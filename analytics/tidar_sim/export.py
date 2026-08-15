"""Export du modèle vers un format évaluable sur le téléphone.

**Pourquoi pas ONNX.** `onnxruntime-react-native` est un module natif : l'ajouter
ferait sortir le projet d'Expo Go et imposerait un build EAS à quiconque veut
lancer l'app. Pour un ensemble de cette taille — 180 arbres de profondeur 5, soit
quelques milliers de nœuds — un évaluateur en TypeScript pur est plus rapide qu'un
runtime générique, pèse quelques dizaines de kilo-octets en JSON, et ne demande
aucune dépendance. La piste ONNX reste ouverte si le modèle grossit d'un ordre de
grandeur ; à cette échelle elle coûterait plus qu'elle ne rapporte.

**Les vecteurs d'or.** Le calcul des features existe en deux implémentations, l'une
en Python pour l'entraînement, l'autre en TypeScript pour l'app. Elles vont
diverger — c'est le *training-serving skew*, et il est silencieux : rien ne casse,
les prédictions se dégradent simplement. Le garde-fou est un fichier de cas de
référence, lu par le test Python **et** par le test Jest. Si une implémentation
bouge sans l'autre, les deux suites tombent.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

from .features import FEATURE_COLUMNS
from .model import design_matrix

# Sentinelle pour « pas de valeur » côté JSON : `NaN` n'est pas du JSON valide, et
# les encodeurs qui l'acceptent produisent un fichier que d'autres refusent de lire.
NULL_SENTINEL = None


def _tree_to_arrays(nodes: np.ndarray) -> list[list[float]]:
    """Un arbre, en tableau plat de nœuds.

    Format d'un nœud : `[is_leaf, feature_idx, threshold, left, right, missing_left, value]`.
    Des tableaux plutôt que des objets : le JSON est trois fois plus petit, et
    l'évaluateur y accède par index sans coût de recherche de clé.
    """
    out = []
    for node in nodes:
        out.append(
            [
                int(node["is_leaf"]),
                int(node["feature_idx"]),
                float(node["num_threshold"]),
                int(node["left"]),
                int(node["right"]),
                int(node["missing_go_to_left"]),
                float(node["value"]),
            ]
        )
    return out


def export_model(model: HistGradientBoostingClassifier) -> dict:
    """Sérialise l'ensemble en une structure JSON auto-suffisante."""
    trees = []
    for stage in model._predictors:
        for predictor in stage:
            if getattr(predictor, "is_categorical", None) is not None and bool(
                predictor.nodes["is_categorical"].any()
            ):
                raise ValueError(
                    "Découpage catégoriel détecté : l'évaluateur TypeScript ne gère que "
                    "les seuils numériques. Les catégorielles doivent rester en one-hot."
                )
            trees.append(_tree_to_arrays(predictor.nodes))

    return {
        "format": "gbdt-numeric-v1",
        "features": FEATURE_COLUMNS,
        "baseline": float(np.ravel(model._baseline_prediction)[0]),
        "trees": trees,
    }


def raw_to_probability(raw: float) -> float:
    return 1.0 / (1.0 + np.exp(-raw))


def build_golden_vectors(
    model: HistGradientBoostingClassifier,
    features: pd.DataFrame,
    n: int = 40,
    seed: int = 7,
) -> list[dict]:
    """Des cas de référence couvrant les branches, pas seulement le cas moyen.

    L'échantillon est volontairement stratifié : des passages ordinaires, des
    doublons, des codes absents, des billets remboursés, et des valeurs manquantes
    (`minutes_since_prior_scan` au premier passage). Quarante cas tirés au hasard
    seraient presque tous des entrées banales et ne testeraient qu'une branche.
    """
    rng = np.random.default_rng(seed)

    strata = {
        "premier passage": features[features.prior_scan_count == 0],
        "doublon": features[features.prior_scan_count > 0],
        "code absent": features[features.code_in_list == 0],
        "remboursé": features[features.is_refunded == 1],
    }

    picked: list[int] = []
    per_stratum = max(1, n // len(strata))
    for subset in strata.values():
        if len(subset) == 0:
            continue
        take = min(per_stratum, len(subset))
        picked.extend(rng.choice(subset.index.to_numpy(), size=take, replace=False).tolist())

    picked = list(dict.fromkeys(picked))[:n]
    sample = features.loc[picked]

    matrix = design_matrix(sample)
    probabilities = model.predict_proba(matrix)[:, 1]

    vectors = []
    for (_, row), probability in zip(sample.iterrows(), probabilities):
        values = [
            NULL_SENTINEL if pd.isna(row[c]) else round(float(row[c]), 9) for c in FEATURE_COLUMNS
        ]
        vectors.append(
            {
                "scan_id": row["scan_id"],
                "note": row["fraud_mode"],
                "features": values,
                "probability": round(float(probability), 9),
            }
        )
    return vectors


def write_bundle(
    model: HistGradientBoostingClassifier,
    features: pd.DataFrame,
    t_verify: float,
    t_refuse: float,
    destination: Path,
) -> tuple[Path, Path]:
    destination.mkdir(parents=True, exist_ok=True)

    bundle = export_model(model)
    bundle["thresholds"] = {"verify": round(t_verify, 4), "refuse": round(t_refuse, 4)}

    model_path = destination / "model.json"
    model_path.write_text(json.dumps(bundle, separators=(",", ":")), encoding="utf-8")

    golden_path = destination / "goldenVectors.json"
    golden_path.write_text(
        json.dumps(
            {
                "features": FEATURE_COLUMNS,
                "cases": build_golden_vectors(model, features),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    return model_path, golden_path
