"""Mesure les règles avant d'entraîner quoi que ce soit.

    python scripts/run_baseline.py

C'est l'étape qu'on saute le plus souvent et qui coûte le plus cher : sans elle,
on ne sait pas si le modèle apporte quelque chose. Les règles sont évaluées sur le
**même jeu de test** que le modèle, avec la **même matrice de coût**. Toute autre
comparaison serait truquée.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tidar_sim.dataio import load_scans  # noqa: E402
from tidar_sim.evaluate import score_decisions  # noqa: E402
from tidar_sim.features import build_features, temporal_group_split  # noqa: E402
from tidar_sim.rules import BASELINES  # noqa: E402


def main() -> None:
    scans = load_scans(ROOT / "data" / "scans.csv")
    features = build_features(scans)
    train, test = temporal_group_split(features)

    print(f"apprentissage : {len(train):,} scans · {int(train.is_illegitimate.sum()):,} illégitimes")
    print(f"test          : {len(test):,} scans · {int(test.is_illegitimate.sum()):,} illégitimes")
    print(f"taux de base  : {100 * test.is_illegitimate.mean():.2f} %")
    print()

    truth = test.is_illegitimate

    header = f"{'règle':<38}{'rappel':>8}{'précis.':>9}{'refusés':>9}{'vérif.':>8}{'coût/scan':>11}"
    print(header)
    print("-" * len(header))

    for name, rule in BASELINES.items():
        outcome = score_decisions(name, rule(test), truth)
        print(
            f"{name:<38}{outcome.recall:>8.3f}{outcome.precision:>9.3f}"
            f"{outcome.refused_legit:>9,}{outcome.verified:>8,}{outcome.cost_per_scan:>11.3f}"
        )

    print()
    print("« refusés » = clients légitimes refoulés à la porte. C'est l'erreur chère,")
    print("et c'est elle qui écarte la règle la plus intuitive.")


if __name__ == "__main__":
    main()
