# Mettre James à jour sur GitHub, puis Render

Cette archive contient **le projet complet de James** : serveur Node.js, interface, Kanban, courses, rappels, routes privées pour Jarvis et les modules existants. Il n’est pas nécessaire de reconstruire une application React : le serveur sert directement `frontend/public`.

Elle ne contient pas les bases personnelles, `.env`, les clés de connexion, `node_modules` ni l’historique `.git`. Les copies personnelles fournies auparavant sont conservées. Ne remplace pas ton dossier local `backend/data` par un dossier vide : garde tes données existantes à part.

## 1. Mettre le code dans ton dépôt existant

Décompresse `James_GitHub_Render_Aurore.zip`. À l’intérieur du dossier, tu dois voir directement `server.js`, `package.json`, `render.yaml`, `backend` et `frontend`.

Dans ton dépôt GitHub **existant**, ouvre la branche que ton service Render utilise, puis **Add file → Upload files**. Glisse le **contenu** du dossier décompressé, pas le ZIP et pas le dossier parent. Les fichiers `server.js` et `package.json` doivent rester à la racine du dépôt. Valide avec **Commit changes**.

Ne copie pas ton `.env`, les bases `.db`, `backend/data/exercices_nosql.json` personnel ni `james_jarvis.json`. Le fichier `.gitignore` fourni évite de suivre ces fichiers lors des prochains ajouts Git. Si tu utilises le site GitHub, pense à inclure les fichiers `.gitignore` et `.node-version` du ZIP : certains explorateurs cachent les noms commençant par un point. La version Node est aussi configurée dans `render.yaml`.

Si tu utilises Git sur ton ordinateur, copie ces sources dans ton dépôt local en conservant ses dossiers `.git`, `.env` et `backend/data`, puis vérifie `git status` avant de valider et pousser vers la branche liée à Render.

Si `backend/data` était **déjà suivi par Git**, `.gitignore` ne le retire pas rétroactivement. Pour cesser de publier les données tout en les gardant sur le PC, utilise depuis le dépôt local :

```bash
git rm -r --cached --ignore-unmatch backend/data
git add backend/data/.gitkeep
```

Cela retire les fichiers de la prochaine version du dépôt, **pas du disque du PC**. Garde les sauvegardes des données avant le déploiement. Cette opération ne nettoie pas d’éventuels secrets déjà présents dans l’historique Git.

## 2. Vérifier le service Render actuel

Garde le service Render déjà lié à ton dépôt. Il n’est pas nécessaire d’en créer un nouveau ou d’importer un nouveau Blueprint.

Dans **Settings** :

| Réglage | Valeur |
|---|---|
| Runtime | Node |
| Branch | La branche GitHub dans laquelle tu viens de mettre le code |
| Root Directory | Vide si `package.json` est à la racine |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Health Check Path | `/api/status` |

Dans **Environment**, conserve tes valeurs privées actuelles et assure-toi d’avoir :

- `NODE_VERSION=24` et `NODE_ENV=production` ;
- `JWT_SECRET` : conserve la valeur existante. Si elle n’existe pas, génère une longue valeur aléatoire privée. Le serveur refuse de démarrer en production sans cette clé ;
- `GEMINI_API_KEY` et `GEMINI_MODEL` : conserve ta configuration actuelle si tu utilises la génération IA. Le Kanban et les courses fonctionnent sans Gemini ;
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_EMAIL` pour les notifications push. Conserve la paire existante pour que les abonnements du téléphone continuent de correspondre au serveur.

Si tu dois générer les clés pour la première fois, sur ton PC, dans le projet : `npm install`, puis `npm run setup:kanban`. Le script crée les valeurs manquantes dans un `.env` privé sans écraser les autres réglages. Recopie les valeurs utiles dans Render, sans publier ce `.env` sur GitHub.

Le fichier `render.yaml` contient aussi ces réglages pour une création par Blueprint. Modifier ce fichier ne remplace pas toujours les réglages d’un service existant créé manuellement : vérifie-les dans le tableau de bord.

## 3. Déployer et ouvrir le Kanban

Si le déploiement automatique est actif, le commit sur la branche liée déclenche le déploiement. Sinon, clique **Manual Deploy → Deploy latest commit** dans le service Render.

Quand le déploiement affiche **Live**, ouvre l’adresse actuelle de James. Le nouveau lien **Kanban & courses** apparaît dans la navigation de l’accueil. Tu peux aussi ouvrir la même adresse avec `/kanban.html` à la fin. Si une ancienne page reste affichée, recharge-la : la version du cache du service worker a été actualisée.

Connecte-toi avec un compte présent dans la base du serveur. Une installation neuve sans base personnelle nécessite la création d’un compte. Les comptes ne sont pas inclus dans ce ZIP pour éviter de publier leurs données sur GitHub.

Teste ensuite : ajouter une carte, la passer en cours puis terminée, ajouter un article de courses et le cocher. Dans le navigateur, les coches hors connexion restent sur cet appareil jusqu’à leur envoi à James.

## 4. Reconnecter Jarvis

Depuis ton James mis à jour sur Render, ouvre le Kanban et clique **Connecter Jarvis**. Place le fichier privé téléchargé `james_jarvis.json` dans `jarvis_aurore/Jarvis_Kanban_Courses` sur le PC de Jarvis. Garde une copie de l’ancien fichier si tu remplaces une connexion existante.

Le ZIP séparé `Jarvis_Kanban_Courses_Aurore.zip` fourni auparavant contient le lanceur vocal et son installation. Il n’est pas nécessaire de publier ce fichier de connexion ni ton Jarvis Python dans le dépôt du site James.

## Stockage temporaire sur Render gratuit

Cette version permet de déployer le site sur Render maintenant, mais **n’ajoute pas de stockage durable à Render gratuit**. Les comptes, les tâches et les articles sont enregistrés en SQLite sur son disque temporaire et peuvent disparaître au redémarrage ou au déploiement. Les sauvegardes créées sur ce même disque ne remplacent pas un stockage externe. N’y conserve pas ta seule copie de données importantes.

Le bouton **Sauvegarder mes listes** exporte les tâches, les courses et leur historique. L’export ne contient pas les mots de passe des comptes et n’est pas un outil de restauration automatique. Ton futur PC serveur, avec le kit déjà fourni, conservera la base sur son disque ; il faudra alors utiliser son adresse pour travailler sur cette base permanente.

## Vérifications

Commande : `npm run test:kanban`.

Elle contrôle les comptes séparés, les validations, les ajouts sans doublons, les changements d’état, les conflits, les archives, l’historique, les courses, le cache des coches, les clés Jarvis et les rappels. Le dépôt fournit aussi le scénario `tests/browser-check.js` ; son exécution nécessite Playwright et Chromium installés séparément. Il n’a pas été exécuté dans l’environnement de préparation.

Documentation officielle : https://render.com/docs/deploy-node-express-app, https://render.com/docs/node-version, https://render.com/docs/free.
