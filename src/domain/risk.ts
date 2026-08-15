/**
 * Le score de risque, calculé sur l'appareil.
 *
 * Ce fichier répond à une question que l'app posait sans y répondre. Sur un
 * doublon, elle affichait « déjà scanné il y a 12 min · porte B » et laissait
 * l'agent trancher seul, en trois secondes, entre un billet partagé et quelqu'un
 * qui ressort fumer et revient. Les deux produisent exactement le même événement.
 *
 * Le modèle a été entraîné dans `analytics/`, où l'on mesure que la règle
 * « tout doublon est refusé » refoule 170 clients légitimes pour 4 500 scans, et
 * que la règle « doublon de moins de 15 minutes » n'attrape plus que 39 % des
 * fraudes parmi les doublons. Le modèle en attrape 91 % en refoulant une personne.
 *
 * **Pourquoi une évaluation d'arbres écrite à la main plutôt qu'un runtime.**
 * `onnxruntime-react-native` est un module natif : il ferait sortir le projet
 * d'Expo Go. À 180 arbres de profondeur 5, une descente d'arbre en TypeScript
 * coûte quelques microsecondes — bien en deçà du budget de 50 ms qu'on s'accorde
 * sur le chemin d'un scan — sans aucune dépendance.
 *
 * **Le piège central de ce fichier.** Les features sont calculées deux fois dans
 * le projet : ici, et dans `analytics/tidar_sim/features.py`. Si les deux
 * divergent, rien ne casse — les prédictions se dégradent en silence. C'est le
 * *training-serving skew*. Le garde-fou est `src/ml/goldenVectors.json`, produit
 * par l'export Python et vérifié par `risk.test.ts` : toute divergence fait
 * tomber la suite de tests.
 */
import bundle from "@/ml/model.json";

import type { LedgerView, ScanRecord, Ticket } from "./types";

/* ------------------------------------------------------------------ le modèle */

/** `[is_leaf, feature_idx, threshold, left, right, missing_left, value]` */
type Node = number[];

interface Bundle {
  format: string;
  features: string[];
  baseline: number;
  trees: Node[][];
  thresholds: { verify: number; refuse: number };
}

const MODEL = bundle as unknown as Bundle;

/** L'ordre des features fait foi — il doit correspondre à `FEATURE_COLUMNS`. */
export const FEATURE_NAMES: readonly string[] = MODEL.features;

/**
 * Descente d'un arbre. `null` encode une valeur absente : l'arbre a appris de
 * quel côté l'envoyer (`missing_left`), au lieu qu'on lui impose un zéro arbitraire.
 */
function walk(nodes: Node[], x: readonly (number | null)[]): number {
  let index = 0;
  // Borne de sécurité : un arbre corrompu ne doit pas figer le fil d'exécution
  // au milieu d'une file d'entrée.
  for (let guard = 0; guard < 512; guard += 1) {
    const node = nodes[index];
    if (!node) return 0;

    if (node[0] === 1) return node[6] as number;

    const value = x[node[1] as number];
    const goLeft =
      value === null || value === undefined || Number.isNaN(value)
        ? node[5] === 1
        : value <= (node[2] as number);

    index = (goLeft ? node[3] : node[4]) as number;
  }
  return 0;
}

/** Probabilité que la tentative soit illégitime. */
export function scoreVector(x: readonly (number | null)[]): number {
  let raw = MODEL.baseline;
  for (const tree of MODEL.trees) raw += walk(tree, x);
  return 1 / (1 + Math.exp(-raw));
}

/* ---------------------------------------------------------------- les features */

export interface RiskInput {
  ticket?: Ticket;
  /** Ouverture des portes et début du concert, ISO 8601. */
  doorsAt: string;
  showAt: string;
  gate: string;
  now: Date;
  manual: boolean;
  /** Passages antérieurs de ce code, ce soir. Strictement antérieurs à `now`. */
  priorScans: readonly ScanRecord[];
  /** Scans effectués à cette porte dans les 5 dernières minutes. */
  gateScansLast5Min: number;
}

const CATEGORIES = ["Standard", "Étudiant", "VIP", "Invitation"];
const CHANNELS = ["web", "guichet", "revendeur", "invitation"];

const MINUTE = 60_000;
const DAY = 86_400_000;

/**
 * Construit le vecteur, dans l'ordre exact de `FEATURE_COLUMNS` côté Python.
 *
 * Miroir de `build_features` : uniquement du passé, jamais d'agrégat qui verrait
 * la suite de la soirée. C'est la même contrainte des deux côtés, pour la même
 * raison — sauf qu'ici elle n'est pas une discipline, c'est une fatalité : le
 * téléphone ne connaît que ce qui s'est déjà produit.
 */
export function buildRiskVector(input: RiskInput): (number | null)[] {
  const { ticket, now, gate } = input;

  const sorted = [...input.priorScans].sort((a, b) => a.at.localeCompare(b.at));
  const last = sorted[sorted.length - 1];

  const minutesSincePrior = last ? (now.getTime() - Date.parse(last.at)) / MINUTE : null;
  const sameGateAsPrior = last ? (last.gate === gate ? 1 : 0) : null;

  const face = ticket?.facePrice ?? 0;
  const paid = ticket?.pricePaid ?? 0;
  // Une invitation a un facial nul : le ratio n'a pas de sens, on ne l'invente pas.
  const priceRatio = face > 0 ? paid / face : null;

  const numeric: (number | null)[] = [
    sorted.length,
    minutesSincePrior,
    sameGateAsPrior,
    (now.getTime() - Date.parse(input.doorsAt)) / MINUTE,
    (Date.parse(input.showAt) - now.getTime()) / MINUTE,
    ticket ? (Date.parse(input.doorsAt) - Date.parse(ticket.purchasedAt)) / DAY : null,
    priceRatio,
    ticket?.orderSize ?? null,
    input.gateScansLast5Min,
    ticket?.buyerPastEvents ?? null,
    ticket?.buyerPastDisputes ?? null,
    input.manual ? 1 : 0,
    ticket ? 1 : 0,
    ticket?.status === "revoked" ? 1 : 0,
    ticket?.status === "refunded" ? 1 : 0,
  ];

  const oneHot = [
    ...CATEGORIES.map((c) => (ticket?.category === c ? 1 : 0)),
    ...CHANNELS.map((c) => (ticket?.channel === c ? 1 : 0)),
  ];

  return [...numeric, ...oneHot];
}

/* ---------------------------------------------------------------- la décision */

export type RiskBand = "clear" | "verify" | "refuse";

export interface RiskAssessment {
  probability: number;
  band: RiskBand;
  /** Ce qui pousse le score vers le haut, en une phrase lisible à la porte. */
  reason: string;
}

export const THRESHOLDS = MODEL.thresholds;

/**
 * Les seuils viennent de l'entraînement, où ils ont été choisis en minimisant le
 * coût métier — refouler un client légitime coûte dix fois plus que laisser
 * passer une fraude — et non par une règle ronde du type « 0,5 ».
 */
export function bandFor(probability: number): RiskBand {
  if (probability >= THRESHOLDS.refuse) return "refuse";
  if (probability >= THRESHOLDS.verify) return "verify";
  return "clear";
}

/**
 * Le motif dominant, en clair.
 *
 * Un score nu ne sert à rien à la porte : « 0,87 » ne se discute pas avec la
 * personne en face. L'explication est déduite des features les plus
 * discriminantes plutôt que d'une attribution exacte type SHAP — celle-ci
 * coûterait bien plus qu'une descente d'arbre, pour une phrase que l'agent lit
 * en une seconde.
 */
function explain(input: RiskInput, vector: readonly (number | null)[]): string {
  const priorCount = vector[0] as number;
  const minutesSince = vector[1] as number | null;
  const sameGate = vector[2] as number | null;

  if (!input.ticket) return "Code absent de la liste chargée.";
  if (input.ticket.status === "revoked") return "Billet annulé par l'organisateur.";
  if (input.ticket.status === "refunded") return "Billet remboursé.";

  if (priorCount > 0 && minutesSince !== null) {
    const delay =
      minutesSince < 60
        ? `${Math.round(minutesSince)} min`
        : `${Math.floor(minutesSince / 60)} h ${String(Math.round(minutesSince % 60)).padStart(2, "0")}`;
    const where = sameGate === 1 ? "à cette porte" : "à une autre porte";
    return `Déjà passé il y a ${delay}, ${where}.`;
  }

  return "Profil d'achat inhabituel pour cette soirée.";
}

/** Le point d'entrée : un contexte de scan, un score et sa raison. */
export function assessRisk(input: RiskInput): RiskAssessment {
  const vector = buildRiskVector(input);
  const probability = scoreVector(vector);
  return {
    probability,
    band: bandFor(probability),
    reason: explain(input, vector),
  };
}

/**
 * Rassemble depuis le registre ce dont `assessRisk` a besoin.
 *
 * Isolé du calcul lui-même pour que le score reste testable sans registre : les
 * vecteurs d'or n'ont pas à construire un faux `LedgerView`.
 */
export function riskInputFromLedger(
  code: string,
  ticket: Ticket | undefined,
  view: LedgerView,
  context: { doorsAt: string; showAt: string; gate: string; now: Date; manual: boolean },
  allScans: readonly ScanRecord[],
): RiskInput {
  const cutoff = context.now.getTime() - 5 * MINUTE;

  return {
    ticket,
    ...context,
    priorScans: allScans.filter((s) => s.code === code && !s.reverted),
    gateScansLast5Min: allScans.filter(
      (s) => s.gate === context.gate && Date.parse(s.at) >= cutoff,
    ).length,
  };
}
