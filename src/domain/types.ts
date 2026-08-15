/** Le vocabulaire du contrôle d'accès. Aucune dépendance : ni React, ni réseau, ni stockage. */

export type TicketStatus = "valid" | "revoked" | "refunded";

export interface EventSummary {
  id: string;
  name: string;
  venue: string;
  /** Ouverture des portes, ISO 8601. */
  doorsAt: string;
  /** Début du concert, ISO 8601. Le pic d'arrivée se situe juste avant. */
  showAt: string;
  ticketsSold: number;
}

export interface Ticket {
  id: string;
  /** La charge utile du QR code, normalisée. C'est la clé de recherche. */
  code: string;
  eventId: string;
  holderName: string;
  holderEmail: string;
  /** « VIP », « Standard », « Étudiant »… libre, défini par l'organisateur. */
  category: string;
  status: TicketStatus;
  purchasedAt: string;

  /**
   * Contexte d'achat, embarqué avec la liste d'invités.
   *
   * Ces champs ne servent pas à l'affichage : ils alimentent le score de risque
   * calculé sur l'appareil. La liste téléchargée avant l'ouverture des portes
   * n'est donc pas qu'un annuaire de noms, c'est aussi la charge utile dont le
   * modèle a besoin pour fonctionner sans réseau. Sans eux, il faudrait soit
   * appeler le serveur à chaque scan — ce que toute l'architecture cherche à
   * éviter — soit entraîner un modèle dégradé sur les seules données locales.
   */
  facePrice: number;
  pricePaid: number;
  /** « web », « guichet », « revendeur », « invitation ». */
  channel: string;
  orderSize: number;
  buyerPastEvents: number;
  buyerPastDisputes: number;
}

/**
 * Ce qui distingue un verdict d'un autre.
 *
 * `review` est le seul cas où l'app ne tranche pas : elle n'a pas la liste et
 * refuse de faire semblant. L'agent décide, et sa décision est consignée —
 * c'est cette trace qui alimentera plus tard le jeu de données de fraude.
 */
export type VerdictKind =
  | "admit"
  /** Retour d'une personne déjà entrée, jugée légitime par le score de risque. */
  | "re_entry"
  | "duplicate"
  | "unknown"
  | "wrong_event"
  | "revoked"
  | "refunded"
  | "review"
  | "unreadable";

/** Sortie du modèle embarqué, attachée au verdict quand il y en a une. */
export interface RiskVerdict {
  probability: number;
  band: "clear" | "verify" | "refuse";
  reason: string;
}

export type Tone = "go" | "stop" | "hold";

export interface Verdict {
  kind: VerdictKind;
  tone: Tone;
  /** Un mot, lisible à bout de bras. */
  headline: string;
  /** La phrase qui permet à l'agent de décider quand le verdict n'est pas « entrée ». */
  detail?: string;
  ticket?: Ticket;
  /** Pour un doublon : le scan qui a déjà fait entrer ce code. */
  priorScan?: ScanRecord;
  /** Présent quand le modèle a été consulté — c'est-à-dire sur les seconds passages. */
  risk?: RiskVerdict;
}

/**
 * Une tentative de passage. On consigne **tous** les scans, y compris les refus :
 * un refus est une information, et c'est la matière première de l'analyse d'après-soirée.
 */
export interface ScanRecord {
  id: string;
  code: string;
  eventId: string;
  gate: string;
  operator: string;
  /** ISO 8601. */
  at: string;
  outcome: VerdictKind;
  /** Saisi à la main depuis la liste, faute de QR lisible. */
  manual: boolean;
  /** Annulé par l'agent dans la fenêtre d'annulation. */
  reverted: boolean;

  /**
   * Ce que l'agent a finalement décidé sur un cas litigieux, après vérification.
   *
   * C'est **l'étiquette d'entraînement du prochain modèle**, et c'est la seule
   * source de vérité qui existera jamais en production : personne ne saura jamais
   * avec certitude qui fraudait, on ne saura que ce que l'agent a tranché pièce
   * d'identité en main. Le champ existe avant le modèle, délibérément — sans
   * collecte en place dès maintenant, il n'y aurait rien à apprendre au prochain
   * tour, et il faudrait attendre une saison entière pour commencer.
   *
   * Étiquette bruitée et biaisée, du reste : l'agent voit la recommandation du
   * modèle avant de décider. À traiter comme telle lors du réentraînement.
   */
  resolution?: "admitted" | "refused";
  /** Remonté au serveur. Tant que c'est `false`, il vit dans la file locale. */
  synced: boolean;
}

/** Qui scanne, où, et pour quel événement. */
export interface GateContext {
  eventId: string;
  gate: string;
  operator: string;
  now: Date;
}

/**
 * La vue en lecture seule dont le moteur a besoin. Rien de plus.
 *
 * C'est cette interface étroite qui rend `checkIn` testable sans caméra, sans
 * réseau et sans stockage : un objet littéral de trois fonctions suffit.
 */
export interface LedgerView {
  findTicket(code: string): Ticket | undefined;
  /** Le scan qui a déjà admis ce code, s'il existe. */
  findAdmission(code: string): ScanRecord | undefined;
  /** La liste des billets a-t-elle été téléchargée pour cet événement ? */
  hasGuestList(): boolean;
}

export interface CheckInResult {
  verdict: Verdict;
  record: ScanRecord;
}
