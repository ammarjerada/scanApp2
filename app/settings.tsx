/**
 * Réglages de poste.
 *
 * Le choix de la porte vit ici, mais il n'est pas cosmétique : il est estampillé
 * sur chaque scan, et c'est lui qui permet de dire à un agent « ce billet est
 * déjà entré porte B il y a douze minutes » plutôt qu'un « déjà scanné » sec.
 */
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_URL, isDemoMode } from "@/data/client";
import { shiftStats } from "@/domain/stats";
import { useLedger } from "@/ledger/LedgerProvider";
import { GATES, useSession } from "@/session/SessionProvider";
import { color, radius, space } from "@/theme/tokens";
import { EventPicker } from "@/ui/EventPicker";
import { tap } from "@/ui/feedback";
import { Button, Card, Label, SectionHeader, StatTile } from "@/ui/primitives";
import { SyncPill } from "@/ui/SyncPill";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { operator, gate, setGate, signOut } = useSession();
  const { snapshot, pendingCount, syncing, flush } = useLedger();

  const [now] = useState(() => new Date());
  // Changer de soirée est rare et lourd de conséquences : on ne déroule la liste
  // que sur demande, plutôt que de l'étaler en permanence dans les réglages.
  const [switching, setSwitching] = useState(false);
  const shift = shiftStats(snapshot.scans, operator?.name ?? "agent", now);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxxl },
      ]}
    >
      <View style={styles.head}>
        <Label variant="eyebrow" tone="muted">
          Réglages
        </Label>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          hitSlop={12}
        >
          <Ionicons name="close" size={26} color={color.textMuted} />
        </Pressable>
      </View>

      <View style={{ gap: space.xs }}>
        <Label variant="display">{operator?.name ?? "Agent"}</Label>
        <Label variant="body" tone="muted">
          {operator?.email ?? "session locale"}
        </Label>
      </View>

      <View>
        <SectionHeader>Votre porte</SectionHeader>
        <View style={styles.gates}>
          {GATES.map((option) => {
            const active = gate === option;
            return (
              <Pressable
                key={option}
                onPress={() => {
                  setGate(option);
                  void tap();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Porte ${option}`}
                style={({ pressed }) => [
                  styles.gate,
                  {
                    backgroundColor: active ? color.brand : color.surface,
                    borderColor: active ? color.brand : color.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Label variant="label" style={{ color: active ? color.onTone : color.text }}>
                  {option}
                </Label>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <SectionHeader>Votre soirée</SectionHeader>
        {switching ? (
          // Refermer la modale suffit : le registre a déjà basculé, et l'écran
          // qu'on retrouve derrière lit le nouvel événement.
          <EventPicker onPicked={() => router.back()} />
        ) : (
          <Card style={{ gap: space.md }}>
            <View style={{ gap: space.xs }}>
              <Label variant="bodyStrong" numberOfLines={2}>
                {snapshot.event?.name ?? "Aucune soirée ouverte"}
              </Label>
              <Label variant="caption" tone="muted">
                {snapshot.event?.venue ?? "—"}
              </Label>
            </View>
            <Button
              label="Changer de soirée"
              variant="quiet"
              icon="swap-horizontal"
              full
              onPress={() => setSwitching(true)}
            />
          </Card>
        )}
      </View>

      <View>
        <SectionHeader>Votre vacation</SectionHeader>
        <View style={styles.tiles}>
          <StatTile value={String(shift.scans)} caption="Scans" />
          <StatTile value={String(shift.admitted)} caption="Entrées" tone="go" />
          <StatTile value={String(shift.perMinute)} caption="Par minute" />
        </View>
      </View>

      <View>
        <SectionHeader>Synchronisation</SectionHeader>
        <Card style={{ gap: space.md }}>
          <View style={styles.row}>
            <Label variant="body" tone="muted">
              File d'attente
            </Label>
            <SyncPill
              pending={pendingCount}
              syncing={syncing}
              onPress={() => void flush().catch(() => undefined)}
            />
          </View>
          <View style={styles.row}>
            <Label variant="body" tone="muted">
              Liste chargée
            </Label>
            <Label variant="code">
              {snapshot.syncedAt
                ? new Date(snapshot.syncedAt).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "jamais"}
            </Label>
          </View>
          <View style={styles.row}>
            <Label variant="body" tone="muted">
              Serveur
            </Label>
            <Label variant="code" tone={isDemoMode ? "hold" : "muted"}>
              {isDemoMode ? "démonstration" : (API_URL ?? "")}
            </Label>
          </View>
        </Card>
      </View>

      {pendingCount > 0 ? (
        <Card style={{ gap: space.sm, borderColor: color.hold }}>
          <Label variant="label" tone="hold">
            {pendingCount} scans pas encore remontés
          </Label>
          <Label variant="caption" tone="muted">
            Ils sont conservés sur l'appareil et repartiront dès que le réseau reviendra.
            Restez connecté jusqu'à ce que la file soit vide avant de fermer votre poste.
          </Label>
        </Card>
      ) : null}

      <Button
        label="Fermer la session"
        variant="quiet"
        icon="log-out-outline"
        full
        onPress={() => void signOut()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  content: { paddingHorizontal: space.xl, gap: space.xl },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  gates: { flexDirection: "row", gap: space.sm },
  gate: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
  },
  tiles: { flexDirection: "row", gap: space.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.lg },
});
