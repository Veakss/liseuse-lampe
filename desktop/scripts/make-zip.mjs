// Builds the portable Windows archive from dist/win-unpacked: dist/Liseuse-a-la-lampe-<version>-win-x64.zip, whose single
// top-level folder is Liseuse-a-la-lampe-<version>-win-x64/ (electron-builder's own zip target spills 20 files into the
// folder where it is extracted). A short LISEZMOI.txt (French) sits next to the .exe.
// Uses `zip` (macOS, Linux) or the `tar` that ships with Windows 10/11 (bsdtar, `tar -a` writes a zip).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const unpacked = join(root, 'dist', 'win-unpacked');
if (!existsSync(join(unpacked, 'Liseuse-a-la-lampe.exe'))) { console.error('dist/win-unpacked est vide : lance d’abord electron-builder --win'); process.exit(1); }

const name = `Liseuse-a-la-lampe-${version}-win-x64`;
const stage = join(root, 'dist', '.zip-stage');
const out = join(root, 'dist', name + '.zip');
rmSync(stage, { recursive: true, force: true }); rmSync(out, { force: true });
mkdirSync(stage, { recursive: true });
cpSync(unpacked, join(stage, name), { recursive: true });
writeFileSync(join(stage, name, 'LISEZMOI.txt'), [
  'Liseuse à la lampe — version portable (Windows 10 ou 11, 64 bits)',
  '',
  '1. Décompresse ce dossier où tu veux (clé USB, Documents…).',
  '2. Double-clique sur Liseuse-a-la-lampe.exe.',
  '',
  'Windows peut afficher « Windows a protégé votre ordinateur » : l’application n’est pas signée',
  '(la signature coûte un abonnement). Clique sur « Informations complémentaires », puis « Exécuter quand même ».',
  '',
  'Tes livres, tes notes et tes réglages sont gardés dans %APPDATA%\\Liseuse-a-la-lampe, pas dans ce dossier :',
  'ils restent quand tu remplaces ce dossier par une version plus récente.',
  '',
].join('\r\n'));

const hasZip = spawnSync('zip', ['-v'], { stdio: 'ignore' }).status === 0;
const r = hasZip
  ? spawnSync('zip', ['-r', '-X', '-9', '-q', out, name], { cwd: stage, stdio: 'inherit' })
  : spawnSync('tar', ['-a', '-c', '-f', out, name], { cwd: stage, stdio: 'inherit' });
rmSync(stage, { recursive: true, force: true });
if (r.status !== 0 || !existsSync(out)) { console.error('la création du zip a échoué'); process.exit(1); }
console.log(`zip portable : dist/${name}.zip (${(statSync(out).size / 1e6).toFixed(1)} Mo)`);
