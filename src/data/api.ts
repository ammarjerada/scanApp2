/**
 * Le seul endroit de l'app qui sait que `tidar.ma` existe.
 *
 * Dans la v1, l'URL, l'en-tête d'autorisation et le format d'erreur étaient
 * recopiés dans deux écrans — dont l'un portait un jeton en clair. Ici la
 * connaissance du serveur est concentrée derrière une interface de quatre
 * méthodes, et le jeton n'est jamais écrit dans le code : il est fourni à
 * l'exécution par la session.
 */
import type { EventSummary, ScanRecord, Ticket } from "@/domain/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface Operator {
  id: string;
  name: string;
  email: string;
}

export interface ApiClient {
  signIn(email: string, password: string): Promise<{ token: string; operator: Operator }>;
  listEvents(): Promise<EventSummary[]>;
  /** Toute la liste d'un coup : c'est ce téléchargement qui rend le hors-ligne possible. */
  guestList(eventId: string): Promise<Ticket[]>;
  /** Remonte la file locale. Renvoie les identifiants réellement acceptés. */
  pushScans(records: ScanRecord[]): Promise<{ accepted: string[] }>;
}

export interface HttpClientOptions {
  baseUrl: string;
  /** Lu à chaque appel : après une reconnexion, le nouveau jeton est pris sans redémarrage. */
  getToken: () => string | null;
  /** Une soirée se déroule souvent en réseau dégradé : mieux vaut échouer vite et rejouer. */
  timeoutMs?: number;
}

export function createHttpClient({
  baseUrl,
  getToken,
  timeoutMs = 8000,
}: HttpClientOptions): ApiClient {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const token = getToken();

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      });

      if (!response.ok) {
        throw new ApiError(response.status, `${init.method ?? "GET"} ${path} → ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiError(0, "Délai dépassé");
      }
      throw new ApiError(0, "Réseau indisponible");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    signIn: (email, password) =>
      request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    listEvents: () => request("/events"),
    guestList: (eventId) => request(`/events/${encodeURIComponent(eventId)}/tickets`),
    pushScans: (records) =>
      request("/scans", { method: "POST", body: JSON.stringify({ scans: records }) }),
  };
}

/**
 * Client de démonstration : la même interface, servie depuis les données locales.
 *
 * C'est ce qui permet de cloner le dépôt et de lancer l'app sans backend, sans
 * compte et sans jeton — et c'est aussi la deuxième implémentation qui prouve
 * que la couture tient.
 */
export function createDemoClient(seed: {
  events: EventSummary[];
  tickets: Ticket[];
  latencyMs?: number;
}): ApiClient {
  const wait = () => new Promise((resolve) => setTimeout(resolve, seed.latencyMs ?? 350));

  return {
    async signIn(email) {
      await wait();
      const name = email.split("@")[0] ?? "agent";
      return {
        token: "demo-token",
        operator: { id: "demo", name: name.charAt(0).toUpperCase() + name.slice(1), email },
      };
    },
    async listEvents() {
      await wait();
      return seed.events;
    },
    async guestList(eventId) {
      await wait();
      return seed.tickets.filter((t) => t.eventId === eventId);
    },
    async pushScans(records) {
      await wait();
      return { accepted: records.map((r) => r.id) };
    },
  };
}
