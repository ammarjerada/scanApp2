# Tidar Scan

Application mobile de **contrôle d'accès événementiel**. Un agent, à l'entrée d'une salle,
scanne le QR code d'un billet et obtient un verdict immédiat — même sans réseau.

Expo SDK 57 · React Native 0.86 · TypeScript strict · fonctionne hors ligne.

```bash
npm install
npm start
```

Aucun backend n'est nécessaire : sans `EXPO_PUBLIC_API_URL`, l'app démarre sur un jeu de
données local de 680 billets répartis sur deux soirées, avec un historique d'arrivées
réaliste. N'importe quelle adresse e-mail ouvre une session.

---

## Le problème que ça résout

Une salle de concert, 21 h. Huit cents personnes dans la file. L'agent tient son téléphone
d'une main et le billet du client de l'autre. Il a environ deux secondes par personne, dans
le noir, dans le bruit — et la 4G est saturée par le public.

Tout le produit découle de ces contraintes :

| Contrainte | Conséquence de conception |
|---|---|
| Deux secondes par personne | Le verdict est **local et synchrone**. Aucun appel réseau sur le chemin du scan. |
| Le réseau n'existe pas | La liste est téléchargée avant l'ouverture ; les scans s'empilent localement et repartent plus tard. |
| Il fait noir, c'est bruyant | Verdict en plein écran + signature vibratoire distincte par issue. Lampe torche intégrée. |
| Le QR ne passe pas toujours | Recherche par nom, e-mail ou code, et entrée manuelle tracée. |
| L'agent se trompe parfois | Annulation possible pendant une minute, sans effacer la trace. |

---

## Ce que fait l'application

**Scanner** — caméra plein écran, mire discrète, lampe torche. Le verdict inonde l'écran :
un aplat, un pictogramme, un mot, lisible à bout de bras. « Entrée » s'efface seul après une
seconde pour ne pas freiner la file ; un refus reste jusqu'à ce qu'on le congédie, parce
qu'il demande une décision.

Un doublon ne dit pas seulement « déjà scanné » : il dit **quand, à quelle porte et par
quel agent**. C'est ce qui permet de distinguer une fraude d'une erreur de manipulation.

**Soirée** — entrées sur jauge, ventilation par catégorie, refus, file de synchronisation,
et la courbe d'arrivée de l'heure écoulée par tranches de cinq minutes.

**Invités** — liste complète recherchable par nom, e-mail ou code. Filtres attendus / entrés.
Fiche individuelle avec l'historique de passage et l'entrée manuelle quand le QR est illisible.

**Réglages** — choix de la porte (estampillée sur chaque scan), statistiques de vacation,
état de la file, fermeture de session.

---

## Architecture

```
app/                    Écrans (expo-router, routage par fichiers)
  (tabs)/               Soirée · Scanner · Invités
  guest/[code].tsx      Fiche invité + entrée manuelle
  events.tsx            Choix de la soirée (télécharge la liste)
  settings.tsx          Poste, porte, vacation

src/
  domain/               Règles métier — pur TypeScript, zéro dépendance
    checkIn.ts            le moteur : un code entre, un verdict sort
    stats.ts              agrégats de la soirée
  data/                 Persistance et réseau
    ledger.ts             registre local (2 adaptateurs : mémoire, AsyncStorage)
    api.ts                accès serveur (2 adaptateurs : HTTP, démonstration)
    seed.ts               générateur du jeu de données de démonstration
  ledger/               État de la soirée (scans, file de synchro)
  session/              Authentification, jeton en stockage sécurisé, porte
  ui/                   Composants et retour haptique
  theme/                Tokens de couleur, d'espace et de typographie
```

**Le cœur est `src/domain/checkIn.ts`.** Une fonction, une entrée, une sortie — qui cache
la normalisation du QR, l'appariement à l'événement, les billets annulés, la détection de
doublon avec son contexte, et le repli quand la liste n'est pas synchronisée. Elle est
**pure** : l'heure arrive par paramètre, les données par une interface de trois fonctions.
D'où les 29 tests unitaires qui tournent dans Node en quelques secondes, sans caméra, sans
serveur et sans émulateur.

Les deux couches d'adaptateurs ne sont pas décoratives : les tests utilisent le registre en
mémoire, l'app utilise AsyncStorage ; la démonstration utilise le client local, la
production le client HTTP. Aucune règle métier ne sait laquelle est branchée.

```bash
npm test        # 29 tests, Node pur
npm run typecheck
npm run doctor  # 21/21
```

---

## Ce qui a changé depuis la v1 (2024)

Le dépôt contenait une application Expo SDK 51 en JavaScript, aboutie visuellement mais dont
une seule fonction métier était branchée. Les corrections structurantes :

**Sécurité** — un jeton d'API en clair était commité dans `ScanPage.js`. Il est retiré ;
l'authentification passe par une session et le jeton vit dans le Keychain / Keystore.
⚠️ Le jeton de la v1 reste dans l'historique Git et doit être **révoqué côté serveur**.

**Bugs bloquants** — la permission caméra n'était jamais demandée (écran noir sur appareil
réel) ; `app.json` avait une clé `expo` imbriquée dans `expo`, rendant toute la
configuration des plugins inerte ; `package.json` portait une dépendance fantôme
`"undefined"` qui cassait `npm install` ; le même QR se relisait en boucle faute de garde.

**Fonctionnel** — les deux barres de recherche avaient des gestionnaires vides ; les boutons
« Valider » et « Rembourser » se contentaient d'un `console.log` ; les compteurs affichaient
`?/?` ; événements, billets et participants étaient codés en dur ; il n'existait aucun
moyen de faire entrer quelqu'un dont le QR est illisible.

**Technique** — SDK 51 → 57, JavaScript → TypeScript strict, navigation manuelle →
expo-router, cinq fichiers de styles dupliqués → tokens, aucun test → 29, deux dépôts
imbriqués commités par erreur → supprimés.

Le code de la v1 reste accessible : `git checkout e8e1404 -- <fichier>`.

---

## Brancher un vrai backend

```bash
cp .env.example .env
# EXPO_PUBLIC_API_URL=https://api.example.ma
```

Quatre routes suffisent, décrites par l'interface `ApiClient` dans `src/data/api.ts` :

| Route | Rôle |
|---|---|
| `POST /auth/login` | `{ token, operator }` |
| `GET /events` | les soirées à contrôler |
| `GET /events/:id/tickets` | la liste complète — c'est elle qui rend le hors-ligne possible |
| `POST /scans` | remontée de la file, renvoie les identifiants acceptés |

Aucun secret ne doit figurer dans `.env` : tout ce qui est préfixé `EXPO_PUBLIC_` est
embarqué dans le bundle, donc lisible.

---

## Suite

Chaque scan — y compris les refus — est consigné avec son horodatage, sa porte, son agent et
son issue. Cette trace est volontairement conservée : c'est la matière première d'une couche
d'analyse et de modèles (détection de fraude, prévision du flux d'arrivée, prédiction de
no-show). Le détail est dans [ROADMAP.md](ROADMAP.md).
