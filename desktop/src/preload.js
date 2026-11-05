'use strict';
// Tiny preload (sandboxed, context isolation on). It exposes nothing to the page but a read-only « desktop » flag, and it
// brings the files the system asks the app to open (double click, « Ouvrir avec », a second launch) to the page the way
// the page already takes them: a File put in its #file input (<input type="file" id="file" multiple>), then a « change »
// event, exactly what the « Ouvrir » button produces. The page itself is not touched.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('liseuseDesktop', Object.freeze({ desktop: true, platform: process.platform }));

// The page is ready for a file once its script has run and the shelf has settled (body.lib-wait is the page's own
// « starting » mark). Past 8 s we go ahead anyway.
let gate = null;
function pageReady() {
  if (gate) return gate;
  gate = new Promise((resolve) => {
    const t0 = Date.now();
    const look = () => {
      const input = document.getElementById('file');
      if (document.readyState !== 'loading' && input && document.body && (!document.body.classList.contains('lib-wait') || Date.now() - t0 > 8000)) { setTimeout(() => resolve(input), 350); return; }
      setTimeout(look, 80);
    };
    look();
  });
  return gate;
}

ipcRenderer.on('liseuse:open-files', async (_event, files) => {
  try {
    const input = await pageReady();
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(new File([f.data], f.name, { type: f.type, lastModified: f.lastModified }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    ipcRenderer.send('liseuse:files-delivered', { names: files.map((f) => f.name), sizes: files.map((f) => f.data.byteLength) });
  } catch (err) {
    ipcRenderer.send('liseuse:open-failed', String((err && err.message) || err));
  }
});

ipcRenderer.send('liseuse:preload-ready');
