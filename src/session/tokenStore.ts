/**
 * Le jeton d'accès, au Keychain (iOS) ou au Keystore (Android).
 *
 * Remplace le `Bearer` écrit en dur dans `ScanPage.js` de la v1 : un binaire
 * mobile se décompile, donc aucun secret ne doit vivre dans le code. Le jeton
 * s'obtient par connexion et ne quitte jamais le stockage sécurisé.
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "tidar.session.token";

/** SecureStore n'existe pas sur le web : on n'y persiste rien plutôt que de planter. */
const available = Platform.OS !== "web";

export async function saveToken(token: string): Promise<void> {
  if (!available) return;
  await SecureStore.setItemAsync(KEY, token);
}

export async function readToken(): Promise<string | null> {
  if (!available) return null;
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function clearToken(): Promise<void> {
  if (!available) return;
  await SecureStore.deleteItemAsync(KEY);
}
