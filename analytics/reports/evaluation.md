# Score de risque à la porte — rapport d'évaluation

> Généré par `scripts/train_eval.py`. **Toutes les données sont simulées.**
> Les chiffres ci-dessous décrivent le simulateur décrit dans `tidar_sim/config.py`,
> pas le comportement réel d'un public. Ce qui se transpose, c'est la méthode
> et la chaîne de traitement — jamais le score.

## Cadrage

| | |
|---|---|
| Décision | admettre, envoyer vérifier, ou refuser |
| Unité d'analyse | une tentative de passage |
| Cible | la personne qui se présente n'a pas de droit d'entrée |
| Horodatage de prédiction | l'instant où le QR est décodé, avant que l'agent n'agisse |
| Apprentissage | 17,910 scans · 734 illégitimes |
| Test | 4,511 scans · 187 illégitimes |
| Taux de base (test) | 4.15 % |

Découpage **temporel par soirée** et **groupé par acheteur** : on entraîne sur les
premières soirées et on teste sur les dernières, et aucun acheteur n'est des deux
côtés. Un découpage aléatoire aurait mis des scans de la même soirée dans les deux
jeux, et les caractéristiques partagées de cette soirée auraient fuité.

## Ce que le modèle apporte — ou non

Coût métier asymétrique : refouler un client légitime coûte **10**, laisser passer
une fraude **3**, envoyer vérifier une pièce d'identité **1**. C'est cette asymétrie
qui décide, pas la courbe ROC.

| politique | rappel | précision | légitimes refusés | vérifications | coût/scan |
|---|---:|---:|---:|---:|---:|
| app actuelle (tout doublon refusé) | 1.000 | 0.524 | 170 | 0 | 0.377 |
| doublon < 15 min | 0.615 | 0.943 | 7 | 0 | 0.063 |
| doublon < 15 min + autre porte | 0.615 | 1.000 | 0 | 22 | 0.053 |
| **modèle (seuils 0.41 / 0.90)** | **0.925** | **0.994** | **1** | **74** | **0.028** |

Le modèle réduit le coût de **47.1 %** face à la meilleure règle
(« doublon < 15 min + autre porte »). Il gagne sa place.

### Classement et calibration

| métrique | valeur |
|---|---:|
| PR-AUC | 0.973 |
| ROC-AUC | 0.999 |
| Brier | 0.0057 |

La PR-AUC prime sur la ROC-AUC : à 4 % de positifs, la ROC-AUC flatte. Le Brier
compte autant que les deux, parce que la sortie est comparée à des seuils —
un modèle qui ordonne bien mais dont les probabilités sont fausses fait sauter
le choix de seuil, donc toute la politique.

### Fiabilité des probabilités

| tranche | n | prédit | observé |
|---|---:|---:|---:|
| 0.00–0.12 | 4,263 | 0.001 | 0.000 |
| 0.12–0.25 | 27 | 0.188 | 0.259 |
| 0.25–0.38 | 21 | 0.309 | 0.190 |
| 0.38–0.50 | 15 | 0.417 | 0.400 |
| 0.50–0.62 | 7 | 0.578 | 0.714 |
| 0.62–0.75 | 24 | 0.687 | 0.708 |
| 0.75–0.88 | 29 | 0.809 | 0.793 |
| 0.88–1.00 | 125 | 0.978 | 0.992 |

### Par catégorie de billet

| catégorie | n | fraudes | rappel | précision | légitimes refusés | coût/scan |
|---|---:|---:|---:|---:|---:|---:|
| Standard | 2,861 | 115 | 0.939 | 1.000 | 0 | 0.023 |
| VIP | 719 | 36 | 0.944 | 1.000 | 0 | 0.028 |
| Étudiant | 709 | 25 | 0.880 | 0.957 | 1 | 0.047 |
| Invitation | 222 | 11 | 0.818 | 1.000 | 0 | 0.036 |

### Par mode de fraude — ce qui échappe encore

| mode | total | manqués | taux de détection |
|---|---:|---:|---:|
| forged | 12 | 0 | 1.000 |
| refunded_reuse | 57 | 0 | 1.000 |
| resale | 38 | 3 | 0.921 |
| screenshot_share | 80 | 11 | 0.863 |

Total manqué : 14 tentatives sur 187.

## Le chiffre global flatte — voici le vrai terrain

`forged` et `refunded_reuse` sont détectés à 100 %, mais ils sont **déterministes** :
un code absent de la liste ou un billet remboursé se reconnaissent par un `if`, sans
modèle. Ils gonflent la PR-AUC sans rien prouver.

Le seul endroit où un modèle peut apporter quelque chose, c'est le **doublon** :
un même code présenté deux fois, où il faut distinguer le billet partagé de la
ré-entrée légitime. Voici les mêmes politiques restreintes à ce sous-ensemble.

Sous-ensemble : 288 seconds passages, dont 118 illégitimes (41.0 %).

| politique | rappel | précision | légitimes refusés | coût/scan |
|---|---:|---:|---:|---:|
| app actuelle (tout doublon refusé) | 1.000 | 0.410 | 170 | 5.903 |
| doublon < 15 min | 0.390 | 0.868 | 7 | 0.993 |
| doublon < 15 min + autre porte | 0.390 | 1.000 | 0 | 0.826 |
| **modèle** | **0.881** | **0.990** | **1** | **0.438** |

C'est ce tableau-là qu'il faut regarder pour juger le modèle. Le reste, une règle
le fait aussi bien et pour moins cher en complexité.

## Limites

- **Données simulées.** Les scores mesurent le simulateur. Les hypothèses de
  `config.py` — surtout le recouvrement entre partage de billet et ré-entrée —
  déterminent directement la difficulté du problème.
- **La branche « vérifier » est supposée infaillible** : on admet qu'un contrôle
  d'identité tranche juste. C'est optimiste, mais appliqué identiquement à toutes
  les politiques comparées, donc sans effet sur le classement.
- **Aucune boucle de retour réelle.** En production, l'étiquette viendrait de la
  décision de l'agent — et serait bruitée, partielle, et biaisée par les
  recommandations du modèle lui-même.
