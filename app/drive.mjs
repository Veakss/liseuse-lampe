// Drives liseuse.html in headless Chrome: steps given as JSON [{js}, {wait}, {shot:name}].
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
const [url, stepsJson, w = '1440', h = '900'] = process.argv.slice(2);
const steps = JSON.parse(stepsJson);
const port = 10000 + Math.floor(Math.random() * 40000);
const prof = process.env.PROF || 'chrome-prof'; // (a profile of its own lets several runs go at once)
rmSync(prof, { recursive: true, force: true });
const ch = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-mock-keychain', '--password-store=basic', `--remote-debugging-port=${port}`, '--user-data-dir=' + process.cwd() + '/' + prof, `--window-size=${w},${h}`, '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 50; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.find((t) => t.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await sleep(200); }
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(), logs = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text)); else if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' ')); else if (d.method === 'Log.entryAdded') logs.push('log ' + d.params.entry.level + ': ' + d.params.entry.text); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Performance.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: +(process.env.DPR || 1), mobile: +w < 600 });
await send('Page.navigate', { url });
await sleep(2500);
for (const s of steps) {
  if (s.wait) await sleep(s.wait);
  if (s.js) { const r = await send('Runtime.evaluate', { expression: `(async () => { ${s.js} })()`, awaitPromise: true, returnByValue: true, userGesture: true }); const v = r.result?.result?.value; if (v !== undefined) console.log('>', JSON.stringify(v)); if (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite)) globalThis.__xy = v; if (r.result?.exceptionDetails) console.log('EVAL ERROR', r.result.exceptionDetails.exception?.description); }
  if (s.cdp) { const pr = Object.assign({}, s.params || {}); if (pr.x === '$x') pr.x = globalThis.__xy[0]; if (pr.y === '$y') pr.y = globalThis.__xy[1]; // ($x, $y: the last [x, y] a js step returned)
    const r = await send(s.cdp, pr); if (s.cdp === 'SystemInfo.getProcessInfo') { const pi = (r.result?.processInfo || []).reduce((o, x) => ((o[x.type] = (o[x.type] || 0) + x.cpuTime), o), {}); const prev = globalThis.__pi; globalThis.__pi = pi; if (prev) console.log('cpu', Object.keys(pi).map((k) => k + '=' + ((pi[k] - (prev[k] || 0)) * 1000 | 0) + 'ms').join(' ')); } if (s.cdp === 'Performance.getMetrics') { const m = Object.fromEntries(r.result.metrics.map((x) => [x.name, x.value])); const prev = globalThis.__m; globalThis.__m = m; if (prev) console.log('busy over window:', ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].map((k) => k + '=' + ((m[k] - prev[k]) * 1000).toFixed(0) + 'ms').join(' '), 'wall=' + ((m.Timestamp - prev.Timestamp) * 1000).toFixed(0) + 'ms'); } }
  if (s.file) { const d = await send('DOM.getDocument'); const q = await send('DOM.querySelector', { nodeId: d.result.root.nodeId, selector: s.selector }); await send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: String(s.file).split('\n') }); }
  if (s.shot) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(s.shot, Buffer.from(r.result.data, 'base64')); console.log('shot', s.shot); }
}
console.log(logs.length ? '--- console ---\n' + logs.join('\n') : '--- no console output ---');
ch.kill(); process.exit(0);
