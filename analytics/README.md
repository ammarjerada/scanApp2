# analytics — score de risque à la porte

Volet données et modèle du projet. Produit le fichier `src/ml/model.json` que
l'application embarque et exécute hors réseau.

> **Toutes les données sont simulées.** Les scores de ce dossier décrivent le
> simulateur défini dans `tidar_sim/config.py`, pas le comportement réel d'un
> public. Ce qui se transpose, c'est la chaîne de traitement et la méthode
> d'évaluation — jamais le chiffre.

## Le problème

À la porte, l'application affichait sur un doublon : « déjà scanné il y a 12 min ·
porte B », puis laissait l'agent trancher seul, en trois secondes, entre un billet
partagé et quelqu'un qui ressort fumer et revient. Les deux produisent exactement
le même événement.

| | |
|---|---|
| **Décision** | admettre, envoyer vérifier, ou refuser |
| **Unité d'analyse** | une tentative de passage |
| **Cible** | la personne qui se présente n'a pas de droit d'entrée |
| **Horodatage de prédiction** | l'instant où le QR est décodé, **avant** que l'agent n'agisse |
| **Baseline** | les règles déterministes de `src/domain/checkIn.ts` |

## Ce qui rend le problème réel

Si tout second passage d'un même code était frauduleux, la règle « déjà scanné ⇒
refuser » serait parfaite et il n'y aurait rien à apprendre. Le simulateur produit
donc aussi des **ré-entrées légitimes** : sur les données générées, **60 % des
doublons sont des gens qui reviennent**. C'est ce recouvrement qui fait le
problème, et c'est la première chose à vérifier après toute modification du
générateur — `build_dataset.py` l'affiche à chaque exécution.

Une première version du simulateur bornait l'écart de partage à 25 min contre
20–130 pour la ré-entrée : les deux distributions ne se recouvraient presque pas,
un seuil à 15 min atteignait 0,99 de précision, et le modèle n'avait aucune raison
d'exister. C'était une hypothèse fausse déguisée en bon résultat. Les plages ont
été élargies pour se chevaucher franchement.

## Résultats

Jeu de test : les 6 dernières soirées, 4 511 scans, 4,15 % d'illégitimes.

| politique | rappel | précision | légitimes refusés | coût/scan |
|---|---:|---:|---:|---:|
| app actuelle (tout doublon refusé) | 1.000 | 0.524 | **170** | 0.377 |
| doublon < 15 min | 0.615 | 0.943 | 7 | 0.063 |
| doublon < 15 min + autre porte | 0.615 | 1.000 | 0 | 0.053 |
| **modèle** | **0.925** | **0.994** | **1** | **0.028** |

Restreint aux 288 seconds passages — le seul terrain où un modèle peut apporter
quelque chose, puisqu'un code absent ou un billet remboursé se reconnaissent par
un `if` :

| politique | rappel | précision | coût/scan |
|---|---:|---:|---:|
| app actuelle | 1.000 | 0.410 | 5.903 |
| doublon < 15 min + autre porte | 0.390 | 1.000 | 0.826 |
| **modèle** | **0.907** | **0.991** | **0.469** |

PR-AUC 0,973 · Brier 0,0057 · seuils retenus 0,41 / 0,90.

La PR-AUC globale flatte : `forged` et `refunded_reuse` sont détectés à 100 % mais
sont déterministes. C'est le second tableau qui juge le modèle.

## Méthode

- **Coût asymétrique.** Refouler un client légitime coûte 10, laisser passer une
  fraude 3, envoyer vérifier 1. Les deux seuils minimisent le coût espéré ; ils ne
  sont ni ronds ni choisis sur la F1.
- **Seuils choisis hors échantillon**, par validation croisée groupée par soirée.
  Les choisir sur le jeu de test reviendrait à s'y ajuster.
- **Double découpage** temporel *et* par acheteur. `temporal_group_split` lève une
  assertion si un acheteur se retrouve des deux côtés.
- **Features causales.** Une passe unique dans l'ordre chronologique, l'état mis à
  jour *après* écriture de chaque ligne. Un `groupby` sur la soirée verrait le futur.
- **Calibration mesurée**, pas supposée : la sortie est comparée à des seuils, un
  bon classement ne suffit pas.

## Parité entraînement / service

Le calcul des features existe deux fois : `tidar_sim/features.py` et
`src/domain/risk.ts`. Elles vont diverger, et en silence — rien ne casse, les
prédictions se dégradent.

Le garde-fou est `src/ml/goldenVectors.json` : 40 cas tirés du jeu de test,
stratifiés (premier passage, doublon, code absent, remboursé, valeurs manquantes),
avec leur probabilité scikit-learn. Le test Jest `src/domain/risk.test.ts` les
rejoue et exige l'égalité à 10⁻⁹. Toute divergence fait tomber la suite.

## Embarquement : arbres compilés, pas ONNX

`onnxruntime-react-native` est un module natif — il ferait sortir le projet d'Expo
Go et imposerait un build EAS. À 180 arbres de profondeur 5, une descente d'arbre
en TypeScript pur coûte quelques microsecondes, tient dans 95 Ko de JSON, et ne
demande aucune dépendance. Les catégorielles sont donc en one-hot plutôt que
confiées au support natif de scikit-learn, dont les découpages s'expriment en
bitsets qu'il faudrait réimplémenter.

## Utilisation

```bash
python scripts/build_dataset.py --seed 42   # génère data/*.csv
python scripts/run_baseline.py              # mesure les règles seules
python scripts/train_eval.py                # entraîne, évalue, exporte vers src/ml/
```

Dépendances : `pandas`, `numpy`, `scikit-learn`. Pas de LightGBM —
`HistGradientBoostingClassifier` est le même type d'algorithme et évite une
dépendance de plus.

## Limites

- Données simulées : les scores mesurent le simulateur.
- La branche « vérifier » est supposée infaillible — optimiste, mais appliqué
  identiquement à toutes les politiques comparées.
- En production, l'étiquette viendra de la décision de l'agent, consignée par
  l'écran « À vérifier ». Elle sera bruitée, partielle, et **biaisée par les
  recommandations du modèle lui-même** : l'agent voit le score avant de trancher.
  À traiter comme telle au réentraînement.
