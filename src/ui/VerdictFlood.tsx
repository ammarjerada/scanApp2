/**
 * L'élément signature de l'application.
 *
 * La v1 répondait par `Alert.alert("Success", "QR Code is valid.")` : une boîte
 * système, au centre, qu'il faut lire puis fermer d'un doigt. Devant huit cents
 * personnes, cette seconde-là coûte la soirée.
 *
 * Ici le verdict inonde l'écran entier par-dessus la caméra. Un aplat, un
 * pictogramme, un mot. L'agent le lit en vision périphérique, sans fixer
 * l'écran ; la vibration le lui confirme sans qu'il regarde du tout.
 *
 * L'asymétrie est délibérée :
 * — « ENTRÉE » disparaît seul après ~1 s, pour ne jamais freiner la file ;
 * — un refus reste jusqu'à ce qu'on le congédie, parce qu'il demande une décision.
 *
 * La couleur ne porte jamais l'information seule : pictogramme, mot et signature
 * vibratoire disent la même chose trois fois.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from "react-native";

import type { Verdict } from "@/domain/types";
import { color, duration, radius, space, toneColor } from "@/theme/tokens";
import { type as type_ } from "@/theme/typography";
import { Label } from "./primitives";

const ICON: Record<Verdict["tone"], keyof typeof Ionicons.glyphMap> = {
  go: "checkmark-circle",
  stop: "close-circle",
  hold: "alert-circle",
};

export function VerdictFlood({
  verdict,
  onDismiss,
  onUndo,
}: {
  verdict: Verdict;
  onDismiss: () => void;
  /** Proposé seulement sur une entrée : c'est le seul verdict qu'on peut avoir donné à tort. */
  onUndo?: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    progress.setValue(reduceMotion ? 1 : 0);
    if (!reduceMotion) {
      Animated.timing(progress, {
        toValue: 1,
        duration: duration.enter,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }

    if (verdict.tone !== "go") return;
    const timer = setTimeout(onDismiss, duration.verdictHold);
    return () => clearTimeout(timer);
  }, [verdict, reduceMotion, progress, onDismiss]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });

  return (
    <Pressable
      onPress={onDismiss}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${verdict.headline}. ${verdict.detail ?? ""}`}
      accessibilityHint="Toucher pour revenir au scan"
      style={[StyleSheet.absoluteFill, styles.sheet, { backgroundColor: toneColor[verdict.tone] }]}
    >
      <Animated.View style={{ opacity: progress, transform: [{ scale }], alignItems: "center" }}>
        <Ionicons name={ICON[verdict.tone]} size={96} color={color.onTone} />

        <Label variant="verdict" style={styles.headline}>
          {verdict.headline}
        </Label>

        {verdict.ticket ? (
          <>
            <Label variant="title" style={styles.ink}>
              {verdict.ticket.holderName}
            </Label>
            <View style={styles.pill}>
              <Label variant="label" style={styles.ink}>
                {verdict.ticket.category}
              </Label>
            </View>
          </>
        ) : null}

        {verdict.detail ? (
          <Label variant="body" style={[styles.ink, styles.detail]}>
            {verdict.detail}
          </Label>
        ) : null}

        <Label variant="code" style={[styles.ink, styles.code]}>
          {verdict.ticket?.code ?? ""}
        </Label>
      </Animated.View>

      <View style={styles.footer}>
        {onUndo ? (
          <Pressable
            onPress={onUndo}
            accessibilityRole="button"
            accessibilityLabel="Annuler cette entrée"
            hitSlop={12}
            style={({ pressed }) => [styles.undo, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="arrow-undo" size={16} color={color.onTone} />
            <Label variant="label" style={styles.ink}>
              Annuler
            </Label>
          </Pressable>
        ) : null}

        <Label variant="caption" style={[styles.ink, { opacity: 0.7 }]}>
          {verdict.tone === "go" ? "Prêt pour le suivant…" : "Toucher pour continuer"}
        </Label>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    zIndex: 10,
  },
  ink: { color: color.onTone },
  headline: {
    ...type_.verdict,
    color: color.onTone,
    marginTop: space.lg,
    textAlign: "center",
  },
  detail: {
    marginTop: space.md,
    textAlign: "center",
    opacity: 0.85,
  },
  code: {
    marginTop: space.sm,
    opacity: 0.65,
  },
  pill: {
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.onTone,
  },
  footer: {
    position: "absolute",
    bottom: space.xxxl,
    alignItems: "center",
    gap: space.lg,
  },
  undo: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.onTone,
  },
});
