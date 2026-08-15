/**
 * Choix de l'adaptateur serveur.
 *
 * Sans `EXPO_PUBLIC_API_URL`, l'app tourne sur le client de démonstration : elle
 * démarre et se manipule entièrement hors ligne. Avec l'URL, elle parle au vrai
 * backend. Aucun écran ne connaît la différence.
 */
import { createDemoClient, createHttpClient, type ApiClient } from "./api";
import { demoEvents, demoTickets } from "./seed";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? null;

export const isDemoMode = API_URL === null;

export function createClient(getToken: () => string | null): ApiClient {
  if (!API_URL) {
    return createDemoClient({ events: demoEvents, tickets: demoTickets });
  }
  return createHttpClient({ baseUrl: API_URL, getToken });
}
