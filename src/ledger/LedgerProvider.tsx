/**
 * L'état de la soirée : la liste, les scans, la file d'attente de synchronisation.
 *
 * Deux partis pris structurent ce fichier.
 *
 * 1. **Le verdict est synchrone.** `submitScan` ne fait aucun appel réseau et
 *    n'attend aucune écriture disque : il lit un instantané en mémoire, applique
 *    le moteur, et rend la main. La persistance se fait après coup. C'est ce qui
 *    permet de tenir une file — la v1 attendait un aller-retour HTTP par personne.
 *
 * 2. **Le hors-ligne est le mode normal, pas un mode dégradé.** La liste est
 *    téléchargée une fois, les scans s'empilent localement, et la remontée est
 *    une opération de fond qui peut échouer sans conséquence pour l'agent.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { isDemoMode } from "@/data/client";
import {
  createAsyncStorageStore,
  emptySnapshot,
  pendingScans,
  toView,
  type LedgerSnapshot,
} from "@/data/ledger";
import { buildDemoScans } from "@/data/seed";
import { admitManually, canRevert, checkIn, revert, type RiskScorer } from "@/domain/checkIn";
import { assessRisk, riskInputFromLedger } from "@/domain/risk";
import { tally, type EventTally } from "@/domain/stats";
import type { CheckInResult, EventSummary, GateContext, ScanRecord, Ticket } from "@/domain/types";
import { useSession } from "@/session/SessionProvider";

interface LedgerValue {
  snapshot: LedgerSnapshot;
  ready: boolean;
  syncing: boolean;
  pendingCount: number;
  totals: EventTally;
  lastResult: CheckInResult | null;
  chooseEvent(event: EventSummary): Promise<void>;
  submitScan(code: string): CheckInResult;
  submitManual(ticket: Ticket): CheckInResult;
  /** Annule le dernier passage de cet agent, dans la minute. `null` si rien à annuler. */
  undoLast(): ScanRecord | null;
  undoableRecord(): ScanRecord | null;
  /** Tranche un cas litigieux — et produit l'étiquette du prochain entraînement. */
  resolve(scanId: string, resolution: "admitted" | "refused"): void;
  flush(): Promise<number>;
}

const LedgerContext = createContext<LedgerValue | null>(null);

const store = createAsyncStorageStore();

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const { api, gate, operator, status } = useSession();

  const [snapshot, setSnapshot] = useState<LedgerSnapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<CheckInResult | null>(null);

  // La ref porte la vérité pendant un scan ; l'état ne sert qu'à rendre l'UI.
  const snapshotRef = useRef<LedgerSnapshot>(emptySnapshot);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      const loaded = await store.read();
      snapshotRef.current = loaded;
      setSnapshot(loaded);
      setReady(true);
    })();
  }, []);

  /**
   * Écriture différée : une rafale de scans ne doit pas déclencher une écriture
   * disque par personne. 400 ms suffisent pour absorber la file sans risquer de
   * perdre plus d'un scan si l'app est tuée.
   */
  const commit = useCallback((next: LedgerSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      void store.write(snapshotRef.current);
    }, 400);
  }, []);

  useEffect(
    () => () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
      void store.write(snapshotRef.current);
    },
    [],
  );

  const gateContext = useCallback(
    (): GateContext => ({
      eventId: snapshotRef.current.event?.id ?? "",
      gate,
      operator: operator?.name ?? "agent",
      now: new Date(),
    }),
    [gate, operator],
  );

  const chooseEvent = useCallback(
    async (event: EventSummary) => {
      setSyncing(true);
      try {
        const tickets = await api.guestList(event.id);
        const current = snapshotRef.current;

        // On ne jette jamais de scan : re-choisir la soirée en cours pour
        // rafraîchir la liste ne doit pas effacer le travail déjà fait, et la
        // file d'attente d'une soirée précédente doit pouvoir encore partir.
        const kept = current.scans;
        const alreadyHasHistory = kept.some((s) => s.eventId === event.id);

        commit({
          event,
          tickets,
          scans:
            isDemoMode && !alreadyHasHistory
              ? [...kept, ...buildDemoScans(new Date(), tickets, event.id)]
              : kept,
          syncedAt: new Date().toISOString(),
        });
      } finally {
        setSyncing(false);
      }
    },
    [api, commit],
  );

  const append = useCallback(
    (result: CheckInResult) => {
      const current = snapshotRef.current;
      commit({ ...current, scans: [...current.scans, result.record] });
      setLastResult(result);
      return result;
    },
    [commit],
  );

  /**
   * Le scoreur de risque, construit à chaque scan sur l'état courant.
   *
   * Il vit ici parce que c'est le seul endroit qui connaît à la fois la soirée
   * (horaires des portes et du concert), le poste (la porte) et l'historique
   * complet des scans — les trois ingrédients des features. `checkIn` reste pur
   * et ne sait rien du modèle.
   */
  const riskScorer = useCallback((): RiskScorer | undefined => {
    const current = snapshotRef.current;
    const event = current.event;
    if (!event) return undefined;

    return (ticket) => {
      const now = new Date();
      const input = riskInputFromLedger(
        ticket.code,
        ticket,
        toView(current),
        {
          doorsAt: event.doorsAt,
          showAt: event.showAt,
          gate,
          now,
          manual: false,
        },
        current.scans.filter((s) => s.eventId === event.id),
      );
      const { probability, band, reason } = assessRisk(input);
      return { probability, band, reason };
    };
  }, [gate]);

  const submitScan = useCallback(
    (code: string) =>
      append(checkIn(code, toView(snapshotRef.current), gateContext(), riskScorer())),
    [append, gateContext, riskScorer],
  );

  const submitManual = useCallback(
    (ticket: Ticket) => append(admitManually(ticket, toView(snapshotRef.current), gateContext())),
    [append, gateContext],
  );

  const undoableRecord = useCallback((): ScanRecord | null => {
    const now = new Date();
    const mine = snapshotRef.current.scans
      .filter((s) => s.outcome === "admit" && s.operator === (operator?.name ?? "agent"))
      .reverse();
    const last = mine.find((s) => canRevert(s, now));
    return last ?? null;
  }, [operator]);

  const undoLast = useCallback((): ScanRecord | null => {
    const target = undoableRecord();
    if (!target) return null;
    const current = snapshotRef.current;
    const reverted = revert(target);
    commit({
      ...current,
      scans: current.scans.map((s) => (s.id === target.id ? reverted : s)),
    });
    setLastResult(null);
    return reverted;
  }, [commit, undoableRecord]);

  /**
   * Consigne la décision finale de l'agent sur un cas litigieux.
   *
   * Le scan repart en `synced: false` : la décision doit remonter au serveur,
   * c'est elle qui a de la valeur pour le réentraînement, davantage que le scan
   * initial qui, lui, ne dit que ce que le modèle avait cru.
   */
  const resolve = useCallback(
    (scanId: string, resolution: "admitted" | "refused") => {
      const current = snapshotRef.current;
      commit({
        ...current,
        scans: current.scans.map((s) =>
          s.id === scanId ? { ...s, resolution, synced: false } : s,
        ),
      });
    },
    [commit],
  );

  const flush = useCallback(async (): Promise<number> => {
    const waiting = pendingScans(snapshotRef.current);
    if (waiting.length === 0) return 0;

    setSyncing(true);
    try {
      const { accepted } = await api.pushScans(waiting);
      const acceptedIds = new Set(accepted);
      const current = snapshotRef.current;
      commit({
        ...current,
        scans: current.scans.map((s) => (acceptedIds.has(s.id) ? { ...s, synced: true } : s)),
      });
      return acceptedIds.size;
    } finally {
      setSyncing(false);
    }
  }, [api, commit]);

  // Remontée opportuniste : à la connexion et à chaque fois que la file grossit,
  // sans jamais bloquer l'agent si le réseau ne répond pas.
  useEffect(() => {
    if (status !== "signedIn" || !ready) return;
    const timer = setTimeout(() => {
      void flush().catch(() => undefined);
    }, 3000);
    return () => clearTimeout(timer);
  }, [status, ready, snapshot.scans.length, flush]);

  const totals = useMemo(
    () => tally(snapshot.tickets, snapshot.scans, snapshot.event?.id ?? ""),
    [snapshot],
  );

  const value = useMemo<LedgerValue>(
    () => ({
      snapshot,
      ready,
      syncing,
      pendingCount: pendingScans(snapshot).length,
      totals,
      lastResult,
      chooseEvent,
      submitScan,
      submitManual,
      undoLast,
      undoableRecord,
      resolve,
      flush,
    }),
    [snapshot, ready, syncing, totals, lastResult, chooseEvent, submitScan, submitManual, undoLast, undoableRecord, resolve, flush],
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerValue {
  const value = useContext(LedgerContext);
  if (!value) throw new Error("useLedger doit être appelé sous <LedgerProvider>");
  return value;
}
