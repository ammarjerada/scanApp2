/**
 * La courbe d'arrivée de l'heure écoulée, par tranches de cinq minutes.
 *
 * Ce n'est pas un ornement : c'est la seule information de l'écran d'accueil qui
 * dit quelque chose sur ce qui *va* se passer. Une barre qui monte, c'est une
 * file qui se forme ; un plateau, c'est le moment d'envoyer un agent en pause.
 *
 * C'est aussi, littéralement, la série temporelle que la phase suivante du
 * projet apprendra à prévoir — la produire aujourd'hui, c'est commencer à
 * constituer la donnée avant d'avoir le modèle.
 *
 * Dessiné en `View`, sans librairie graphique : une douzaine de rectangles ne
 * justifie pas une dépendance de plus dans un bundle mobile.
 */
import React from "react";
import { StyleSheet, View } from "react-native";

import { color, radius, space } from "@/theme/tokens";
import { Label } from "./primitives";

export function ArrivalPulse({
  buckets,
  bucketMinutes = 5,
}: {
  buckets: number[];
  bucketMinutes?: number;
}) {
  const peak = Math.max(1, ...buckets);
  const span = buckets.length * bucketMinutes;
  const total = buckets.reduce((sum, n) => sum + n, 0);
  const lastIndex = buckets.length - 1;

  return (
    <View style={{ gap: space.md }}>
      <View
        style={styles.chart}
        accessibilityRole="image"
        accessibilityLabel={`Flux d'arrivée : ${total} entrées sur les ${span} dernières minutes, pic de ${peak} par tranche de ${bucketMinutes} minutes.`}
      >
        {buckets.map((count, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              {
                // 3 px de socle : une tranche vide reste visible, sinon la courbe
                // paraît trouée là où il ne s'est simplement rien passé.
                height: Math.max(3, (count / peak) * 56),
                backgroundColor: index === lastIndex ? color.brand : color.brandSurface,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.axis}>
        <Label variant="caption" tone="muted">
          il y a {span} min
        </Label>
        <Label variant="caption" tone="muted">
          pic {peak}/{bucketMinutes} min
        </Label>
        <Label variant="caption" tone="muted">
          maintenant
        </Label>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.xs,
    height: 56,
  },
  bar: {
    flex: 1,
    borderRadius: radius.sm,
  },
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
