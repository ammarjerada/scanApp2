/**
 * La file « À vérifier » — tout ce que la porte n'a pas laissé passer.
 *
 * Cet écran n'existait pas : les refus disparaissaient dans le registre sans que
 * personne ne puisse les relire. Or un refus est l'événement le plus coûteux du
 * contrôle d'accès, dans les deux sens — refuser un client légitime fait une
 * scène à l'entrée, laisser passer un billet partagé coûte une place.
 *
 * Deux usages, donc. Pendant la soirée : un responsable relit les cas litigieux
 * et peut faire entrer quelqu'un après vérification de sa pièce d'identité.
 * Après la soirée : c'est la matière première de l'analyse.
 *
 * C'est aussi ici que se refermera la boucle d'apprentissage. Chaque décision
 * prise sur cet écran — admis après vérification, ou refus confirmé — est
 * l'étiquette dont un modèle de risque aura besoin. La collecte est en place
 * avant le modèle, volontairement : sans elle il n'y aurait jamais rien à apprendre.
 */
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { toView } from "@/data/ledger";
import { formatElapsed, headlineFor, toneFor } from "@/domain/checkIn";
import type { ScanRecord, Tone } from "@/domain/types";
import { useLedger } from "@/ledger/LedgerProvider";
import { color, radius, space, toneColor } from "@/theme/tokens";
import { tap } from "@/ui/feedback";
import { Button, EmptyState, Label } from "@/ui/primitives";

export default function ReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { snapshot, ready, resolve } = useLedger();

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const view = useMemo(() => toView(snapshot), [snapshot]);

  /**
   * Ce qui mérite un second regard : tout ce qui n'est pas une entrée franche.
   * Les scans annulés sont exclus — l'agent a déjà tranché, la trace reste dans
   * le registre mais ce n'est plus une question ouverte.
   */
  const flagged = useMemo(() => {
    const eventId = snapshot.event?.id;
    if (!eventId) return [];
    return snapshot.scans
      .filter((s) => s.eventId === eventId && s.outcome !== "admit" && !s.reverted)
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [snapshot]);

  if (!ready || !snapshot.event) {
    return <View style={{ flex: 1, backgroundColor: color.background }} />;
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.lg }]}>
      <View style={styles.head}>
        <Label variant="title">À vérifier</Label>
        <Label variant="caption" tone="muted">
          {flagged.length === 0
            ? "Aucun litige pour l'instant"
            : `${flagged.length} passage${flagged.length > 1 ? "s" : ""} non admis`}
        </Label>
      </View>

      <FlatList
        data={flagged}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        initialNumToRender={12}
        windowSize={8}
        ListEmptyComponent={
          <EmptyState
            icon="shield-checkmark-outline"
            title="Rien à vérifier"
            body="Tous les scans de cette soirée ont abouti à une entrée. Les refus et les doublons apparaîtront ici."
          />
        }
        renderItem={({ item }) => {
          const ticket = view.findTicket(item.code);
          return (
            <FlaggedRow
              record={item}
              now={now}
              holder={ticket?.holderName}
              category={ticket?.category}
              onResolve={(resolution) => {
                resolve(item.id, resolution);
                void tap();
              }}
              // Sans billet connu (code forgé, liste absente) il n'y a pas de
              // fiche à ouvrir : la ligne reste informative, pas cliquable.
              onPress={
                ticket
                  ? () => router.push(`/guest/${encodeURIComponent(ticket.code)}`)
                  : undefined
              }
            />
          );
        }}
      />
    </View>
  );
}

function FlaggedRow({
  record,
  now,
  holder,
  category,
  onPress,
  onResolve,
}: {
  record: ScanRecord;
  now: Date;
  holder?: string;
  category?: string;
  onPress?: () => void;
  onResolve: (resolution: "admitted" | "refused") => void;
}) {
  const tone: Tone = toneFor(record.outcome);
  const ink = toneColor[tone];
  const label = headlineFor(record.outcome);

  const body = (
    <View style={styles.row}>
      {/* Le ton n'est jamais seul : le mot du verdict le double toujours. */}
      <View style={[styles.stripe, { backgroundColor: ink }]} />

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Label variant="label" style={{ color: ink }}>
            {label}
          </Label>
          <Label variant="caption" tone="muted">
            {formatElapsed(record.at, now)}
          </Label>
        </View>

        <Label variant="bodyStrong" numberOfLines={1}>
          {holder ?? "Porteur inconnu"}
        </Label>

        <Label variant="code" tone="muted" numberOfLines={1}>
          {record.code}
          {category ? ` · ${category}` : ""}
        </Label>

        <Label variant="caption" tone="muted">
          Porte {record.gate} · {record.operator}
          {record.manual ? " · saisie manuelle" : ""}
        </Label>
      </View>

      {onPress ? <Ionicons name="chevron-forward" size={20} color={color.textMuted} /> : null}
    </View>
  );

  /**
   * Les deux boutons ci-dessous sont le point d'architecture le plus important de
   * l'écran, et le moins spectaculaire. Chaque appui écrit l'étiquette dont le
   * prochain entraînement aura besoin — pièce d'identité en main, l'agent est la
   * seule source de vérité qui existera jamais sur ce qui s'est passé à la porte.
   */
  const decision = record.resolution ? (
    <View style={styles.resolved}>
      <Ionicons
        name={record.resolution === "admitted" ? "checkmark-circle" : "close-circle"}
        size={16}
        color={record.resolution === "admitted" ? color.go : color.stop}
      />
      <Label variant="caption" tone="muted">
        {record.resolution === "admitted" ? "Admis après vérification" : "Refus confirmé"}
      </Label>
    </View>
  ) : (
    <View style={styles.actions}>
      <Button
        label="Faire entrer"
        variant="quiet"
        icon="checkmark"
        onPress={() => onResolve("admitted")}
        style={{ flex: 1 }}
      />
      <Button
        label="Refus confirmé"
        variant="quiet"
        icon="close"
        onPress={() => onResolve("refused")}
        style={{ flex: 1 }}
      />
    </View>
  );

  return (
    <View style={styles.rowShell}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${holder ?? "porteur inconnu"}, ${formatElapsed(record.at, now)}`}
          android_ripple={{ color: "#ffffff11" }}
          style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      {decision}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  head: { paddingHorizontal: space.xl, gap: space.xs, paddingBottom: space.lg },
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  rowShell: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.lg, paddingRight: space.lg },
  stripe: { width: 4, alignSelf: "stretch" },
  rowBody: { flex: 1, gap: 3, paddingVertical: space.md },
  actions: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: space.md,
  },
  resolved: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
});
