/**
 * La liste des soirées, et ce qui se passe quand on en choisit une.
 *
 * Elle sert deux appelants aux suites très différentes : la prise de poste, qui
 * enchaîne sur le scanner, et les réglages, qui referment leur modale. D'où le
 * `onPicked` : le composant sait charger et choisir, il ne décide pas de la
 * navigation. Sans cette extraction, la même liste serait recopiée dans les deux
 * écrans et l'une des deux copies finirait par diverger.
 *
 * Choisir télécharge toute la liste d'invités sur l'appareil — c'est l'opération
 * qui rend la soirée jouable sans réseau, pas un simple filtre d'affichage.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import type { EventSummary } from "@/domain/types";
import { useLedger } from "@/ledger/LedgerProvider";
import { useSession } from "@/session/SessionProvider";
import { color, space } from "@/theme/tokens";
import { Button, Card, EmptyState, Label } from "@/ui/primitives";

export function EventPicker({ onPicked }: { onPicked: () => void }) {
  const { api } = useSession();
  const { snapshot, chooseEvent } = useLedger();

  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setFailed(false);
    setEvents(null);
    api
      .listEvents()
      .then(setEvents)
      .catch(() => setFailed(true));
  };

  useEffect(load, [api]);

  const pick = async (event: EventSummary) => {
    setBusyId(event.id);
    try {
      await chooseEvent(event);
      onPicked();
    } catch {
      setFailed(true);
    } finally {
      setBusyId(null);
    }
  };

  if (failed) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Liste indisponible"
        body="Impossible de joindre le serveur. Vérifiez la connexion et réessayez."
        action={<Button label="Réessayer" variant="quiet" onPress={load} />}
      />
    );
  }

  if (events === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={color.brand} />
        <Label variant="caption" tone="muted">
          Chargement…
        </Label>
      </View>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      {events.map((event) => {
        const active = snapshot.event?.id === event.id;
        const busy = busyId === event.id;
        return (
          <Pressable
            key={event.id}
            onPress={() => void pick(event)}
            disabled={busyId !== null}
            accessibilityRole="button"
            accessibilityState={{ selected: active, busy, disabled: busyId !== null }}
            accessibilityLabel={`${event.name}, ${event.venue}, ${event.ticketsSold} billets vendus${
              active ? ", soirée en cours" : ""
            }`}
            android_ripple={{ color: "#ffffff11" }}
            style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
          >
            <Card style={[styles.card, active && { borderColor: color.brand }]}>
              <View style={{ flex: 1, gap: space.xs }}>
                <Label variant="title" numberOfLines={2}>
                  {event.name}
                </Label>
                <Label variant="caption" tone="muted">
                  {event.venue}
                </Label>
                <View style={styles.meta}>
                  <Label variant="code" tone="muted">
                    {new Date(event.doorsAt).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Label>
                  <Label variant="code" tone="muted">
                    {event.ticketsSold} billets
                  </Label>
                </View>
              </View>

              {busy ? (
                <ActivityIndicator color={color.brand} />
              ) : (
                <Ionicons
                  name={active ? "checkmark-circle" : "chevron-forward"}
                  size={active ? 26 : 22}
                  color={active ? color.go : color.textMuted}
                />
              )}
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: space.lg },
  meta: { flexDirection: "row", gap: space.lg, marginTop: space.xs },
  loading: { alignItems: "center", gap: space.md, paddingVertical: space.xxxl },
});
