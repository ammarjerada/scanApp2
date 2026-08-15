"""Le générateur d'événements.

Produit un historique de tentatives de passage avec **vérité terrain** : pour
chaque scan, on sait si la personne qui se présente avait le droit d'entrer.

Deux choix de modélisation méritent d'être lus avant le code.

**1. La ré-entrée légitime existe.** Sans elle, tout second passage d'un même code
serait frauduleux, la règle « déjà scanné => refuser » serait parfaite, et il n'y
aurait rien à apprendre. Les gens sortent fumer et reviennent. Le partage de
billet et la ré-entrée produisent tous deux un doublon ; ce qui les sépare — le
délai, la porte, l'heure — les sépare *en tendance*, jamais parfaitement. C'est ce
recouvrement qui fait le problème.

**2. L'étiquette ne dépend pas de l'ordre d'arrivée.** Quand un QR est partagé
entre trois personnes, une seule l'a acheté : c'est elle la légitime, qu'elle
arrive en premier ou en dernier. La règle « le premier scan gagne » va donc
parfois admettre le fraudeur et refouler l'acheteur. Ce n'est pas un défaut du
simulateur, c'est ce qui se passe à une vraie porte — et c'est précisément ce que
la matrice de coût asymétrique sert à arbitrer.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import DEFAULT, SimulationConfig

GATE_NAMES = ["A", "B", "C", "D", "E"]
OPERATORS = ["Karim", "Salma", "Youssef", "Imane", "Mehdi", "Nadia"]


@dataclass
class Dataset:
    """Ce que produit une simulation."""

    scans: pd.DataFrame
    tickets: pd.DataFrame
    events: pd.DataFrame


def _pick_categories(rng: np.random.Generator, cfg: SimulationConfig, n: int) -> np.ndarray:
    names = [c.name for c in cfg.categories]
    probs = np.array([c.share for c in cfg.categories], dtype=float)
    probs = probs / probs.sum()
    return rng.choice(names, size=n, p=probs)


def _arrival_offsets(
    rng: np.random.Generator, cfg: SimulationConfig, n: int, window_minutes: float
) -> np.ndarray:
    """Minutes après l'ouverture des portes, suivant la double bosse.

    Un processus de Poisson non homogène dont l'intensité est cette courbe
    reviendrait au même ; tirer directement les positions est plus lisible et
    suffit ici, puisqu'on ne cherche pas à modéliser la file d'attente elle-même.
    """
    early = rng.random(n) < cfg.early_bump_share
    centre = np.where(early, cfg.early_peak_ratio, cfg.late_peak_ratio)
    spread = np.where(early, cfg.early_spread, cfg.late_spread)

    position = rng.normal(loc=centre, scale=spread)

    # Une frange de retardataires, au-delà du début du concert.
    late = rng.random(n) < cfg.late_arrival_share
    position = np.where(late, rng.uniform(1.0, 1.35, size=n), position)

    position = np.clip(position, 0.005, 1.45)
    return position * window_minutes


def _simulate_event(
    rng: np.random.Generator,
    cfg: SimulationConfig,
    event_index: int,
    base_date: pd.Timestamp,
) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    event_id = f"evt-{event_index:02d}"
    show_at = base_date + pd.Timedelta(hours=21)
    doors_at = show_at - pd.Timedelta(minutes=cfg.doors_open_minutes_before_show)
    window = float(cfg.doors_open_minutes_before_show)

    n_tickets = int(rng.integers(cfg.tickets_per_event[0], cfg.tickets_per_event[1]))
    gates = GATE_NAMES[: cfg.n_gates]

    # ------------------------------------------------------------- billetterie
    categories = _pick_categories(rng, cfg, n_tickets)
    face_price = np.array([cfg.category_by_name(c).face_price for c in categories])

    channels = rng.choice(cfg.channels, size=n_tickets, p=np.array(cfg.channel_weights))
    # Un billet revendu se paie au-dessus du facial ; une invitation, rien.
    multiplier = np.where(channels == "revendeur", rng.uniform(1.1, 2.4, n_tickets), 1.0)
    price_paid = face_price * multiplier

    lead_days = rng.uniform(*cfg.purchase_lead_days, size=n_tickets)
    purchased_at = doors_at - pd.to_timedelta(lead_days, unit="D")

    status_roll = rng.random(n_tickets)
    status = np.where(
        status_roll < cfg.revoked_rate,
        "revoked",
        np.where(status_roll < cfg.revoked_rate + cfg.refunded_rate, "refunded", "valid"),
    )

    order_size = rng.integers(1, 5, size=n_tickets)
    buyer_id = np.array([f"buyer-{event_index:02d}-{i // 2}" for i in range(n_tickets)])
    buyer_past_events = rng.poisson(1.4, size=n_tickets)
    buyer_past_disputes = rng.binomial(1, 0.03, size=n_tickets)

    tickets = pd.DataFrame(
        {
            "ticket_id": [f"{event_id}-t{i:04d}" for i in range(n_tickets)],
            "code": [f"TDR-{event_index:02d}{1000 + i:05d}" for i in range(n_tickets)],
            "event_id": event_id,
            "category": categories,
            "status": status,
            "face_price": face_price,
            "price_paid": price_paid,
            "channel": channels,
            "order_size": order_size,
            "purchased_at": purchased_at,
            "buyer_id": buyer_id,
            "buyer_past_events": buyer_past_events,
            "buyer_past_disputes": buyer_past_disputes,
        }
    )

    # ------------------------------------------------------------- présence
    no_show_rate = np.array([cfg.category_by_name(c).no_show_rate for c in categories])
    shows_up = rng.random(n_tickets) > no_show_rate
    # Un billet annulé ne donne pas lieu à une venue ; un remboursé, parfois.
    shows_up &= status != "revoked"
    refunded_mask = status == "refunded"
    shows_up = np.where(
        refunded_mask, rng.random(n_tickets) < cfg.refunded_reuse_rate, shows_up
    )

    attendees = tickets[shows_up].copy()
    n_att = len(attendees)
    if n_att == 0:
        empty = pd.DataFrame()
        return empty, tickets, {"event_id": event_id, "doors_at": doors_at, "show_at": show_at}

    offsets = _arrival_offsets(rng, cfg, n_att, window)
    attendees["arrival_at"] = doors_at + pd.to_timedelta(offsets, unit="m")
    attendees["gate"] = rng.choice(gates, size=n_att)

    attempts: list[dict] = []

    def push(row: pd.Series, at: pd.Timestamp, gate: str, illegitimate: bool, mode: str) -> None:
        attempts.append(
            {
                "event_id": event_id,
                "event_index": event_index,
                "doors_at": doors_at,
                "show_at": show_at,
                "code": row["code"],
                "ticket_id": row["ticket_id"],
                "buyer_id": row["buyer_id"],
                "at": at,
                "gate": gate,
                "category": row["category"],
                "status": row["status"],
                "face_price": row["face_price"],
                "price_paid": row["price_paid"],
                "channel": row["channel"],
                "order_size": row["order_size"],
                "purchased_at": row["purchased_at"],
                "buyer_past_events": row["buyer_past_events"],
                "buyer_past_disputes": row["buyer_past_disputes"],
                "is_illegitimate": illegitimate,
                "fraud_mode": mode,
            }
        )

    # --------------------------------------------------- passages légitimes
    for _, row in attendees.iterrows():
        # Un billet remboursé présenté quand même : la personne n'a plus de droit
        # d'entrée, même si elle l'ignore de bonne foi.
        illegitimate = row["status"] == "refunded"
        push(
            row,
            row["arrival_at"],
            row["gate"],
            illegitimate,
            "refunded_reuse" if illegitimate else "legit",
        )

    other_gate = lambda g: rng.choice([x for x in gates if x != g]) if len(gates) > 1 else g

    # ------------------------------------------------- partage de capture d'écran
    n_share = rng.binomial(n_att, cfg.screenshot_share_rate)
    if n_share > 0:
        for _, row in attendees.sample(n=min(n_share, n_att), random_state=int(rng.integers(1e9))).iterrows():
            if row["status"] != "valid":
                continue
            extras = int(rng.integers(*cfg.screenshot_extra_people, endpoint=True))
            for _ in range(extras):
                gap = rng.uniform(*cfg.screenshot_gap_minutes)
                gate = (
                    other_gate(row["gate"])
                    if rng.random() < cfg.screenshot_other_gate_prob
                    else row["gate"]
                )
                push(row, row["arrival_at"] + pd.Timedelta(minutes=gap), gate, True, "screenshot_share")

    # ------------------------------------------------------------ revente
    n_resale = rng.binomial(n_att, cfg.resale_rate)
    if n_resale > 0:
        for _, row in attendees.sample(n=min(n_resale, n_att), random_state=int(rng.integers(1e9))).iterrows():
            if row["status"] != "valid":
                continue
            gap = rng.uniform(*cfg.resale_gap_minutes)
            push(row, row["arrival_at"] + pd.Timedelta(minutes=gap), other_gate(row["gate"]), True, "resale")

    # ------------------------------------------------- ré-entrée (BÉNIGNE)
    n_reentry = rng.binomial(n_att, cfg.re_entry_rate)
    if n_reentry > 0:
        for _, row in attendees.sample(n=min(n_reentry, n_att), random_state=int(rng.integers(1e9))).iterrows():
            if row["status"] != "valid":
                continue
            gap = rng.uniform(*cfg.re_entry_gap_minutes)
            gate = (
                row["gate"]
                if rng.random() < cfg.re_entry_same_gate_prob
                else other_gate(row["gate"])
            )
            push(row, row["arrival_at"] + pd.Timedelta(minutes=gap), gate, False, "re_entry")

    # ------------------------------------------------------------- codes forgés
    n_forged = rng.binomial(n_att, cfg.forged_rate)
    for i in range(int(n_forged)):
        template = attendees.iloc[int(rng.integers(n_att))].copy()
        template["code"] = f"TDR-{event_index:02d}{90000 + i:05d}"
        template["ticket_id"] = None
        template["buyer_id"] = None
        template["status"] = "absent"
        at = doors_at + pd.Timedelta(minutes=float(rng.uniform(0, window * 1.2)))
        push(template, at, str(rng.choice(gates)), True, "forged")

    scans = pd.DataFrame(attempts)
    if scans.empty:
        return scans, tickets, {"event_id": event_id, "doors_at": doors_at, "show_at": show_at}

    scans = scans.sort_values("at").reset_index(drop=True)
    scans["scan_id"] = [f"{event_id}-s{i:05d}" for i in range(len(scans))]
    scans["operator"] = rng.choice(OPERATORS[: max(2, cfg.n_gates)], size=len(scans))
    scans["is_manual"] = rng.random(len(scans)) < cfg.manual_entry_rate

    return scans, tickets, {"event_id": event_id, "doors_at": doors_at, "show_at": show_at}


def simulate(cfg: SimulationConfig = DEFAULT) -> Dataset:
    """Génère `cfg.n_events` soirées consécutives."""
    rng = np.random.default_rng(cfg.seed)
    base = pd.Timestamp("2026-03-06 00:00:00")

    all_scans, all_tickets, all_events = [], [], []
    for i in range(cfg.n_events):
        # Une soirée tous les 12 jours : l'ordre chronologique est ce qui permet
        # un découpage temporel honnête plus tard.
        scans, tickets, meta = _simulate_event(rng, cfg, i, base + pd.Timedelta(days=12 * i))
        if not scans.empty:
            all_scans.append(scans)
        all_tickets.append(tickets)
        all_events.append(meta)

    return Dataset(
        scans=pd.concat(all_scans, ignore_index=True),
        tickets=pd.concat(all_tickets, ignore_index=True),
        events=pd.DataFrame(all_events),
    )
