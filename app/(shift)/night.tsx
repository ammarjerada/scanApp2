/**
 * L'état de la soirée — la surface de supervision.
 *
 * Elle remplace l'accueil de la v1 qui affichait « ?/? validated » et « ? scans
 * connected » : quatre tuiles décoratives dont trois ne menaient nulle part.
 * Chaque chiffre ici est calculé à partir du registre local, donc disponible
 * même sans réseau.
 *
 * Cet écran ne pilote plus la configuration. Il portait auparavant une roue
 * dentée dans un coin et un bouton « Changer d'événement » au bas du scroll —
 * deux affordances différentes pour deux réglages qui n'ont rien à faire dans
 * un tableau de bord. Tout cela vit maintenant dans `settings`, son domicile unique.
 */
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { arrivalBuckets, shiftStats } from "@/domain/stats";
import { useLedger } from "@/ledger/LedgerProvider";
import { useSession } from "@/session/SessionProvider";
import { color, radius, space } from "@/theme/tokens";
import { ArrivalPulse } from "@/ui/ArrivalPulse";
import { Card, Label, SectionHeader, StatTile } from "@/ui/primitives";
import { SyncPill } from "@/ui/SyncPill";

export default function NightScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { snapshot, totals, pendingCount, syncing, flush, ready } = useLedger();
  const { gate, operator } = useSession();

  // Les chiffres bougent pendant la soirée : on redessine régulièrement plutôt
  // que d'afficher un instantané figé à l'ouverture de l'écran.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const event = snapshot.event;
  const shift = shiftStats(snapshot.scans, operator?.name ?? "agent", now);
  const buckets = arrivalBuckets(
    snapshot.scans.filter((s) => s.eventId === event?.id),
    now,
  );
  const remaining = Math.max(0, totals.total - totals.admitted);
  const ratio = totals.total > 0 ? totals.admitted / totals.total : 0;

  if (!ready || !event) return <View style={{ flex: 1, backgroundColor: color.background }} />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: space.xxxl },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={syncing}
          onRefresh={() => void flush().catch(() => undefined)}
          tintColor={color.textMuted}
        />
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1, gap: space.xs }}>
          <Label variant="eyebrow" tone="brand">
            Porte {gate}
          </Label>
          <Label variant="title" numberOfLines={2}>
            {event.name}
          </Label>
          <Label variant="caption" tone="muted">
            {event.venue}
          </Label>
        </View>
        <SyncPill
          pending={pendingCount}
          syncing={syncing}
          onPress={() => void flush().catch(() => undefined)}
        />
      </View>

      {/* Le chiffre qui compte, et rien autour. */}
      <Card style={{ gap: space.lg }}>
        <View style={styles.heroRow}>
          <Label variant="metric">{totals.admitted}</Label>
          <Label variant="body" tone="muted" style={{ paddingBottom: 6 }}>
            / {totals.total} entrées
          </Label>
        </View>

        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: totals.total, now: totals.admitted }}
        >
          <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
        </View>

        <View style={styles.heroFoot}>
          <Label variant="caption" tone="muted">
            {Math.round(ratio * 100)} % de la jauge
          </Label>
          <Label variant="caption" tone="muted">
            {shift.scans} scans à votre poste · {shift.perMinute}/min
          </Label>
        </View>
      </Card>

      <View style={styles.tiles}>
        <StatTile value={String(remaining)} caption="Attendus" />
        <StatTile
          value={String(totals.refused)}
          caption="Refusés"
          tone={totals.refused > 0 ? "stop" : "default"}
        />
        <StatTile
          value={String(pendingCount)}
          caption="À remonter"
          tone={pendingCount > 0 ? "hold" : "default"}
        />
      </View>

      <Card style={{ gap: space.lg }}>
        <SectionHeader>Flux d'arrivée</SectionHeader>
        <ArrivalPulse buckets={buckets} />
      </Card>

      <Card style={{ gap: space.lg }}>
        <SectionHeader>Par catégorie</SectionHeader>
        {totals.byCategory.map((row) => {
          const share = row.total > 0 ? row.admitted / row.total : 0;
          return (
            <View key={row.category} style={{ gap: space.sm }}>
              <View style={styles.catRow}>
                <Label variant="bodyStrong">{row.category}</Label>
                <Label variant="metricSmall" tone="muted">
                  {row.admitted}/{row.total}
                </Label>
              </View>
              <View style={styles.trackThin}>
                <View style={[styles.fill, { width: `${Math.round(share * 100)}%` }]} />
              </View>
            </View>
          );
        })}
      </Card>

      {/* Une porte de sortie explicite vers la configuration, libellée — plutôt
          qu'une roue dentée muette accrochée dans un coin de l'en-tête. */}
      <Pressable
        onPress={() => router.push("/settings")}
        accessibilityRole="button"
        accessibilityLabel="Réglages du poste"
        android_ripple={{ color: "#ffffff11" }}
        style={({ pressed }) => [styles.settingsRow, { opacity: pressed ? 0.75 : 1 }]}
      >
        <Ionicons name="settings-outline" size={20} color={color.textMuted} />
        <View style={{ flex: 1 }}>
          <Label variant="bodyStrong">Réglages du poste</Label>
          <Label variant="caption" tone="muted">
            Porte, soirée, synchronisation, session
          </Label>
        </View>
        <Ionicons name="chevron-forward" size={20} color={color.textMuted} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  content: { paddingHorizontal: space.xl, gap: space.xl },
  header: { flexDirection: "row", gap: space.lg, alignItems: "flex-start" },
  heroRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  heroFoot: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  track: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: color.brandSurface,
    overflow: "hidden",
  },
  trackThin: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.brandSurface,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: color.brand },
  tiles: { flexDirection: "row", gap: space.md },
  catRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    minHeight: 64,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
});
