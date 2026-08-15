"""Évaluation — et surtout, la métrique qui décide.

L'accuracy est inutilisable ici : refuser tout le monde ou n'admettre personne
donne déjà 96 % de bonnes réponses quand la fraude est à 4 %. La PR-AUC est bien
meilleure, mais elle ne dit toujours pas quoi faire à la porte.

Ce qui décide, c'est le **coût métier**, et il est asymétrique : refouler un client
légitime coûte bien plus cher que laisser passer un fraudeur — une altercation à
l'entrée, une file bloquée, un geste commercial, un avis assassin, contre une place
perdue. Les seuils ne sont donc pas choisis « au feeling » ni sur la F1 : ils
minimisent le coût espéré, et c'est la matrice de coût de `config.py` qui les fixe.

La troisième branche — envoyer vérifier une pièce d'identité — n'est pas un
raffinement cosmétique. C'est elle qui permet au système de dire « je ne sais pas »
au lieu de trancher à pile ou face sur les cas ambigus, qui sont précisément ceux
où il se trompe.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

from .config import DEFAULT, SimulationConfig
from .rules import ADMIT, REFUSE, VERIFY


@dataclass
class Outcome:
    """Ce que coûte une politique de décision, et pourquoi."""

    name: str
    n: int
    refused_legit: int
    admitted_fraud: int
    verified: int
    caught: int
    total_fraud: int
    cost: float

    @property
    def cost_per_scan(self) -> float:
        return self.cost / max(1, self.n)

    @property
    def recall(self) -> float:
        return self.caught / max(1, self.total_fraud)

    @property
    def precision(self) -> float:
        flagged = self.caught + self.refused_legit
        return self.caught / max(1, flagged)


def score_decisions(
    name: str,
    decisions: pd.Series,
    truth: pd.Series,
    cfg: SimulationConfig = DEFAULT,
) -> Outcome:
    """Applique la matrice de coût à une politique à trois branches.

    Hypothèse assumée sur la branche « vérifier » : le contrôle d'identité tranche
    correctement. C'est optimiste — un agent pressé se trompe — mais c'est la
    convention la plus lisible, et elle est identique pour toutes les politiques
    comparées, donc elle ne fausse pas le classement.
    """
    truth = truth.astype(bool)

    refused_legit = int(((decisions == REFUSE) & ~truth).sum())
    admitted_fraud = int(((decisions == ADMIT) & truth).sum())
    verified = int((decisions == VERIFY).sum())
    caught = int(((decisions == REFUSE) & truth).sum()) + int(((decisions == VERIFY) & truth).sum())

    cost = (
        refused_legit * cfg.cost_false_positive
        + admitted_fraud * cfg.cost_false_negative
        + verified * cfg.cost_manual_check
    )

    return Outcome(
        name=name,
        n=len(decisions),
        refused_legit=refused_legit,
        admitted_fraud=admitted_fraud,
        verified=verified,
        caught=caught,
        total_fraud=int(truth.sum()),
        cost=cost,
    )


def choose_thresholds(
    probability: np.ndarray,
    truth: np.ndarray,
    cfg: SimulationConfig = DEFAULT,
    grid: int = 60,
) -> tuple[float, float]:
    """Cherche le couple de seuils (vérifier, refuser) qui minimise le coût espéré.

    Balayage sur une grille plutôt qu'une optimisation continue : la surface de
    coût est en escalier — elle ne bouge qu'aux valeurs de probabilité réellement
    observées — et un balayage se lit et se rejoue sans surprise.

    À faire sur les données d'**apprentissage** uniquement. Choisir un seuil sur le
    jeu de test, c'est s'y ajuster, et le résultat annoncé devient optimiste.
    """
    candidates = np.linspace(0.01, 0.95, grid)
    best = (0.35, 0.75)
    best_cost = float("inf")

    for t_verify in candidates:
        for t_refuse in candidates:
            if t_refuse <= t_verify:
                continue
            decisions = np.where(
                probability >= t_refuse, REFUSE, np.where(probability >= t_verify, VERIFY, ADMIT)
            )
            outcome = score_decisions(
                "grid", pd.Series(decisions), pd.Series(truth), cfg
            )
            if outcome.cost < best_cost:
                best_cost = outcome.cost
                best = (float(t_verify), float(t_refuse))

    return best


def apply_thresholds(probability: np.ndarray, t_verify: float, t_refuse: float) -> pd.Series:
    return pd.Series(
        np.where(
            probability >= t_refuse, REFUSE, np.where(probability >= t_verify, VERIFY, ADMIT)
        )
    )


def ranking_metrics(probability: np.ndarray, truth: np.ndarray) -> dict[str, float]:
    """PR-AUC, ROC-AUC et calibration.

    Le score de Brier est ici aussi important que la PR-AUC : la sortie ne sert pas
    seulement à classer, elle est comparée à des seuils. Un modèle qui ordonne
    parfaitement mais renvoie des probabilités fausses fait sauter le choix de
    seuil et donc toute la politique.
    """
    return {
        "pr_auc": float(average_precision_score(truth, probability)),
        "roc_auc": float(roc_auc_score(truth, probability)),
        "brier": float(brier_score_loss(truth, probability)),
        "base_rate": float(np.mean(truth)),
    }


def calibration_table(probability: np.ndarray, truth: np.ndarray, bins: int = 8) -> pd.DataFrame:
    """Fréquence observée contre probabilité annoncée, par tranche."""
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(probability, edges) - 1, 0, bins - 1)

    rows = []
    for b in range(bins):
        mask = idx == b
        if mask.sum() == 0:
            continue
        rows.append(
            {
                "tranche": f"{edges[b]:.2f}–{edges[b + 1]:.2f}",
                "n": int(mask.sum()),
                "prédit": float(probability[mask].mean()),
                "observé": float(truth[mask].mean()),
            }
        )
    return pd.DataFrame(rows)


def slice_report(
    frame: pd.DataFrame, decisions: pd.Series, truth: pd.Series, by: str
) -> pd.DataFrame:
    """Comportement par tranche : une moyenne globale peut cacher un sous-groupe massacré."""
    out = []
    for value, group in frame.groupby(by):
        sub = score_decisions(str(value), decisions.loc[group.index], truth.loc[group.index])
        out.append(
            {
                by: value,
                "n": sub.n,
                "fraudes": sub.total_fraud,
                "rappel": round(sub.recall, 3),
                "précision": round(sub.precision, 3),
                "légitimes refusés": sub.refused_legit,
                "coût/scan": round(sub.cost_per_scan, 3),
            }
        )
    return pd.DataFrame(out).sort_values("n", ascending=False)
