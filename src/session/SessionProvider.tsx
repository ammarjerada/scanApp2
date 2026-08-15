/**
 * Qui est connecté, à quelle porte.
 *
 * La v1 affichait une alerte « Logged in successfully » et n'en tirait rien :
 * pas de jeton conservé, pas de redirection, toutes les routes ouvertes. Ici la
 * session est un état applicatif, et c'est elle qui décide de ce que le routeur
 * affiche.
 *
 * La porte fait partie de la session, pas des réglages : elle est estampillée
 * sur chaque scan, donc l'agent doit la choisir avant de scanner.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, type ApiClient, type Operator } from "@/data/api";
import { createClient } from "@/data/client";
import { clearToken, readToken, saveToken } from "./tokenStore";

const GATE_KEY = "tidar.session.gate";

export const GATES = ["A", "B", "C", "Presse"] as const;

type Status = "loading" | "signedOut" | "signedIn";

interface SessionValue {
  status: Status;
  operator: Operator | null;
  gate: string;
  api: ApiClient;
  pending: boolean;
  error: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  setGate(gate: string): void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [operator, setOperator] = useState<Operator | null>(null);
  const [gate, setGateState] = useState<string>("A");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le jeton vit dans une ref : le client HTTP le relit à chaque appel sans être
  // recréé, donc aucun écran n'a besoin de le connaître ni de se re-rendre.
  const tokenRef = useRef<string | null>(null);
  const api = useMemo(() => createClient(() => tokenRef.current), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [token, storedGate] = await Promise.all([readToken(), AsyncStorage.getItem(GATE_KEY)]);
      if (cancelled) return;
      if (storedGate) setGateState(storedGate);
      if (token) {
        tokenRef.current = token;
        const raw = await AsyncStorage.getItem("tidar.session.operator");
        if (raw) setOperator(JSON.parse(raw) as Operator);
        setStatus("signedIn");
      } else {
        setStatus("signedOut");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setPending(true);
      setError(null);
      try {
        const { token, operator: who } = await api.signIn(email.trim(), password);
        tokenRef.current = token;
        await Promise.all([
          saveToken(token),
          AsyncStorage.setItem("tidar.session.operator", JSON.stringify(who)),
        ]);
        setOperator(who);
        setStatus("signedIn");
      } catch (e) {
        // Un message qui dit quoi faire, pas un code d'erreur recopié.
        setError(
          e instanceof ApiError && e.status === 401
            ? "Identifiants incorrects."
            : "Connexion impossible. Vérifiez le réseau et réessayez.",
        );
        throw e;
      } finally {
        setPending(false);
      }
    },
    [api],
  );

  const signOut = useCallback(async () => {
    tokenRef.current = null;
    await Promise.all([clearToken(), AsyncStorage.removeItem("tidar.session.operator")]);
    setOperator(null);
    setStatus("signedOut");
  }, []);

  const setGate = useCallback((next: string) => {
    setGateState(next);
    void AsyncStorage.setItem(GATE_KEY, next);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ status, operator, gate, api, pending, error, signIn, signOut, setGate }),
    [status, operator, gate, api, pending, error, signIn, signOut, setGate],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession doit être appelé sous <SessionProvider>");
  return value;
}
