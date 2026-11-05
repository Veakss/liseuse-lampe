'use strict';
// Liseuse à la lampe, desktop shell. The reading app is one HTML page (app/index.html, copied from the sources by
// scripts/prepare.mjs); this file only gives it a window, a stable origin, a few desktop manners and "open with".
//
// Test hooks (all optional, unused in normal life):
//   LISEUSE_TEST_DOWNLOAD_DIR  downloads are saved there without a dialog
//   LISEUSE_TEST_LOG           path of a JSON-lines log of what the shell did (external links, denied permissions, blocked
//                              navigations, downloads, delivered files); also: external links are NOT opened, the window
//                              is shown without taking the focus, no Dock icon on macOS
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, screen, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const NAME = 'Liseuse à la lampe';
const SCHEME = 'app';
const HOST = 'liseuse';
const ORIGIN = `${SCHEME}://${HOST}`;
const START_URL = `${ORIGIN}/index.html`;
const BG = '#0d0a08';                       // the room's dark (--bg in ambiance): what shows before the page paints
const MIN_W = 960, MIN_H = 600;
const MAX_FILE = 1024 * 1024 * 1024;        // 1 GiB: past this the page itself would not cope
const TEST_LOG = process.env.LISEUSE_TEST_LOG || '';
const TEST_DL = process.env.LISEUSE_TEST_DOWNLOAD_DIR || '';
const isMac = process.platform === 'darwin';

// What the page asks of the system, and nothing else: writing to the clipboard (a notes export that cannot download falls
// back to it) and its own fullscreen (the ambiance).
const PERMISSIONS = new Set(['clipboard-sanitized-write', 'fullscreen']);

// What « open with » may hand over: the formats the page reads (Importers.accept) plus the pictures it takes as pages.
const MIME = {
  pdf: 'application/pdf', epub: 'application/epub+zip', txt: 'text/plain', text: 'text/plain', md: 'text/markdown', markdown: 'text/markdown',
  html: 'text/html', htm: 'text/html', xhtml: 'application/xhtml+xml', fb2: 'application/x-fictionbook+xml', mobi: 'application/x-mobipocket-ebook',
  azw: 'application/vnd.amazon.ebook', azw3: 'application/vnd.amazon.ebook', prc: 'application/x-mobipocket-ebook', pdb: 'application/vnd.palm',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf', cbz: 'application/vnd.comicbook+zip', zip: 'application/zip',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
};
const extOf = (p) => path.extname(p).slice(1).toLowerCase();

// The page's origin must not depend on where the app is installed or on its version: the data (localStorage, IndexedDB)
// lives under userData, keyed by app://liseuse, and survives updates. The folder name is fixed here on purpose.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), 'Liseuse-a-la-lampe'));
app.setName(NAME);
if (process.platform === 'win32') app.setAppUserModelId('fr.liseuse.lampe');

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

function tlog(event, data) {
  if (!TEST_LOG) return;
  try { fs.appendFileSync(TEST_LOG, JSON.stringify({ t: Date.now(), event, ...data }) + '\n'); } catch { /* the log is a test aid only */ }
}

/* ---------------- one instance, files to open ---------------- */
let win = null;
let rendererReady = false;           // the preload of the current page has announced itself
let pending = [];                    // paths waiting for a window (cold start, or the page still loading)
let flushTimer = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv, cwd) => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
    queueFiles(filesFromArgv(argv, cwd));
  });
  // macOS: a file dropped on the icon or opened with the app, before or after the window exists.
  app.on('open-file', (e, p) => { e.preventDefault(); queueFiles([p]); });
  queueFiles(filesFromArgv(process.argv, process.cwd()));
  app.whenReady().then(start);
}

function filesFromArgv(argv, cwd) {
  const out = [];
  for (const a of argv.slice(1)) {
    if (!a || a.startsWith('-')) continue;
    const p = path.resolve(cwd || process.cwd(), a);
    if (!MIME[extOf(p)]) continue;
    try { if (fs.statSync(p).isFile()) out.push(p); } catch { /* not a file: ignore */ }
  }
  return out;
}

// Several files arriving together (a multiple selection, several open-file events) go to the page as one batch, the way
// the page's own « Ouvrir » button hands it a multiple selection.
function queueFiles(paths) {
  for (const p of paths) if (!pending.includes(p)) pending.push(p);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 250);
}

async function flush() {
  if (!pending.length) return;
  if (!win || !rendererReady) { flushTimer = setTimeout(flush, 200); return; }
  const paths = pending; pending = [];
  const files = [], failed = [];
  for (const p of paths) {
    try {
      const st = await fs.promises.stat(p);
      if (st.size > MAX_FILE) { failed.push(path.basename(p) + ' (trop volumineux)'); continue; }
      files.push({ name: path.basename(p), type: MIME[extOf(p)] || '', lastModified: st.mtimeMs, data: await fs.promises.readFile(p) });
    } catch { failed.push(path.basename(p)); }
  }
  if (failed.length) dialog.showMessageBox(win, { type: 'warning', message: 'Ce fichier n’a pas pu être lu.', detail: failed.join('\n'), buttons: ['OK'] });
  if (!files.length || !win) return;
  if (!TEST_LOG) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  win.webContents.send('liseuse:open-files', files);
}

ipcMain.on('liseuse:preload-ready', (e) => { if (win && e.sender === win.webContents) { rendererReady = true; if (pending.length) flush(); } });
ipcMain.on('liseuse:files-delivered', (e, info) => tlog('files-delivered', info));
ipcMain.on('liseuse:open-failed', (e, message) => tlog('open-failed', { message }));

/* ---------------- window state ---------------- */
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadState() {
  let s = null;
  try { s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; }
  if (!s || typeof s !== 'object') return {};
  const num = (v) => (Number.isFinite(v) ? Math.round(v) : undefined);
  const out = { width: num(s.width), height: num(s.height), x: num(s.x), y: num(s.y), maximized: s.maximized === true, fullscreen: s.fullscreen === true };
  if (out.width !== undefined) out.width = Math.max(MIN_W, out.width);
  if (out.height !== undefined) out.height = Math.max(MIN_H, out.height);
  // a position that no screen shows any more (an unplugged monitor) is dropped: the window opens centred
  if (out.x !== undefined && out.y !== undefined && out.width && out.height) {
    const seen = screen.getAllDisplays().some((d) => {
      const a = d.workArea, w = Math.min(out.x + out.width, a.x + a.width) - Math.max(out.x, a.x), h = Math.min(out.y + out.height, a.y + a.height) - Math.max(out.y, a.y);
      return w >= 160 && h >= 80;
    });
    if (!seen) { delete out.x; delete out.y; }
  } else { delete out.x; delete out.y; }
  return out;
}

let htmlFullscreen = false;          // the page's own fullscreen (the ambiance): not a state to remember
let saveTimer = null;
function saveState() {
  if (!win || win.isDestroyed()) return;
  clearTimeout(saveTimer);
  try {
    const b = win.getNormalBounds();
    const state = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized(), fullscreen: win.isFullScreen() && !htmlFullscreen };
    const tmp = stateFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, stateFile());
    tlog('state-saved', state);
  } catch (err) { tlog('state-error', { message: String(err && err.message) }); /* a state that cannot be written is not worth an error */ }
}
const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveState, 400); };

/* ---------------- opening links, downloads, permissions ---------------- */
function isHttp(url) { try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }
function openExternal(url) {
  if (!isHttp(url)) return;
  if (TEST_LOG) { tlog('external', { url }); return; }
  shell.openExternal(url).catch(() => {});
}
// Not `new URL(url).origin`: Node gives the origin « null » to a non-special scheme such as app:, so compare scheme and host.
const ours = (url) => { try { const u = new URL(url); return u.protocol === `${SCHEME}:` && u.host === HOST; } catch { return false; } };

function lockDown(contents) {
  contents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  const block = (e, url) => { if (!ours(url)) { e.preventDefault(); tlog('navigation-blocked', { url }); } };
  contents.on('will-navigate', block);
  contents.on('will-redirect', block);
  contents.on('will-frame-navigate', block);
  contents.on('will-attach-webview', (e) => e.preventDefault());
}

function setupSession(ses) {
  ses.setSpellCheckerEnabled(false);
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const ok = PERMISSIONS.has(permission) && ours(details.requestingUrl || wc.getURL());
    if (!ok) tlog('permission-denied', { permission });
    callback(ok);
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => PERMISSIONS.has(permission) && ours(origin));
  ses.setDevicePermissionHandler(() => false);

  // The notes export is a Blob download. Without a dialog the file would land in Downloads under a name the reader never
  // saw: ask where to save it, in Documents, under the name the page suggests.
  ses.on('will-download', (_e, item) => {
    const name = path.basename(item.getFilename() || 'liseuse.txt').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'liseuse.txt';
    if (TEST_DL) {
      fs.mkdirSync(TEST_DL, { recursive: true });
      item.setSavePath(path.join(TEST_DL, name));
    } else {
      const ext = path.extname(name).slice(1);
      item.setSaveDialogOptions({
        title: 'Enregistrer le fichier',
        defaultPath: path.join(app.getPath('documents'), name),
        buttonLabel: 'Enregistrer',
        filters: ext ? [{ name: 'Fichier .' + ext, extensions: [ext] }, { name: 'Tous les fichiers', extensions: ['*'] }] : [{ name: 'Tous les fichiers', extensions: ['*'] }],
      });
    }
    item.once('done', (_ev, state) => {
      tlog('download', { name, state, path: item.getSavePath(), size: item.getReceivedBytes() });
      if (state === 'interrupted') dialog.showMessageBox(win, { type: 'error', message: 'Le fichier n’a pas pu être enregistré.', detail: name, buttons: ['OK'] });
    });
  });
}

/* ---------------- the page, served from app://liseuse ---------------- */
const PAGE_ROOT = path.join(__dirname, '..', 'app');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function registerProtocol() {
  protocol.handle(SCHEME, async (request) => {
    try {
      const u = new URL(request.url);
      if (u.hostname !== HOST) return new Response('Introuvable', { status: 404 });
      let rel = decodeURIComponent(u.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const file = path.normalize(path.join(PAGE_ROOT, rel));
      if (!file.startsWith(PAGE_ROOT + path.sep)) return new Response('Interdit', { status: 403 });
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'x-content-type-options': 'nosniff' } });
    } catch {
      return new Response('Introuvable', { status: 404 });
    }
  });
}

/* ---------------- menu ---------------- */
function setupMenu() {
  if (!isMac) { Menu.setApplicationMenu(null); return; }   // Windows: no menu bar at all
  app.setAboutPanelOptions({ applicationName: NAME, applicationVersion: app.getVersion(), copyright: '© 2026 Victor Dumanois · licence MIT' });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: NAME, submenu: [
      { role: 'about', label: 'À propos de ' + NAME }, { type: 'separator' },
      { role: 'hide', label: 'Masquer ' + NAME }, { role: 'hideOthers', label: 'Masquer les autres' }, { role: 'unhide', label: 'Tout afficher' }, { type: 'separator' },
      { role: 'quit', label: 'Quitter ' + NAME },
    ] },
    { label: 'Édition', submenu: [
      { role: 'undo', label: 'Annuler' }, { role: 'redo', label: 'Rétablir' }, { type: 'separator' },
      { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' }, { role: 'selectAll', label: 'Tout sélectionner' },
    ] },
    { label: 'Présentation', submenu: [{ role: 'togglefullscreen', label: 'Plein écran' }] },   // Ctrl+Cmd+F
    { label: 'Fenêtre', submenu: [{ role: 'minimize', label: 'Réduire' }, { role: 'zoom', label: 'Agrandir' }, { type: 'separator' }, { role: 'front', label: 'Tout ramener au premier plan' }] },
  ]));
}

/* ---------------- start ---------------- */
function start() {
  setupMenu();
  registerProtocol();
  setupSession(session.defaultSession);
  if (TEST_LOG && isMac && app.dock) app.dock.hide();

  const st = loadState();
  const wa = screen.getPrimaryDisplay().workArea;
  const iconFile = path.join(__dirname, '..', 'build', 'icon.png');
  win = new BrowserWindow({
    width: st.width || Math.min(1280, wa.width), height: st.height || Math.min(820, wa.height), x: st.x, y: st.y,
    minWidth: MIN_W, minHeight: MIN_H,
    title: NAME, backgroundColor: BG, show: false,
    // never `fullscreen: false`: on macOS an explicit false makes the window non-fullscreenable (F11 and Ctrl+Cmd+F would do nothing)
    ...(st.fullscreen ? { fullscreen: true } : {}),
    ...(!isMac && fs.existsSync(iconFile) ? { icon: iconFile } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      spellcheck: false, webSecurity: true, allowRunningInsecureContent: false,
    },
  });
  if (st.maximized && !st.fullscreen) win.maximize();

  win.once('ready-to-show', () => {
    if (TEST_LOG) win.showInactive(); else win.show();
    tlog('window-shown', { title: win.getTitle(), minimumSize: win.getMinimumSize(), bounds: win.getBounds(), maximized: win.isMaximized(), fullscreen: win.isFullScreen(), restored: st });
  });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('resize', saveSoon);
  win.on('move', saveSoon);
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(ev, () => { tlog('window-' + ev, { maximized: win.isMaximized(), fullscreen: win.isFullScreen() }); saveSoon(); });
  win.on('close', saveState);
  win.on('closed', () => { win = null; rendererReady = false; });

  const wc = win.webContents;
  wc.on('enter-html-full-screen', () => { htmlFullscreen = true; tlog('html-fullscreen', { on: true }); });
  wc.on('leave-html-full-screen', () => { htmlFullscreen = false; tlog('html-fullscreen', { on: false }); saveSoon(); });
  wc.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => { if (isMainFrame) rendererReady = false; });
  // F11 toggles fullscreen everywhere (on macOS the View menu also has Ctrl+Cmd+F).
  wc.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11' && !input.control && !input.alt && !input.meta && !input.shift) {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
  let lastCrash = 0;
  wc.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit' || Date.now() - lastCrash < 10000) return;
    lastCrash = Date.now();
    win.loadURL(START_URL);
  });

  win.loadURL(START_URL);
}

app.on('web-contents-created', (_e, contents) => lockDown(contents));
app.on('before-quit', saveState);
app.on('window-all-closed', () => app.quit());
