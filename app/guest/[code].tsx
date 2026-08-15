/**
 * La fiche d'un invité, et l'entrée à la main.
 *
 * C'est le chemin qui manquait à la v1 : le modal de détail existait mais ses
 * deux boutons se contentaient d'un `console.log`. Ici l'entrée manuelle passe
 * par le même moteur que le scan — mêmes règles, même détection de doublon —
 * et le scan résultant est marqué `manual`, ce qui le rend distinguable dans
 * l'analyse d'après-soirée.
 */
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { toView } from "@/data/ledger";
import { canRevert, formatElapsed } from "@/domain/checkIn";
import type { Verdict } from "@/domain/types";
import { useLedger } from "@/ledger/LedgerProvider";
import { color, radius, space } from "@/theme/tokens";
import { pulse, tap } from "@/ui/feedback";
import { Badge, Button, Card, EmptyState, Label, SectionHeader } from "@/ui/primitives";
import { VerdictFlood } from "@/ui/VerdictFlood";

export default function GuestDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { snapshot, submitManual, undoLast } = useLedger();

  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const view = useMemo(() => toView(snapshot), [snapshot]);
  const ticket = code ? view.findTicket(decodeURIComponent(code)) : undefined;
  const admission = ticket ? view.findAdmission(ticket.code) : undefined;
  const now = new Date();

  if (!ticket) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + space.xxl }]}>
        <EmptyState
          icon="alert-circle-outline"
          title="Billet introuvable"
          body="Ce code n'est pas dans la liste chargée."
          action={<Button label="Retour" variant="quiet" onPress={() => router.back()} />}
        />
      </View>
    );
  }

  const blocked = ticket.status !== "valid";

  const admit = () => {
    const result = submitManual(ticket);
    setVerdict(result.verdict);
    void pulse(result.verdict.tone);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxxl },
        ]}
      >
        <View style={styles.head}>
          <Label variant="eyebrow" tone="muted">
            Fiche invité
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

        <View style={{ gap: space.sm }}>
          <Label variant="display">{ticket.holderName}</Label>
          <Label variant="body" tone="muted">
            {ticket.holderEmail}
          </Label>
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.xs }}>
            <Badge tone="brand">{ticket.category}</Badge>
            {blocked ? (
              <Badge tone="stop">{ticket.status === "revoked" ? "Annulé" : "Remboursé"}</Badge>
            ) : admission ? (
              <Badge tone="go">Entré</Badge>
            ) : (
              <Badge tone="muted">Attendu</Badge>
            )}
          </View>
        </View>

        <Card style={{ gap: space.md }}>
          <SectionHeader>Billet</SectionHeader>
          <Row label="Code" value={ticket.code} mono />
          <Row
            label="Acheté le"
            value={new Date(ticket.purchasedAt).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          />
        </Card>

        {admission ? (
          <Card style={{ gap: space.md }}>
            <SectionHeader>Passage</SectionHeader>
            <Row label="Quand" value={formatElapsed(admission.at, now)} />
            <Row label="Porte" value={admission.gate} />
            <Row label="Agent" value={admission.operator} />
            <Row label="Mode" value={admission.manual ? "Saisie manuelle" : "Scan QR"} />

            {canRevert(admission, now) ? (
              <Button
                label="Annuler ce passage"
                variant="quiet"
                icon="arrow-undo"
                full
                onPress={() => {
                  undoLast();
                  void tap();
                  router.back();
                }}
              />
            ) : null}
          </Card>
        ) : null}

        {/* L'action principale reste en bas, dans le pouce. */}
        {blocked ? (
          <Card style={{ gap: space.sm, borderColor: color.stop }}>
            <Label variant="label" tone="stop">
              Entrée impossible
            </Label>
            <Label variant="caption" tone="muted">
              Ce billet a été {ticket.status === "revoked" ? "annulé" : "remboursé"} par
              l'organisateur. Orientez la personne vers l'accueil.
            </Label>
          </Card>
        ) : admission ? null : (
          <Button label="Faire entrer" icon="checkmark-circle" full onPress={admit} />
        )}
      </ScrollView>

      {verdict ? (
        <VerdictFlood
          verdict={verdict}
          onDismiss={() => {
            setVerdict(null);
            router.back();
          }}
        />
      ) : null}
    </View>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Label variant="body" tone="muted">
        {label}
      </Label>
      <Label variant={mono ? "code" : "bodyStrong"}>{value}</Label>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  content: { paddingHorizontal: space.xl, gap: space.xl },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.lg,
    minHeight: 32,
    borderRadius: radius.sm,
  },
});
