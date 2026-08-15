# scanApp2 — Audit technique & roadmap de valorisation Data / AI

> Audit réalisé le 14 août 2026 sur le commit `e8e1404` (dernier commit : 23 mai 2024).
>
> **Mise à jour du 14 août 2026 — les phases 0 et 1 sont faites.** L'application a été
> reconstruite : SDK 57, TypeScript strict, expo-router, mode hors ligne, moteur de contrôle
> testé, et les douze bugs du tableau §2.2 sont corrigés. Voir [README.md](README.md).
> Les sections 1 et 2 ci-dessous décrivent donc l'**état initial**, conservé comme point de
> comparaison. Le reste — plateforme data et modèles — est toujours à venir.
>
> ⚠️ Une action reste ouverte et ne dépend pas du code : **révoquer le jeton tidar.ma**,
> toujours présent dans l'historique Git.

---

## 1. État des lieux

**Ce que c'est :** une application Expo / React Native (SDK 51, RN 0.74.1) de contrôle d'accès
par QR code pour la billetterie événementielle **tidar.ma**. Rôle : l'agent à l'entrée scanne
le billet d'un participant, l'app valide auprès de l'API.

**Écrans (7) :**

| Fichier | Rôle | État réel |
|---|---|---|
| `App.js` | Stack navigator + écran d'accueil | Compteurs affichés en dur : `?/? validated` |
| `ScanPage.js` | Scan QR + appel `POST /api/scan` | **Seul appel API fonctionnel** |
| `Events.js` | Liste des événements | 5 événements codés en dur |
| `TicketListing.js` | Catégories de billets | 3 catégories codées en dur |
| `TicketDetails.js` | Liste des participants | 2 participants codés en dur |
| `LoginPage.js` | Connexion `POST /api/login` | Appel réel, mais résultat non exploité |
| `CreateAccountPage.js` | Inscription | Handler vide |
| `Settings.js` | Accès login / création de compte | OK |

**Verdict :** c'est un prototype d'UI abouti visuellement, mais dont **une seule fonction
métier est réellement branchée** (le scan). Il n'y a ni état applicatif, ni persistance, ni
données. C'est un point de départ, pas un produit — et c'est en fait une bonne nouvelle :
tu peux reconstruire la couche métier et data sans rien casser.

---

## 2. Audit — ce qui bloque

### 2.1 Sécurité — à traiter en priorité absolue

**🔴 Token d'API en clair, commité sur un dépôt GitHub public**

`ScanPage.js:22` contient un Bearer token de 60 caractères pour `tidar.ma`, en dur dans le
code source, poussé sur un dépôt public depuis mai 2024.

Actions, dans cet ordre :

1. **Révoquer le token côté serveur tidar.ma.** Il est public depuis 2 ans ; le considérer
   comme compromis, sans exception. Le retirer du code ne suffit pas — il reste dans
   l'historique Git et dans tous les forks/caches.
2. Purger l'historique (`git filter-repo`) **ou**, plus simple et plus honnête : repartir
   d'un dépôt neuf pour la v2 et archiver l'ancien.
3. Aucun secret dans le bundle mobile, jamais : un binaire mobile est décompilable. Le
   token d'accès doit être obtenu par login utilisateur et stocké dans
   `expo-secure-store` (Keychain iOS / Keystore Android).
4. Ajouter `gitleaks` en pre-commit hook + en job CI.

**🟠 Aucune gestion de session.** `LoginPage.js:26` affiche une `Alert` en cas de succès et
s'arrête là : pas de token conservé, pas de redirection, pas de contexte d'auth. Toutes les
routes sont accessibles sans authentification (`App.js:33`, `initialRouteName="Home"`).

**🟠 Aucune validation d'entrée** sur email / mot de passe, ni côté client ni de retour
d'erreur structuré. `LoginPage.js:31` fait `errorMessage.email` sans vérifier que
`data.message` existe → `TypeError` si l'API renvoie autre chose que le format attendu.

### 2.2 Bugs fonctionnels

| # | Fichier | Problème | Impact |
|---|---|---|---|
| 1 | `ScanPage.js:51` | **La permission caméra n'est jamais demandée** (`useCameraPermissions` absent) | Écran noir sur device réel — l'app ne scanne pas |
| 2 | `app.json:37` | Clé `"expo"` **imbriquée dans** `"expo"` | Le bloc `plugins` (config caméra) n'est jamais lu par Expo |
| 3 | `package.json:28` | Dépendance fantôme `"undefined": "expo-camera/next"` | Casse `npm install` |
| 4 | `ScanPage.js:41` | `setScanned(false)` dans le `finally`, sans délai | Le même QR est re-scanné en boucle → l'API est martelée |
| 5 | `ScanPage.js:53` | API `Camera` + `onBarCodeScanned` (dépréciée) | Supprimée à partir du SDK 52 |
| 6 | `Events.js:57` | `onMouseEnter` / `onMouseLeave` | Props web uniquement, sans effet sur mobile |
| 7 | `Events.js:20` | Une seule `scaleValue` et un seul `isHovered` partagés par **tous** les items | Tous les items s'animent ensemble |
| 8 | `Events.js:119` | `value={""}` + `onChangeText={() => {}}` | La recherche d'événements ne fonctionne pas |
| 9 | `TicketDetails.js:121` | `handleSearchInputChange` vide | La recherche de participants ne fonctionne pas |
| 10 | `TicketDetails.js:135` | `handleValidateTicket` / `handleRefundTicket` → `console.log` | Boutons décoratifs |
| 11 | `TicketDetails.js:25` | `validatedTickets` figé à `"0/16"`, `setInterval` qui réécrit la même valeur | Compteur factice |
| 12 | dépôt | `Scan-Application` et `scanApp` commités en **gitlinks** (mode `160000`) sans `.gitmodules` | Deux dossiers vides après clone ; dépôts imbriqués commités par accident |

### 2.3 Dette technique

- **6 versions de SDK de retard.** SDK 51 → **57** aujourd'hui ; RN 0.74.1 → **0.87.0**.
  `expo-barcode-scanner` est figé à 13.0.1 : le paquet est mort, remplacé par `expo-camera`.
- **JavaScript sans types**, sans ESLint, sans Prettier, sans tests, sans CI.
- **Aucun état global** : chaque écran gère son état local, la donnée circule via
  `route.params`.
- **Dépendances inutilisées** : `react-native-vector-icons` (le code utilise
  `@expo/vector-icons`), `expo-barcode-scanner`, `@react-native-community/masked-view`
  (déprécié), `react-native-reanimated` (jamais importé).
- **Dépendances importées mais non déclarées** : `expo-font`, `@expo/vector-icons` —
  elles ne fonctionnent que par transitivité d'`expo`.
- **Styles dupliqués** : 5 fichiers de styles, aucun token partagé (les mêmes `#242424`,
  `#A78ED6`, `circularstd` recopiés partout).
- **`userInterfaceStyle: "light"`** dans `app.json` alors que toute l'UI est sombre.
- **README de 24 octets.**

---

## 3. Le point dur à regarder en face : il n'y a pas de données

Tu veux valoriser un profil **data / AI engineering**. Or ce dépôt ne contient
**aucune donnée** : pas de base, pas de logs, pas d'historique de scans. Or aucune des
fonctionnalités IA proposées plus bas n'est démontrable sans données.

**C'est le premier chantier, et il est lui-même un livrable de portfolio.**

### Simulateur d'événement (`sim/`)

Un générateur paramétrable qui produit un historique réaliste :

- **Courbe d'arrivée** : mélange de deux modes — un pic à l'ouverture des portes, un pic
  plus fort 20–30 min avant le début du show, avec une queue de retardataires.
  (Un processus de Poisson non homogène suffit ; l'intensité est la courbe.)
- **Taux de no-show différencié par catégorie** : les billets gratuits / invitations
  no-showent beaucoup plus que les VIP payants — c'est ce gradient qui rend la
  prédiction de no-show intéressante.
- **Injection de fraude paramétrée**, avec le *ground truth* conservé : duplication de QR
  (capture d'écran revendue à N personnes), billet revendu au marché noir, QR forgé,
  billet remboursé mais présenté quand même.
- **Plusieurs portes**, avec des vitesses de traitement différentes.
- **Pannes réseau** : coupures de 30 s à 10 min, pour tester le mode hors-ligne.

Sorties : `tickets.parquet`, `orders.parquet`, `scan_events.parquet`, `fraud_labels.parquet`.

**Pourquoi ça compte en entretien :** un data engineer confronté à « on n'a pas encore de
prod » ne bloque pas, il simule — et il sait dire ce que sa simulation ne capture pas.
Documente explicitement les hypothèses du générateur et leurs limites : c'est ce paragraphe
qui distingue un vrai profil data d'un utilisateur de `make_classification`.

⚠️ **Garde-fou méthodologique :** un modèle entraîné sur des données que tu as toi-même
générées apprend ta simulation, pas la réalité. Ne présente donc jamais les scores obtenus
sur données simulées comme des performances métier. Le livrable, c'est **le pipeline et la
méthode**, pas le chiffre. Dis-le explicitement dans le README — c'est un signal de maturité
beaucoup plus fort qu'un AUC de 0,97 non qualifié.

---

## 4. Les fonctionnalités IA, par ordre de valeur

Classées par **valeur métier × crédibilité en entretien**, pas par effet de démo.

### 🥇 A. Détection de fraude au contrôle d'accès

**Le meilleur candidat**, parce que c'est le problème métier réel de ce produit.

*Problème :* billets dupliqués (capture d'écran partagée), revente non autorisée, QR forgés,
billets remboursés présentés quand même.

*Features (calculables au moment du scan) :*
- Δt depuis le premier scan du même QR ; nombre total de scans de ce QR
- Distance entre les portes des scans successifs / vitesse implicite (impossibilité physique)
- Δ entre l'heure d'achat et l'heure de scan
- Canal d'achat, prix payé vs prix facial, nombre de billets dans la commande
- Historique de l'acheteur : nb d'événements, nb de no-shows, nb de litiges passés
- Densité de scans de la même commande sur une fenêtre glissante

*Approche progressive :*
1. **Baseline par règles** : « déjà scanné » + « fenêtre temporelle » + « deux portes
   incompatibles ». **Mesure-la.** Souvent elle attrape 80 % des cas — et une règle qui
   marche est un meilleur choix qu'un modèle qui fait pareil. Savoir dire ça est un point
   fort, pas une faiblesse.
2. **Non supervisé** (`IsolationForest`, LOF) tant qu'il n'y a pas de labels, pour remonter
   les cas atypiques à la revue manuelle.
3. **Supervisé** (LightGBM) dès que le staff produit des labels — car c'est ça le vrai
   design : *chaque décision de l'agent à la porte est une annotation*. Prévois le bouton
   « refusé / accepté après vérification » dans l'app dès la v1 : c'est ta boucle de
   feedback, et c'est le point d'architecture le plus intéressant à raconter.

*Métriques :* surtout **pas l'accuracy** (la fraude est à ~1 %). Deux seuils distincts :
- seuil **« bloquer »** → optimisé en **précision** (refuser un client légitime à la porte
  coûte très cher : conflit, file bloquée, image de marque)
- seuil **« vérifier »** → optimisé en **rappel**, pour la revue post-événement

Présente une **matrice de coût asymétrique** et le choix de seuil qui en découle. C'est
exactement la conversation qu'un recruteur data attend, et c'est rarement ce qu'il trouve.

### 🥈 B. Prévision du flux d'arrivée et dimensionnement des portes

*Problème :* files d'attente à l'entrée, sous-effectif au pic, sur-effectif le reste du temps.

*Cible :* nombre d'arrivées par tranche de 5 min et par porte.

*Features :* minutes avant l'ouverture / avant le début, jour de semaine, catégorie de
billet, météo (API publique), taux de remplissage vendu, historique du lieu et de l'artiste.

*Modèles :*
1. Baseline : **courbe d'arrivée moyenne historique** par type d'événement. Elle est
   étonnamment difficile à battre.
2. LightGBM en **régression quantile** (P50 et P90) : on dimensionne le staff sur le P90,
   pas sur la moyenne — l'intervalle de prédiction *est* la décision métier.

*Livrable visible :* un écran « Portes » dans l'app + un dashboard organisateur —
pic prévu, nombre de scanners recommandés, alerte temps réel quand le réel s'écarte de
l'intervalle prévu.

*Métriques :* MAE et **pinball loss** (adaptée aux quantiles), plus une métrique métier
simulée : minutes d'attente cumulées évitées.

### 🥉 C. Prédiction de no-show

*Cible :* ce billet sera-t-il scanné ? (classification binaire, par billet)

*Valeur :* dimensionnement du catering et du personnel, surréservation maîtrisée, relance
ciblée à J-1 sur les billets à fort risque.

*Point technique à ne pas rater :* le **split doit être temporel et par événement**, jamais
aléatoire. Un split aléatoire mettrait des billets du même événement des deux côtés →
fuite massive par les caractéristiques partagées de l'événement, et un score irréaliste.

*Métriques :* AUC-PR **et calibration** (score de Brier + courbe de calibration). La sortie
sert à estimer un volume (« combien de repas prévoir »), donc il faut des probabilités
calibrées, pas seulement un bon classement. Peu de candidats pensent à la calibration ;
c'est un bon différenciateur.

### 🏅 D. Scoring embarqué hors-ligne — le vrai différenciateur « AI engineering »

*Le constat terrain :* aujourd'hui, **chaque scan est un aller-retour HTTP**
(`ScanPage.js:16`). Dans une salle de concert ou un festival — sous-sol, 4G saturée par
5 000 personnes — l'app est tout simplement inutilisable. C'est le défaut de conception le
plus grave du produit actuel, et le corriger est aussi ce qui rend la partie ML intéressante.

*Architecture hors-ligne d'abord :*
- SQLite local (`expo-sqlite`) avec la liste des billets pré-synchronisée avant l'événement
- File de scans locale, rejouée à la reconnexion
- Résolution de conflit explicite : **le premier scan horodaté gagne**, les suivants sont
  marqués « doublon détecté a posteriori » — ce qui alimente directement le dataset de fraude

*Le modèle sur l'appareil :*
- LightGBM entraîné côté serveur → export **ONNX** → quantification → quelques centaines
  de Ko → exécution locale
- Budget de latence explicite : **< 50 ms** sur le chemin du scan, mesuré et documenté
- Le piège classique à traiter et à raconter : la **parité des features online / offline**
  (*training-serving skew*). Certaines features (historique acheteur) ne sont pas
  disponibles hors ligne → il faut soit les pré-calculer et les embarquer, soit entraîner
  un modèle « dégradé » dédié au mode hors-ligne. Ce compromis, documenté, vaut plus qu'un
  notebook de plus.

C'est le bloc qui te démarque : optimisation de modèle, contrainte d'embarqué, budget de
latence, cohérence des features. C'est du ML **engineering**, pas du ML de notebook.

### 🎁 E. Assistant en langage naturel sur les données de l'événement (bonus)

« Combien de VIP ne sont pas encore arrivés ? » → SQL généré sur un schéma restreint,
exécuté en lecture seule, réponse chiffrée + graphique.

*Garde-fous obligatoires :* allow-list de tables et colonnes, SQL parsé et validé
(`sqlglot`) avant exécution, connexion en lecture seule, timeout, aucun DDL/DML,
jamais de concaténation de chaîne.

⚠️ **À placer en dernier, volontairement.** C'est le module le plus rapide à construire
aujourd'hui, donc le moins différenciant : tout le monde met un chatbot dans son portfolio.
Les blocs A à D valent bien plus. Si tu le fais, l'angle à défendre est *le garde-fou*, pas
le prompt.

### ⛔ F. Ce qu'il faut écarter (et savoir expliquer pourquoi)

La reconnaissance faciale pour l'accès VIP est techniquement à portée et paraît
impressionnante. C'est une **donnée biométrique** : RGPD art. 9, consentement explicite,
analyse d'impact (AIPD) obligatoire, et une loi 09-08 côté Maroc. Hors cadre pour un projet
de portfolio.

**Mentionne ce choix dans le README.** Dire « j'ai écarté cette piste, voici pourquoi » est
un signal de jugement d'ingénieur — souvent plus valorisé que la fonctionnalité elle-même.

---

## 5. Architecture cible

```
┌─────────────────────────────────────────────────────────┐
│  MOBILE — Expo SDK 57 / RN 0.87 / TypeScript            │
│  expo-router · TanStack Query · Zustand · SecureStore   │
│  ┌───────────────────────────────────────────────────┐  │
│  │ SQLite local · file de scans · modèle ONNX (<1 Mo)│  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS · JWT · sync par lots
┌──────────────────────────▼──────────────────────────────┐
│  API — FastAPI + Pydantic                               │
│  /auth · /scan · /sync · /predict · /metrics            │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│  POSTGRES (OLTP)                                        │
│  events · tickets · orders · attendees                  │
│  scan_events  ← table append-only, jamais d'UPDATE      │
└──────────────────────────┬──────────────────────────────┘
                           │ dbt (batch)
┌──────────────────────────▼──────────────────────────────┐
│  ANALYTICS — schéma dédié + modèles dbt + tests dbt     │
│  → tables de features versionnées                       │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│  ML — MLflow (tracking + registry) · Prefect (retrain)  │
│  fraude (ONNX → embarqué + serveur) · flux · no-show    │
│  Evidently → dérive des données et des prédictions      │
└──────────────────────────┬──────────────────────────────┘
                           │
              Dashboard organisateur (Streamlit)
```

**Un conseil que je te donne franchement :** ne mets pas Kafka. Le volume d'un contrôle
d'accès (quelques milliers d'événements par soirée) ne le justifie pas, et un intervieweur
technique le verra. `scan_events` en table append-only dans Postgres + dbt en batch couvre
100 % du besoin. Si tu veux absolument la ligne « streaming » sur ton CV, prends
**Redpanda** (compatible Kafka, mono-binaire) et **assume-le comme un choix pédagogique**
dans le README. Un candidat qui sait dire « ici c'était surdimensionné, je l'ai fait pour
apprendre » marque plus de points qu'un candidat qui empile des outils.

---

## 6. Modernisation du socle mobile

Prérequis technique aux fonctionnalités IA — sans ça, rien ne tourne sur un téléphone récent.

**Montée de version : par paliers, jamais d'un coup.**

```bash
# À répéter pour 52 → 53 → 54 → 55 → 56 → 57
npx expo install expo@^52.0.0 && npx expo install --fix && npx expo-doctor
```

| Chantier | De | Vers |
|---|---|---|
| SDK Expo | 51 | 57 |
| React Native | 0.74.1 | 0.87.0 |
| Scan QR | `Camera` + `expo-barcode-scanner` | `CameraView` + `useCameraPermissions()` + `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}` |
| Langage | JavaScript | **TypeScript strict** |
| Navigation | `createStackNavigator` manuel | **expo-router** (fichiers) |
| Données serveur | `fetch` brut | **TanStack Query** (cache, retry, invalidation) |
| État client | `useState` épars | **Zustand** |
| Secrets | token en dur 🔴 | **expo-secure-store** |
| Persistance | aucune | **expo-sqlite** + file de sync |
| Styles | 5 fichiers dupliqués | tokens partagés (`theme.ts`) |
| Build / déploiement | aucun | **EAS Build + EAS Update** (OTA) |
| Observabilité | aucune | **Sentry** |
| Tests | aucun | **Jest + @testing-library/react-native** ; **Maestro** pour l'E2E du parcours de scan |
| CI | aucune | GitHub Actions : lint → typecheck → test → build EAS preview |
| Secrets scan | aucun | **gitleaks** en pre-commit + CI |

Nettoyage immédiat, sans risque :

```bash
git rm --cached Scan-Application scanApp   # supprime les deux gitlinks vides
```

Puis retirer de `package.json` : `"undefined"`, `expo-barcode-scanner`,
`react-native-vector-icons`, `@react-native-community/masked-view` ; et corriger la clé
`expo.expo` imbriquée dans `app.json`.

---

## 7. Roadmap en 4 phases

### Phase 0 — Assainissement (2–3 jours)
1. **Révoquer le token tidar.ma** ← à faire aujourd'hui
2. Nouveau dépôt `scanapp-v2`, historique propre, `gitleaks` en place
3. Supprimer les gitlinks, corriger `app.json`, purger les dépendances mortes
4. README honnête : ce que fait l'app, ce qu'elle ne fait pas encore

*Livrable : un dépôt qu'un recruteur peut ouvrir sans tomber sur un secret.*

### Phase 1 — Socle mobile (1–2 semaines)
5. Migration SDK 51 → 57 par paliers, TypeScript strict
6. `CameraView` + permissions + anti-rebond de scan (cooldown 2 s)
7. Auth réelle : JWT en SecureStore, contexte d'auth, écran de login comme route initiale
8. **Mode hors-ligne** : SQLite + file de scans + réconciliation
9. Tests sur le parcours de scan + CI GitHub Actions

*Livrable : une app qui marche vraiment, y compris sans réseau. C'est déjà, à soi seul, un
meilleur projet que la v1.*

### Phase 2 — Plateforme data (2–3 semaines)
10. API FastAPI + Postgres, `scan_events` en append-only
11. **Simulateur d'événement** (`sim/`) — le déblocage de tout le reste
12. dbt : modèles + tests + documentation du schéma
13. Dashboard organisateur (Streamlit) : temps réel + historique

*Livrable : le bloc « data engineering » de ton profil. C'est celui que les recruteurs
trouvent le plus rarement dans un portfolio — beaucoup de notebooks, très peu de pipelines.*

### Phase 3 — Modèles (3–4 semaines)
14. Fraude : règles mesurées → non supervisé → supervisé, avec matrice de coût et double seuil
15. Export ONNX + quantification + **inférence embarquée < 50 ms**
16. Prévision du flux d'arrivée (quantile P50/P90) → écran « Portes »
17. No-show avec split temporel et calibration
18. MLflow + Prefect (réentraînement) + Evidently (dérive)

*Livrable : le bloc « AI engineering » — du modèle jusqu'au téléphone, avec les contraintes
de production assumées.*

### Phase 4 — Bonus (1 semaine)
19. Assistant NL text-to-SQL avec garde-fous
20. Segmentation des participants pour l'organisateur

---

## 8. Comment le présenter sur ton profil

Le piège serait de présenter ça comme « une app de scan à laquelle j'ai ajouté de l'IA ».
Le bon cadrage est l'inverse :

> **Plateforme de contrôle d'accès événementiel, du terrain au modèle** — application
> mobile hors-ligne d'abord, pipeline de données temps réel, détection de fraude embarquée
> et prévision de flux pour le dimensionnement des équipes.

Ce qui fait la différence dans les trois blocs :

| Bloc | Ce qui se remarque |
|---|---|
| **Data engineering** | Un vrai pipeline (ingestion → dbt → features versionnées), pas des CSV dans un notebook |
| **ML** | Baseline par règles mesurée avant tout modèle ; matrice de coût asymétrique ; split temporel ; probabilités calibrées |
| **AI engineering** | Modèle quantifié, exécuté sur l'appareil, sous budget de latence, avec la question de la parité des features traitée |

Les trois points qui feront le plus parler en entretien, dans l'ordre :

1. **La boucle de feedback.** Chaque décision de l'agent à la porte annote le dataset. Tu as
   conçu la collecte de labels avant d'avoir un modèle — c'est le réflexe qui distingue un
   ingénieur ML d'un data scientist.
2. **Le compromis online / offline.** Le modèle tourne sur le téléphone parce que le réseau
   n'existe pas dans une salle de concert, et ce choix impose des features dégradées, que tu
   as documentées.
3. **Ce que tu n'as pas fait.** La reconnaissance faciale écartée pour raisons RGPD, Kafka
   écarté comme surdimensionné. Savoir défendre un « non » vaut souvent plus qu'une
   fonctionnalité de plus.

Et une chose à ne surtout pas oublier : écris noir sur blanc que les modèles sont entraînés
sur des données simulées, et ce que ça implique. Un candidat qui qualifie lui-même la portée
de ses résultats inspire plus confiance que celui qui affiche un score parfait sans contexte.
