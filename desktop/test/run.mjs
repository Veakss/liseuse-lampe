// End-to-end test of the desktop shell, driven through --remote-debugging-port (CDP), on the built app.
//
//   npm run build:mac && npm test                       (macOS arm64 build, the default)
//   LISEUSE_BIN=/path/to/the/executable npm test        (another build, or the unpacked Windows one on Windows)
//
// Needs the page to be reachable at app://liseuse (no network is required; the page's web fonts are a plain request that may
// fail offline and is reported apart). One app at a time; every process started here is stopped by its own PID.
// Sound: the app is started with --mute-audio and the page's volume is 0. Window moves and sizes use System Events (macOS).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, readLog, sleep } from './lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = process.env.LISEUSE_BIN || join(root, 'dist/mac-arm64/Liseuse-a-la-lampe.app/Contents/MacOS/Liseuse-a-la-lampe');
const APP_BUNDLE = BIN.includes('.app/') ? BIN.slice(0, BIN.indexOf('.app/') + 4) : null;
const MAC = process.platform === 'darwin';
if (!existsSync(BIN)) { console.error('Executable introuvable : ' + BIN + '\nLance d’abord : npm run build:mac'); process.exit(2); }

const work = mkdtempSync(join(tmpdir(), 'liseuse-test-'));
const ud = join(work, 'userData'), dl = join(work, 'downloads'), log = join(work, 'shell.log'), fx = join(work, 'fixtures');
for (const d of [ud, dl, fx]) mkdirSync(d, { recursive: true });
// fixtures: placeholder text written for these tests, never a real book
const para = (n, w) => Array.from({ length: 6 }, (_, k) => `Phrase de contrôle ${w} ${n}.${k + 1}, écrite pour vérifier l'ouverture d'un fichier dans la liseuse.`).join(' ');
const F1 = join(fx, 'essai-lampe.txt'), F2 = join(fx, 'essai-deux.md'), F3 = join(fx, 'essai-froid.txt');
writeFileSync(F1, ['Essai de la lampe', ...[1, 2, 3, 4].map((n) => para(n, 'Alpha'))].join('\n\n') + '\n');
writeFileSync(F2, ['# Essai deux', '', ...[1, 2, 3].map((n) => para(n, 'Bravo')), '', '## Suite', '', para(9, 'Bravo')].join('\n\n') + '\n');
writeFileSync(F3, ['Essai à froid', ...[1, 2, 3].map((n) => para(n, 'Charlie'))].join('\n\n') + '\n');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`); };
const note = (name, detail) => { results.push({ name, ok: null, detail }); console.log(`NOTE  ${name}  - ${detail}`); };
const stateFile = join(ud, 'window-state.json');
const readState = () => { try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return null; } };
const live = new Set();
const start = async (opts = {}) => { const a = await launch(BIN, { ud, log, dl, ...opts }); live.add(a); return a; };
const stop = async (a) => { const r = await a.quit(); live.delete(a); return r; };

const asVal = (pid, what) => execFileSync('osascript', ['-e', `tell application "System Events" to tell (first process whose unix id is ${pid}) to ${what}`], { encoding: 'utf8', timeout: 20000 }).trim();
const frame = (pid) => asVal(pid, 'get {position, size} of window 1').split(/,\s*/).map(Number);   // x, y, w, h
const SEL = (i, a, b) => `const el=document.querySelector('#column [data-i="${i}"]'); const tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); let n,p=0,r=document.createRange(),sa=0,sb=0; while((n=tw.nextNode())){ if(!sa&&p+n.length>=${a}){r.setStart(n,${a}-p);sa=1;} if(!sb&&p+n.length>=${b}){r.setEnd(n,${b}-p);sb=1;} p+=n.length; } const s=getSelection(); s.removeAllRanges(); s.addRange(r);`;
const libraryText = (a) => a.cdp.ev("return localStorage.getItem('liseuse.library') || ''");

try {
  /* ============ launch 1: a fresh profile ============ */
  console.log('--- launch 1: fresh profile ---');
  let a = await start();
  await sleep(2500);
  const shown = await a.waitEvent('window-shown');
  const info = await a.cdp.ev('return [location.href, document.title, isSecureContext, document.readyState, typeof window.liseuseDesktop, !!window.require, typeof process, typeof window.electron]');
  check('page served from app://liseuse/index.html (secure context)', info[0] === 'app://liseuse/index.html' && info[2] === true && info[3] === 'complete', info.join(' | '));
  check('contextIsolation / no node in the page', info[5] === false && info[6] === 'undefined' && info[7] === 'undefined', 'require=' + info[5] + ' process=' + info[6]);
  check('preload exposes only the desktop flag', info[4] === 'object');
  check('window title is « Liseuse à la lampe »', shown && shown.title === 'Liseuse à la lampe', shown && shown.title);
  check('minimum size 960x600', shown && shown.minimumSize[0] === 960 && shown.minimumSize[1] === 600, JSON.stringify(shown && shown.minimumSize));
  check('window shown only at ready-to-show (event logged)', !!shown);
  const sample = await a.cdp.ev("return !!document.querySelector('#column [data-i=\"1\"]') && !!document.getElementById('file') && document.getElementById('file').multiple");
  check('page is alive (sample book in the column, #file is multiple)', sample === true);
  const fh = await a.cdp.ev("return getComputedStyle(document.body).fontFamily + ' | spellcheck=' + document.body.spellcheck");
  note('page font stack', fh);

  if (MAC) {
    asVal(a.pid, 'set size of window 1 to {800, 500}'); await sleep(500);
    const f = frame(a.pid);
    check('window cannot go under the minimum size', f[2] >= 960 && f[3] >= 600, `asked 800x500, got ${f[2]}x${f[3]}`);
  }

  // storage written now, read back after a full quit
  await a.cdp.ev(`localStorage.setItem('desktop-test', 'valeur-ls-é'); await new Promise((res, rej) => { const r = indexedDB.open('desktop-test', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ ok: true, n: 42, s: 'valeur-idb' }, 'k'); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); }; r.onerror = () => rej(r.error); });`);

  // external links: window.open, target=_blank, other schemes
  await a.cdp.ev(`window.open('https://example.com/ouvert-par-window-open', '_blank');
    const l = document.createElement('a'); l.href = 'https://example.org/lien-target-blank'; l.target = '_blank'; l.textContent = 'x'; document.body.append(l); l.click(); l.remove();
    window.open('file:///etc/hosts', '_blank'); window.open('javascript:alert(1)', '_blank'); window.open('app://liseuse/index.html', '_blank');`);
  await sleep(800);
  const ext = a.events().filter((e) => e.event === 'external').map((e) => e.url);
  check('window.open and target=_blank http(s) links go to the default browser', ext.includes('https://example.com/ouvert-par-window-open') && ext.includes('https://example.org/lien-target-blank'), ext.join(', '));
  check('file:, javascript: and app: windows are not opened', ext.length === 2, `external=${ext.length}`);
  const winCount = (await (await fetch(`http://127.0.0.1:${a.port}/json`)).json()).filter((t) => t.type === 'page').length;
  check('no extra window was created', winCount === 1, 'pages=' + winCount);

  // navigation away
  await a.cdp.ev("location.href = 'https://example.net/ailleurs'; ");
  await sleep(1200);
  await a.cdp.ev("location.href = 'file:///etc/hosts'; ");
  await sleep(600);
  await a.cdp.ev("location.href = 'app://autre/index.html'; ");
  await sleep(600);
  const href2 = await a.cdp.ev('return location.href');
  const blocked = a.events().filter((e) => e.event === 'navigation-blocked').map((e) => e.url);
  // file: from an app: page is refused by Chromium itself before the shell sees it (« Not allowed to load local resource »)
  check('navigation away from the app is blocked (https, file, other app host)', href2 === 'app://liseuse/index.html' && blocked.includes('https://example.net/ailleurs') && blocked.includes('app://autre/index.html'), `href=${href2} blocked by the shell: ${blocked.join(', ')}`);

  // permissions
  const perms = await a.cdp.ev(`
    const out = {};
    out.notification = await Notification.requestPermission();
    out.geoloc = await new Promise((res) => navigator.geolocation.getCurrentPosition(() => res('granted'), (e) => res('denied:' + e.code), { timeout: 4000 }));
    out.camera = await navigator.mediaDevices.getUserMedia({ audio: true }).then(() => 'granted', (e) => e.name);
    out.clipboardWrite = (await navigator.permissions.query({ name: 'clipboard-write' })).state;
    out.clipboardRead = await navigator.clipboard.readText().then(() => 'granted', (e) => e.name);
    return out;`);
  check('permissions: notifications, geolocation, microphone, clipboard-read are denied', perms.notification === 'denied' && /^denied/.test(perms.geoloc) && perms.camera === 'NotAllowedError' && perms.clipboardRead === 'NotAllowedError', JSON.stringify(perms));
  check('permissions: clipboard write is allowed', perms.clipboardWrite === 'granted', perms.clipboardWrite);

  // sound: volume 0, muted process; the page's own sound engine starts without an error
  await a.cdp.ev("localStorage.setItem('liseuse.settings', JSON.stringify({ sound: true, vol: 0 })); location.hash = '#debug'; location.reload();");
  await sleep(3500);
  const snd = await a.cdp.ev(`const s = window.__day && window.__day.sound; if (!s) return { err: 'no __day' }; s.start(); await new Promise((r) => setTimeout(r, 1200)); return { state: s.ctx && s.ctx.state, rate: s.ctx && s.ctx.sampleRate, toast: /Le son n.a pas pu/.test(document.body.innerText) };`);
  check('sound starts with no error (AudioContext running, volume 0, process muted)', snd.state === 'running' && snd.toast === false, JSON.stringify(snd));

  // notes export: Blob download -> will-download -> saved in the test dir
  await a.cdp.ev("localStorage.setItem('liseuse.settings', JSON.stringify({ sound: false })); location.hash = ''; location.reload();");
  await sleep(3500);
  await a.cdp.ev(SEL(1, 9, 60)); await sleep(500);
  const hl = await a.cdp.ev("document.getElementById('selHl').click(); await new Promise((r) => setTimeout(r, 500)); return document.querySelectorAll('#column mark.an.hl').length");
  check('a highlight can be made (notes exist for the export)', hl >= 1, 'marks=' + hl);
  await a.cdp.ev("document.getElementById('notesExport').click();");
  const dlEvent = await a.waitEvent('download', () => true, 10000);
  const files = readdirSync(dl);
  const exported = files.find((f) => /^Notes - .*\.md$/.test(f));
  const body = exported ? readFileSync(join(dl, exported), 'utf8') : '';
  check('notes export: will-download saved the file in test mode, with the suggested name', !!dlEvent && dlEvent.state === 'completed' && !!exported && body.startsWith('# ') && body.includes('> '), `${exported} (${body.length} bytes)`);

  // window geometry: a size that is not the default, then a polite quit
  if (MAC) { asVal(a.pid, 'set size of window 1 to {1100, 700}'); asVal(a.pid, 'set position of window 1 to {120, 90}'); await sleep(1200); }
  // the file:///etc/hosts line is Chromium refusing the navigation this test provoked on purpose: not a page error
  const errs1 = a.cdp.errors.filter((e) => !/Not allowed to load local resource: file:\/\/\/etc\/hosts/.test(e)), net1 = [...a.cdp.network];
  const q1 = await stop(a);
  check('launch 1: no console error / exception in the page', errs1.length === 0, errs1.join(' // ').slice(0, 400));
  if (net1.length) note('network requests that failed (page web fonts / OCR script, expected offline)', net1.length + ' : ' + net1[0].slice(0, 120));
  check('SIGTERM quits cleanly', !q1.forced && q1.code === 0, JSON.stringify(q1));
  const st1 = readState();
  if (MAC) check('window state saved at quit (1100x700 at 120,90)', st1 && st1.width === 1100 && st1.height === 700 && st1.x === 120 && st1.y === 90 && st1.maximized === false && st1.fullscreen === false, JSON.stringify(st1));
  else check('window state file written at quit', !!st1, JSON.stringify(st1));

  /* ============ launch 2: same profile ============ */
  console.log('--- launch 2: same profile (storage, bounds, second instance, open-with) ---');
  a = await start();
  await sleep(2500);
  const shown2 = await a.waitEvent('window-shown', (e) => e.t > Date.now() - 20000);
  const back = await a.cdp.ev(`const ls = localStorage.getItem('desktop-test'); const idb = await new Promise((res) => { const r = indexedDB.open('desktop-test', 1); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('k'); q.onsuccess = () => { r.result.close(); res(q.result); }; q.onerror = () => res(null); }; r.onerror = () => res(null); }); return { ls, idb };`);
  check('localStorage survives a full quit and relaunch', back.ls === 'valeur-ls-é', JSON.stringify(back.ls));
  check('IndexedDB survives a full quit and relaunch', back.idb && back.idb.n === 42 && back.idb.s === 'valeur-idb', JSON.stringify(back.idb));
  const b2 = shown2 && shown2.bounds;
  check('window bounds restored at launch', st1 && b2 && b2.width === st1.width && b2.height === st1.height && b2.x === st1.x && b2.y === st1.y, `saved ${JSON.stringify(st1 && [st1.x, st1.y, st1.width, st1.height])} -> ${JSON.stringify(b2 && [b2.x, b2.y, b2.width, b2.height])}`);

  // a second launch with a file: goes to the running window, the second process leaves
  const t0 = Date.now();
  const second = spawn(BIN, [`--user-data-dir=${ud}`, F1], { env: { ...process.env, LISEUSE_TEST_LOG: log, LISEUSE_TEST_DOWNLOAD_DIR: dl }, stdio: 'ignore' });
  const secondExit = await new Promise((res) => { second.on('exit', (code, signal) => res({ code, signal })); setTimeout(() => res({ timeout: true }), 15000); });
  if (secondExit.timeout) { second.kill('SIGKILL'); }
  check('single instance: the second process leaves at once', !secondExit.timeout && secondExit.code === 0, `${JSON.stringify(secondExit)} after ${Date.now() - t0} ms`);
  const del = await a.waitEvent('files-delivered', (e) => e.names && e.names.includes('essai-lampe.txt'), 12000);
  check('open-with (second launch with a file): the preload received and delivered it', !!del, JSON.stringify(del && del.names));
  await sleep(1500);
  const imp = await a.cdp.ev("return [document.getElementById('column').textContent.includes('Phrase de contrôle Alpha 1.1'), document.getElementById('loading').hidden, localStorage.getItem('liseuse.library') || '']");
  check('open-with: the page imported it through #file (book on screen, in the library)', imp[0] === true && imp[1] === true && imp[2].includes('essai-lampe'), `column=${imp[0]} loadingHidden=${imp[1]} inLibrary=${imp[2].includes('essai-lampe')}`);

  // macOS open-file (the Finder way): LaunchServices hands the file to the running instance
  if (MAC && APP_BUNDLE) {
    try {
      execFileSync('open', ['-g', '-a', APP_BUNDLE, F2], { timeout: 15000 });
      const del2 = await a.waitEvent('files-delivered', (e) => e.names && e.names.includes('essai-deux.md'), 12000);
      await sleep(1500);
      const imp2 = await a.cdp.ev("return document.getElementById('column').textContent.includes('Phrase de contrôle Bravo 1.1')");
      if (del2) check('macOS open-file (open -a app file) reaches the running window and imports', imp2 === true, 'delivered=true imported=' + imp2);
      else note('macOS open-file via LaunchServices', 'no delivery seen: `open -a` may have started another LaunchServices instance (not testable here)');
    } catch (e) { note('macOS open-file via LaunchServices', 'open failed: ' + String(e.message).slice(0, 160)); }
  }
  const errs2 = [...a.cdp.errors];
  const q2 = await stop(a);
  check('launch 2: no console error / exception in the page', errs2.length === 0, errs2.join(' // ').slice(0, 400));
  check('launch 2: quit cleanly', !q2.forced && q2.code === 0, JSON.stringify(q2));

  /* ============ launch 3: cold start with a file on the command line, F11 ============ */
  console.log('--- launch 3: cold start with a file, F11 ---');
  a = await start({ args: [F3] });
  await sleep(2500);
  const del3 = await a.waitEvent('files-delivered', (e) => e.names && e.names.includes('essai-froid.txt'), 15000);
  await sleep(1500);
  const imp3 = await a.cdp.ev("return [document.getElementById('column').textContent.includes('Phrase de contrôle Charlie 1.1'), localStorage.getItem('liseuse.library') || '']");
  check('cold start with a file argument: imported once the page is ready', !!del3 && imp3[0] === true && imp3[1].includes('essai-froid'), `delivered=${!!del3} column=${imp3[0]}`);
  const key = (type) => a.cdp.send('Input.dispatchKeyEvent', { type, key: 'F11', code: 'F11', windowsVirtualKeyCode: 122, nativeVirtualKeyCode: 122 });
  await key('rawKeyDown'); await key('keyUp');
  const fsOn = await a.waitEvent('window-enter-full-screen', () => true, 8000);
  check('F11 enters fullscreen', !!fsOn && fsOn.fullscreen === true, JSON.stringify(fsOn));
  await sleep(1500);
  const errs3 = [...a.cdp.errors];
  const q3 = await stop(a);
  const st3 = readState();
  check('fullscreen state is saved at quit', st3 && st3.fullscreen === true, JSON.stringify(st3));
  check('launch 3: no console error / exception in the page', errs3.length === 0, errs3.join(' // ').slice(0, 400));
  check('launch 3: quit cleanly', !q3.forced && q3.code === 0, JSON.stringify(q3));

  /* ============ launch 4: fullscreen restored, F11 off, the page's own fullscreen ============ */
  console.log('--- launch 4: fullscreen restored; F11; page fullscreen ---');
  a = await start();
  await sleep(2500);
  const shown4 = await a.waitEvent('window-shown', (e) => e.t > Date.now() - 20000);
  const fsRestored = await a.waitEvent('window-enter-full-screen', (e) => e.t > Date.now() - 20000, 8000);
  check('fullscreen restored at launch', !!shown4 && shown4.restored && shown4.restored.fullscreen === true && !!fsRestored, JSON.stringify({ restored: shown4 && shown4.restored.fullscreen, entered: !!fsRestored }));
  await sleep(1500);
  const n0 = a.events().length;
  const key4 = (type) => a.cdp.send('Input.dispatchKeyEvent', { type, key: 'F11', code: 'F11', windowsVirtualKeyCode: 122, nativeVirtualKeyCode: 122 });
  await key4('rawKeyDown'); await key4('keyUp');
  const fsOff = await a.waitEvent('window-leave-full-screen', (e) => e.t > Date.now() - 8000, 8000);
  check('F11 leaves fullscreen', !!fsOff && fsOff.fullscreen === false, JSON.stringify(fsOff));
  await sleep(1500);
  const hf = await a.cdp.ev("let ok = true, err = ''; try { await Promise.race([document.documentElement.requestFullscreen(), new Promise((_, no) => setTimeout(() => no(new Error('no answer after 6 s')), 6000))]); } catch (e) { ok = false; err = e.name + ' ' + e.message; } await new Promise((r) => setTimeout(r, 1800)); return { ok, err, el: !!document.fullscreenElement };");
  check("the page's own fullscreen (ambiance) is allowed", hf.ok && hf.el, JSON.stringify(hf));
  const denied = a.events().filter((e) => e.event === 'permission-denied' && e.t > Date.now() - 20000).map((e) => e.permission);
  check('no permission the page needs was denied', !denied.includes('fullscreen') && !denied.includes('clipboard-sanitized-write'), 'denied: ' + JSON.stringify(denied));
  // quitting while the page is fullscreen must not leave the window fullscreen next time
  const q4 = await stop(a);
  const st4 = readState();
  check("the page's own fullscreen is not remembered as a window state", st4 && st4.fullscreen === false, JSON.stringify(st4));
  check('launch 4: quit cleanly', !q4.forced && q4.code === 0, JSON.stringify(q4));
  const errs4 = [...a.cdp.errors];
  check('launch 4: no console error / exception in the page', errs4.length === 0, errs4.join(' // ').slice(0, 400));
} catch (err) {
  check('test run completed without an exception', false, String(err && err.stack || err).slice(0, 600));
} finally {
  for (const a of live) { try { a.cdp.close(); a.child.kill('SIGKILL'); } catch { /* gone */ } }   // only the processes this run started
  const fails = results.filter((r) => r.ok === false);
  console.log(`\n${results.filter((r) => r.ok).length} passed, ${fails.length} failed, ${results.filter((r) => r.ok === null).length} notes`);
  writeFileSync(join(root, 'test', 'last-run.json'), JSON.stringify({ when: new Date().toISOString(), bin: BIN, results }, null, 2) + '\n');
  console.log('shell log: ' + log);
  if (!process.env.LISEUSE_KEEP_TEST_DIR) rmSync(work, { recursive: true, force: true }); else console.log('kept: ' + work);
  process.exit(fails.length ? 1 : 0);
}
