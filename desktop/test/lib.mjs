// Small helpers for test/run.mjs: launch the app with a remote-debugging port, talk CDP, read the shell's test log.
// No dependency: Node 22 (global fetch and WebSocket).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    this.errors = []; this.warnings = []; this.network = [];
    ws.addEventListener('message', (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.pending.has(d.id)) { const [ok, ko] = this.pending.get(d.id); this.pending.delete(d.id); d.error ? ko(new Error(d.method + ' ' + JSON.stringify(d.error))) : ok(d.result); return; }
      if (d.method === 'Runtime.exceptionThrown') this.errors.push('exception: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
      else if (d.method === 'Runtime.consoleAPICalled') {
        const text = d.params.args.map((a) => a.value ?? a.description).join(' ');
        if (d.params.type === 'error') this.errors.push('console.error: ' + text); else if (d.params.type === 'warning') this.warnings.push(text.slice(0, 200));
      } else if (d.method === 'Log.entryAdded') {
        const e = d.params.entry;
        // a failed request to the network (the page's web fonts, the OCR script) is not a page error: kept apart
        if (e.level === 'error') (/Failed to load resource|net::ERR/i.test(e.text) ? this.network : this.errors).push(`log ${e.source}: ${e.text} ${e.url || ''}`.trim());
        else if (e.level === 'warning') this.warnings.push(e.text.slice(0, 200));
      }
    });
  }
  static async open(url) {
    const ws = new WebSocket(url);
    await new Promise((ok, ko) => { ws.addEventListener('open', ok); ws.addEventListener('error', () => ko(new Error('websocket error'))); });
    const c = new Cdp(ws);
    await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Page.enable');
    return c;
  }
  send(method, params = {}) {
    return new Promise((ok, ko) => { const id = ++this.id; this.pending.set(id, [ok, ko]); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  // runs `body` (an async function body) in the page, with a user gesture; returns its value
  async ev(body) {
    const r = await this.send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch { /* gone */ } }
}

export function readLog(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { event: 'bad-line', l }; } });
}

// Starts the app. `ud` is its userData (--user-data-dir), `log` the shell's test log, `dl` the test download dir.
export async function launch(bin, { ud, log, dl, args = [], env = {}, port = 20000 + Math.floor(Math.random() * 20000) }) {
  const child = spawn(bin, [`--remote-debugging-port=${port}`, `--user-data-dir=${ud}`, '--mute-audio', ...args], {
    env: { ...process.env, LISEUSE_TEST_LOG: log, LISEUSE_TEST_DOWNLOAD_DIR: dl, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = [];
  child.stdout.on('data', (d) => out.push(String(d)));
  child.stderr.on('data', (d) => out.push(String(d)));
  let exited = null;
  child.on('exit', (code, signal) => { exited = { code, signal }; });
  let target = null;
  for (let i = 0; i < 100 && !target; i++) {
    if (exited) throw new Error('the app exited at start: ' + JSON.stringify(exited) + '\n' + out.join('').slice(0, 800));
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page' && t.url.startsWith('app://')); } catch { /* not up yet */ }
    if (!target) await sleep(250);
  }
  if (!target) { child.kill('SIGKILL'); throw new Error('no page target'); }
  const cdp = await Cdp.open(target.webSocketDebuggerUrl);
  return {
    child, pid: child.pid, port, cdp, out, ud, log,
    get exited() { return exited; },
    events: () => readLog(log),
    async waitEvent(name, pred = () => true, ms = 15000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { const e = readLog(log).filter((x) => x.event === name && pred(x)); if (e.length) return e[e.length - 1]; await sleep(150); }
      return null;
    },
    // a polite quit (SIGTERM: before-quit, window state saved); SIGKILL only if it has not left after 10 s. Only our own PID.
    async quit() {
      cdp.close();
      if (!exited) child.kill('SIGTERM');
      for (let i = 0; i < 100 && !exited; i++) await sleep(100);
      if (!exited) { child.kill('SIGKILL'); for (let i = 0; i < 30 && !exited; i++) await sleep(100); return { forced: true, ...exited }; }
      return { forced: false, ...exited };
    },
  };
}
