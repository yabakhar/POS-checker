// F-09: le service démarre automatiquement au démarrage de Windows, sans
// intervention utilisateur. Utilise le Planificateur de tâches Windows
// (schtasks) plutôt que node-windows : ça fonctionne aussi bien avec un
// .exe autonome (pkg) qu'avec `node src/cli.js run`, sans dépendre d'une
// installation Node.js séparée sur le PC caisse.
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

const TASK_NAME = 'POS Local Sync Agent';

function buildAction() {
  if (process.pkg) {
    return { exe: process.execPath, args: 'run', workDir: path.dirname(process.execPath) };
  }
  // Mode dev (non packagé avec pkg) : relance via node + cli.js
  return {
    exe: process.execPath,
    args: `"${path.join(__dirname, 'cli.js')}" run`,
    workDir: path.resolve(__dirname, '..'),
  };
}

function buildTaskXml() {
  const { exe, args, workDir } = buildAction();
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Agent local qui synchronise les donnees du POS vers le dashboard cloud.</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
      <Delay>PT30S</Delay>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${exe}</Command>
      <Arguments>${args}</Arguments>
      <WorkingDirectory>${workDir}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
}

async function main() {
  console.log(`Installation de la tache planifiee Windows "${TASK_NAME}"...`);

  const xml = buildTaskXml();
  const xmlPath = path.join(os.tmpdir(), 'pos-agent-task.xml');
  // schtasks exige un BOM UTF-16 LE en tête du fichier pour reconnaître
  // l'encodage déclaré (<?xml ... encoding="UTF-16"?>) ; fs.writeFileSync
  // avec 'utf16le' écrit les bytes mais n'ajoute PAS ce BOM tout seul.
  const bom = Buffer.from([0xff, 0xfe]);
  fs.writeFileSync(xmlPath, Buffer.concat([bom, Buffer.from(xml, 'utf16le')]));

  try {
    execSync(`schtasks /create /tn "${TASK_NAME}" /xml "${xmlPath}" /f`, { stdio: 'inherit' });
    console.log('Tache creee. Demarrage immediat...');
    execSync(`schtasks /run /tn "${TASK_NAME}"`, { stdio: 'inherit' });
    console.log(`\n"${TASK_NAME}" est installee et demarrera automatiquement a chaque demarrage de Windows.`);
  } catch (err) {
    console.error('\nErreur lors de la creation de la tache planifiee :', err.message);
    console.error('Astuce : relance cette action "en tant qu\'administrateur" (clic droit sur INSTALLER.bat).');
    process.exitCode = 1;
  } finally {
    if (fs.existsSync(xmlPath)) fs.unlinkSync(xmlPath);
  }
}

module.exports = { main };

if (require.main === module) {
  main();
}
