const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

// Relit le .env existant s'il y en a un (ex: SHOP_TOKEN déjà pré-rempli
// par le développeur avant de livrer le package au client).
function loadExistingEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  try {
    return dotenv.parse(fs.readFileSync(envPath));
  } catch {
    return {};
  }
}

// Liste les tables de la base et laisse choisir lesquelles surveiller.
// Renvoie "*" (toutes), "table1,table2" (sélection), ou "" (aucune / erreur connexion).
async function chooseWatchedTables({ host, port, user, password, database, existingTables }) {
  let conn;
  try {
    conn = await mysql.createConnection({ host, port, user, password, database, connectTimeout: 5000 });
    const [rows] = await conn.execute(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [database]
    );
    const tableNames = rows.map((r) => r.TABLE_NAME);

    console.log(`\n${tableNames.length} tables trouvées dans "${database}" :\n`);
    tableNames.forEach((name, i) => console.log(`  ${i + 1}. ${name}`));

    console.log('\nQuelles tables l\'agent doit-il surveiller (envoyer les changements au cloud) ?');
    // Enter (vide) garde la sélection déjà pré-remplie par le développeur ;
    // le client n'a pas à connaître les numéros de tables lui-même.
    const suggestion = existingTables || '';
    const prompt = suggestion
      ? `Numéros séparés par des virgules, "*" pour toutes, ou Entrée pour garder [${suggestion}] : `
      : 'Numéros séparés par des virgules (ex: 1,3,7), "*" pour toutes, ou vide pour aucune : ';
    const answer = await ask(prompt);
    const trimmed = answer.trim();

    if (!trimmed) return suggestion;
    if (trimmed === '*') return '*';

    const selected = trimmed
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((i) => i >= 1 && i <= tableNames.length)
      .map((i) => tableNames[i - 1]);
    return selected.join(',');
  } catch (err) {
    console.log(`\n[ATTENTION] Impossible de lister les tables (${err.message}).`);
    console.log('Tu pourras configurer WATCHED_TABLES manuellement dans .env plus tard.');
    return existingTables || '';
  } finally {
    if (conn) await conn.end();
  }
}

async function main() {
  console.log('=== Configuration rapide de l\'Agent Local POS ===\n');

  // Résolu par rapport au dossier de travail (le dossier où se trouve
  // pos-agent.exe / INSTALLER.bat), jamais par rapport à __dirname : dans
  // l'exécutable pkg, __dirname pointe vers un chemin virtuel interne
  // (C:\snapshot\...) qui n'existe pas sur le disque et fait planter l'écriture.
  const envPath = path.resolve(process.cwd(), '.env');
  const existing = loadExistingEnv(envPath);

  // SHOP_TOKEN / CLOUD_API_URL : configurés par le développeur avant de
  // livrer le package (le client n'a pas ces informations et ne doit pas
  // avoir à les saisir). On les reprend tels quels s'ils existent déjà dans
  // .env, sinon ils restent vides pour l'instant (le développeur les
  // renseignera avant la mise en production — SHOP_TOKEN est alors obligatoire).
  const shopToken = existing.SHOP_TOKEN || '';
  const cloudApiUrl = existing.CLOUD_API_URL || 'https://api.votre-domaine.com';

  // Valeurs DB pré-remplies par le développeur (déjà dans .env) : le client
  // n'a qu'à appuyer sur Entrée pour les garder, il n'a pas à les connaître.
  const defaultDbUser = existing.DB_USER || 'pos_agent';
  const dbUser = await ask(`Utilisateur MySQL (lecture seule) [${defaultDbUser}] : `) || defaultDbUser;

  const hasExistingPassword = Boolean(existing.DB_PASSWORD);
  const passwordPrompt = hasExistingPassword
    ? 'Mot de passe MySQL [Entrée = garder le mot de passe actuel] : '
    : 'Mot de passe MySQL : ';
  const dbPasswordInput = await ask(passwordPrompt);
  const dbPassword = dbPasswordInput || existing.DB_PASSWORD || '';

  const defaultDbName = existing.DB_NAME || '';
  const dbNamePrompt = defaultDbName
    ? `Nom de la base de données POS [${defaultDbName}] : `
    : 'Nom de la base de données POS : ';
  const dbName = await ask(dbNamePrompt) || defaultDbName;

  const watchedTables = await chooseWatchedTables({
    host: '127.0.0.1',
    port: 3306,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    existingTables: existing.WATCHED_TABLES || '',
  });

  const envContent = `SHOP_TOKEN=${shopToken}

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=${dbUser}
DB_PASSWORD=${dbPassword}
DB_NAME=${dbName}

CLOUD_API_URL=${cloudApiUrl}

DRY_RUN=true
DRY_RUN_FILE=./data/test-output.json

WATCHED_TABLES=${watchedTables}

SYNC_TABLES_SECONDS=3600

RETRY_INTERVAL_SECONDS=60

LOG_LEVEL=info
LOG_DIR=./logs
`;

  fs.writeFileSync(envPath, envContent, 'utf8');

  console.log(`\nConfiguration enregistrée dans ${envPath}`);
  if (!shopToken) {
    console.log('\n[INFO] SHOP_TOKEN est vide pour l\'instant (ok en DRY_RUN).');
    console.log('Le développeur doit le renseigner dans .env avant la mise en production');
    console.log('(SHOP_TOKEN devient obligatoire dès que DRY_RUN=false).');
  }
  console.log('Mode test (DRY_RUN) activé par défaut : rien ne sera envoyé au');
  console.log('cloud tant que le développeur n\'aura pas confirmé que tout est prêt.');
  console.log('\nVous pouvez maintenant lancer : npm run test-run');
  rl.close();
}

module.exports = { main };

if (require.main === module) {
  main();
}
