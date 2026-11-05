// Reads the Windows build without running it (no Wine needed): the PE header, the icon group and the version information
// of the app executable (dist/win-unpacked) and of the installer, using `resedit`.
// Usage: node scripts/inspect-win.mjs [file.exe ...]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ResEdit from 'resedit';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const targets = process.argv.slice(2).length ? process.argv.slice(2) : [join(dist, 'win-unpacked', 'Liseuse-a-la-lampe.exe'), ...(existsSync(dist) ? readdirSync(dist).filter((f) => /-win-x64\.exe$/.test(f)).map((f) => join(dist, f)) : [])];

for (const file of targets) {
  console.log('\n== ' + file);
  const buf = readFileSync(file);
  const exe = ResEdit.NtExecutable.from(buf, { ignoreCert: true });
  const machine = buf.readUInt16LE(buf.readUInt32LE(0x3c) + 4);
  console.log('machine: 0x' + machine.toString(16) + (machine === 0x8664 ? ' (x64)' : machine === 0x14c ? ' (x86)' : ''));
  console.log('signed (certificate table): ' + (readCert(buf) ? 'yes' : 'no'));
  const res = ResEdit.NtExecutableResource.from(exe);
  const groups = res.entries.filter((e) => e.type === 14);
  for (const g of groups) {
    const dir = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries).find((x) => x.id === g.id);
    const sizes = dir ? dir.icons.map((i) => (i.width || 256) + 'x' + (i.height || 256)) : [];
    console.log(`icon group ${g.id}: ${sizes.join(' ')}`);
  }
  if (!groups.length) console.log('icon group: none');
  const vis = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  for (const vi of vis) {
    const fv = vi.fixedInfo;
    console.log(`file version ${fv.fileVersionMS >>> 16}.${fv.fileVersionMS & 0xffff}.${fv.fileVersionLS >>> 16}.${fv.fileVersionLS & 0xffff}, product version ${fv.productVersionMS >>> 16}.${fv.productVersionMS & 0xffff}.${fv.productVersionLS >>> 16}.${fv.productVersionLS & 0xffff}`);
    for (const lang of vi.getAllLanguagesForStringValues()) console.log(`strings [lang ${lang.lang} codepage ${lang.codepage}]`, JSON.stringify(vi.getStringValues(lang)));
  }
  if (!vis.length) console.log('version info: none');
}

// the certificate table entry of the PE optional header (data directory 4)
function readCert(buf) {
  const pe = buf.readUInt32LE(0x3c); const magic = buf.readUInt16LE(pe + 24);
  const dd = pe + 24 + (magic === 0x20b ? 112 : 96) + 4 * 8;
  return buf.readUInt32LE(dd + 4) > 0;
}
