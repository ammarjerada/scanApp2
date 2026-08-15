"""Entraîne, évalue, compare aux règles, et écrit le rapport.

    python scripts/train_eval.py

Produit `reports/evaluation.md`. Le rapport dit ce qui gagne, y compris si c'est
une règle : un modèle qui n'améliore pas le coût métier ne mérite pas d'être
embarqué, et le dire est plus utile que de le déployer quand même.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tidar_sim.dataio import load_scans  # noqa: E402
from tidar_sim.evaluate import (  # noqa: E402
    apply_thresholds,
    calibration_table,
    ranking_metrics,
    score_decisions,
    slice_report,
)
from tidar_sim.export import write_bundle  # noqa: E402
from tidar_sim.features import build_features, temporal_group_split  # noqa: E402
from tidar_sim.model import fit_and_score  # noqa: E402
from tidar_sim.rules import BASELINES  # noqa: E402


def main() -> None:
    scans = load_scans(ROOT / "data" / "scans.csv")
    features = build_features(scans)
    train, test = temporal_group_split(features)
    truth = test.is_illegitimate

    fitted = fit_and_score(train, test)
    decisions = apply_thresholds(fitted.test_probability, fitted.t_verify, fitted.t_refuse)
    decisions.index = test.index

    metrics = ranking_metrics(fitted.test_probability, truth.astype(int).to_numpy())
    model_outcome = score_decisions("modèle", decisions, truth)

    baseline_outcomes = [score_decisions(name, rule(test), truth) for name, rule in BASELINES.items()]
    best_rule = min(baseline_outcomes, key=lambda o: o.cost)

    lines: list[str] = []
    add = lines.append

    add("# Score de risque à la porte — rapport d'évaluation\n")
    add("> Généré par `scripts/train_eval.py`. **Toutes les données sont simulées.**")
    add("> Les chiffres ci-dessous décrivent le simulateur décrit dans `tidar_sim/config.py`,")
    add("> pas le comportement réel d'un public. Ce qui se transpose, c'est la méthode")
    add("> et la chaîne de traitement — jamais le score.\n")

    add("## Cadrage\n")
    add("| | |")
    add("|---|---|")
    add("| Décision | admettre, envoyer vérifier, ou refuser |")
    add("| Unité d'analyse | une tentative de passage |")
    add("| Cible | la personne qui se présente n'a pas de droit d'entrée |")
    add("| Horodatage de prédiction | l'instant où le QR est décodé, avant que l'agent n'agisse |")
    add(f"| Apprentissage | {len(train):,} scans · {int(train.is_illegitimate.sum()):,} illégitimes |")
    add(f"| Test | {len(test):,} scans · {int(test.is_illegitimate.sum()):,} illégitimes |")
    add(f"| Taux de base (test) | {100 * metrics['base_rate']:.2f} % |\n")

    add("Découpage **temporel par soirée** et **groupé par acheteur** : on entraîne sur les")
    add("premières soirées et on teste sur les dernières, et aucun acheteur n'est des deux")
    add("côtés. Un découpage aléatoire aurait mis des scans de la même soirée dans les deux")
    add("jeux, et les caractéristiques partagées de cette soirée auraient fuité.\n")

    add("## Ce que le modèle apporte — ou non\n")
    add("Coût métier asymétrique : refouler un client légitime coûte **10**, laisser passer")
    add("une fraude **3**, envoyer vérifier une pièce d'identité **1**. C'est cette asymétrie")
    add("qui décide, pas la courbe ROC.\n")

    add("| politique | rappel | précision | légitimes refusés | vérifications | coût/scan |")
    add("|---|---:|---:|---:|---:|---:|")
    for outcome in baseline_outcomes:
        add(
            f"| {outcome.name} | {outcome.recall:.3f} | {outcome.precision:.3f} | "
            f"{outcome.refused_legit:,} | {outcome.verified:,} | {outcome.cost_per_scan:.3f} |"
        )
    add(
        f"| **modèle (seuils {fitted.t_verify:.2f} / {fitted.t_refuse:.2f})** | "
        f"**{model_outcome.recall:.3f}** | **{model_outcome.precision:.3f}** | "
        f"**{model_outcome.refused_legit:,}** | **{model_outcome.verified:,}** | "
        f"**{model_outcome.cost_per_scan:.3f}** |"
    )
    add("")

    gain = (best_rule.cost - model_outcome.cost) / best_rule.cost * 100
    if model_outcome.cost < best_rule.cost:
        add(f"Le modèle réduit le coût de **{gain:.1f} %** face à la meilleure règle")
        add(f"(« {best_rule.name} »). Il gagne sa place.\n")
    else:
        add(f"**Le modèle ne bat pas la règle « {best_rule.name} »** ({-gain:.1f} % plus cher).")
        add("Conclusion : garder la règle. Elle se lit, se teste, se corrige un vendredi soir")
        add("à la porte, et ne dérive pas. Un modèle qui n'apporte rien est une dette.\n")

    add("### Classement et calibration\n")
    add("| métrique | valeur |")
    add("|---|---:|")
    add(f"| PR-AUC | {metrics['pr_auc']:.3f} |")
    add(f"| ROC-AUC | {metrics['roc_auc']:.3f} |")
    add(f"| Brier | {metrics['brier']:.4f} |")
    add("")
    add("La PR-AUC prime sur la ROC-AUC : à 4 % de positifs, la ROC-AUC flatte. Le Brier")
    add("compte autant que les deux, parce que la sortie est comparée à des seuils —")
    add("un modèle qui ordonne bien mais dont les probabilités sont fausses fait sauter")
    add("le choix de seuil, donc toute la politique.\n")

    add("### Fiabilité des probabilités\n")
    table = calibration_table(fitted.test_probability, truth.astype(int).to_numpy())
    add("| tranche | n | prédit | observé |")
    add("|---|---:|---:|---:|")
    for row in table.itertuples(index=False):
        add(f"| {row.tranche} | {row.n:,} | {row.prédit:.3f} | {row.observé:.3f} |")
    add("")

    add("### Par catégorie de billet\n")
    by_category = slice_report(test, decisions, truth, "category")
    add("| catégorie | n | fraudes | rappel | précision | légitimes refusés | coût/scan |")
    add("|---|---:|---:|---:|---:|---:|---:|")
    # `iterrows` et non `itertuples` : ce dernier renomme les colonnes contenant
    # un espace en `_5`, `_6`… et l'accès par nom échoue silencieusement.
    for _, row in by_category.iterrows():
        add(
            f"| {row['category']} | {row['n']:,} | {row['fraudes']:,} | {row['rappel']:.3f} | "
            f"{row['précision']:.3f} | {row['légitimes refusés']:,} | "
            f"{row['coût/scan']:.3f} |"
        )
    add("")

    add("### Par mode de fraude — ce qui échappe encore\n")
    caught = test.copy()
    caught["decision"] = decisions
    missed = caught[caught.is_illegitimate & (caught.decision == "admit")]
    add("| mode | total | manqués | taux de détection |")
    add("|---|---:|---:|---:|")
    for mode, group in caught[caught.is_illegitimate].groupby("fraud_mode"):
        n_missed = int((group.decision == "admit").sum())
        add(f"| {mode} | {len(group):,} | {n_missed:,} | {1 - n_missed / len(group):.3f} |")
    add("")
    add(f"Total manqué : {len(missed):,} tentatives sur {int(truth.sum()):,}.\n")

    add("## Le chiffre global flatte — voici le vrai terrain\n")
    add("`forged` et `refunded_reuse` sont détectés à 100 %, mais ils sont **déterministes** :")
    add("un code absent de la liste ou un billet remboursé se reconnaissent par un `if`, sans")
    add("modèle. Ils gonflent la PR-AUC sans rien prouver.")
    add("")
    add("Le seul endroit où un modèle peut apporter quelque chose, c'est le **doublon** :")
    add("un même code présenté deux fois, où il faut distinguer le billet partagé de la")
    add("ré-entrée légitime. Voici les mêmes politiques restreintes à ce sous-ensemble.\n")

    ambiguous = test[test.prior_scan_count > 0]
    amb_truth = ambiguous.is_illegitimate
    add(
        f"Sous-ensemble : {len(ambiguous):,} seconds passages, "
        f"dont {int(amb_truth.sum()):,} illégitimes "
        f"({100 * amb_truth.mean():.1f} %).\n"
    )

    add("| politique | rappel | précision | légitimes refusés | coût/scan |")
    add("|---|---:|---:|---:|---:|")
    for name, rule in BASELINES.items():
        sub = score_decisions(name, rule(ambiguous), amb_truth)
        add(
            f"| {name} | {sub.recall:.3f} | {sub.precision:.3f} | "
            f"{sub.refused_legit:,} | {sub.cost_per_scan:.3f} |"
        )
    amb_model = score_decisions("modèle", decisions.loc[ambiguous.index], amb_truth)
    add(
        f"| **modèle** | **{amb_model.recall:.3f}** | **{amb_model.precision:.3f}** | "
        f"**{amb_model.refused_legit:,}** | **{amb_model.cost_per_scan:.3f}** |"
    )
    add("")
    add("C'est ce tableau-là qu'il faut regarder pour juger le modèle. Le reste, une règle")
    add("le fait aussi bien et pour moins cher en complexité.\n")

    add("## Limites\n")
    add("- **Données simulées.** Les scores mesurent le simulateur. Les hypothèses de")
    add("  `config.py` — surtout le recouvrement entre partage de billet et ré-entrée —")
    add("  déterminent directement la difficulté du problème.")
    add("- **La branche « vérifier » est supposée infaillible** : on admet qu'un contrôle")
    add("  d'identité tranche juste. C'est optimiste, mais appliqué identiquement à toutes")
    add("  les politiques comparées, donc sans effet sur le classement.")
    add("- **Aucune boucle de retour réelle.** En production, l'étiquette viendrait de la")
    add("  décision de l'agent — et serait bruitée, partielle, et biaisée par les")
    add("  recommandations du modèle lui-même.\n")

    report = ROOT / "reports"
    report.mkdir(exist_ok=True)
    (report / "evaluation.md").write_text("\n".join(lines), encoding="utf-8")

    # Export vers l'app. Les vecteurs d'or sont tirés du jeu de **test** : ils
    # doivent couvrir des cas que le modèle n'a pas vus à l'entraînement.
    model_path, golden_path = write_bundle(
        fitted.model, test, fitted.t_verify, fitted.t_refuse, ROOT.parent / "src" / "ml"
    )
    print(f"→ modèle exporté   : {model_path} ({model_path.stat().st_size / 1024:.0f} Ko)")
    print(f"→ vecteurs d'or    : {golden_path}")

    print(f"PR-AUC {metrics['pr_auc']:.3f} · Brier {metrics['brier']:.4f}")
    print(f"seuils : vérifier ≥ {fitted.t_verify:.2f} · refuser ≥ {fitted.t_refuse:.2f}")
    print()
    print(f"{'politique':<38}{'rappel':>8}{'précis.':>9}{'refusés':>9}{'coût/scan':>11}")
    print("-" * 75)
    for outcome in [*baseline_outcomes, model_outcome]:
        print(
            f"{outcome.name:<38}{outcome.recall:>8.3f}{outcome.precision:>9.3f}"
            f"{outcome.refused_legit:>9,}{outcome.cost_per_scan:>11.3f}"
        )
    print()
    verdict = "gagne" if model_outcome.cost < best_rule.cost else "NE GAGNE PAS"
    print(f"→ le modèle {verdict} contre « {best_rule.name} » ({gain:+.1f} % de coût)")
    print(f"→ rapport écrit dans {report / 'evaluation.md'}")


if __name__ == "__main__":
    main()
