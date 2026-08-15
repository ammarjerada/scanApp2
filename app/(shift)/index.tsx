/**
 * Le scanner — le foyer de l'application.
 *
 * Trois défauts de la v1 sont corrigés ici, et ce sont les trois qui empêchaient
 * l'écran de fonctionner sur un vrai téléphone à une vraie porte :
 *
 * 1. **La permission caméra n'était jamais demandée.** L'écran s'ouvrait noir.
 * 2. **Chaque scan attendait un aller-retour HTTP.** Le verdict est désormais
 *    local et immédiat ; la remontée se fait en tâche de fond.
 * 3. **Le même QR se relisait en boucle.** La caméra émet plusieurs fois par
 *    seconde sur un code immobile ; sans garde, l'API était martelée et le
 *    doublon déclenché par l'app elle-même. Un même code est ignoré pendant
 *    quelques secondes — c'est une double lecture, pas une deuxième personne.
 *
 * Le bandeau haut porte tout ce que l'agent doit pouvoir vérifier sans quitter
 * la caméra : sa porte, sa soirée, et l'état de la file de remontée. C'est
 * pendant le scan que ces informations comptent, pas sur un écran de statistiques.
 */
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Verdict } from "@/domain/types";
import { useLedger } from "@/ledger/LedgerProvider";
import { useSession } from "@/session/SessionProvider";
import { color, radius, space } from "@/theme/tokens";
import { pulse, tap } from "@/ui/feedback";
import { Button, EmptyState, IconButton, Label } from "@/ui/primitives";
import { SyncPill } from "@/ui/SyncPill";
import { VerdictFlood } from "@/ui/VerdictFlood";

/** Une même personne ne repasse pas la porte en trois secondes. */
const SAME_CODE_COOLDOWN_MS = 3000;

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const { snapshot, totals, submitScan, undoLast, pendingCount, syncing, flush } = useLedger();
  const { gate } = useSession();

  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [torch, setTorch] = useState(false);

  // Refs plutôt qu'état : la caméra émet plus vite qu'un cycle de rendu, et une
  // garde qui dépend d'un `setState` laisse passer les lectures de la même frame.
  const lastCode = useRef<{ code: string; at: number } | null>(null);
  const busy = useRef(false);

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (busy.current) return;

      const now = Date.now();
      const previous = lastCode.current;
      if (previous && previous.code === data && now - previous.at < SAME_CODE_COOLDOWN_MS) return;
      lastCode.current = { code: data, at: now };

      busy.current = true;
      const result = submitScan(data);
      setVerdict(result.verdict);
      void pulse(result.verdict.tone);
    },
    [submitScan],
  );

  const dismiss = useCallback(() => {
    setVerdict(null);
    busy.current = false;
  }, []);

  const event = snapshot.event;

  /* ------------------------------------------------------ garde-fous d'abord */

  // Sans soirée ouverte, `ShiftGate` redirige vers `setup` : on ne dessine rien
  // plutôt que de faire clignoter un écran vide le temps de la redirection.
  if (!event) return <View style={styles.gate} />;

  if (!permission) return <View style={styles.gate} />;

  if (!permission.granted) {
    // On explique pourquoi avant de demander : une demande système sans contexte
    // se refuse par réflexe, et un refus est bien plus coûteux à rattraper.
    return (
      <View style={[styles.gate, { paddingTop: insets.top + space.xxxl }]}>
        <EmptyState
          icon="camera-outline"
          title="La caméra est nécessaire"
          body="Tidar Scan lit les QR codes des billets. Aucune image n'est enregistrée ni transmise : seul le code lu est utilisé."
          action={
            permission.canAskAgain ? (
              <Button label="Autoriser la caméra" onPress={() => void requestPermission()} />
            ) : (
              <Button
                label="Ouvrir les réglages"
                variant="quiet"
                onPress={() => void Linking.openSettings()}
              />
            )
          }
        />
      </View>
    );
  }

  /* ----------------------------------------------------------------- caméra */

  return (
    <View style={styles.screen}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={verdict ? undefined : handleScan}
      />

      {/* Bandeau de poste : où je suis, où en est la file, et la lampe. */}
      <View style={[styles.topBar, { paddingTop: insets.top + space.md }]}>
        <View style={styles.context}>
          <Label variant="eyebrow" tone="brand">
            Porte {gate}
          </Label>
          <Label variant="label" numberOfLines={1}>
            {event.name}
          </Label>
        </View>

        <SyncPill
          pending={pendingCount}
          syncing={syncing}
          onPress={() => void flush().catch(() => undefined)}
        />

        <IconButton
          icon={torch ? "flashlight" : "flashlight-outline"}
          label={torch ? "Éteindre la lampe" : "Allumer la lampe"}
          active={torch}
          onPress={() => {
            setTorch((on) => !on);
            void tap();
          }}
        />
      </View>

      {/* La mire : quatre angles, rien au centre. Le champ doit rester lisible. */}
      <View style={styles.reticleWrap} pointerEvents="none">
        <View style={styles.reticle}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
        <Label variant="caption" tone="muted" style={styles.hint}>
          Cadrez le QR code du billet
        </Label>
      </View>

      {/* Bandeau bas : le compteur, et la sortie de secours quand le QR ne passe pas. */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.counter}>
          <Label variant="metricSmall">{totals.admitted}</Label>
          <Label variant="caption" tone="muted">
            / {totals.total} entrées
          </Label>
        </View>

        <Pressable
          onPress={() => router.push("/lookup")}
          accessibilityRole="button"
          accessibilityLabel="Chercher un invité et le faire entrer à la main"
          style={({ pressed }) => [styles.manual, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="keypad-outline" size={18} color={color.text} />
          <Label variant="label">QR illisible</Label>
        </Pressable>
      </View>

      {verdict ? (
        <VerdictFlood
          verdict={verdict}
          onDismiss={dismiss}
          onUndo={
            verdict.kind === "admit"
              ? () => {
                  undoLast();
                  void tap();
                  dismiss();
                }
              : undefined
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  gate: { flex: 1, backgroundColor: color.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
    backgroundColor: "#07080Ccc",
  },
  context: { flex: 1, gap: 2 },
  reticleWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.xl },
  reticle: { width: 250, height: 250 },
  corner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: color.brand,
  },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: radius.lg },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: radius.lg },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: radius.lg },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: radius.lg },
  hint: { textShadowColor: "#000", textShadowRadius: 6 },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    backgroundColor: "#07080Ccc",
  },
  counter: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  manual: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
});
