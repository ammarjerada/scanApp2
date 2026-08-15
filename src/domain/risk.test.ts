/**
 * La parité entraînement / service.
 *
 * Ce fichier est le seul garde-fou contre la panne la plus sournoise d'un modèle
 * embarqué : Python et TypeScript calculent la même chose aujourd'hui, puis l'un
 * des deux change, et rien ne casse. Pas d'exception, pas de test rouge — les
 * prédictions se dégradent simplement, en production, sans bruit.
 *
 * `src/ml/goldenVectors.json` est produit par `analytics/tidar_sim/export.py` à
 * partir du jeu de **test** : des cas que le modèle n'a pas vus. Chaque cas porte
 * son vecteur de features et la probabilité rendue par scikit-learn. Si
 * l'évaluateur TypeScript s'en écarte, c'est ici que ça tombe.
 */
import { describe, expect, it } from "@jest/globals";

import golden from "@/ml/goldenVectors.json";

import { bandFor, FEATURE_NAMES, scoreVector, THRESHOLDS } from "./risk";

interface GoldenCase {
  scan_id: string;
  note: string;
  features: (number | null)[];
  probability: number;
}

const cases = golden.cases as GoldenCase[];

describe("parité avec le modèle Python", () => {
  it("charge des cas de référence couvrant plusieurs branches", () => {
    expect(cases.length).toBeGreaterThan(10);
    // Un échantillon uniquement composé d'entrées banales ne testerait qu'une
    // branche de l'arbre et ne prouverait rien.
    expect(new Set(cases.map((c) => c.note)).size).toBeGreaterThan(1);
  });

  it("expose les features dans le même ordre que l'export", () => {
    expect(FEATURE_NAMES).toEqual(golden.features);
  });

  it.each(cases.map((c) => [c.scan_id, c.note, c] as const))(
    "reproduit la probabilité de %s (%s)",
    (_id, _note, testCase) => {
      const actual = scoreVector(testCase.features);
      // 1e-9 : on attend l'égalité aux erreurs d'arrondi de la sérialisation JSON
      // près, pas une simple ressemblance. Une divergence de features produirait
      // un écart de plusieurs ordres de grandeur au-dessus de ce seuil.
      expect(actual).toBeCloseTo(testCase.probability, 9);
    },
  );
});

describe("politique de décision", () => {
  it("ordonne les seuils", () => {
    expect(THRESHOLDS.verify).toBeLessThan(THRESHOLDS.refuse);
  });

  it("classe selon les seuils issus de l'optimisation du coût", () => {
    expect(bandFor(0)).toBe("clear");
    expect(bandFor(THRESHOLDS.verify - 0.001)).toBe("clear");
    expect(bandFor(THRESHOLDS.verify)).toBe("verify");
    expect(bandFor(THRESHOLDS.refuse - 0.001)).toBe("verify");
    expect(bandFor(THRESHOLDS.refuse)).toBe("refuse");
    expect(bandFor(1)).toBe("refuse");
  });

  it("place le seuil de refus haut — refouler un client légitime coûte cher", () => {
    // Ce n'est pas un détail de réglage : la matrice de coût de `config.py` met
    // le faux positif à 10 contre 3 pour le faux négatif, donc l'optimisation
    // doit produire un seuil de refus nettement au-dessus de 0,5.
    expect(THRESHOLDS.refuse).toBeGreaterThan(0.6);
  });
});
