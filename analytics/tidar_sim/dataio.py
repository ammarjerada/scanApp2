"""Lecture du jeu de données simulé.

Les colonnes de date doivent être reparsées explicitement : un CSV ne porte pas de
schéma, et pandas rendrait des chaînes. Tout le calcul de features repose sur des
différences de dates — une chaîne passerait silencieusement et donnerait des
features fausses plutôt qu'une erreur.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

DATE_COLUMNS = ["at", "doors_at", "show_at", "purchased_at"]


def load_scans(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(path)
    for column in DATE_COLUMNS:
        frame[column] = pd.to_datetime(frame[column])
    return frame
