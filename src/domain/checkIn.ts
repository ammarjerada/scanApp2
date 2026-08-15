/**
 * Le moteur de contrôle d'accès.
 *
 * Module profond au sens propre : l'interface tient en une fonction — un code
 * entre, un verdict sort — et cache la normalisation du QR, l'appariement à
 * l'événement, les billets annulés, la détection de doublon avec son contexte,
 * et le repli quand la liste n'a pas été synchronisée.
 *
 * Il est **pur**. Pas de `fetch`, pas de `Date.now()`, pas de stockage : l'heure
 * arrive par `GateContext`, les données par `LedgerView`. C'est ce qui permet de
 * couvrir toutes les règles d'entrée dans un test unitaire de quelques lignes,
 * là où la v1 exigeait une caméra et un serveur pour vérifier quoi que ce soit.
 *
 * Le supprimer ne déplacerait pas la complexité : il faudrait réécrire ces règles
 * dans l'écran de scan **et** dans la liste des invités, qui font entrer les gens
 * tous les deux.
 */
import type {
  CheckInResult,
  GateContext,
  LedgerView,
  ScanRecord,
  Ticket,
  Verdict,
  VerdictKind,
} from "./types";

/**
 * Les QR imprimés arrivent avec des espaces, des retours ligne et une casse
 * variable selon le lecteur. On normalise avant toute comparaison — sinon le
 * même billet est « inconnu » sur un téléphone et valide sur un autre.
 */
export function normalizeCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

const TONE_BY_KIND: Record<VerdictKind, Verdict["tone"]> = {
  admit: "go",
  re_entry: "go",
  duplicate: "stop",
  unknown: "stop",
  wrong_event: "stop",
  revoked: "stop",
  refunded: "stop",
  review: "hold",
  unreadable: "hold",
};

const HEADLINE_BY_KIND: Record<VerdictKind, string> = {
  admit: "ENTRÉE",
  re_entry: "RETOUR",
  duplicate: "DÉJÀ ENTRÉ",
  unknown: "INCONNU",
  wrong_event: "AUTRE SOIRÉE",
  revoked: "ANNULÉ",
  refunded: "REMBOURSÉ",
  review: "À VÉRIFIER",
  unreadable: "ILLISIBLE",
};

/**
 * Le mot et le ton d'un type de verdict, exposés pour les écrans qui relisent
 * l'historique plutôt que de trancher un scan — la file « À vérifier », par
 * exemple. Sans ça, chaque écran recopierait sa propre table de libellés et
 * elles finiraient par diverger.
 */
export function headlineFor(kind: VerdictKind): string {
  return HEADLINE_BY_KIND[kind];
}

export function toneFor(kind: VerdictKind): Verdict["tone"] {
  return TONE_BY_KIND[kind];
}

/** « à l'instant », « il y a 12 min », « il y a 2 h 05 ». */
export function formatElapsed(fromISO: string, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(fromISO).getTime()) / 1000));
  if (seconds < 45) return "à l'instant";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `il y a ${hours} h ${String(rest).padStart(2, "0")}`;
}

function newRecord(
  code: string,
  outcome: VerdictKind,
  gate: GateContext,
  manual: boolean,
): ScanRecord {
  return {
    id: `${gate.now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    code,
    eventId: gate.eventId,
    gate: gate.gate,
    operator: gate.operator,
    at: gate.now.toISOString(),
    outcome,
    manual,
    reverted: false,
    synced: false,
  };
}

function verdict(kind: VerdictKind, extra: Partial<Verdict> = {}): Verdict {
  return {
    kind,
    tone: TONE_BY_KIND[kind],
    headline: HEADLINE_BY_KIND[kind],
    ...extra,
  };
}

/**
 * Tranche un scan. L'ordre des règles est la logique métier :
 * on écarte d'abord ce qui n'est pas un billet d'ici, puis ce qui n'est plus
 * valable, et seulement à la fin on regarde si quelqu'un est déjà passé avec.
 */
/**
 * Le score de risque, injecté plutôt qu'importé.
 *
 * `checkIn` reste pur et testable sans le modèle : les tests de règles passent un
 * scoreur nul, ceux du risque passent une fonction contrôlée. Importer le modèle
 * ici lierait 95 Ko de JSON à chaque test de règle métier.
 */
export type RiskScorer = (ticket: Ticket, prior: ScanRecord) => Verdict["risk"];

export function checkIn(
  rawCode: string,
  view: LedgerView,
  gate: GateContext,
  scoreRisk?: RiskScorer,
): CheckInResult {
  const code = normalizeCode(rawCode);

  if (code.length === 0) {
    return { verdict: verdict("unreadable", { detail: "Code vide ou illisible." }), record: newRecord(code, "unreadable", gate, false) };
  }

  const ticket = view.findTicket(code);

  if (!ticket) {
    // Sans liste locale, l'app ne peut pas dire « inconnu » : elle ne sait pas.
    // Prétendre trancher ferait refouler des gens légitimes à cause du réseau.
    if (!view.hasGuestList()) {
      return {
        verdict: verdict("review", {
          detail: "Liste non synchronisée. Vérifiez le billet et décidez.",
        }),
        record: newRecord(code, "review", gate, false),
      };
    }
    return {
      verdict: verdict("unknown", { detail: "Ce code ne figure pas dans la liste." }),
      record: newRecord(code, "unknown", gate, false),
    };
  }

  if (ticket.eventId !== gate.eventId) {
    return {
      verdict: verdict("wrong_event", {
        detail: "Billet valable pour un autre événement.",
        ticket,
      }),
      record: newRecord(code, "wrong_event", gate, false),
    };
  }

  if (ticket.status === "revoked") {
    return {
      verdict: verdict("revoked", { detail: "Billet annulé par l'organisateur.", ticket }),
      record: newRecord(code, "revoked", gate, false),
    };
  }

  if (ticket.status === "refunded") {
    return {
      verdict: verdict("refunded", { detail: "Billet remboursé.", ticket }),
      record: newRecord(code, "refunded", gate, false),
    };
  }

  const prior = view.findAdmission(code);
  if (prior) {
    // Le détail compte plus que le refus : l'agent a besoin de savoir quand,
    // où et par qui, pour distinguer une fraude d'une erreur de manipulation.
    const where = prior.gate === gate.gate ? "ici même" : `porte ${prior.gate}`;
    const context = `${formatElapsed(prior.at, gate.now)} · ${where} · ${prior.operator}`;

    // C'est ici, et nulle part ailleurs, que le modèle a quelque chose à dire.
    // Les cas précédents — code absent, billet annulé, mauvaise soirée — se
    // tranchent par une comparaison ; un second passage, non. Sur les données
    // simulées, refuser tout doublon refoule 170 clients légitimes pour
    // 4 500 scans, et n'attraper que les doublons de moins de 15 minutes laisse
    // passer 61 % des fraudes. Le score sépare les deux beaucoup mieux qu'un seuil.
    const risk = scoreRisk?.(ticket, prior);

    if (risk?.band === "clear") {
      return {
        verdict: verdict("re_entry", {
          detail: `${ticket.holderName} · ${context}`,
          ticket,
          priorScan: prior,
          risk,
        }),
        record: newRecord(code, "re_entry", gate, false),
      };
    }

    if (risk?.band === "verify") {
      // Le modèle a le droit de ne pas savoir. Envoyer vérifier une pièce
      // d'identité coûte quelques dizaines de secondes ; refouler un client
      // légitime coûte dix fois plus.
      return {
        verdict: verdict("review", {
          detail: `${risk.reason} Demandez une pièce d'identité.`,
          ticket,
          priorScan: prior,
          risk,
        }),
        record: newRecord(code, "review", gate, false),
      };
    }

    return {
      verdict: verdict("duplicate", { detail: context, ticket, priorScan: prior, risk }),
      record: newRecord(code, "duplicate", gate, false),
    };
  }

  return {
    verdict: verdict("admit", { detail: `${ticket.holderName} · ${ticket.category}`, ticket }),
    record: newRecord(code, "admit", gate, false),
  };
}

/**
 * Entrée saisie à la main depuis la liste, quand le QR est illisible : écran
 * cassé, billet imprimé délavé, téléphone déchargé. Sans ce chemin l'agent est
 * bloqué et laisse passer sans contrôle — ce qui est pire que pas de contrôle.
 */
export function admitManually(
  ticket: Ticket,
  view: LedgerView,
  gate: GateContext,
): CheckInResult {
  const prior = view.findAdmission(ticket.code);
  if (prior) {
    return {
      verdict: verdict("duplicate", {
        detail: `${formatElapsed(prior.at, gate.now)} · porte ${prior.gate} · ${prior.operator}`,
        ticket,
        priorScan: prior,
      }),
      record: newRecord(ticket.code, "duplicate", gate, true),
    };
  }
  return {
    verdict: verdict("admit", { detail: `${ticket.holderName} · ${ticket.category}`, ticket }),
    record: newRecord(ticket.code, "admit", gate, true),
  };
}

/** Fenêtre pendant laquelle l'agent peut annuler son dernier scan. */
export const REVERT_WINDOW_MS = 60_000;

export function canRevert(record: ScanRecord, now: Date): boolean {
  if (record.reverted) return false;
  return now.getTime() - new Date(record.at).getTime() <= REVERT_WINDOW_MS;
}

/**
 * Un scan annulé n'est pas effacé : il est marqué. L'historique d'une soirée doit
 * rester fidèle, y compris aux erreurs — c'est ce qui rend l'analyse possible après.
 */
export function revert(record: ScanRecord): ScanRecord {
  return { ...record, reverted: true, synced: false };
}
