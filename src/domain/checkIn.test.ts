/**
 * Toutes les règles d'entrée, sans caméra, sans serveur, sans écran.
 *
 * C'est la démonstration concrète de l'intérêt du découpage : dans la v1, aucune
 * de ces vérifications n'était possible sans un téléphone et l'API en ligne.
 */
import { describe, expect, it } from "@jest/globals";

import { admitManually, canRevert, checkIn, formatElapsed, normalizeCode, revert } from "./checkIn";
import type { GateContext, LedgerView, ScanRecord, Ticket } from "./types";

const NOW = new Date("2026-08-14T21:30:00.000Z");

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: "t1",
  code: "TDR-1001",
  eventId: "evt-1",
  holderName: "Ammar Jerada",
  holderEmail: "ammar@example.com",
  category: "VIP",
  status: "valid",
  purchasedAt: "2026-07-01T10:00:00.000Z",
  facePrice: 700,
  pricePaid: 700,
  channel: "web",
  orderSize: 2,
  buyerPastEvents: 1,
  buyerPastDisputes: 0,
  ...over,
});

const gate = (over: Partial<GateContext> = {}): GateContext => ({
  eventId: "evt-1",
  gate: "A",
  operator: "Karim",
  now: NOW,
  ...over,
});

/** La vue dont le moteur a besoin tient en trois fonctions. */
const view = (tickets: Ticket[], admissions: ScanRecord[] = [], synced = true): LedgerView => ({
  findTicket: (code) => tickets.find((t) => t.code === code),
  findAdmission: (code) => admissions.find((s) => s.code === code),
  hasGuestList: () => synced,
});

const admission = (over: Partial<ScanRecord> = {}): ScanRecord => ({
  id: "s1",
  code: "TDR-1001",
  eventId: "evt-1",
  gate: "B",
  operator: "Salma",
  at: "2026-08-14T21:18:00.000Z",
  outcome: "admit",
  manual: false,
  reverted: false,
  synced: true,
  ...over,
});

describe("normalizeCode", () => {
  it("absorbe la casse et les espaces des lecteurs de QR", () => {
    expect(normalizeCode("  tdr-1001\n")).toBe("TDR-1001");
    expect(normalizeCode("tdr 1001")).toBe("TDR1001");
  });
});

describe("checkIn", () => {
  it("laisse entrer un billet valide", () => {
    const { verdict, record } = checkIn("TDR-1001", view([ticket()]), gate());
    expect(verdict.kind).toBe("admit");
    expect(verdict.tone).toBe("go");
    expect(verdict.detail).toContain("Ammar Jerada");
    expect(record.outcome).toBe("admit");
    expect(record.synced).toBe(false);
  });

  it("accepte un code mal formaté par le lecteur", () => {
    const { verdict } = checkIn(" tdr-1001 ", view([ticket()]), gate());
    expect(verdict.kind).toBe("admit");
  });

  it("refuse un code absent de la liste", () => {
    const { verdict } = checkIn("TDR-9999", view([ticket()]), gate());
    expect(verdict.kind).toBe("unknown");
    expect(verdict.tone).toBe("stop");
  });

  it("refuse de trancher quand la liste n'a pas été synchronisée", () => {
    const { verdict } = checkIn("TDR-9999", view([], [], false), gate());
    expect(verdict.kind).toBe("review");
    expect(verdict.tone).toBe("hold");
  });

  it("refuse un billet d'un autre événement", () => {
    const { verdict } = checkIn("TDR-1001", view([ticket({ eventId: "evt-2" })]), gate());
    expect(verdict.kind).toBe("wrong_event");
  });

  it("refuse un billet annulé ou remboursé", () => {
    expect(checkIn("TDR-1001", view([ticket({ status: "revoked" })]), gate()).verdict.kind).toBe("revoked");
    expect(checkIn("TDR-1001", view([ticket({ status: "refunded" })]), gate()).verdict.kind).toBe("refunded");
  });

  it("signale un doublon avec le quand, le où et le qui", () => {
    const { verdict } = checkIn("TDR-1001", view([ticket()], [admission()]), gate());
    expect(verdict.kind).toBe("duplicate");
    expect(verdict.detail).toBe("il y a 12 min · porte B · Salma");
    expect(verdict.priorScan?.id).toBe("s1");
  });

  it("dit « ici même » quand le doublon vient de la même porte", () => {
    const { verdict } = checkIn("TDR-1001", view([ticket()], [admission({ gate: "A" })]), gate());
    expect(verdict.detail).toContain("ici même");
  });

  it("marque un code vide comme illisible plutôt que comme inconnu", () => {
    const { verdict } = checkIn("   ", view([ticket()]), gate());
    expect(verdict.kind).toBe("unreadable");
    expect(verdict.tone).toBe("hold");
  });

  it("consigne aussi les refus", () => {
    const { record } = checkIn("TDR-9999", view([ticket()]), gate());
    expect(record.outcome).toBe("unknown");
    expect(record.at).toBe(NOW.toISOString());
    expect(record.gate).toBe("A");
  });

  it("évalue les règles dans l'ordre : un billet annulé prime sur un doublon", () => {
    const { verdict } = checkIn(
      "TDR-1001",
      view([ticket({ status: "revoked" })], [admission()]),
      gate(),
    );
    expect(verdict.kind).toBe("revoked");
  });
});

describe("admitManually", () => {
  it("marque l'entrée comme manuelle", () => {
    const { record, verdict } = admitManually(ticket(), view([ticket()]), gate());
    expect(verdict.kind).toBe("admit");
    expect(record.manual).toBe(true);
  });

  it("détecte le doublon aussi par la saisie manuelle", () => {
    const { verdict } = admitManually(ticket(), view([ticket()], [admission()]), gate());
    expect(verdict.kind).toBe("duplicate");
  });
});

describe("annulation", () => {
  it("reste possible dans la minute qui suit", () => {
    const record = admission({ at: NOW.toISOString() });
    expect(canRevert(record, new Date(NOW.getTime() + 30_000))).toBe(true);
    expect(canRevert(record, new Date(NOW.getTime() + 90_000))).toBe(false);
  });

  it("marque le scan sans l'effacer, et le remet dans la file de synchro", () => {
    const reverted = revert(admission());
    expect(reverted.reverted).toBe(true);
    expect(reverted.synced).toBe(false);
    expect(reverted.id).toBe("s1");
  });

  it("ne s'applique pas deux fois", () => {
    expect(canRevert(revert(admission({ at: NOW.toISOString() })), NOW)).toBe(false);
  });
});

describe("formatElapsed", () => {
  it("arrondit lisiblement", () => {
    expect(formatElapsed(NOW.toISOString(), NOW)).toBe("à l'instant");
    expect(formatElapsed("2026-08-14T21:25:00.000Z", NOW)).toBe("il y a 5 min");
    expect(formatElapsed("2026-08-14T19:25:00.000Z", NOW)).toBe("il y a 2 h 05");
  });
});

/**
 * Le score de risque ne change qu'une branche : le second passage. Partout
 * ailleurs, le moteur doit se comporter exactement comme avant — c'est ce que
 * ces tests verrouillent, en plus des trois issues du doublon.
 */
describe("second passage arbitré par le score de risque", () => {
  const scorer = (band: "clear" | "verify" | "refuse") => () => ({
    probability: band === "clear" ? 0.05 : band === "verify" ? 0.6 : 0.97,
    band,
    reason: "motif de test",
  });

  it("laisse entrer un retour jugé légitime", () => {
    const result = checkIn("TDR-1001", view([ticket()], [admission()]), gate(), scorer("clear"));
    expect(result.verdict.kind).toBe("re_entry");
    expect(result.verdict.tone).toBe("go");
    expect(result.record.outcome).toBe("re_entry");
  });

  it("envoie vérifier quand le modèle hésite, plutôt que de refouler", () => {
    const result = checkIn("TDR-1001", view([ticket()], [admission()]), gate(), scorer("verify"));
    expect(result.verdict.kind).toBe("review");
    expect(result.verdict.tone).toBe("hold");
    expect(result.verdict.detail).toContain("pièce d'identité");
  });

  it("refuse quand le risque est élevé", () => {
    const result = checkIn("TDR-1001", view([ticket()], [admission()]), gate(), scorer("refuse"));
    expect(result.verdict.kind).toBe("duplicate");
    expect(result.verdict.tone).toBe("stop");
  });

  it("retombe sur le refus systématique sans scoreur", () => {
    const result = checkIn("TDR-1001", view([ticket()], [admission()]), gate());
    expect(result.verdict.kind).toBe("duplicate");
    expect(result.verdict.risk).toBeUndefined();
  });

  it("attache le score au verdict pour que l écran puisse l expliquer", () => {
    const result = checkIn("TDR-1001", view([ticket()], [admission()]), gate(), scorer("verify"));
    expect(result.verdict.risk?.probability).toBeCloseTo(0.6, 5);
    expect(result.verdict.risk?.reason).toBe("motif de test");
  });

  it("ne consulte pas le modele sur un premier passage", () => {
    let called = false;
    const spy = () => {
      called = true;
      return { probability: 1, band: "refuse" as const, reason: "" };
    };
    const result = checkIn("TDR-1001", view([ticket()], []), gate(), spy);
    expect(result.verdict.kind).toBe("admit");
    expect(called).toBe(false);
  });
});
