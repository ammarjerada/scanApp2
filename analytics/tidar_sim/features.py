"""Construction des features, à l'instant du scan et pas une seconde plus tard.

**L'horodatage de prédiction est l'instant où le QR est décodé, avant que l'agent
n'agisse.** Toute information postérieure est interdite. C'est la contrainte
centrale de ce fichier, et la raison de sa forme.

D'où le parcours en une passe, scan par scan, dans l'ordre chronologique, avec un
état accumulé au fur et à mesure. Un `groupby` sur toute la soirée serait plus
court à écrire et faux : il verrait le futur. « Ce code a été scanné 3 fois ce
soir » n'est pas connaissable au premier passage — au premier passage, le compteur
vaut zéro.

Cette forme a un second avantage, décisif : c'est **exactement** ce que peut faire
le téléphone à la porte, qui ne connaît que le passé. Le code Python et le code
TypeScript embarqué calculent donc la même chose de la même façon, et les vecteurs
d'or (`src/ml/goldenVectors.json`) vérifient qu'ils ne divergent pas.
"""

from __future__ import annotations

from collections import defaultdict, deque

import numpy as np
import pandas as pd

# L'ordre fait foi : c'est celui du vecteur passé au modèle, côté Python comme
# côté TypeScript. Le changer sans réexporter le modèle casse silencieusement les
# prédictions — d'où les vecteurs d'or.
NUMERIC_FEATURES = [
    "prior_scan_count",
    "minutes_since_prior_scan",
    "same_gate_as_prior",
    "minutes_since_doors",
    "minutes_to_show",
    "purchase_lead_days",
    "price_ratio",
    "order_size",
    "gate_rate_5min",
    "buyer_past_events",
    "buyer_past_disputes",
    "is_manual",
    "code_in_list",
    "is_revoked",
    "is_refunded",
]

# Les catégorielles sont encodées en one-hot plutôt que confiées au support natif
# de scikit-learn. Ce n'est pas un choix statistique — à 4 modalités les deux se
# valent — mais un choix d'embarquement : les découpages catégoriels de
# `HistGradientBoosting` s'expriment en *bitsets*, qu'il faudrait réimplémenter en
# TypeScript avec le risque de diverger sur un cas limite. En one-hot, tous les
# découpages de l'arbre sont des comparaisons numériques, et l'évaluateur embarqué
# tient en une vingtaine de lignes qu'on peut lire et vérifier.
CATEGORIES = ["Standard", "Étudiant", "VIP", "Invitation"]
CHANNELS = ["web", "guichet", "revendeur", "invitation"]

ONE_HOT_FEATURES = [f"cat_{c}" for c in CATEGORIES] + [f"chan_{c}" for c in CHANNELS]

FEATURE_COLUMNS = NUMERIC_FEATURES + ONE_HOT_FEATURES

# Valeur sentinelle quand il n'y a pas de passage antérieur. On ne met pas 0 :
# « zéro minute depuis le passage précédent » est une affirmation forte et fausse.
# Les arbres traitent les NaN comme une branche à part, ce qui est le bon sens ici.
NO_PRIOR = np.nan


def build_features(scans: pd.DataFrame) -> pd.DataFrame:
    """Une ligne de features par tentative de passage, calculée as-of."""
    ordered = scans.sort_values(["event_id", "at"]).reset_index(drop=True)

    # État accumulé, remis à zéro à chaque soirée.
    last_scan: dict[tuple[str, str], dict] = {}
    scan_count: dict[tuple[str, str], int] = defaultdict(int)
    gate_window: dict[tuple[str, str], deque] = defaultdict(deque)

    rows: list[dict] = []

    for row in ordered.itertuples(index=False):
        key = (row.event_id, row.code)
        gate_key = (row.event_id, row.gate)
        at: pd.Timestamp = row.at

        prior = last_scan.get(key)
        prior_count = scan_count[key]

        if prior is None:
            minutes_since_prior = NO_PRIOR
            same_gate = NO_PRIOR
        else:
            minutes_since_prior = (at - prior["at"]).total_seconds() / 60.0
            same_gate = 1.0 if prior["gate"] == row.gate else 0.0

        # Pression à la porte : combien de scans sur les 5 dernières minutes, ici.
        # Fenêtre glissante purgée par la gauche — que du passé, par construction.
        window = gate_window[gate_key]
        cutoff = at - pd.Timedelta(minutes=5)
        while window and window[0] < cutoff:
            window.popleft()
        gate_rate = float(len(window))

        face = float(row.face_price)
        paid = float(row.price_paid)
        # Une invitation a un facial nul : le ratio n'a pas de sens, on ne l'invente pas.
        price_ratio = paid / face if face > 0 else NO_PRIOR

        code_in_list = 0.0 if row.status == "absent" else 1.0

        one_hot = {f"cat_{c}": 1.0 if row.category == c else 0.0 for c in CATEGORIES}
        one_hot.update({f"chan_{c}": 1.0 if row.channel == c else 0.0 for c in CHANNELS})

        rows.append(
            {
                **one_hot,
                "scan_id": row.scan_id,
                "event_id": row.event_id,
                "event_index": row.event_index,
                "code": row.code,
                "buyer_id": row.buyer_id,
                "at": at,
                "fraud_mode": row.fraud_mode,
                "is_illegitimate": bool(row.is_illegitimate),
                # --- features -------------------------------------------------
                "prior_scan_count": float(prior_count),
                "minutes_since_prior_scan": minutes_since_prior,
                "same_gate_as_prior": same_gate,
                "minutes_since_doors": (at - row.doors_at).total_seconds() / 60.0,
                "minutes_to_show": (row.show_at - at).total_seconds() / 60.0,
                "purchase_lead_days": (row.doors_at - row.purchased_at).total_seconds() / 86400.0,
                "price_ratio": price_ratio,
                "order_size": float(row.order_size),
                "gate_rate_5min": gate_rate,
                "buyer_past_events": float(row.buyer_past_events),
                "buyer_past_disputes": float(row.buyer_past_disputes),
                "is_manual": 1.0 if row.is_manual else 0.0,
                "code_in_list": code_in_list,
                "is_revoked": 1.0 if row.status == "revoked" else 0.0,
                "is_refunded": 1.0 if row.status == "refunded" else 0.0,
                "category": str(row.category),
                "channel": str(row.channel),
            }
        )

        # L'état n'est mis à jour qu'APRÈS avoir écrit la ligne : le scan courant
        # ne doit jamais s'être vu lui-même dans ses propres features.
        scan_count[key] = prior_count + 1
        last_scan[key] = {"at": at, "gate": row.gate}
        window.append(at)

    return pd.DataFrame(rows)


def temporal_group_split(
    frame: pd.DataFrame, test_events: int = 6
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Découpe en apprentissage / test par **soirée**, dans l'ordre du temps.

    Deux fuites sont écartées d'un seul geste, et il faut les deux.

    *Temporelle* — on teste sur des soirées postérieures à celles vues à
    l'entraînement, comme en production où l'on prédit sur des soirées à venir.

    *Par entité* — les acheteurs sont propres à une soirée dans ce simulateur, donc
    découper par soirée sépare aussi les acheteurs. La vérification ci-dessous n'est
    pas décorative : si le générateur venait à faire revenir un acheteur d'une
    soirée à l'autre, un découpage purement temporel laisserait fuiter son
    historique, et l'assertion le signalerait immédiatement.
    """
    order = sorted(frame.event_index.unique())
    cut = order[-test_events]

    train = frame[frame.event_index < cut].copy()
    test = frame[frame.event_index >= cut].copy()

    overlap = set(train.buyer_id.dropna()) & set(test.buyer_id.dropna())
    assert not overlap, f"fuite par acheteur : {len(overlap)} acheteurs des deux côtés"

    return train, test
