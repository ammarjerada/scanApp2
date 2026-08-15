/**
 * Jeu de données de démonstration.
 *
 * Objectif : que `npm start` suffise. Cloner le dépôt, lancer l'app, scanner —
 * sans backend, sans compte, sans jeton. Un projet de portfolio qui ne démarre
 * pas ne se lit pas.
 *
 * Le tirage est déterministe (générateur pseudo-aléatoire à graine fixe) pour
 * que la démo soit la même à chaque lancement, et la courbe d'arrivée suit deux
 * pics — l'ouverture des portes puis la demi-heure avant le concert — parce que
 * c'est la forme réelle d'un flux d'entrée, et que c'est cette forme que la
 * phase suivante du projet apprendra à prévoir.
 */
import type { EventSummary, ScanRecord, Ticket } from "@/domain/types";

/** mulberry32 — court, sans dépendance, reproductible. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  "Ammar", "Salma", "Youssef", "Imane", "Karim", "Nadia", "Mehdi", "Sofia",
  "Rachid", "Leila", "Omar", "Hind", "Anas", "Meryem", "Bilal", "Zineb",
  "Hamza", "Kenza", "Ayoub", "Rim", "Ilyas", "Ghita", "Adam", "Salwa",
];

const LAST_NAMES = [
  "Jerada", "Bennani", "El Amrani", "Tazi", "Cherkaoui", "Idrissi", "Alaoui",
  "Benjelloun", "Ouazzani", "Berrada", "Sekkat", "Lahlou", "Fassi", "Naciri",
];

/**
 * Part de la jauge par catégorie et prix facial — un événement n'est pas homogène.
 * Les mêmes valeurs que `analytics/tidar_sim/config.py` : la démo et le simulateur
 * doivent décrire le même monde, sinon le score de risque embarqué verrait ici des
 * distributions qu'il n'a jamais rencontrées à l'entraînement.
 */
const CATEGORIES: { name: string; share: number; facePrice: number }[] = [
  { name: "Standard", share: 0.62, facePrice: 250 },
  { name: "VIP", share: 0.14, facePrice: 700 },
  { name: "Étudiant", share: 0.18, facePrice: 120 },
  { name: "Invitation", share: 0.06, facePrice: 0 },
];

const CHANNELS = ["web", "guichet", "revendeur", "invitation"] as const;
const CHANNEL_WEIGHTS = [0.68, 0.16, 0.1, 0.06];

export const demoEvents: EventSummary[] = [
  {
    id: "evt-1",
    name: "Nayda Festival — Soirée 2",
    venue: "Complexe Al Amal, Casablanca",
    doorsAt: "2026-08-14T19:00:00.000Z",
    showAt: "2026-08-14T20:30:00.000Z",
    ticketsSold: 420,
  },
  {
    id: "evt-2",
    name: "Jazzablanca — Scène Anfa",
    venue: "Anfa Park, Casablanca",
    doorsAt: "2026-08-22T18:30:00.000Z",
    showAt: "2026-08-22T20:00:00.000Z",
    ticketsSold: 260,
  },
];

function buildTickets(eventId: string, count: number, seed: number): Ticket[] {
  const random = rng(seed);
  const tickets: Ticket[] = [];

  for (let i = 0; i < count; i += 1) {
    const first = FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)] ?? "Ammar";
    const last = LAST_NAMES[Math.floor(random() * LAST_NAMES.length)] ?? "Jerada";

    // Tirage de la catégorie selon les parts déclarées.
    let roll = random();
    let category = "Standard";
    let facePrice = 250;
    for (const c of CATEGORIES) {
      if (roll < c.share) {
        category = c.name;
        facePrice = c.facePrice;
        break;
      }
      roll -= c.share;
    }

    let channelRoll = random();
    let channel: string = "web";
    for (let k = 0; k < CHANNELS.length; k += 1) {
      const weight = CHANNEL_WEIGHTS[k] ?? 0;
      if (channelRoll < weight) {
        channel = CHANNELS[k] ?? "web";
        break;
      }
      channelRoll -= weight;
    }

    // Un billet revendu se paie au-dessus du facial ; une invitation, rien.
    const pricePaid = channel === "revendeur" ? facePrice * (1.1 + random() * 1.3) : facePrice;

    // Quelques billets annulés ou remboursés : sans eux, ces branches du moteur
    // ne seraient jamais visibles en démonstration.
    const statusRoll = random();
    const status: Ticket["status"] =
      statusRoll < 0.02 ? "revoked" : statusRoll < 0.045 ? "refunded" : "valid";

    const serial = String(1000 + i);
    tickets.push({
      id: `${eventId}-t${i}`,
      code: `TDR-${eventId.slice(-1)}${serial}`,
      eventId,
      holderName: `${first} ${last}`,
      holderEmail: `${first.toLowerCase()}.${last.split(" ").join("").toLowerCase()}${i}@example.ma`,
      category,
      status,
      purchasedAt: new Date(
        Date.parse("2026-06-15T00:00:00.000Z") + random() * 50 * 86_400_000,
      ).toISOString(),
      facePrice,
      pricePaid,
      channel,
      orderSize: 1 + Math.floor(random() * 4),
      buyerPastEvents: Math.floor(random() * 4),
      buyerPastDisputes: random() < 0.03 ? 1 : 0,
    });
  }
  return tickets;
}

export const demoTickets: Ticket[] = [
  ...buildTickets("evt-1", 420, 20260814),
  ...buildTickets("evt-2", 260, 20260822),
];

/**
 * Historique d'entrées déjà consigné, pour que le tableau de bord ne s'ouvre pas
 * sur des compteurs à zéro et une courbe plate.
 *
 * L'intensité suit une double bosse : quelques arrivées à l'ouverture, puis la
 * montée forte à l'approche du concert.
 */
export function buildDemoScans(now: Date, tickets: Ticket[], eventId: string): ScanRecord[] {
  const random = rng(7);
  const pool = tickets.filter((t) => t.eventId === eventId && t.status === "valid");
  const scans: ScanRecord[] = [];
  const gates = ["A", "B"];
  const operators = ["Karim", "Salma"];

  const windowMinutes = 75;
  const admitted = Math.min(pool.length, 168);

  for (let i = 0; i < admitted; i += 1) {
    const ticket = pool[i];
    if (!ticket) break;

    // Deux bosses : ouverture (~t-70 min) puis pic avant le début (~t-15 min).
    const early = random() < 0.35;
    const centre = early ? 0.15 : 0.78;
    const spread = early ? 0.12 : 0.16;
    const position = Math.min(0.99, Math.max(0.01, centre + (random() - 0.5) * spread * 2));
    const minutesAgo = windowMinutes * (1 - position);

    scans.push({
      id: `demo-${i}`,
      code: ticket.code,
      eventId,
      gate: gates[i % gates.length] ?? "A",
      operator: operators[i % operators.length] ?? "Karim",
      at: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
      outcome: "admit",
      manual: random() < 0.03,
      reverted: false,
      synced: true,
    });
  }

  // Une poignée de refus, pour que les compteurs de la soirée ne soient pas
  // suspicieusement parfaits — et pour montrer le verdict rouge en démonstration.
  //
  // Les deux motifs de refus ne se fabriquent pas de la même façon, et les
  // confondre rendrait la démo incohérente : un doublon porte forcément un code
  // *présent* dans la liste et déjà admis, tandis qu'un code inconnu doit être
  // absent de la liste — sinon l'app affiche un nom de porteur pour un billet
  // qu'elle est censée ne pas connaître.
  for (let i = 0; i < 3; i += 1) {
    const ticket = pool[i];
    if (!ticket) break;
    scans.push({
      id: `demo-dup-${i}`,
      code: ticket.code,
      eventId,
      gate: "B",
      operator: "Salma",
      at: new Date(now.getTime() - random() * 40 * 60_000).toISOString(),
      outcome: "duplicate",
      manual: false,
      reverted: false,
      synced: true,
    });
  }

  for (let i = 0; i < 3; i += 1) {
    // Sérial hors de la plage émise (1000–1419) : un billet forgé, pas un billet d'ici.
    scans.push({
      id: `demo-unknown-${i}`,
      code: `TDR-${eventId.slice(-1)}${9900 + i}`,
      eventId,
      gate: "B",
      operator: "Salma",
      at: new Date(now.getTime() - random() * 40 * 60_000).toISOString(),
      outcome: "unknown",
      manual: false,
      reverted: false,
      synced: true,
    });
  }

  return scans.sort((a, b) => a.at.localeCompare(b.at));
}
