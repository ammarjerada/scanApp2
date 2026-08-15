/**
 * La recherche d'invité — le recours du scanner, en feuille par-dessus lui.
 *
 * Dans la v1, les deux barres de recherche existaient mais ne faisaient rien :
 * `onChangeText={() => {}}` côté événements, un gestionnaire vide côté
 * participants. Et il n'y avait aucun moyen de faire entrer quelqu'un dont le
 * billet est illisible — écran cassé, impression délavée, téléphone déchargé.
 * L'agent n'avait alors d'autre choix que de laisser passer sans contrôle.
 *
 * Cet écran était un onglet dans la première v2, à côté du scanner. C'était une
 * erreur de structure : y aller démontait la caméra, et le chemin complet — sortir
 * du scanner, chercher, ouvrir la fiche, faire entrer — faisait quatre interactions
 * avec une file qui attend. En feuille, la caméra reste montée derrière et le
 * retour au scan est immédiat.
 */
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { toView } from "@/data/ledger";
import { normalizeCode } from "@/domain/checkIn";
import type { Ticket } from "@/domain/types";
import { useLedger } from "@/ledger/LedgerProvider";
import { color, radius, space } from "@/theme/tokens";
import { EmptyState, Label, SearchField } from "@/ui/primitives";

type Filter = "all" | "expected" | "inside";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "expected", label: "Attendus" },
  { key: "inside", label: "Entrés" },
];

export default function LookupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { snapshot, totals } = useLedger();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const view = useMemo(() => toView(snapshot), [snapshot]);

  const rows = useMemo(() => {
    const eventId = snapshot.event?.id;
    if (!eventId) return [];

    const needle = query.trim().toLowerCase();
    const needleCode = normalizeCode(query);

    return snapshot.tickets
      .filter((ticket) => {
        if (ticket.eventId !== eventId) return false;

        const inside = view.findAdmission(ticket.code) !== undefined;
        if (filter === "inside" && !inside) return false;
        if (filter === "expected" && inside) return false;

        if (needle.length === 0) return true;
        return (
          ticket.holderName.toLowerCase().includes(needle) ||
          ticket.holderEmail.toLowerCase().includes(needle) ||
          ticket.code.includes(needleCode)
        );
      })
      .sort((a, b) => a.holderName.localeCompare(b.holderName, "fr"));
  }, [snapshot, query, filter, view]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.lg }]}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: space.xs }}>
          <Label variant="title">Chercher un invité</Label>
          <Label variant="caption" tone="muted">
            {totals.admitted} entrés · {Math.max(0, totals.total - totals.admitted)} attendus
          </Label>
        </View>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Fermer et revenir au scanner"
          hitSlop={12}
        >
          <Ionicons name="close" size={26} color={color.textMuted} />
        </Pressable>
      </View>

      <View style={styles.controls}>
        <SearchField value={query} onChange={setQuery} placeholder="Nom, e-mail ou code billet" />

        <View style={styles.chips}>
          {FILTERS.map((option) => {
            const active = filter === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => setFilter(option.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={option.label}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: active ? color.brand : color.surface,
                    borderColor: active ? color.brand : color.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Label variant="label" style={{ color: active ? color.onTone : color.textMuted }}>
                  {option.label}
                </Label>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxxl }]}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        windowSize={8}
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="Personne ne correspond"
            body={
              query.length > 0
                ? "Essayez le nom de famille seul, ou le code du billet."
                : "Aucun invité dans ce filtre."
            }
          />
        }
        renderItem={({ item }) => (
          <GuestRow
            ticket={item}
            inside={view.findAdmission(item.code) !== undefined}
            onPress={() => router.push(`/guest/${encodeURIComponent(item.code)}`)}
          />
        )}
      />
    </View>
  );
}

function GuestRow({
  ticket,
  inside,
  onPress,
}: {
  ticket: Ticket;
  inside: boolean;
  onPress: () => void;
}) {
  const blocked = ticket.status !== "valid";
  // Le statut n'est jamais porté par la seule couleur : un mot l'accompagne.
  const statusLabel = blocked
    ? ticket.status === "revoked"
      ? "Annulé"
      : "Remboursé"
    : inside
      ? "Entré"
      : "Attendu";
  const statusTone = blocked ? color.stop : inside ? color.go : color.textMuted;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ticket.holderName}, ${ticket.category}, ${statusLabel}`}
      android_ripple={{ color: "#ffffff11" }}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[styles.dot, { backgroundColor: statusTone }]} />

      <View style={{ flex: 1, gap: 2 }}>
        <Label variant="bodyStrong" numberOfLines={1}>
          {ticket.holderName}
        </Label>
        <Label variant="code" tone="muted" numberOfLines={1}>
          {ticket.code}
        </Label>
      </View>

      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Label variant="caption" tone="muted">
          {ticket.category}
        </Label>
        <Label variant="caption" style={{ color: statusTone }}>
          {statusLabel}
        </Label>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.lg,
    paddingHorizontal: space.xl,
  },
  controls: { paddingHorizontal: space.xl, paddingVertical: space.lg, gap: space.md },
  chips: { flexDirection: "row", gap: space.sm },
  chip: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  list: { paddingHorizontal: space.xl, gap: space.sm },
  row: {
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
  dot: { width: 10, height: 10, borderRadius: radius.pill },
});
