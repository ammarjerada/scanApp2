/**
 * Le registre local de la soirée : l'événement courant, sa liste de billets et
 * tous les scans consignés.
 *
 * `LedgerStore` est la couture avec le stockage. Deux implémentations existent —
 * mémoire et AsyncStorage — ce qui rend la couture réelle et non hypothétique :
 * les tests tournent sur la première, l'app sur la seconde, sans qu'aucune règle
 * métier ne sache laquelle. Le jour où le volume justifie SQLite, on écrit une
 * troisième implémentation et rien d'autre ne bouge.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { EventSummary, LedgerView, ScanRecord, Ticket } from "@/domain/types";

export interface LedgerSnapshot {
  event: EventSummary | null;
  tickets: Ticket[];
  scans: ScanRecord[];
  /** Dernière synchronisation réussie de la liste, ISO. `null` = jamais. */
  syncedAt: string | null;
}

export const emptySnapshot: LedgerSnapshot = {
  event: null,
  tickets: [],
  scans: [],
  syncedAt: null,
};

export interface LedgerStore {
  read(): Promise<LedgerSnapshot>;
  write(snapshot: LedgerSnapshot): Promise<void>;
}

/** Adaptateur mémoire — tests et prévisualisation. */
export function createMemoryStore(initial: LedgerSnapshot = emptySnapshot): LedgerStore {
  let state = initial;
  return {
    async read() {
      return state;
    },
    async write(snapshot) {
      state = snapshot;
    },
  };
}

const STORAGE_KEY = "tidar.ledger.v2";

/** Adaptateur appareil. Le registre survit à la fermeture de l'app — et à la coupure réseau. */
export function createAsyncStorageStore(): LedgerStore {
  return {
    async read() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as LedgerSnapshot) : emptySnapshot;
      } catch {
        // Un registre illisible ne doit pas empêcher l'agent de travailler :
        // on repart d'un registre vide plutôt que de planter à l'ouverture.
        return emptySnapshot;
      }
    },
    async write(snapshot) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    },
  };
}

/**
 * Transforme un instantané en la vue étroite que réclame le moteur de contrôle.
 *
 * Les index sont construits une fois par scan plutôt qu'à chaque recherche :
 * sur une liste de plusieurs milliers de billets, un `find` linéaire par lecture
 * de QR se sent au doigt.
 */
export function toView(snapshot: LedgerSnapshot): LedgerView {
  const ticketsByCode = new Map(snapshot.tickets.map((t) => [t.code, t]));

  const admissionByCode = new Map<string, ScanRecord>();
  for (const scan of snapshot.scans) {
    if (scan.outcome !== "admit" || scan.reverted) continue;
    const existing = admissionByCode.get(scan.code);
    // On garde la première entrée : c'est elle qui fait foi, les suivantes sont les doublons.
    if (!existing || scan.at < existing.at) admissionByCode.set(scan.code, scan);
  }

  return {
    findTicket: (code) => ticketsByCode.get(code),
    findAdmission: (code) => admissionByCode.get(code),
    hasGuestList: () => snapshot.syncedAt !== null && snapshot.tickets.length > 0,
  };
}

/** Les scans qui attendent d'être remontés au serveur. */
export function pendingScans(snapshot: LedgerSnapshot): ScanRecord[] {
  return snapshot.scans.filter((s) => !s.synced);
}
