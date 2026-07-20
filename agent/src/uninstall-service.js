const { execSync } = require('child_process');

const TASK_NAME = 'POS Local Sync Agent';

async function main() {
  console.log(`Suppression de la tache planifiee "${TASK_NAME}"...`);

  try {
    execSync(`schtasks /end /tn "${TASK_NAME}"`, { stdio: 'ignore' });
  } catch {
    // pas grave si elle n'etait pas en cours d'execution
  }

  try {
    execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { stdio: 'inherit' });
    console.log('Tache supprimee.');
  } catch (err) {
    console.error('Erreur lors de la suppression :', err.message);
    console.error('Astuce : relance cette action "en tant qu\'administrateur".');
    process.exitCode = 1;
  }
}

module.exports = { main };

if (require.main === module) {
  main();
}
