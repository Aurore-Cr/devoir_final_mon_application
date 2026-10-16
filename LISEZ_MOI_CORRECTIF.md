# Correctif des dépendances James — 16 octobre 2026

Le rapport fourni dans le Drive indique **8 vulnérabilités : 1 critique, 4 élevées et 3 modérées**.

La copie corrigée passe les audits npm complets et de production : **0 vulnérabilité détectée au 16 octobre 2026**. Cela décrit le résultat de l’audit des dépendances à cette date ; ce n’est pas une garantie générale de sécurité de l’application.

## Installer le correctif

Décompresse `Correctif_Securite_James.zip`. Copie `package.json` et `package-lock.json` à la racine de ton dossier James en acceptant leur remplacement. Copie aussi `tests/securite.test.js` dans son dossier `tests` existant. Garde `.env`, `.git`, `backend/data` et tous tes autres fichiers.

Dans le terminal de VS Code, à la racine de James :

```bash
node --version
npm ci
npm audit
npm run test:securite
```

Utilise Node 24, comme sur Render. Le projet demande maintenant au minimum Node 22. `npm ci` remplace uniquement les dépendances installées dans `node_modules` à partir du lockfile fourni ; il ne supprime pas tes bases ni ta configuration.

Vérifications fonctionnelles supplémentaires, si tu as conservé les tests fournis avec le projet complet :

```bash
npm run test:kanban
npm run test:render
```

Valide et synchronise les changements sur GitHub dans la branche utilisée par ton service Render. Redéploie la dernière version sur Render si le déploiement ne se lance pas automatiquement. Le Build Command reste `npm ci --omit=dev` et le Start Command reste `npm start`. Garde les variables privées déjà configurées dans Render.

N’exécute pas `npm audit fix --force` pour appliquer ce correctif : les versions corrigées sont déjà enregistrées dans les deux fichiers fournis.

## Changements

| Élément | Avant | Après |
|---|---|---|
| Express | 4.22.2 | 4.22.3 |
| proxy-addr | 2.0.7 | 2.0.8 |
| qs | 6.15.3 | 6.16.1 |
| body-parser | 1.20.6 | 1.20.8 |
| nodemon et sa chaîne chokidar/braces/brace-expansion | Présents en développement | Retirés du projet |
| `npm run dev` | nodemon | `node --watch server.js` |

Express reste en version majeure 4. Le mode développement continue à redémarrer le serveur lorsqu’un module change. Le mode production reste `npm start`. Aucune modification du code des routes, de l’interface ou des bases n’est nécessaire pour ce correctif.

Les audits JSON joints permettent de retrouver le résultat du contrôle. Les tests de sécurité vérifient les cas corrigés concernant les sous-réseaux IP et les paramètres qs, avec de petites entrées de test.

Références officielles consultées :
- https://github.com/advisories/GHSA-jqcg-44mw-7w3h (proxy-addr corrigé en 2.0.8)
- https://github.com/advisories/GHSA-x5fp-wj9c-mxmx (qs corrigé à partir de 6.16.0)
- https://github.com/advisories/GHSA-4mjr-xmp4-gh2g (qs)
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm (braces sans version corrigée annoncée)
- https://nodejs.org/download/release/v24.0.2/docs/api/cli.html#--watch (surveillance native Node)
