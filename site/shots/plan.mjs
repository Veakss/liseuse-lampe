// shots/plan.mjs <nom> <sortie.png> : écrit sur la sortie standard les étapes JSON que drive.mjs (dossier des sources
// de la liseuse) joue pour une capture. Aucun texte de livre réel : seulement le livre d'exemple de l'application
// (« Un soir de pluie ») et des titres inventés pour la bibliothèque.
//
// Chaque capture = des réglages posés dans localStorage avant que la page ne s'exécute, un rechargement, puis le geste
// qui amène l'écran voulu (ambiance, bibliothèque, tiroir des réglages…).
const [nom, sortie] = process.argv.slice(2);

// Posé avant le script de la page : un document qui se décharge réécrit sa place, une graine posée avant un
// rechargement serait écrasée (même méthode que work/notes/seed.mjs).
const graine = (kv) => ({
  cdp: 'Page.addScriptToEvaluateOnNewDocument',
  params: {
    source: `if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); ${Object.entries(kv)
      .map(([k, v]) => `localStorage.setItem(${JSON.stringify('liseuse.' + k)}, ${JSON.stringify(JSON.stringify(v))});`)
      .join(' ')} }`,
  },
});

// Réglages communs : rien ne bouge au hasard (météo fixe), pas de son, pas de gouttes sur le texte.
const base = { sound: false, evolve: 'fixed', pace: 'slow', drops: false };
const reglages = (o) => Object.assign({}, base, o);

const attendre = (ms, js) => (js ? { wait: ms, js } : { wait: ms });
const ambiance = { js: "document.getElementById('ambBtn').click();" };
// Un mouvement de souris fait apparaître la barre de l'ambiance (elle s'efface seule au bout de quelques secondes).
const souris = (x, y) => ({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x, y } });
// Tourne la page du livre relié (la flèche droite, comme au clavier).
const tourne = { js: "document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));" };
const defile = (px) => ({ js: `document.getElementById('reader').scrollTop = ${px};` });
const prise = { shot: sortie };

// Une étagère inventée : des titres de fantaisie, des auteurs absents.
const jour = 86400000, maintenant = Date.now();
const livres = [
  ['carnet-pluie', 'Carnet d’un soir de pluie', 0.62, 1],
  ['refuge-col', 'Le Refuge du col', 0.18, 2],
  ['heures-lentes', 'Les Heures lentes', 1, 3],
  ['lettres-cote', 'Lettres de la côte', 0.4, 4],
  ['hiver-nara', 'Un hiver à Nara', 0, 5],
  ['atlas-brumes', 'Atlas des brumes', 0.85, 6],
  ['maison-lac', 'La Maison du lac', 0.07, 7],
  ['chemin-toits', 'Le Chemin des toits', 0.5, 8],
].map(([id, title, pct, age]) => ({ id, title, author: '', added: maintenant - age * jour * 3, opened: maintenant - age * jour, read: pct > 0 ? maintenant - age * jour : 0, pct, ch: '' }));

const PLANS = {
  // Une nuit dans le coin lecture, sur la feuille éclairée par la lampe.
  'coin-nuit': () => [
    graine({ settings: reglages({ scene: 'nook', weather: { nook: 'night' }, support: { '*': 'native' } }) }),
    { js: 'location.reload();' },
    attendre(2500, ambiance.js),
    attendre(3500, defile(0).js),
    attendre(6500),
    prise,
  ],
  // Le refuge alpin au crépuscule, texte dans la bulle.
  'alpes-bulle': () => [
    graine({ settings: reglages({ scene: 'alpes', weather: { alpes: 'sunset' }, support: { '*': 'bubble' }, bubble: { bg: 'glass', veil: 1 } }) }),
    { js: 'location.reload();' },
    attendre(2500, ambiance.js),
    attendre(3500, defile(260).js),
    souris(720, 300),
    attendre(2500),
    prise,
  ],
  // Les toits de Paris en plein jour, texte dans le livre relié.
  'paris-jour': () => [
    graine({ settings: reglages({ scene: 'paris', weather: { paris: 'sun' }, support: { '*': 'folio' } }) }),
    { js: 'location.reload();' },
    attendre(2500, ambiance.js),
    attendre(3500, tourne.js),
    attendre(2500, tourne.js),
    attendre(6000),
    prise,
  ],
  'fuji-jour': () => [
    graine({ settings: reglages({ scene: 'fuji', weather: { fuji: 'sun' }, support: { '*': 'frame' } }) }),
    { js: 'location.reload();' },
    attendre(2500, ambiance.js),
    attendre(3500, defile(120).js),
    attendre(6000),
    prise,
  ],
  // Le choix de la scène, ouvert sur la barre de l'ambiance : les douze scènes peintes.
  scenes: () => [
    graine({ settings: reglages({ scene: 'washitsu', weather: { washitsu: 'golden' }, support: { '*': 'easel' } }) }),
    { js: 'location.reload();' },
    attendre(2500, ambiance.js),
    attendre(3000, defile(0).js),
    souris(720, 300),
    attendre(1500, "document.getElementById('dkScene').click();"),
    attendre(2500),
    prise,
  ],
  // La bibliothèque : des livres posés sur la table de bois.
  bibliotheque: () => [
    graine({ settings: reglages({ scene: 'nook', weather: { nook: 'night' } }), library: livres }),
    { js: 'location.reload();' },
    attendre(2500, "document.getElementById('libBtn').click();"),
    attendre(3500),
    prise,
  ],
  // Le tiroir des réglages, ouvert sur une scène.
  reglages: () => [
    graine({ settings: reglages({ scene: 'hearth', weather: { hearth: 'night' }, support: { '*': 'native' } }) }),
    { js: 'location.reload();' },
    attendre(2500, ambiance.js),
    attendre(2500, "document.getElementById('ambSettings').click();"),
    attendre(3000),
    prise,
  ],
};

// Une scène seule, sans texte ni support (la galerie des douze scènes) : scene-<clé>[-<météo>].
const cache = { js: "for (const id of ['reader', 'sheet', 'airShade', 'sup', 'bubGL', 'bubSpW', 'drops']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }" };
const CLES = ['nook', 'hearth', 'forest', 'lake', 'snow', 'washitsu', 'fuji', 'onsen', 'plage', 'alpes', 'cote', 'paris'];
const METEOS = ['sun', 'clouds', 'golden', 'sunset', 'night', 'rain', 'storm'];
for (const k of CLES) for (const w of [''].concat(METEOS)) {
  PLANS['scene-' + k + (w ? '-' + w : '')] = () => [
    graine({ settings: reglages(Object.assign({ scene: k, support: { '*': 'none' } }, w ? { weather: { [k]: w } } : {})) }),
    { js: 'location.reload();' },
    attendre(2500, ambiance.js),
    attendre(3000, cache.js),
    attendre(5500),
    prise,
  ];
  // La même scène avec le texte sur le support conseillé pour elle (l'ouverture du site, qui suit l'heure) : heure-<clé>-<météo>.
  if (w) PLANS['heure-' + k + '-' + w] = () => [
    graine({ settings: reglages({ scene: k, weather: { [k]: w } }) }),
    { js: 'location.reload();' },
    attendre(2500, ambiance.js),
    attendre(3500, defile(0).js),
    attendre(6500),
    prise,
  ];
}

if (!PLANS[nom]) { console.error('capture inconnue : ' + nom + ' (' + Object.keys(PLANS).join(', ') + ')'); process.exit(1); }
console.log(JSON.stringify(PLANS[nom]()));
