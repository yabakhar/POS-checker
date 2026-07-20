# POS Local Sync Agent

## Pour le client (installation en un clic)

1. Copier `pos-agent.exe` + `INSTALLER.bat` (voir "Générer l'exécutable"
   ci-dessous) dans un dossier sur le PC caisse
2. Double-cliquer sur **`INSTALLER.bat`**
3. Suivre les instructions à l'écran (configuration, puis menu)
4. Choisir "1" dans le menu pour faire un premier test sans rien envoyer

C'est tout — **pas besoin d'installer Node.js ni de taper de commandes** :
`pos-agent.exe` est un exécutable autonome (Node.js est embarqué dedans).

---

Agent local qui lit la base MySQL/MariaDB du logiciel de caisse (POS) et
pousse les métriques vers l'API cloud, conformément au cahier des charges
CDC-POS-DASHBOARD-2026.

## Prérequis (côté PC caisse)

- Accès en lecture seule à la base MySQL/MariaDB du POS
- Un utilisateur MySQL dédié à l'agent (voir section "Sécurité DB" ci-dessous)
- Un Shop Token généré depuis le dashboard (page "Configuration")
- **Node.js n'est pas nécessaire** sur le PC caisse : uniquement pour toi,
  côté développement, pour générer l'exécutable (voir ci-dessous)

## Générer l'exécutable (côté développeur)

```bash
npm install
npm run build
```

Ça génère `pos-agent.exe` (~65 Mo, Node.js embarqué) directement à la
racine du projet, à côté d'`INSTALLER.bat` — **important** : `pos-agent.exe`
et `INSTALLER.bat` doivent toujours être dans le même dossier (le `.bat`
cherche l'exe à côté de lui, pas ailleurs).

Pour livrer un client, copie ces 2 fichiers dans un dossier à part :
- `pos-agent.exe`
- `INSTALLER.bat`

Rien d'autre n'est nécessaire (pas de `node_modules`, pas de `src`).

## Un seul exécutable, deux configurations (`.env`)

`pos-agent.exe` est **toujours le même fichier** — un seul `npm run build`.
Ce qui change entre "tester chez toi" et "livrer au client", c'est
uniquement le `.env` à côté de l'exe :

| | Config de test (toi) | Config client (production) |
|---|---|---|
| `DRY_RUN` | `true` | `false` |
| `SHOP_TOKEN` | optionnel (fallback `test-token`) | **obligatoire** — l'agent refuse de démarrer si vide |
| `CLOUD_API_URL` | peu importe (rien n'est envoyé) | doit pointer vers la vraie API |
| Envoi réel au cloud | non, tout va dans `data/test-output.json` | oui |

`src/config.js` applique déjà cette règle : `SHOP_TOKEN` n'est exigé que
lorsque `DRY_RUN=false`. Donc pour livrer un client : mets `DRY_RUN=false`
et un vrai `SHOP_TOKEN` dans son `.env` avant de le lui envoyer — si tu
oublies, l'agent s'arrête tout de suite avec un message clair au lieu de
tourner sans jamais rien envoyer.

## Tester sans backend cloud (mode DRY_RUN)

En développement (avec Node.js installé), sans passer par l'exécutable :

```bash
npm install
npm run setup           # renseigne DB_USER / DB_PASSWORD / DB_NAME + tables à surveiller
```

Ouvre `.env` et mets :

```
DRY_RUN=true
```

Puis lance un test unique (une seule collecte, pas de boucle infinie) :

```bash
npm run test-run
```

Ça va :
1. Se connecter à ta vraie base MySQL/MariaDB
2. Détecter les lignes nouvelles/modifiées dans les tables surveillées (`WATCHED_TABLES`)
3. Afficher le résultat dans la console
4. Sauvegarder tout dans `data/test-output.json`

Ouvre `data/test-output.json` pour voir exactement quelles données seraient
envoyées au cloud, et vers quel endpoint (`wouldSendTo`), sans rien envoyer
réellement.

Une fois que tu as un backend cloud prêt : remets `DRY_RUN=false`, ajoute
`CLOUD_API_URL`, régénère l'exécutable (`npm run build`) et livre-le au client.

## Surveillance de tables génériques (WATCHED_TABLES)

L'agent surveille n'importe quelle table du POS et ne pousse que les
lignes nouvelles ou modifiées depuis le dernier cycle (comparaison par hash,
par ligne, voir `src/tableWatcher.js`) — c'est le seul mécanisme de collecte
(pas de requêtes SQL figées à maintenir par installation).

- Configuré de façon interactive lors de `npm run setup` (liste les tables
  disponibles, tu choisis des numéros ou `*` pour toutes)
- Réglable à tout moment dans `.env` : `WATCHED_TABLES=table1,table2` ou `*`
- Fréquence : `SYNC_TABLES_SECONDS` (3600s = 1h par défaut)
- État local de comparaison : `data/table-state/<table>.json`

## Démarrage automatique (tâche planifiée Windows)

Depuis l'exécutable livré au client (menu `INSTALLER.bat`, option 2), ou :

```bash
npm run install-service    # crée une tâche planifiée Windows (F-09)
```

Ça crée une tâche planifiée nommée "POS Local Sync Agent" qui démarre au
boot de Windows (délai 30s), tourne en tâche de fond (fenêtre cachée), et
redémarre automatiquement en cas de plantage. Nécessite d'être lancé en
tant qu'administrateur (le `.bat` le vérifie et prévient sinon).

Pour désinstaller :

```bash
npm run uninstall-service
```

## Sécurité DB (section 5.1 du CDC)

Avant de lancer l'agent, créer un utilisateur MySQL dédié, lecture seule :

```sql
CREATE USER 'pos_agent'@'localhost' IDENTIFIED BY 'mot_de_passe_fort';
GRANT SELECT ON nom_de_la_base.* TO 'pos_agent'@'localhost';
FLUSH PRIVILEGES;
```

Aucun droit INSERT/UPDATE/DELETE ne doit être accordé à cet utilisateur.

## Structure du projet

```
src/
  cli.js                Point d'entrée unique pour l'exécutable pkg (dispatch par commande)
  config.js             Chargement et validation des variables d'environnement
  logger.js              Logs rotatifs (F-07)
  db.js                  Pool de connexion MySQL
  tableWatcher.js        Watch générique de tables (WATCHED_TABLES), diff par ligne
  queue.js                File d'attente hors ligne (F-06)
  httpClient.js          Envoi HTTPS vers l'API cloud (F-05)
  scheduler.js           Cadencement des synchronisations
  index.js               Point d'entrée agent (boucle continue)
  setup.js               Configuration interactive (.env), liste + choix des tables
  install-service.js     Installation de la tâche planifiée Windows (F-09)
  uninstall-service.js   Désinstallation de la tâche planifiée
  inspect-schema.js       Inventaire du schéma DB réel (Jalon J-01)
```

## Étapes suivantes (Jalon J-01)

1. Obtenir l'accès HeidiSQL chez le client
2. Lancer `npm run inspect-schema` pour voir les vraies tables/colonnes
3. Choisir les tables pertinentes dans `WATCHED_TABLES` (via `npm run setup`)
4. Tester `npm start` en pointant sur la vraie base
5. Une fois validé, `npm run install-service`

## Notes

- L'agent ne modifie jamais les données du POS (SELECT uniquement).
- En cas de coupure Internet, les métriques sont mises en file d'attente
  locale (`data/queue.json`) et renvoyées automatiquement à la reconnexion.
- Les identifiants sensibles vivent uniquement dans `.env` (jamais commité).


<!-- taskschd.msc -->