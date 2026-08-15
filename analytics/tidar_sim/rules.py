"""La baseline : les règles que l'application applique déjà.

Avant tout modèle, il faut savoir ce que fait le système en place. `checkIn.ts`
tranche aujourd'hui de façon déterministe, et ces règles-là sont reproduites ici à
l'identique — pas une version affaiblie choisie pour faire briller le modèle.

Deux variantes plus fines suivent. Elles ne sont pas là pour la forme : si l'une
d'elles suffit, le bon livrable est une règle, pas un modèle. Un `if` se lit, se
teste, se corrige à la porte un vendredi soir, et ne dérive pas. Le modèle doit
gagner sa place contre elles, sur le coût métier — pas sur une courbe.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# Les trois décisions possibles à la porte.
ADMIT = "admit"
VERIFY = "verify"
REFUSE = "refuse"


def rule_current_app(f: pd.DataFrame) -> pd.Series:
    """Les règles de `src/domain/checkIn.ts`, telles qu'elles tournent aujourd'hui.

    Ordre identique à celui du moteur : on écarte d'abord ce qui n'est pas un
    billet d'ici, puis ce qui n'est plus valable, et seulement à la fin on regarde
    si quelqu'un est déjà passé avec.
    """
    refuse = (
        (f.code_in_list == 0)
        | (f.is_revoked == 1)
        | (f.is_refunded == 1)
        | (f.prior_scan_count > 0)
    )
    return pd.Series(np.where(refuse, REFUSE, ADMIT), index=f.index)


def rule_duplicate_window(f: pd.DataFrame, minutes: float = 15.0) -> pd.Series:
    """Comme ci-dessus, mais un doublon tardif est traité comme une ré-entrée.

    L'intuition : revenir deux heures plus tard, c'est une ré-entrée ; repasser
    dans les minutes qui suivent, c'est un billet partagé.
    """
    hard = (f.code_in_list == 0) | (f.is_revoked == 1) | (f.is_refunded == 1)
    fresh_duplicate = (f.prior_scan_count > 0) & (f.minutes_since_prior_scan < minutes)
    return pd.Series(np.where(hard | fresh_duplicate, REFUSE, ADMIT), index=f.index)


def rule_window_and_gate(f: pd.DataFrame, minutes: float = 15.0) -> pd.Series:
    """La règle précédente, resserrée par la porte, et avec une branche « vérifier ».

    Un doublon rapide **à une autre porte** est le profil type du billet partagé :
    on refuse. Un doublon rapide **à la même porte** est ambigu — même agent, même
    file — donc on envoie vérifier plutôt que de refouler quelqu'un à tort.
    """
    hard = (f.code_in_list == 0) | (f.is_revoked == 1) | (f.is_refunded == 1)
    fresh = (f.prior_scan_count > 0) & (f.minutes_since_prior_scan < minutes)
    other_gate = f.same_gate_as_prior == 0

    decision = np.where(
        hard | (fresh & other_gate),
        REFUSE,
        np.where(fresh, VERIFY, ADMIT),
    )
    return pd.Series(decision, index=f.index)


BASELINES = {
    "app actuelle (tout doublon refusé)": rule_current_app,
    "doublon < 15 min": rule_duplicate_window,
    "doublon < 15 min + autre porte": rule_window_and_gate,
}
