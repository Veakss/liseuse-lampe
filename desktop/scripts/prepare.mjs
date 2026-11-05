// Copies the reading page into app/index.html (what the app serves as app://liseuse/index.html) and records which page
// it is. Source: LISEUSE_HTML, else ../app/dist/liseuse.html (the repository) or ../liseuse-lampe-src/dist/liseuse.html, the
// public build (PUBLIC=1 OUT=dist/liseuse.html python3 build.py). Run by every build script; harmless to run again.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// (in the repository the page's sources sit in ../app; in the working folders, in ../liseuse-lampe-src)
const src = resolve(process.env.LISEUSE_HTML || [resolve(root, '..', 'app', 'dist', 'liseuse.html'), resolve(root, '..', 'liseuse-lampe-src', 'dist', 'liseuse.html')].find((f) => existsSync(f)) || resolve(root, '..', 'app', 'dist', 'liseuse.html'));
if (!existsSync(src)) { console.error(`Page introuvable : ${src}\nIndique-la avec LISEUSE_HTML=/chemin/vers/liseuse.html`); process.exit(1); }
const html = readFileSync(src);
if (html.length < 100000 || !html.includes('id="file"') || !html.includes('<title>Liseuse')) { console.error(`${src} ne ressemble pas à la page de la liseuse.`); process.exit(1); }

// (the public build only: the claude.ai build carries a key-word table prepared for one private book)
if (!html.includes('const EMPHASIS = [];')) { console.error(`${src} n'est pas la version publique : PUBLIC=1 OUT=dist/liseuse.html python3 build.py dans liseuse-lampe-src.`); process.exit(1); }
mkdirSync(resolve(root, 'app'), { recursive: true });
copyFileSync(src, resolve(root, 'app', 'index.html'));
const info = { source: src, bytes: html.length, sha256: createHash('sha256').update(html).digest('hex'), sourceModified: statSync(src).mtime.toISOString(), copied: new Date().toISOString() };
writeFileSync(resolve(root, 'app', 'page.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`page copiée : ${src}\n  ${(html.length / 1e6).toFixed(2)} Mo, sha256 ${info.sha256.slice(0, 16)}…`);
