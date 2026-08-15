"""Le modèle candidat, et la façon honnête de choisir ses seuils.

`HistGradientBoostingClassifier` plutôt que LightGBM : c'est le même type
d'algorithme — arbres boostés sur histogrammes — il est déjà dans scikit-learn,
il gère nativement les valeurs manquantes et les variables catégorielles, et il
évite une dépendance de plus pour un gain nul à cette échelle. Une dépendance
qu'on n'ajoute pas est une dépendance qui ne casse pas.

Le point de méthode important est ailleurs, dans `fit_and_score` : les seuils sont
choisis sur des prédictions **hors échantillon**, obtenues par validation croisée
groupée par soirée. Les choisir sur les prédictions d'entraînement donnerait des
probabilités trop sûres d'elles et des seuils trop serrés ; les choisir sur le jeu
de test reviendrait à s'y ajuster et à annoncer un résultat qu'on n'obtiendra
jamais en production.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import GroupKFold, cross_val_predict

from .config import DEFAULT, SimulationConfig
from .evaluate import choose_thresholds
from .features import FEATURE_COLUMNS

SEED = 42


def make_model() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        max_depth=5,
        max_iter=180,
        learning_rate=0.07,
        min_samples_leaf=25,
        l2_regularization=1.0,
        # Les arbres restent petits et peu nombreux : ils devront être évalués sur
        # un téléphone, dans le chemin d'un scan, sous 50 ms.
        random_state=SEED,
    )


def design_matrix(frame: pd.DataFrame) -> pd.DataFrame:
    """Les colonnes du modèle, dans l'ordre qui fait foi.

    Tout est numérique — les catégorielles sont déjà en one-hot depuis
    `features.py` — de sorte que chaque découpage de l'arbre soit une simple
    comparaison à un seuil, portable telle quelle en TypeScript.
    """
    return frame[FEATURE_COLUMNS].astype(float)


@dataclass
class Fitted:
    model: HistGradientBoostingClassifier
    t_verify: float
    t_refuse: float
    oof_probability: np.ndarray
    test_probability: np.ndarray


def fit_and_score(
    train: pd.DataFrame, test: pd.DataFrame, cfg: SimulationConfig = DEFAULT
) -> Fitted:
    x_train, y_train = design_matrix(train), train.is_illegitimate.astype(int).to_numpy()
    x_test = design_matrix(test)

    # Validation croisée groupée par soirée : aucune soirée n'est à la fois dans
    # le pli d'apprentissage et dans le pli de validation. Un découpage aléatoire
    # mettrait des scans de la même soirée des deux côtés, et les caractéristiques
    # partagées de cette soirée fuiraient d'un pli à l'autre.
    splitter = GroupKFold(n_splits=4)
    oof = cross_val_predict(
        make_model(),
        x_train,
        y_train,
        cv=splitter,
        groups=train.event_index,
        method="predict_proba",
    )[:, 1]

    t_verify, t_refuse = choose_thresholds(oof, y_train, cfg)

    model = make_model()
    model.fit(x_train, y_train)
    test_probability = model.predict_proba(x_test)[:, 1]

    return Fitted(
        model=model,
        t_verify=t_verify,
        t_refuse=t_refuse,
        oof_probability=oof,
        test_probability=test_probability,
    )
