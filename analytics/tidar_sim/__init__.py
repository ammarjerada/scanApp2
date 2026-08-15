"""Volet données et modèle du projet Tidar Scan.

Chaîne complète : simulation d'événements avec vérité terrain, construction de
features causales, baseline par règles mesurée, puis modèle — dans cet ordre, et
seulement si la baseline ne suffit pas.
"""

from .config import DEFAULT, SimulationConfig
from .simulate import Dataset, simulate

__all__ = ["DEFAULT", "SimulationConfig", "Dataset", "simulate"]
