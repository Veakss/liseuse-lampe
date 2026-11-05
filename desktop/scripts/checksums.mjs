// Writes dist/SHA256SUMS.txt for the files to attach to a release (the installer, the portable zip and the page alone), and puts the same
// lines in RELEASE.md (the fenced block that follows « Empreintes SHA-256 »), so the two never disagree.
import { createHash } from 'node:crypto';
import { copyFileSync, createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
// (the page alone, liseuse.html, for Mac and Linux: the same page the app embeds, attached to the release too)
if (existsSync(join(root, 'app', 'index.html'))) copyFileSync(join(root, 'app', 'index.html'), join(root, 'dist', 'liseuse.html'));
const files = [`Liseuse-a-la-lampe-${version}-win-x64.exe`, `Liseuse-a-la-lampe-${version}-win-x64.zip`, 'liseuse.html'].filter((f) => existsSync(join(root, 'dist', f)));
const sha = (f) => new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(join(root, 'dist', f)).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
const lines = [];
for (const f of files) { const s = await sha(f); lines.push(`${s}  ${f}`); console.log(`${s}  ${f}  (${(statSync(join(root, 'dist', f)).size / 1e6).toFixed(1)} Mo)`); }
writeFileSync(join(root, 'dist', 'SHA256SUMS.txt'), lines.join('\n') + '\n');
const rel = join(root, 'RELEASE.md');
if (existsSync(rel) && lines.length) {
  const md = readFileSync(rel, 'utf8'), re = /(Empreintes SHA-256[^\n]*\n\n```\n)[\s\S]*?(\n```)/;
  if (re.test(md)) { writeFileSync(rel, md.replace(re, (_, a, b) => a + lines.join('\n') + b)); console.log('RELEASE.md : empreintes mises à jour'); }
  else console.warn('RELEASE.md : bloc des empreintes introuvable, à mettre à jour à la main');
}
