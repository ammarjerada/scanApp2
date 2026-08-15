/**
 * La prise de poste — l'écran du premier lancement.
 *
 * `events.tsx` faisait deux métiers avec la même présentation : le choix
 * obligatoire du premier lancement, et le changement d'événement en cours de
 * soirée, rarissime. Deux besoins opposés — l'un bloque le démarrage, l'autre est
 * un réglage — présentés à l'identique et atteints par un bouton perdu au bas du
 * scroll d'un tableau de bord. C'est scindé : la prise de poste est ici, en plein
 * écran et sans échappatoire ; le changement vit dans les réglages. La liste
 * elle-même est partagée (`EventPicker`), seule la suite diffère.
 *
 * Les deux choix sont réunis parce qu'ils forment un seul geste. La porte n'est
 * pas cosmétique : elle est estampillée sur chaque scan, et c'est elle qui permet
 * de dire « déjà entré porte B il y a douze minutes » plutôt qu'un « déjà scanné »
 * sec. La choisir après coup, c'est signer une partie de la soirée au mauvais poste.
 */
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GATES, useSession } from "@/session/SessionProvider";
import { color, radius, space } from "@/theme/tokens";
import { EventPicker } from "@/ui/EventPicker";
import { tap } from "@/ui/feedback";
import { Label, SectionHeader } from "@/ui/primitives";

export default function SetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { gate, setGate, operator } = useSession();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xxxl },
      ]}
    >
      <View style={{ gap: space.sm }}>
        <Label variant="eyebrow" tone="brand">
          Prise de poste
        </Label>
        <Label variant="display">Bonsoir {operator?.name ?? ""}</Label>
        <Label variant="body" tone="muted">
          Votre porte et votre soirée. La liste d'invités sera téléchargée sur l'appareil
          pour fonctionner sans réseau.
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
        {/* `replace` et non `push` : la prise de poste ne doit pas rester dans
            l'historique, on ne « revient » pas en arrière vers un choix déjà fait. */}
        <EventPicker onPicked={() => router.replace("/")} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  content: { paddingHorizontal: space.xl, gap: space.xl },
  gates: { flexDirection: "row", gap: space.sm },
  gate: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
