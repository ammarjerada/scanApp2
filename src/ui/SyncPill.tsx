/**
 * L'état de la file de synchronisation, dit franchement.
 *
 * Le hors-ligne n'inspire confiance que s'il est visible. Tant que l'agent ne
 * sait pas si ses scans sont partis, il doute de l'outil — et un agent qui doute
 * rescanne. La pastille dit donc toujours où en est la file, et permet de forcer
 * la remontée d'un doigt.
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet } from "react-native";

import { color, hitSize, radius, space } from "@/theme/tokens";
import { Label } from "./primitives";

export function SyncPill({
  pending,
  syncing,
  onPress,
}: {
  pending: number;
  syncing: boolean;
  onPress: () => void;
}) {
  const clear = pending === 0;
  const tone = clear ? "go" : "hold";
  const text = syncing
    ? "Synchronisation…"
    : clear
      ? "À jour"
      : `${pending} en attente`;

  return (
    <Pressable
      onPress={onPress}
      disabled={syncing || clear}
      accessibilityRole="button"
      accessibilityLabel={
        clear ? "Tous les scans sont remontés" : `${pending} scans en attente. Toucher pour remonter maintenant.`
      }
      hitSlop={8}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: clear ? color.border : color.hold, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {syncing ? (
        <ActivityIndicator size="small" color={color.textMuted} />
      ) : (
        <Ionicons
          name={clear ? "cloud-done-outline" : "cloud-upload-outline"}
          size={16}
          color={clear ? color.go : color.hold}
        />
      )}
      <Label variant="caption" tone={syncing ? "muted" : tone}>
        {text}
      </Label>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: hitSize - 12,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: color.surface,
  },
});
