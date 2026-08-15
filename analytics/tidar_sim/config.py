"""Les hypothèses du simulateur, réunies et nommées.

Ce fichier est le plus important du dossier `analytics`, et pas parce qu'il
contient du code : c'est la déclaration explicite de tout ce que la simulation
suppose du monde réel. Un modèle entraîné ici n'apprend pas le contrôle d'accès,
il apprend **ces valeurs**. Les sortir du code et les documenter une à une est ce
qui permet de dire honnêtement ce que les résultats valent — et ce qu'ils ne
valent pas.

Aucune donnée réelle n'existe pour ce projet. Le simulateur n'est donc pas un
raccourci en attendant mieux : c'est le seul moyen d'avoir un jeu de données avec
**vérité terrain**, c'est-à-dire où l'on sait avec certitude quelle tentative était
frauduleuse. En production cette étiquette n'existe jamais de façon fiable, ce qui
rend l'évaluation d'un détecteur de fraude beaucoup plus difficile qu'ici.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class CategoryMix:
    """Une catégorie de billet, sa part de la jauge et son comportement.

    Le taux de no-show est différencié volontairement : c'est ce gradient qui rend
    la prédiction d'absence apprenable. Les invitations gratuites ne coûtent rien à
    ignorer, les VIP payés cher se présentent presque toujours.
    """

    name: str
    share: float
    no_show_rate: float
    face_price: float


@dataclass(frozen=True)
class SimulationConfig:
    """Tous les réglages du monde simulé."""

    seed: int = 42

    # --- Volumétrie ---------------------------------------------------------
    n_events: int = 24
    """Deux ans de programmation mensuelle. Assez d'événements pour qu'un
    découpage temporel ait du sens — on entraîne sur les premiers et on teste sur
    les derniers, jamais au hasard — et assez de positifs dans le jeu de test pour
    que les intervalles de confiance ne soient pas ridicules : à 3 % de fraude,
    dix soirées ne donnaient qu'une centaine de cas positifs au total."""

    tickets_per_event: tuple[int, int] = (600, 1800)
    n_gates: int = 3

    # --- Catégories ---------------------------------------------------------
    categories: tuple[CategoryMix, ...] = (
        CategoryMix("Standard", share=0.62, no_show_rate=0.12, face_price=250.0),
        CategoryMix("Étudiant", share=0.18, no_show_rate=0.18, face_price=120.0),
        CategoryMix("VIP", share=0.14, no_show_rate=0.05, face_price=700.0),
        CategoryMix("Invitation", share=0.06, no_show_rate=0.35, face_price=0.0),
    )

    # --- Courbe d'arrivée ---------------------------------------------------
    doors_open_minutes_before_show: int = 90
    """Les portes ouvrent 90 min avant le début du concert."""

    early_bump_share: float = 0.30
    """Part du public qui arrive dès l'ouverture. Le reste attend."""

    early_peak_ratio: float = 0.15
    late_peak_ratio: float = 0.80
    """Positions des deux pics dans la fenêtre d'arrivée, en fraction. Le second,
    juste avant le début du show, est de loin le plus dense — c'est lui qui fait
    la file d'attente et le sous-effectif aux portes."""

    early_spread: float = 0.10
    late_spread: float = 0.13

    late_arrival_share: float = 0.04
    """Retardataires arrivant après le début. Queue longue, densité faible."""

    # --- Fraude -------------------------------------------------------------
    #
    # Les taux ci-dessous produisent une classe positive autour de 1 à 3 % des
    # tentatives. C'est volontairement déséquilibré : c'est l'ordre de grandeur
    # réel, et c'est ce qui rend l'accuracy inutilisable comme métrique.

    screenshot_share_rate: float = 0.012
    """Billets dont le QR a été partagé (capture d'écran envoyée à des amis)."""

    screenshot_extra_people: tuple[int, int] = (1, 3)
    screenshot_gap_minutes: tuple[float, float] = (2.0, 75.0)
    """Écart entre le porteur légitime et celui qui présente la même capture.

    Une première version bornait cet écart à 25 min, contre 20–130 pour la
    ré-entrée : les deux distributions ne se recouvraient presque pas, et un seuil
    à 15 min séparait les classes avec 0,99 de précision. C'était une hypothèse
    fausse déguisée en bon résultat — l'ami à qui on transfère une capture n'arrive
    pas nécessairement dans le quart d'heure, il arrive quand il arrive. La plage
    est élargie pour que le recouvrement soit réel : entre 8 et 75 min, le délai
    seul ne permet plus de trancher."""

    screenshot_other_gate_prob: float = 0.55
    """Souvent une autre porte — pour ne pas retomber sur l'agent qui vient de
    scanner le même billet. C'est le signal le plus discriminant, mais il est loin
    d'être parfait, et c'est justement ce qui rend le problème intéressant."""

    resale_rate: float = 0.006
    """Billet revendu au marché noir : l'acheteur et le vendeur se présentent."""

    resale_gap_minutes: tuple[float, float] = (5.0, 70.0)

    forged_rate: float = 0.004
    """Codes fabriqués, absents de la liste. Faciles à détecter — une règle suffit."""

    refunded_reuse_rate: float = 0.35
    """Part des billets remboursés dont le porteur se présente quand même. Souvent
    de bonne foi : la personne ignore que son organisateur l'a remboursée."""

    # --- Doublons bénins ----------------------------------------------------
    #
    # LE point de conception du simulateur.
    #
    # Si tout second passage d'un même code était frauduleux, la règle
    # « déjà scanné => refuser » serait parfaite, aucun modèle ne serait utile et
    # tout ce dossier serait une mise en scène. La ré-entrée légitime existe — on
    # sort fumer, on revient — et c'est elle qui crée le recouvrement entre les
    # deux classes. Sans elle, il n'y a pas de problème d'apprentissage.

    re_entry_rate: float = 0.045
    """Part des entrants qui ressortent et reviennent."""

    re_entry_gap_minutes: tuple[float, float] = (8.0, 140.0)
    """Plus long en moyenne qu'un partage de billet, mais franchement chevauchant :
    on ressort parfois dix minutes, parfois deux heures. C'est ce chevauchement qui
    empêche un seuil sur le seul délai de résoudre le problème."""

    re_entry_same_gate_prob: float = 0.80
    """On revient par où l'on est sorti. Là encore : tendance, pas règle."""

    # --- Bruit terrain ------------------------------------------------------
    manual_entry_rate: float = 0.03
    """QR illisible : écran cassé, impression délavée, batterie vide."""

    network_outage_count: tuple[int, int] = (1, 4)
    network_outage_minutes: tuple[float, float] = (0.5, 12.0)
    """Coupures réseau. Sans effet sur l'étiquette de fraude — elles n'affectent
    que la remontée — mais elles servent à éprouver le mode hors-ligne."""

    # --- Achat --------------------------------------------------------------
    purchase_lead_days: tuple[float, float] = (0.2, 60.0)
    channels: tuple[str, ...] = ("web", "guichet", "revendeur", "invitation")
    channel_weights: tuple[float, ...] = (0.68, 0.16, 0.10, 0.06)

    revoked_rate: float = 0.02
    refunded_rate: float = 0.025

    # --- Coût métier --------------------------------------------------------
    #
    # Asymétrique, et c'est tout l'enjeu de la décision à la porte.

    cost_false_positive: float = 10.0
    """Refuser un client légitime : altercation à l'entrée, file bloquée, geste
    commercial, avis négatif. C'est l'erreur chère."""

    cost_false_negative: float = 3.0
    """Laisser entrer une tentative illégitime : une place perdue."""

    cost_manual_check: float = 1.0
    """Envoyer quelqu'un en vérification d'identité : quelques dizaines de
    secondes d'agent, sans conflit. C'est la porte de sortie qui justifie une
    politique à trois branches plutôt qu'un simple oui/non."""

    holidays: tuple[str, ...] = field(default_factory=tuple)

    def category_by_name(self, name: str) -> CategoryMix:
        for c in self.categories:
            if c.name == name:
                return c
        raise KeyError(name)


DEFAULT = SimulationConfig()
