/**
 * Les chiffres que l'écran d'accueil affichait en « ?/? » dans la v1.
 *
 * Fonctions pures sur un tableau de scans : elles se testent sans app, et elles
 * produisent exactement les agrégats qu'un pipeline analytique recalculerait
 * côté serveur — même définition ici et là-bas, donc pas d'écart de compteur
 * entre l'écran de l'agent et le tableau de bord de l'organisateur.
 */
import type { ScanRecord, Ticket } from "./types";

export interface CategoryTally {
  category: string;
  admitted: number;
  total: number;
}

export interface EventTally {
  admitted: number;
  total: number;
  /** Tentatives refusées sur la soirée (doublons, inconnus, annulés…). */
  refused: number;
  byCategory: CategoryTally[];
}

/** Les codes réellement entrés : admis, non annulés, dédoublonnés. */
export function admittedCodes(scans: readonly ScanRecord[]): Set<string> {
  const codes = new Set<string>();
  for (const scan of scans) {
    if (scan.outcome === "admit" && !scan.reverted) codes.add(scan.code);
  }
  return codes;
}

export function tally(
  tickets: readonly Ticket[],
  scans: readonly ScanRecord[],
  eventId: string,
): EventTally {
  const eventTickets = tickets.filter((t) => t.eventId === eventId);
  const eventScans = scans.filter((s) => s.eventId === eventId);
  const admitted = admittedCodes(eventScans);

  const buckets = new Map<string, CategoryTally>();
  for (const ticket of eventTickets) {
    const row = buckets.get(ticket.category) ?? {
      category: ticket.category,
      admitted: 0,
      total: 0,
    };
    row.total += 1;
    if (admitted.has(ticket.code)) row.admitted += 1;
    buckets.set(ticket.category, row);
  }

  // Un retour jugé légitime n'est pas un refus, et une vérification en cours
  // n'en est pas un non plus : dans les deux cas personne n'a été refoulé.
  const refused = eventScans.filter(
    (s) =>
      !s.reverted &&
      s.outcome !== "admit" &&
      s.outcome !== "re_entry" &&
      s.outcome !== "review",
  ).length;

  return {
    admitted: admitted.size,
    total: eventTickets.length,
    refused,
    byCategory: [...buckets.values()].sort((a, b) => b.total - a.total),
  };
}

/**
 * Le flux d'arrivée découpé en tranches égales, la plus récente en dernier.
 *
 * C'est la courbe que l'écran d'accueil dessine en direct — et c'est exactement
 * la série temporelle que la phase suivante du projet apprendra à prévoir.
 * La produire dès maintenant, c'est commencer à constituer la donnée avant
 * d'avoir le modèle.
 */
export function arrivalBuckets(
  scans: readonly ScanRecord[],
  now: Date,
  bucketMinutes = 5,
  bucketCount = 12,
): number[] {
  const buckets = new Array<number>(bucketCount).fill(0);
  const bucketMs = bucketMinutes * 60_000;
  const windowStart = now.getTime() - bucketCount * bucketMs;

  for (const scan of scans) {
    if (scan.outcome !== "admit" || scan.reverted) continue;
    const at = new Date(scan.at).getTime();
    if (at < windowStart || at > now.getTime()) continue;
    const index = Math.min(bucketCount - 1, Math.floor((at - windowStart) / bucketMs));
    buckets[index] = (buckets[index] ?? 0) + 1;
  }
  return buckets;
}

export interface ShiftStats {
  scans: number;
  admitted: number;
  /** Scans par minute depuis le premier scan de la vacation. */
  perMinute: number;
}

/** Ce que l'agent a fait depuis sa prise de poste. */
export function shiftStats(
  scans: readonly ScanRecord[],
  operator: string,
  now: Date,
): ShiftStats {
  const mine = scans.filter((s) => s.operator === operator);
  if (mine.length === 0) return { scans: 0, admitted: 0, perMinute: 0 };

  const first = mine.reduce((min, s) => (s.at < min ? s.at : min), mine[0]!.at);
  const elapsedMin = Math.max(1, (now.getTime() - new Date(first).getTime()) / 60_000);

  return {
    scans: mine.length,
    admitted: mine.filter((s) => s.outcome === "admit" && !s.reverted).length,
    perMinute: Math.round((mine.length / elapsedMin) * 10) / 10,
  };
}
