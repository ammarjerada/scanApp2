import { describe, expect, it } from "@jest/globals";

import { admittedCodes, arrivalBuckets, shiftStats, tally } from "./stats";
import type { ScanRecord, Ticket } from "./types";

const NOW = new Date("2026-08-14T22:00:00.000Z");

const ticket = (code: string, category: string, over: Partial<Ticket> = {}): Ticket => ({
  id: code,
  code,
  eventId: "evt-1",
  holderName: code,
  holderEmail: `${code}@example.ma`,
  category,
  status: "valid",
  purchasedAt: "2026-07-01T00:00:00.000Z",
  facePrice: 250,
  pricePaid: 250,
  channel: "web",
  orderSize: 1,
  buyerPastEvents: 0,
  buyerPastDisputes: 0,
  ...over,
});

const scan = (code: string, over: Partial<ScanRecord> = {}): ScanRecord => ({
  id: `s-${code}-${over.at ?? ""}`,
  code,
  eventId: "evt-1",
  gate: "A",
  operator: "Karim",
  at: NOW.toISOString(),
  outcome: "admit",
  manual: false,
  reverted: false,
  synced: false,
  ...over,
});

describe("admittedCodes", () => {
  it("dédoublonne : deux scans du même code ne font qu'une entrée", () => {
    const codes = admittedCodes([scan("A"), scan("A"), scan("B")]);
    expect(codes.size).toBe(2);
  });

  it("ignore les passages annulés", () => {
    expect(admittedCodes([scan("A", { reverted: true })]).size).toBe(0);
  });

  it("ignore les refus", () => {
    expect(admittedCodes([scan("A", { outcome: "duplicate" })]).size).toBe(0);
  });
});

describe("tally", () => {
  const tickets = [
    ticket("A", "VIP"),
    ticket("B", "VIP"),
    ticket("C", "Standard"),
    ticket("D", "Standard", { eventId: "evt-2" }),
  ];

  it("ne compte que l'événement demandé", () => {
    const result = tally(tickets, [scan("A")], "evt-1");
    expect(result.total).toBe(3);
    expect(result.admitted).toBe(1);
  });

  it("ventile par catégorie", () => {
    const result = tally(tickets, [scan("A"), scan("C")], "evt-1");
    const vip = result.byCategory.find((c) => c.category === "VIP");
    expect(vip).toEqual({ category: "VIP", admitted: 1, total: 2 });
  });

  it("compte les refus mais pas les cas à vérifier", () => {
    const result = tally(
      tickets,
      [scan("X", { outcome: "unknown" }), scan("Y", { outcome: "review" })],
      "evt-1",
    );
    expect(result.refused).toBe(1);
  });
});

describe("arrivalBuckets", () => {
  it("range chaque entrée dans sa tranche, la plus récente en dernier", () => {
    const buckets = arrivalBuckets(
      [
        scan("A", { at: new Date(NOW.getTime() - 2 * 60_000).toISOString() }),
        scan("B", { at: new Date(NOW.getTime() - 2 * 60_000).toISOString() }),
        scan("C", { at: new Date(NOW.getTime() - 32 * 60_000).toISOString() }),
      ],
      NOW,
    );
    expect(buckets).toHaveLength(12);
    expect(buckets[11]).toBe(2);
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("écarte ce qui sort de la fenêtre", () => {
    const buckets = arrivalBuckets(
      [scan("A", { at: new Date(NOW.getTime() - 3 * 3600_000).toISOString() })],
      NOW,
    );
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("shiftStats", () => {
  it("ne compte que les scans de l'agent", () => {
    const stats = shiftStats([scan("A"), scan("B", { operator: "Salma" })], "Karim", NOW);
    expect(stats.scans).toBe(1);
  });

  it("renvoie zéro sans planter quand l'agent n'a rien scanné", () => {
    expect(shiftStats([], "Karim", NOW)).toEqual({ scans: 0, admitted: 0, perMinute: 0 });
  });

  it("calcule un rythme depuis le premier scan", () => {
    const stats = shiftStats(
      [
        scan("A", { at: new Date(NOW.getTime() - 10 * 60_000).toISOString() }),
        scan("B", { at: new Date(NOW.getTime() - 5 * 60_000).toISOString() }),
      ],
      "Karim",
      NOW,
    );
    expect(stats.perMinute).toBeCloseTo(0.2, 1);
  });
});
