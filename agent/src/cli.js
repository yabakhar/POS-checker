// Point d'entrée unique utilisé pour le build pkg (un seul .exe autonome,
// sans Node.js à installer chez le client). La commande voulue est le
// premier argument : `pos-agent.exe <commande>`.
// NOTE: chaque require() ci-dessous utilise un littéral (pas de variable) :
// pkg analyse le code statiquement pour savoir quels fichiers embarquer
// dans l'exécutable, un require() dynamique serait invisible pour lui.
const command = process.argv[2] || 'run';

function load(command) {
  switch (command) {
    case 'run':
      return require('./index');
    case 'setup':
      return require('./setup');
    case 'test-run':
      return require('./test-run');
    case 'install-service':
      return require('./install-service');
    case 'uninstall-service':
      return require('./uninstall-service');
    case 'inspect-schema':
      return require('./inspect-schema');
    default:
      return null;
  }
}

const mod = load(command);

if (!mod) {
  console.error(`Commande inconnue : "${command}"`);
  console.error('Commandes disponibles : run, setup, test-run, install-service, uninstall-service, inspect-schema');
  process.exit(1);
}

mod.main().catch((err) => {
  console.error('Erreur:', err.message);
  process.exit(1);
});
