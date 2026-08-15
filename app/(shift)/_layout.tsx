/**
 * Le poste de travail.
 *
 * Trois onglets, et leur ordre porte une décision : le scanner est le premier et
 * le défaut. La première v2 ouvrait sur le tableau de bord — un agent qui prend
 * son poste devait taper une fois avant de pouvoir travailler, à répéter à chaque
 * réouverture de l'app pendant toute la soirée.
 *
 * « Invités » n'est plus un onglet. Ce n'était pas un pair du scanner mais son
 * recours, celui qu'on ouvre quand un QR ne passe pas ; le mettre à côté obligeait
 * à quitter la caméra, donc à la démonter, avec une file qui attend. Il vit
 * désormais en feuille par-dessus le scanner (`app/lookup.tsx`).
 *
 * Ce groupe exige une soirée ouverte : sans elle, rien ici n'a de sens, et la
 * garde ci-dessous renvoie vers `setup` plutôt que de laisser des écrans vides.
 */
import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLedger } from "@/ledger/LedgerProvider";
import { color, space } from "@/theme/tokens";
import { font } from "@/theme/typography";

const tint = (focused: boolean) => (focused ? color.brand : color.textMuted);

/**
 * Même patron que `AuthGate` dans `app/_layout.tsx` : un seul endroit décide des
 * redirections, aucun écran n'a à se demander s'il a le droit de s'afficher.
 */
function ShiftGate() {
  const { snapshot, ready } = useLedger();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!snapshot.event) router.replace("/setup");
  }, [ready, snapshot.event, router]);

  return null;
}

export default function ShiftLayout() {
  const insets = useSafeAreaInsets();

  return (
    <>
      <ShiftGate />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: color.background },
          tabBarActiveTintColor: color.brand,
          tabBarInactiveTintColor: color.textMuted,
          tabBarStyle: {
            backgroundColor: color.surface,
            borderTopColor: color.border,
            // La barre monte au-dessus de la zone de geste : rien de tappable dessous.
            height: 60 + insets.bottom,
            paddingTop: space.sm,
            paddingBottom: insets.bottom,
          },
          tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 11 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Scanner",
            // Le geste principal : icône plus grande que ses voisines.
            tabBarIcon: ({ focused, size }) => (
              <Ionicons name="scan" size={size + 4} color={tint(focused)} />
            ),
          }}
        />
        <Tabs.Screen
          name="night"
          options={{
            title: "Soirée",
            tabBarIcon: ({ focused, size }) => (
              <Ionicons name="stats-chart" size={size} color={tint(focused)} />
            ),
          }}
        />
        <Tabs.Screen
          name="review"
          options={{
            title: "À vérifier",
            tabBarIcon: ({ focused, size }) => (
              <Ionicons name="shield-checkmark-outline" size={size} color={tint(focused)} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
