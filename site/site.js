/* site.js : le peu de JavaScript du site.
   1. donne leur adresse aux boutons, d'après config.js (data-lien="…", data-texte="…", data-taille="…") ;
   2. propose la page seule (liseuse.html) à qui n'est pas sous Windows ;
   3. fait apparaître les blocs au défilement (l'effet d'ExigeLabs : un bloc monte de 20 px en 0,7 s, une seule fois) ;
   4. met l'image d'ouverture à l'heure du visiteur (soleil, heure dorée, coucher, lune, pluie) ;
   5. la lueur de la lampe qui suit la souris (une seule couche déplacée par transform : rien n'est repeint) ;
   6. la galerie des douze scènes, agrandie dans une visionneuse (flèches, Échap).
   Sans lui, la page se lit entière ; seuls les liens de téléchargement ont besoin de config.js. */
(function () {
  'use strict';
  var C = window.LISEUSE || { liens: {}, tailles: {} };
  var tous = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  /* 1. les adresses */
  tous('[data-lien]').forEach(function (a) {
    var u = C.liens && C.liens[a.getAttribute('data-lien')];
    if (u) a.setAttribute('href', u);
  });
  tous('[data-taille]').forEach(function (el) {
    var t = C.tailles && C.tailles[el.getAttribute('data-taille')];
    if (t) { el.textContent = ' · ' + t; el.hidden = false; }
  });
  tous('[data-texte]').forEach(function (el) {
    var t = C[el.getAttribute('data-texte')];
    if (t) el.textContent = t;
  });

  /* 2. un autre système que Windows */
  var sys = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  if (sys && !/win/i.test(sys) && !/Windows/.test(navigator.userAgent)) {
    tous('.autre-os').forEach(function (el) { el.hidden = false; });
  }

  var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 4. l'heure : la même scène à plusieurs moments, en fondu ; au départ, le moment de la journée du visiteur */
  (function () {
    var fig = document.querySelector('[data-heures]');
    if (!fig) return;
    var imgs = Array.prototype.slice.call(fig.querySelectorAll('img[data-meteo]'));
    var boutons = Array.prototype.slice.call(fig.querySelectorAll('button[data-meteo]'));
    var dit = fig.querySelector('[data-heure-dite]');
    var mo = fig.querySelector('.moments');
    if (mo) mo.hidden = false;
    var h = new Date().getHours();
    var depart = h >= 7 && h < 16 ? 'sun' : h >= 16 && h < 18 ? 'golden' : h >= 18 && h < 21 ? 'sunset' : 'night';
    var cur = null, tourne = null, touche = false;
    function charger(img) { if (!img.getAttribute('src') && img.getAttribute('data-src')) { img.srcset = img.getAttribute('data-srcset') || ''; img.src = img.getAttribute('data-src'); } }
    function choisir(m, doux) {
      if (m === cur) return;
      cur = m;
      imgs.forEach(function (img) {
        var oui = img.getAttribute('data-meteo') === m;
        if (oui) charger(img);
        img.classList.toggle('vue', oui);
        img.classList.toggle('sans-fondu', !doux);
      });
      boutons.forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-meteo') === m ? 'true' : 'false'); b.tabIndex = b.getAttribute('data-meteo') === m ? 0 : -1; });
    }
    if (dit) {
      var noms = { sun: 'en plein soleil', golden: 'à l’heure dorée', sunset: 'au coucher du soleil', night: 'sous la lune' };
      dit.textContent = 'Il est ' + h + ' h chez toi : la scène est ' + noms[depart] + '.';
      dit.hidden = false;
    }
    choisir(depart, false);
    /* une fois la scène changée, la phrase ne parle plus de l'heure du visiteur */
    function suivre() { if (dit) dit.textContent = 'Dans la liseuse, la scène suit ton heure, ou celle que tu choisis.'; }
    boutons.forEach(function (b, i) {
      b.addEventListener('click', function () { touche = true; arreter(); choisir(b.getAttribute('data-meteo'), true); suivre(); });
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = boutons[(i + d + boutons.length) % boutons.length];
        n.focus(); n.click();
      });
    });
    /* les autres moments se chargent quand la page est prête, puis la scène avance seule, lentement, tant que personne
       n'a choisi et qu'elle est à l'écran */
    window.addEventListener('load', function () { setTimeout(function () { imgs.forEach(charger); }, 600); });
    if (reduit) return;
    function arreter() { if (tourne) { clearInterval(tourne); tourne = null; } }
    function lancer() {
      if (touche || tourne) return;
      tourne = setInterval(function () {
        var ordre = boutons.map(function (b) { return b.getAttribute('data-meteo'); });
        choisir(ordre[(ordre.indexOf(cur) + 1) % ordre.length], true); suivre();
      }, 5200);
    }
    fig.addEventListener('pointerenter', arreter);
    fig.addEventListener('pointerleave', function () { if (!touche) setTimeout(lancer, 1200); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { if (e[0].isIntersecting) setTimeout(lancer, 3800); else arreter(); }, { threshold: 0.35 }).observe(fig);
    }
  })();

  /* 5. la lueur : un halo ambré qui suit la souris avec un peu de retard, et s'arrête quand il a rejoint le pointeur */
  (function () {
    var fin = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fin || reduit) return;
    var l = document.createElement('div');
    l.className = 'lueur'; l.setAttribute('aria-hidden', 'true');
    document.body.appendChild(l);
    var x = innerWidth * 0.7, y = innerHeight * 0.3, tx = x, ty = y, enCours = false;
    function pas() {
      x += (tx - x) * 0.12; y += (ty - y) * 0.12;
      l.style.transform = 'translate3d(' + (x - 450).toFixed(1) + 'px,' + (y - 450).toFixed(1) + 'px,0)';
      if (Math.abs(tx - x) + Math.abs(ty - y) > 0.5) requestAnimationFrame(pas); else enCours = false;
    }
    window.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY;
      l.classList.add('allumee');
      if (!enCours) { enCours = true; requestAnimationFrame(pas); }
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { l.classList.remove('allumee'); });
    pas();
  })();

  /* 6. la galerie : une vignette ouvre la scène en grand */
  (function () {
    var v = document.querySelector('.visionneuse');
    var vignettes = Array.prototype.slice.call(document.querySelectorAll('.vignette'));
    if (!v || !vignettes.length || typeof v.showModal !== 'function') return;
    var img = v.querySelector('img'), nom = v.querySelector('.nom'), i = 0, retour = null;
    function montrer(n) {
      i = (n + vignettes.length) % vignettes.length;
      var b = vignettes[i], petite = b.querySelector('img');
      img.src = b.getAttribute('data-grand');
      img.alt = petite.alt;
      var t = b.querySelector('.n'), m = t.querySelector('small');
      nom.textContent = t.firstChild.textContent.trim();
      v.querySelector('.rang').textContent = (m ? m.textContent + ' · ' : '') + (i + 1) + '\u00a0/\u00a0' + vignettes.length;
    }
    vignettes.forEach(function (b, n) { b.addEventListener('click', function () { retour = b; montrer(n); v.showModal(); }); });
    v.querySelector('.prec').addEventListener('click', function () { montrer(i - 1); });
    v.querySelector('.suiv').addEventListener('click', function () { montrer(i + 1); });
    v.querySelector('.fermer').addEventListener('click', function () { v.close(); });
    v.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); montrer(i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); montrer(i - 1); }
    });
    /* un clic sur le fond (hors de l'image et des boutons) ferme */
    v.addEventListener('click', function (e) { if (e.target === v) v.close(); });
    v.addEventListener('close', function () { if (retour) retour.focus(); });
  })();

  /* 3. l'apparition */
  var blocs = tous('[data-apparition]');
  function montrer(el) { el.classList.remove('attente'); el.classList.add('apparu'); }
  window.Apparition = { toutMontrer: function () { blocs.forEach(montrer); } };
  if (!blocs.length || reduit || !('IntersectionObserver' in window)) return;
  blocs.forEach(function (el) { el.classList.add('attente'); });
  var obs = new IntersectionObserver(function (entrees) {
    entrees.forEach(function (e) { if (e.isIntersecting) { montrer(e.target); obs.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
  blocs.forEach(function (el) { obs.observe(el); });
  /* un saut par ancre ou un retour en arrière : rien ne reste en attente au-dessus de l'écran */
  function dessus() { blocs.forEach(function (el) { if (el.getBoundingClientRect().bottom < 0) { montrer(el); obs.unobserve(el); } }); }
  window.addEventListener('pageshow', dessus);
  window.addEventListener('hashchange', dessus);
})();
