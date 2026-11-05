/* ---------------- opening documents ----------------
   Every file the reader takes, turned into the book's blocks: {type: 'h', level, text}, {type: 'p', text, center?},
   {type: 'sep', text}. PDF (its text, or its scanned pages read by OCR), ePub, Word (.docx), OpenDocument (.odt), RTF,
   plain text, Markdown, HTML, FictionBook (.fb2), Kindle (.mobi, .azw3, without DRM), and pictures of pages (photos,
   scans, a .cbz of them). All of it runs in the browser. The OCR engine (Tesseract: about 3.7 MB with the French
   model) is fetched the first time a page needs it, then kept by the browser. */
const Importers = (() => {
  class ImportError extends Error {}
  const fail = (msg) => { throw new ImportError(msg); };

  /* ---- text ---- */
  const decoder = (enc, fatal = false) => { try { return new TextDecoder(enc, { fatal }); } catch { return new TextDecoder('utf-8'); } };
  // Bytes to text: a BOM decides, else the hint, else UTF-8 if it is valid, else Windows-1252 (old French .txt files).
  function decode(b, hint) {
    if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return decoder('utf-8').decode(b.subarray(3));
    if (b[0] === 0xff && b[1] === 0xfe) return decoder('utf-16le').decode(b.subarray(2));
    if (b[0] === 0xfe && b[1] === 0xff) return decoder('utf-16be').decode(b.subarray(2));
    const n = Math.min(b.length, 4000);
    let z0 = 0, z1 = 0;
    for (let i = 0; i < n; i++) if (!b[i]) (i & 1 ? z1++ : z0++);
    if (z1 > n * 0.3 && z0 < n * 0.02) return decoder('utf-16le').decode(b);
    if (z0 > n * 0.3 && z1 < n * 0.02) return decoder('utf-16be').decode(b);
    if (hint) { try { return decoder(hint, true).decode(b); } catch {} }
    try { return decoder('utf-8', true).decode(b); } catch { return decoder('windows-1252').decode(b); }
  }
  // Spaces folded, soft hyphens and zero-width marks gone; no-break spaces (French punctuation) kept.
  const clean = (s) => String(s || '').replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, '').replace(/[ \t\n\r\f\v\u2028\u2029]+/g, ' ').trim();
  const norm = (s) => clean(s).toLowerCase().normalize('NFD').replace(/[^\p{L}\p{N}]+/gu, '');
  const ornament = (t) => t.length <= 12 && !/[\p{L}\p{N}]/u.test(t);
  const CHAPTER = /^(chapitre|chapter|partie|part|livre|book|tome|prologue|épilogue|epilogue|introduction|préface|preface|avant-propos|postface|conclusion|annexe|appendix|acte|scène)\b/i;
  const ROMAN = /^[IVXLCDM]{1,7}\.?$/;
  const baseName = (name) => String(name || '').replace(/\.[a-z0-9]{1,8}$/i, '').replace(/\.fb2$/i, '').split(' -- ')[0].trim();

  // Last pass for every format. Headings carry a rank (1 = top); the chapters are the highest rank used at least twice,
  // anything above them counts as a chapter too, anything below is a section. Repeats of the title at the top go.
  function finish(raw, title, author, name) {
    raw = raw.filter((b) => b.type === 'sep' || clean(b.text));
    // no title in the file's own data: a first heading that is not a chapter is the title
    if (name != null && title === baseName(name) && raw[0] && raw[0].type === 'h' && !CHAPTER.test(clean(raw[0].text)) && !ROMAN.test(clean(raw[0].text)) && raw.some((b, i) => i && b.type === 'h')) {
      title = clean(raw.shift().text);
      // and a short line between it and the first heading: the author
      const a = raw[0] && clean(raw[0].text);
      if (!author && raw[0].type === 'p' && raw[1] && raw[1].type === 'h' && a.length < 60 && !/[.!?:;,]$/.test(a)) { author = a; raw.shift(); }
    }
    const counts = new Map();
    for (const b of raw) if (b.type === 'h') counts.set(b.rank, (counts.get(b.rank) || 0) + 1);
    const ranks = [...counts.keys()].filter((r) => r > 0).sort((a, b) => a - b);
    const chap = ranks.find((r) => counts.get(r) >= 2) ?? ranks[0] ?? 0;
    const out = [];
    for (const b of raw) {
      const text = clean(String(b.text || '').replace(/\s*↩[\ufe0e\ufe0f]?/g, ''));
      if (!text) continue;
      if (b.type === 'sep' || (b.type === 'p' && ornament(text))) {
        if (out.length && out[out.length - 1].type !== 'sep') out.push({ type: 'sep', text: b.type === 'sep' && text !== '*' ? text : '* * *' });
        continue;
      }
      if (b.type === 'h' && text.length <= 200) out.push({ type: 'h', level: b.rank <= chap ? 1 : 2, text });
      else out.push(b.center ? { type: 'p', text, center: true } : { type: 'p', text });
    }
    while (out.length && out[out.length - 1].type === 'sep') out.pop();
    const t = norm(title), a = norm(author);
    for (let i = 0; i < Math.min(out.length, 6); i++) {
      const n = norm(out[i].text);
      if (out[i].type === 'p' && out[i].text.length > 80) break;
      if (n && (n === t || n === a)) { out.splice(i, 1); i--; }
    }
    return { title, author, blocks: out };
  }
  // note calls, as superscript figures
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n) => String(n).replace(/\d/g, (d) => SUP[d]).replace(/[^⁰¹²³⁴⁵⁶⁷⁸⁹*†‡§]/g, '');

  /* ---- zip (ePub, Word, OpenDocument, .cbz), with the browser's own inflate ---- */
  async function inflate(data) {
    const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  function unzip(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let e = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) fail("Ce fichier est abîmé ou incomplet.");
    let n = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true);
    if ((p === 0xffffffff || n === 0xffff) && e >= 20 && dv.getUint32(e - 20, true) === 0x07064b50) {
      const z = Number(dv.getBigUint64(e - 12, true));
      if (dv.getUint32(z, true) === 0x06064b50) { n = Number(dv.getBigUint64(z + 32, true)); p = Number(dv.getBigUint64(z + 48, true)); }
    }
    const files = new Map(), lower = new Map(), utf8 = decoder('utf-8');
    for (let k = 0; k < n && p + 46 <= b.length && dv.getUint32(p, true) === 0x02014b50; k++) {
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
      let csize = dv.getUint32(p + 20, true), off = dv.getUint32(p + 42, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const name = utf8.decode(b.subarray(p + 46, p + 46 + nl));
      // ZIP64 sizes and offset, in the extra field, for entries past 4 GB markers
      for (let x = p + 46 + nl, end = x + xl; x + 4 <= end;) {
        const id = dv.getUint16(x, true), sz = dv.getUint16(x + 2, true);
        if (id === 1) { let q = x + 4; if (dv.getUint32(p + 24, true) === 0xffffffff) q += 8; if (csize === 0xffffffff) { csize = Number(dv.getBigUint64(q, true)); q += 8; } if (off === 0xffffffff) off = Number(dv.getBigUint64(q, true)); }
        x += 4 + sz;
      }
      if (!name.endsWith('/')) { files.set(name, { flags, method, csize, off }); lower.set(name.toLowerCase(), name); }
      p += 46 + nl + xl + cl;
    }
    const find = (name) => (files.has(name) ? name : lower.get(String(name).toLowerCase()));
    async function get(name) {
      const f = files.get(find(name));
      if (!f) return null;
      if (f.flags & 1) fail('Ce fichier est protégé par un mot de passe.');
      const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const data = b.subarray(start, start + f.csize);
      if (f.method === 0) return data;
      if (f.method === 8) return inflate(data);
      fail("Ce fichier utilise une compression qui ne se lit pas ici.");
    }
    return { names: [...files.keys()], has: (name) => !!find(name), get, text: async (name, hint) => { const d = await get(name); return d ? decode(d, hint) : null; } };
  }

  /* ---- XML and HTML ---- */
  function parseXml(s) {
    if (!s) return null;
    const d = new DOMParser().parseFromString(s, 'application/xml');
    return d.getElementsByTagName('parsererror').length ? null : d;
  }
  // XHTML when it parses as such, HTML otherwise (named entities, loose tags).
  function parseHtml(s, xhtml) {
    if (xhtml) { const d = new DOMParser().parseFromString(s, 'application/xhtml+xml'); if (!d.getElementsByTagName('parsererror').length && d.documentElement) return d; }
    return new DOMParser().parseFromString(s, 'text/html');
  }
  const kids = (el, name) => (el ? [...el.children].filter((c) => c.localName === name) : []);
  const kid = (el, name) => (el ? [...el.children].find((c) => c.localName === name) : null);
  const attr = (el, local) => { if (el) for (const a of el.attributes) if (a.localName === local) return a.value; return null; };
  const byTag = (d, name) => (d ? [...d.getElementsByTagNameNS('*', name)] : []);

  const BLOCKS = new Set('address article aside blockquote body caption center dd details div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main ol p pre section summary table tbody td tfoot th thead tr ul'.split(' '));
  const SKIP = new Set('area audio button canvas head iframe img map math nav noscript object picture rp rt script select style svg template textarea title video'.split(' '));
  const kindOf = (el) => (el.getAttribute('epub:type') || '') + ' ' + (el.getAttribute('role') || '') + ' ' + (el.getAttribute('class') || '');
  // Note calls (a raised 3, a starred link): 'call', kept as a superscript figure. Links back from the notes: 'back', left out.
  function noteRef(el) {
    const t = el.localName, k = kindOf(el), s = el.textContent.trim();
    if (/backlink|footnote-back|fn-back/i.test(k) || (t === 'a' && /^↩/.test(s))) return 'back';
    const mark = /^[[(]?(\d{1,3}|[*†‡§]{1,3})[\])]?$/.test(s);
    if (/noteref|footnote-ref|fnref/i.test(k)) return mark ? 'call' : 'back';
    if ((t !== 'sup' && t !== 'a') || !mark) return false;
    return t === 'sup' || el.closest('sup') || /#/.test(el.getAttribute('href') || '') ? 'call' : false;
  }
  const footBody = (el) => el.localName === 'aside' && /footnote|rearnote|endnote/.test(kindOf(el));
  const notesBox = (el) => /footnotes|endnotes|rearnotes/.test(kindOf(el));
  const hidden = (el) => el.hasAttribute('hidden') || /display\s*:\s*none/i.test(el.getAttribute('style') || '');

  // Paragraphs and headings of an HTML body. Text runs between block elements are paragraphs; a <br> starts a new one
  // (verse keeps its lines); list items get a bullet. ctx.centered: classes the style sheets centre; ctx.targets: ids the
  // table of contents points to (a heading goes there, see marks()).
  function htmlBlocks(root, ctx = {}) {
    const out = [], centered = ctx.centered || new Set(), targets = ctx.targets;
    let buf = '', prefix = '';
    const flush = (center) => {
      const t = clean(buf); buf = '';
      if (!t) return;
      out.push(center ? { type: 'p', text: prefix + t, center: true } : { type: 'p', text: prefix + t });
      prefix = '';
    };
    const isCentered = (el) => el.localName === 'center' || el.getAttribute('align') === 'center' || /text-align\s*:\s*center/i.test(el.getAttribute('style') || '') || [...el.classList].some((c) => centered.has(c));
    function inline(el) {
      let s = '';
      (function rec(n) {
        for (let c = n.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 3 || c.nodeType === 4) s += c.data;
          else if (c.nodeType === 1) {
            const t = c.localName.toLowerCase();
            if (SKIP.has(t) || hidden(c)) continue;
            const r = noteRef(c);
            if (r) { if (r === 'call') s += sup(c.textContent.trim()); continue; }
            if (t === 'br') { s += ' '; continue; }
            rec(c);
            if (BLOCKS.has(t)) s += ' ';
          }
        }
      })(el);
      return clean(s);
    }
    function walk(node, center, inNotes) {
      for (let n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3 || n.nodeType === 4) { buf += n.data; continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.localName.toLowerCase();
        if (SKIP.has(tag) || hidden(n)) continue;
        const ref = noteRef(n);
        if (ref) { if (ref === 'call') buf += sup(n.textContent.trim()); continue; }
        const notes = inNotes || notesBox(n);
        if (footBody(n)) { flush(center); const num = /(\d+)\D*$/.exec(n.id || ''); prefix = num ? sup(num[1]) + ' ' : ''; walk(n, center, true); flush(center); continue; }
        const target = targets && n.id && targets.get(n.id);
        if (target) { flush(center); out.push({ type: 'mark', label: target.label, depth: target.depth }); }
        if (tag === 'br') { flush(center); continue; }
        if (tag === 'hr') { flush(center); if (!notes) out.push({ type: 'sep', text: '* * *' }); continue; }
        const h = /^h([1-6])$/.exec(tag);
        if (h) { flush(center); const t = inline(n); if (t) out.push({ type: 'h', rank: +h[1], text: t }); continue; }
        if (BLOCKS.has(tag)) {
          flush(center);
          const c = center || isCentered(n);
          if (tag === 'li') {
            const p = n.parentElement, k = p && p.localName === 'ol' ? +(p.getAttribute('start') || 1) + kids(p, 'li').indexOf(n) : 0;
            prefix = !k ? '• ' : notes ? sup(k) + ' ' : k + '. ';
          }
          if (tag === 'pre') { for (const line of n.textContent.split('\n')) { buf = line; flush(c); } continue; }
          walk(n, c, notes); flush(c);
          continue;
        }
        walk(n, center, inNotes);
      }
    }
    walk(root, false, false); flush(false);
    return out;
  }
  // Where the table of contents points at an element that is not a heading, the entry's label becomes the heading
  // (or the paragraph there is promoted, when it already says it). start: the entry for the top of the file.
  function marks(blocks, start) {
    const out = [];
    const put = (label, depth, next) => {
      if (next && next.type === 'h') return;
      if (next && next.type === 'p' && norm(next.text) === norm(label)) { next.type = 'h'; next.rank = depth + 1; delete next.center; return; }
      out.push({ type: 'h', rank: depth + 1, text: label });
    };
    const real = blocks.filter((b) => b.type !== 'mark');
    if (start && real.length) put(start.label, start.depth, real[0]);
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.type === 'mark') { let j = i + 1; while (blocks[j] && blocks[j].type === 'mark') j++; if (blocks[j]) put(b.label, b.depth, blocks[j]); continue; }
      out.push(b);
    }
    return out;
  }
  // Classes whose rule centres the text, from the style sheets.
  function centeredClasses(css, into) {
    for (const m of String(css).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/text-align\s*:\s*center/i.test(m[2])) continue;
      for (const sel of m[1].split(',')) { const c = /^\s*[a-z0-9]*\.([\w-]+)\s*$/i.exec(sel); if (c) into.add(c[1]); }
    }
    return into;
  }
  const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');
  function resolve(base, rel) {
    let r = String(rel || '');
    try { r = decodeURIComponent(r); } catch {}
    const out = [];
    for (const p of (r.startsWith('/') ? r.slice(1) : base + r).split('/')) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
    return out.join('/');
  }

  /* ---- ePub ---- */
  async function epub(zip, name, ctx) {
    if (zip.has('META-INF/rights.xml') || zip.has('META-INF/license.lcpl')) fail('Ce livre est protégé contre la copie (DRM) : il ne peut pas s’ouvrir ici.');
    const enc = await zip.text('META-INF/encryption.xml');
    // only font obfuscation is allowed: anything else enciphered is DRM
    if (enc && byTag(parseXml(enc), 'EncryptionMethod').some((m) => !/idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC/.test(m.getAttribute('Algorithm') || ''))) fail('Ce livre est protégé contre la copie (DRM) : il ne peut pas s’ouvrir ici.');
    const cont = parseXml(await zip.text('META-INF/container.xml'));
    let opfPath = attr(byTag(cont, 'rootfile')[0], 'full-path');
    if (!opfPath || !zip.has(opfPath)) opfPath = zip.names.find((n) => /\.opf$/i.test(n));
    const opf = opfPath && parseXml(await zip.text(opfPath));
    if (!opf) fail("Ce fichier ePub est incomplet : sa table des fichiers manque.");
    const base = dirOf(opfPath);
    const meta = (tag) => byTag(opf, tag).filter((e) => e.closest && byTag(opf, 'metadata').some((m) => m.contains(e))).map((e) => clean(e.textContent)).filter(Boolean);
    const title = meta('title')[0] || baseName(name), author = meta('creator').join(', ');
    const items = new Map();
    for (const it of byTag(opf, 'item')) items.set(it.getAttribute('id'), { href: resolve(base, it.getAttribute('href')), type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' });
    const spineEl = byTag(opf, 'spine')[0];
    const spine = byTag(opf, 'itemref').filter((r) => r.getAttribute('linear') !== 'no').map((r) => items.get(r.getAttribute('idref')))
      .filter((it) => it && /html|xml/.test(it.type) && !/\bnav\b/.test(it.props));
    const toc = await epubToc(zip, items, spineEl);
    const centered = new Set();
    for (const it of items.values()) if (/css/.test(it.type)) centeredClasses(await zip.text(it.href) || '', centered);
    const raw = [];
    for (let k = 0; k < spine.length; k++) {
      const it = spine[k], src = await zip.text(it.href);
      if (src) {
        const doc = parseHtml(src, true);
        for (const st of doc.getElementsByTagName('style')) centeredClasses(st.textContent, centered);
        const here = toc.filter((t) => t.file === it.href);
        const targets = new Map(here.filter((t) => t.frag).map((t) => [t.frag, t]));
        raw.push(...marks(htmlBlocks(doc.body || doc.documentElement, { centered, targets }), here.find((t) => !t.frag)));
      }
      ctx.progress((k + 1) / spine.length);
    }
    const out = finish(raw, title, author, name);
    // its cover picture, when it names one (ePub 3: properties="cover-image"; ePub 2: <meta name="cover" content=id>)
    try {
      let cov = [...items.values()].find((it) => /(^|\s)cover-image(\s|$)/.test(it.props));
      if (!cov) { const m = byTag(opf, 'meta').find((x) => x.getAttribute('name') === 'cover'), c = m && m.getAttribute('content'); cov = c && (items.get(c) || [...items.values()].find((it) => it.href === resolve(base, c))); } // (some name the file, not its id)
      const d = cov && /^image\/(jpe?g|png|gif|webp)$/i.test(cov.type) && (await zip.get(cov.href));
      if (d && d.length > 200 && d.length < 12e6) out.cover = { data: d.slice(), type: cov.type.toLowerCase().replace(/jpg$/, 'jpeg') };
    } catch {}
    return out;
  }
  // The table of contents: the ePub 3 nav, else the ePub 2 NCX. [{file, frag, label, depth}]
  async function epubToc(zip, items, spineEl) {
    const out = [];
    const push = (from, href, label, depth) => {
      if (!label || !href) return;
      const [f, frag = ''] = href.split('#');
      let fr = frag; try { fr = decodeURIComponent(frag); } catch {}
      const file = f ? resolve(dirOf(from), f) : from;
      if (!fr && out.some((t) => t.file === file && !t.frag)) return;
      out.push({ file, frag: fr, label: clean(label), depth });
    };
    const nav = [...items.values()].find((it) => /\bnav\b/.test(it.props));
    if (nav) {
      const d = parseHtml(await zip.text(nav.href) || '', true);
      const navs = [...d.getElementsByTagName('nav')];
      const el = navs.find((n) => /toc/.test(n.getAttribute('epub:type') || '') || n.getAttribute('role') === 'doc-toc') || navs[0];
      const rec = (ol, depth) => {
        for (const li of kids(ol, 'li')) {
          const a = kid(li, 'a') || kid(li, 'span');
          if (a) push(nav.href, a.getAttribute('href'), a.textContent, depth);
          const sub = kid(li, 'ol');
          if (sub) rec(sub, depth + 1);
        }
      };
      const ol = el && (kid(el, 'ol') || el.getElementsByTagName('ol')[0]);
      if (ol) rec(ol, 0);
    }
    if (!out.length) {
      const id = spineEl && spineEl.getAttribute('toc');
      const ncx = (id && items.get(id)) || [...items.values()].find((it) => /dtbncx/.test(it.type));
      const d = ncx && parseXml(await zip.text(ncx.href));
      const rec = (el, depth) => {
        for (const np of kids(el, 'navPoint')) {
          const lab = byTag(kid(np, 'navLabel'), 'text')[0];
          push(ncx.href, attr(kid(np, 'content'), 'src'), lab ? lab.textContent : '', depth);
          rec(np, depth + 1);
        }
      };
      const map = byTag(d, 'navMap')[0];
      if (map) rec(map, 0);
    }
    return out;
  }

  // Heading ranks from style names, in several languages: "heading 2", "Titre 2", "Title".
  function styleRank(name) {
    const n = String(name || '').replace(/[_\s]+|_20_/g, ' ').trim();
    let m = /^(?:heading|titre|título|titolo|überschrift|kop|rubrik|nagłówek)\s*(\d)$/i.exec(n);
    if (m) return +m[1];
    if (/^(title|titre|titel|título|titolo)$/i.test(n)) return 0;
    return null;
  }
  const subtitle = (name) => /^(subtitle|sous[- ]titre|untertitel|subtítulo|sottotitolo)$/i.test(String(name || '').replace(/_20_/g, ' ').trim());

  // Without heading styles (a document formatted by hand): short paragraphs in type clearly larger than the body's.
  function sizeHeads(raw) {
    if (raw.some((b) => b.type === 'h')) return;
    const w = new Map(); for (const b of raw) if (b.fs) w.set(b.fs, (w.get(b.fs) || 0) + b.text.length);
    const body = [...w].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!body) return;
    for (const b of raw) if (b.type === 'p' && b.fs >= body * 1.2 && b.text.length < 140 && b.one !== false && !/^[•\d]/.test(b.text)) { b.type = 'h'; b.rank = b.fs >= body * 1.6 ? 1 : 2; }
  }
  /* ---- Word (.docx) ---- */
  async function docx(zip, name) {
    const doc = parseXml(await zip.text('word/document.xml'));
    if (!doc) fail("Ce document Word n’a pas pu être lu.");
    const styles = new Map();
    for (const s of byTag(parseXml(await zip.text('word/styles.xml')), 'style')) {
      if (attr(s, 'type') !== 'paragraph') continue;
      const pPr = kid(s, 'pPr');
      styles.set(attr(s, 'styleId'), { name: attr(kid(s, 'name'), 'val') || '', based: attr(kid(s, 'basedOn'), 'val'), outline: attr(kid(pPr, 'outlineLvl'), 'val'), jc: attr(kid(pPr, 'jc'), 'val') });
    }
    const chain = (id) => { const out = []; for (let s = styles.get(id), k = 0; s && k < 12; s = styles.get(s.based), k++) out.push(s); return out; };
    // the notes, by id, and the text sizes the document starts from
    const notes = new Map();
    for (const f of ['word/footnotes.xml', 'word/endnotes.xml']) for (const n of byTag(parseXml(await zip.text(f)), 'footnote').concat(byTag(parseXml(await zip.text(f)), 'endnote'))) {
      const id = attr(n, 'id'); if (+id > 0) notes.set(f[5] + id, kids(n, 'p').map((p) => runs(p).join(' ')).filter(Boolean).join(' '));
    }
    const stylesDoc = parseXml(await zip.text('word/styles.xml'));
    const szDefault = +attr(byTag(byTag(stylesDoc, 'rPrDefault')[0], 'sz')[0], 'val') || 22;
    const pSize = new Map();
    for (const s of byTag(stylesDoc, 'style')) { const sz = attr(kid(kid(s, 'rPr'), 'sz'), 'val'); if (sz) pSize.set(attr(s, 'styleId'), +sz); }
    let calls = 0, pending = [];
    const core = parseXml(await zip.text('docProps/core.xml'));
    const title = clean(byTag(core, 'title')[0]?.textContent) || baseName(name), author = clean(byTag(core, 'creator')[0]?.textContent);
    const raw = [];
    // text of a paragraph, cut at its line breaks
    function runs(p, sizes, base) {
      const segs = [''];
      (function rec(el, sz, up) {
        for (const c of el.children) {
          const n = c.localName;
          if (n === 'r') { const rp = kid(c, 'rPr'), v = attr(kid(rp, 'sz'), 'val'); rec(c, v ? +v : sz, attr(kid(rp, 'vertAlign'), 'val') === 'superscript'); continue; }
          if (n === 't') { const t = up && /^\s*\d{1,3}\s*$/.test(c.textContent) ? sup(c.textContent.trim()) : c.textContent; segs[segs.length - 1] += t; if (sizes) sizes.set(sz, (sizes.get(sz) || 0) + t.length); }
          else if ((n === 'footnoteReference' || n === 'endnoteReference') && sizes) {
            const t = notes.get((n[0] === 'f' ? 'f' : 'e') + attr(c, 'id'));
            if (t) { calls++; segs[segs.length - 1] += sup(calls); pending.push(sup(calls) + ' ' + t); }
          }
          else if (n === 'tab' || n === 'ptab') segs[segs.length - 1] += ' ';
          else if (n === 'br' || n === 'cr') { if (/page|column/.test(attr(c, 'type') || '')) segs[segs.length - 1] += ' '; else segs.push(''); }
          else if (n === 'noBreakHyphen') segs[segs.length - 1] += '-';
          else if (!/^(del|moveFrom|delText|instrText|pPr|rPr|footnoteReference|endnoteReference|commentReference|txbxContent|drawing|pict|object|fldData)$/.test(n)) rec(c, sz, up);
        }
      })(p, base);
      return segs.map(clean).filter(Boolean);
    }
    function para(p) {
      const pPr = kid(p, 'pPr'), sid = attr(kid(pPr, 'pStyle'), 'val'), ch = chain(sid);
      const outline = attr(kid(pPr, 'outlineLvl'), 'val') ?? ch.map((s) => s.outline).find((v) => v != null);
      const jc = attr(kid(pPr, 'jc'), 'val') ?? ch.map((s) => s.jc).find((v) => v != null);
      let rank = null;
      for (const s of ch) { rank = styleRank(s.name); if (rank != null) break; }
      if (rank == null) rank = styleRank(sid);
      if (rank == null && outline != null && +outline < 9) rank = +outline + 1;
      const sizes = new Map(), base = [sid, ...ch.map((s) => s.based)].map((id) => pSize.get(id)).find((v) => v) || szDefault;
      const psz = attr(kid(kid(pPr, 'rPr'), 'sz'), 'val');
      const segs = runs(p, sizes, base);
      const flushNotes = () => { for (const t of pending) raw.push({ type: 'p', text: t }); pending = []; };
      if (!segs.length) {
        // a horizontal rule drawn as a paragraph (Word's own, or a "Horizontal Line" style)
        if (byTag(p, '*').some((e) => attr(e, 'hr') === 't') || ch.some((s) => /horizontal ?line/i.test(s.name))) raw.push({ type: 'sep', text: '* * *' });
        return;
      }
      if (rank != null) { raw.push({ type: 'h', rank, text: segs.join(' ') }); flushNotes(); return; }
      let fs = 0, best = -1; for (const [k, v] of sizes) if (v > best) { best = v; fs = k; }
      const center = jc === 'center' || ch.some((s) => subtitle(s.name));
      const list = !!kid(pPr, 'numPr');
      for (const s of segs) raw.push({ type: 'p', text: (list ? '• ' : '') + s, center, fs: fs || +psz || base, one: segs.length === 1 });
      flushNotes();
    }
    (function walk(el) {
      for (const c of el.children) {
        const n = c.localName;
        if (n === 'p') para(c);
        else if (n === 'tbl') { for (const tr of kids(c, 'tr')) for (const tc of kids(tr, 'tc')) walk(tc); }
        else if (n === 'sdt') {
          // a table of contents generated by Word repeats the headings: left out
          if (byTag(kid(c, 'sdtPr'), 'docPartGallery').some((g) => /contents/i.test(attr(g, 'val') || ''))) continue;
          const sc = kid(c, 'sdtContent'); if (sc) walk(sc);
        } else if (/^(customXml|smartTag|ins|moveTo)$/.test(n)) walk(c);
      }
    })(byTag(doc, 'body')[0] || doc.documentElement);
    sizeHeads(raw);
    return finish(raw, title, author, name);
  }

  /* ---- OpenDocument (.odt) ---- */
  async function odt(zip, name) {
    const doc = parseXml(await zip.text('content.xml'));
    if (!doc) fail("Ce document OpenDocument n’a pas pu être lu.");
    const styles = new Map();
    for (const d of [parseXml(await zip.text('styles.xml')), doc]) for (const s of byTag(d, 'style')) {
      if (attr(s, 'family') !== 'paragraph') continue;
      const pp = kid(s, 'paragraph-properties');
      styles.set(attr(s, 'name'), { parent: attr(s, 'parent-style-name'), center: pp ? /center/.test(attr(pp, 'text-align') || '') || null : null, name: attr(s, 'display-name') || attr(s, 'name') });
    }
    const chain = (id) => { const out = []; for (let s = styles.get(id), k = 0; s && k < 12; s = styles.get(s.parent), k++) out.push(s); return out; };
    const meta = parseXml(await zip.text('meta.xml'));
    const title = clean(byTag(meta, 'title')[0]?.textContent) || baseName(name);
    const author = clean(byTag(meta, 'creator')[0]?.textContent || byTag(meta, 'initial-creator')[0]?.textContent);
    const raw = [];
    let prefix = '', calls = 0, pendingNotes = [];
    const notesOut = () => { for (const t of pendingNotes) raw.push({ type: 'p', text: t }); pendingNotes = []; };
    function segs(p) {
      const out = [''];
      (function rec(el) {
        for (let c = el.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 3) { out[out.length - 1] += c.data; continue; }
          if (c.nodeType !== 1) continue;
          const n = c.localName;
          if (n === 's' || n === 'tab') out[out.length - 1] += ' ';
          else if (n === 'line-break') out.push('');
          else if (n === 'note') {
            const body = kid(c, 'note-body'), t = body ? kids(body, 'p').map((q) => segs(q).join(' ')).join(' ') : '';
            if (t) { calls++; out[out.length - 1] += sup(calls); pendingNotes.push(sup(calls) + ' ' + t); }
          }
          else if (!/^(annotation|frame|ruby-text|tracked-changes|bookmark-ref|soft-page-break)$/.test(n)) rec(c);
        }
      })(p);
      return out.map(clean).filter(Boolean);
    }
    (function walk(el) {
      for (const c of el.children) {
        const n = c.localName;
        if (n === 'h') { const t = segs(c).join(' '); if (t) raw.push({ type: 'h', rank: +(attr(c, 'outline-level') || 1), text: t }); notesOut(); }
        else if (n === 'p') {
          const ch = chain(attr(c, 'style-name')), parts = segs(c);
          if (!parts.length) { if (ch.some((s) => /horizontal.?line/i.test(s.name))) raw.push({ type: 'sep', text: '* * *' }); continue; }
          let rank = null;
          for (const s of ch) { rank = styleRank(s.name); if (rank != null) break; }
          if (rank != null) { raw.push({ type: 'h', rank, text: parts.join(' ') }); prefix = ''; notesOut(); continue; }
          const center = !!(ch.map((s) => s.center).find((v) => v != null) || ch.some((s) => subtitle(s.name)));
          for (const s of parts) { raw.push({ type: 'p', text: prefix + s, center }); prefix = ''; }
          notesOut();
        } else if (n === 'list') { for (const li of kids(c, 'list-item')) { prefix = '• '; walk(li); } prefix = ''; }
        else if (/^(section|table|table-rows|table-row|table-cell|table-header-rows|list-header|deletion|change)$/.test(n) && n !== 'deletion') walk(c);
      }
    })(byTag(doc, 'text').find((t) => t.parentElement && t.parentElement.localName === 'body') || doc.documentElement);
    return finish(raw, title, author, name);
  }

  /* ---- FictionBook (.fb2) ---- */
  function fb2(src, name) {
    const d = parseXml(src);
    if (!d) fail("Ce fichier FictionBook n’a pas pu être lu.");
    const ti = byTag(d, 'title-info')[0];
    const title = clean(byTag(ti, 'book-title')[0]?.textContent) || baseName(name);
    const author = kids(ti, 'author').map((a) => clean(['first-name', 'middle-name', 'last-name'].map((k) => kid(a, k)?.textContent || '').join(' '))).filter(Boolean).join(', ');
    const raw = [];
    const text = (el) => { let s = ''; (function rec(n) { for (let c = n.firstChild; c; c = c.nextSibling) { if (c.nodeType === 3) s += c.data; else if (c.nodeType === 1) { if (c.localName === 'a' && /note/.test(attr(c, 'type') || '')) s += sup(c.textContent.replace(/\D/g, '') || '*'); else rec(c); } } })(el); return clean(s); };
    const walkFb2 = function sec(el, depth) {
      for (const c of el.children) {
        const n = c.localName;
        if (n === 'title') { const t = kids(c, 'p').map(text).join(' · ') || text(c); if (t) raw.push({ type: 'h', rank: depth, text: t }); }
        else if (n === 'section') sec(c, depth + 1);
        else if (n === 'p' || n === 'text-author') raw.push({ type: 'p', text: text(c) });
        else if (n === 'subtitle') raw.push({ type: 'p', text: text(c), center: true });
        else if (/^(epigraph|cite|annotation|poem|stanza)$/.test(n)) sec(c, depth);
        else if (n === 'v') raw.push({ type: 'p', text: text(c) });
        else if (n === 'table') for (const tr of kids(c, 'tr')) for (const td of [...tr.children]) raw.push({ type: 'p', text: text(td) });
      }
    };
    for (const body of byTag(d, 'body').filter((b) => !/notes|comments/.test(b.getAttribute('name') || ''))) walkFb2(body, 0);
    const notes = byTag(d, 'body').filter((b) => /notes/.test(b.getAttribute('name') || ''));
    for (const nb of notes) for (const sec of kids(nb, 'section')) {
      const num = clean(kid(sec, 'title')?.textContent).replace(/\D/g, ''), t = kids(sec, 'p').map(text).join(' ');
      if (t) raw.push({ type: 'p', text: (num ? sup(num) + ' ' : '') + t });
    }
    return finish(raw, title, author, name);
  }

  /* ---- RTF ---- */
  // A small reader: groups, control words, \'hh bytes in the document's code page, \uN characters. Headings come from
  // \outlinelevel, from heading style names, or from type clearly larger than the body's.
  function rtf(src, name) {
    const meta = {}, styleNames = new Map(), paras = [];
    const SKIPD = /^(fonttbl|colortbl|pict|object|header[lrf]?|footer[lrf]?|listtable|listoverridetable|rsidtbl|generator|xmlnstbl|themedata|colorschememapping|latentstyles|datastore|fldinst|footnote|annotation|atnid|atnauthor|filetbl|revtbl|pgdsctbl|background|shp|shpinst|nonshppict|mmathPr|docvar|xe|tc|template|bkmkstart|bkmkend|pn|pntext|listtext|expandedcolortbl|fchars|lchars|operator|company|category|comment|doccomm|keywords|subject|creatim|revtim|printim|buptim|hlinkbase|userprops|passwordhash|wgrffmtfilter|ftnsep|ftnsepc|aftnsep|aftnsepc)$/;
    let cp = 1252, s = { dest: 'text', uc: 1, fs: 24 }, i = 0, skipN = 0, bytes = [];
    const stack = [];
    let fresh = false, cur = { text: '', sizes: new Map(), outline: -1, center: false, style: -1 };
    const dec = () => decoder(cp === 65001 ? 'utf-8' : cp === 10000 ? 'macintosh' : cp >= 874 && cp <= 1258 ? 'windows-' + cp : 'windows-1252');
    const flushBytes = () => { if (bytes.length) { put(dec().decode(new Uint8Array(bytes)), true); bytes = []; } };
    function put(ch, decoded) {
      if (!decoded && bytes.length) flushBytes();
      if (s.dest === 'text') { if (s.up && /\d/.test(ch)) ch = sup(ch); cur.text += ch; if (ch.trim()) cur.sizes.set(s.fs, (cur.sizes.get(s.fs) || 0) + ch.length); }
      else if (s.dest === 'title' || s.dest === 'author') meta[s.dest] = (meta[s.dest] || '') + ch;
      else if (s.dest === 'style') s.styleText = (s.styleText || '') + ch;
    }
    function endPar() {
      flushBytes();
      const text = clean(cur.text);
      if (text) { let fs = 0, best = -1; for (const [k, v] of cur.sizes) if (v > best) { best = v; fs = k; } paras.push({ text, fs, outline: cur.outline, center: cur.center, style: cur.style }); }
      cur = { text: '', sizes: new Map(), outline: cur.outline, center: cur.center, style: cur.style };
    }
    const CH = { tab: ' ', emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', bullet: '•', emspace: ' ', enspace: ' ', qmspace: ' ' };
    while (i < src.length) {
      const c = src[i];
      if (c === '{') { flushBytes(); stack.push(s); s = { ...s }; fresh = true; i++; continue; }
      if (c === '}') {
        flushBytes();
        if (s.dest === 'style' && s.styleNum != null) styleNames.set(s.styleNum, clean(s.styleText).replace(/;$/, ''));
        s = stack.pop() || s; fresh = false; i++; continue;
      }
      if (c === '\\') {
        const n = src[i + 1];
        if (/[a-zA-Z]/.test(n || '')) {
          let j = i + 1; while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
          const word = src.slice(i + 1, j);
          let k = j; if (src[k] === '-') k++; while (k < src.length && /\d/.test(src[k])) k++;
          const param = k > j ? parseInt(src.slice(j, k), 10) : null;
          if (src[k] === ' ') k++;
          i = k;
          const first = fresh; fresh = false;
          if (first) {
            if (SKIPD.test(word)) { s.dest = 'skip'; continue; }
            if (word === 'stylesheet') { s.dest = 'stylesheet'; continue; }
            if (word === 'info') { s.dest = 'info'; continue; }
            if (s.dest === 'info') { s.dest = word === 'title' || word === 'author' ? word : 'skip'; continue; }
            if (s.dest === 'stylesheet') s.dest = 'style';
          }
          if (s.dest === 'skip') continue;
          if (word === 'par' || word === 'line' || word === 'sect' || word === 'page' || word === 'cell' || word === 'row') { if (s.dest === 'text') endPar(); }
          else if (word === 'pard') { cur.outline = -1; cur.center = false; cur.style = -1; }
          else if (word === 'qc') cur.center = true;
          else if (word === 'ql' || word === 'qr' || word === 'qj') cur.center = false;
          else if (word === 's') { if (s.dest === 'style') s.styleNum = param; else cur.style = param; }
          else if (word === 'outlinelevel') cur.outline = param;
          else if (word === 'fs') s.fs = param;
          else if (word === 'plain') { s.fs = 24; s.up = false; }
          else if (word === 'super') s.up = true;
          else if (word === 'nosupersub' || word === 'sub') s.up = false;
          else if (word === 'u') { put(String.fromCharCode(param < 0 ? param + 65536 : param)); skipN = s.uc; }
          else if (word === 'uc') s.uc = param;
          else if (word === 'ansicpg') cp = param;
          else if (word === 'mac') cp = 10000;
          else if (CH[word]) put(CH[word]);
          continue;
        }
        if (n === "'") {
          const v = parseInt(src.substr(i + 2, 2), 16); i += 4;
          if (skipN > 0) { skipN--; continue; }
          if (s.dest !== 'skip' && s.dest !== 'stylesheet' && s.dest !== 'info') bytes.push(v);
          continue;
        }
        i += 2; fresh = false;
        if (n === '*') { s.dest = 'skip'; continue; }
        if (s.dest === 'skip') continue;
        if (n === '~') put('\u00a0');
        else if (n === '_') put('-');
        else if (n === '\\' || n === '{' || n === '}') put(n);
        else if (n === '\n' || n === '\r') { if (s.dest === 'text') endPar(); }
        continue;
      }
      i++;
      if (c === '\n' || c === '\r') continue;
      fresh = false;
      if (skipN > 0) { skipN--; continue; }
      if (s.dest === 'skip' || s.dest === 'stylesheet' || s.dest === 'info') continue;
      put(c);
    }
    endPar();
    // body size: the most used, weighted by length
    const w = new Map(); for (const p of paras) w.set(p.fs, (w.get(p.fs) || 0) + p.text.length);
    const body = [...w].sort((a, b) => b[1] - a[1])[0]?.[0] || 24;
    const raw = paras.map((p) => {
      let rank = p.outline >= 0 && p.outline < 9 ? p.outline + 1 : styleRank(styleNames.get(p.style));
      if (rank == null && p.fs >= body * 1.2 && p.text.length < 140) rank = p.fs >= body * 1.6 ? 1 : 2;
      return rank != null ? { type: 'h', rank, text: p.text } : { type: 'p', text: p.text, center: p.center };
    });
    const title = clean(meta.title) || baseName(name), author = clean(meta.author);
    return finish(raw, title, author, name);
  }

  /* ---- plain text and Markdown ---- */
  // Paragraphs separated by blank lines, or one per line, or hard-wrapped lines rejoined (Project Gutenberg style).
  function plain(src, name) {
    let s = src.replace(/\r\n?/g, '\n');
    const g0 = s.search(/^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG.*$/im), g1 = s.search(/^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/im);
    let title = '', author = '';
    if (g0 >= 0) {
      const head = s.slice(0, g0);
      title = clean((/^Title:\s*(.+)$/im.exec(head) || [])[1]); author = clean((/^Author:\s*(.+)$/im.exec(head) || [])[1]);
      s = s.slice(s.indexOf('\n', g0) + 1, g1 > g0 ? g1 : undefined);
    }
    const lines = s.split('\n');
    const blank = lines.filter((l) => !l.trim()).length, filled = lines.length - blank;
    const lens = lines.filter((l) => l.trim()).map((l) => l.trimEnd().length).sort((a, b) => a - b);
    const p90 = lens[Math.floor(lens.length * 0.9)] || 0;
    const raw = [];
    const join = (a, b) => (/[a-zà-ÿ]-$/.test(a) && /^[a-zà-ÿ]/.test(b) ? a.slice(0, -1) + b : a + ' ' + b);
    const headish = (t) => t.length < 80 && !/[.,;:]$/.test(t) && (CHAPTER.test(t) || ROMAN.test(t) || /^\d{1,3}\.?$/.test(t) || (/\p{L}/u.test(t) && t === t.toUpperCase() && t.length > 2));
    const section = (t) => t.length < 60 && t.split(' ').length <= 8 && /^\p{Lu}/u.test(t) && !/[.!?…:;,»"”)\]—-]$/.test(t);
    const push = (text, alone) => {
      const t = clean(text);
      if (!t) return;
      if (/^[-—–_*=~#•·.\s]{3,}$/.test(t)) { raw.push({ type: 'sep', text: '* * *' }); return; }
      if (alone && headish(t)) raw.push({ type: 'h', rank: CHAPTER.test(t) || ROMAN.test(t) || /^\d/.test(t) ? 1 : 2, text: t });
      else if (alone && section(t)) raw.push({ type: 'h', rank: 2, text: t });
      else raw.push({ type: 'p', text: t });
    };
    if (blank >= filled * 0.15) {
      // blank-line paragraphs; inside one, wrapped lines are rejoined
      for (const chunk of s.split(/\n[ \t]*\n/)) {
        const ls = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
        if (!ls.length) continue;
        // a chunk of short lines that each end a sentence (verse, lists) keeps its lines
        if (ls.length > 1 && ls.every((l) => l.length < p90 * 0.7)) { for (const l of ls) push(l, ls.length <= 3); continue; }
        push(ls.reduce(join), ls.length === 1);
      }
    } else {
      const wrapped = p90 >= 50 && p90 <= 110 && lens.filter((n) => n >= p90 * 0.85).length > lens.length * 0.4;
      let buf = '', prevLen = 0;
      for (const line of lines) {
        const t = line.trim();
        if (!t) { push(buf, false); buf = ''; continue; }
        const indent = /^[ \t]{2,}|^\t/.test(line);
        if (!wrapped || !buf || indent || prevLen < p90 * 0.75) { if (buf) push(buf, false); buf = t; if (!wrapped) { push(buf, true); buf = ''; } }
        else buf = join(buf, t);
        prevLen = line.trimEnd().length;
      }
      push(buf, false);
    }
    title = title || baseName(name);
    return finish(raw, title, author, name);
  }
  // Markdown: headings (# and underlined), quotes, lists, rules; the inline marks are taken out.
  function markdown(src, name) {
    let s = src.replace(/\r\n?/g, '\n'), title = '', author = '';
    const fm = /^---\n([\s\S]*?)\n(---|\.\.\.)\n/.exec(s);
    if (fm) {
      const y = (k) => clean(((new RegExp('^' + k + ':\\s*(.+)$', 'im')).exec(fm[1]) || [])[1]).replace(/^["']|["']$/g, '');
      title = y('title'); author = y('author'); s = s.slice(fm[0].length);
    }
    const noteNum = new Map();
    const num = (id) => { if (!noteNum.has(id)) noteNum.set(id, noteNum.size + 1); return noteNum.get(id); };
    const inline = (t) => t
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[\^([^\]]+)\]/g, (m, id) => sup(num(id)))
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1').replace(/<(https?:[^>]+)>/g, '$1')
      .replace(/<[^>]+>/g, '').replace(/`([^`]+)`/g, '$1')
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2').replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*/g, '$1$2').replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?![\w])/g, '$1$2')
      .replace(/~~([\s\S]*?)~~/g, '$1').replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1');
    const raw = [];
    let buf = [], fence = false, m0;
    const flush = () => { if (buf.length) { const text = buf.join(' '); raw.push({ type: 'p', text: inline(text) }); buf = []; } };
    const lines = s.split('\n');
    for (let k = 0; k < lines.length; k++) {
      const line = lines[k], t = line.trim();
      if (/^(```|~~~)/.test(t)) { flush(); fence = !fence; continue; }
      if (fence) { raw.push({ type: 'p', text: line }); continue; }
      m0 = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(t);
      if (m0) { flush(); const body = [m0[2]]; while (lines[k + 1] && /^\s{2,}\S/.test(lines[k + 1])) body.push(lines[++k].trim()); raw.push({ type: 'p', text: sup(num(m0[1])) + ' ' + inline(body.join(' ')) }); continue; }
      if (/^\[[^\]]+\]:\s*\S+/.test(t)) continue;
      if (!t) { flush(); continue; }
      let m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(t);
      if (m) { flush(); raw.push({ type: 'h', rank: m[1].length, text: inline(m[2]) }); continue; }
      if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(t)) {
        // "text\n---" is a heading, a lone rule is a break
        if (buf.length && /^-+$/.test(t)) { const text = buf.join(' '); buf = []; raw.push({ type: 'h', rank: 2, text: inline(text) }); }
        else { flush(); raw.push({ type: 'sep', text: '* * *' }); }
        continue;
      }
      if (/^=+$/.test(t) && buf.length) { const text = buf.join(' '); buf = []; raw.push({ type: 'h', rank: 1, text: inline(text) }); continue; }
      m = /^(?:[-*+]|(\d+)[.)])\s+(.*)$/.exec(t);
      if (m) { flush(); buf = [(m[1] ? m[1] + '. ' : '• ') + m[2]]; continue; }
      if (t.startsWith('>')) { const q = t.replace(/^(>\s?)+/, ''); if (!q) { flush(); continue; } if (buf.length && !lines[k - 1].trim().startsWith('>')) flush(); buf.push(q); continue; }
      if (/ {2,}$|\\$/.test(line)) { buf.push(t.replace(/\\$/, '')); flush(); continue; }
      buf.push(t);
    }
    flush();
    if (!title) { const h = raw.find((b) => b.type === 'h' && b.rank === 1); title = h && raw.filter((b) => b.type === 'h' && b.rank === 1).length === 1 ? h.text : baseName(name); }
    return finish(raw, title, author, name);
  }
  function html(src, name) {
    const d = parseHtml(src, /^\s*<\?xml/.test(src));
    const centered = new Set();
    for (const st of d.getElementsByTagName('style')) centeredClasses(st.textContent, centered);
    const title = clean(d.querySelector('title')?.textContent) || baseName(name);
    const author = clean(d.querySelector('meta[name="author" i]')?.getAttribute('content'));
    return finish(htmlBlocks(d.body || d.documentElement, { centered }), title, author, name);
  }

  /* ---- Kindle: MOBI, AZW, AZW3, PRC, PalmDOC ---- */
  async function mobi(b, name) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const nrec = dv.getUint16(76), rec = (k) => { const a = dv.getUint32(78 + k * 8), z = k + 1 < nrec ? dv.getUint32(78 + (k + 1) * 8) : b.length; return b.subarray(a, z); };
    const r0 = rec(0), d0 = new DataView(r0.buffer, r0.byteOffset, r0.byteLength);
    const comp = d0.getUint16(0), textLen = d0.getUint32(4), count = d0.getUint16(8), encr = d0.getUint16(12);
    if (encr) fail('Ce livre Kindle est protégé contre la copie (DRM) : il ne peut pas s’ouvrir ici.');
    let title = baseName(name), author = '', enc = 'windows-1252', extra = 0;
    const isMobi = r0.length > 20 && String.fromCharCode(...r0.subarray(16, 20)) === 'MOBI';
    if (isMobi) {
      const hl = d0.getUint32(20);
      enc = d0.getUint32(28) === 65001 ? 'utf-8' : 'windows-1252';
      const tOff = d0.getUint32(84), tLen = d0.getUint32(88);
      if (tLen && tOff + tLen <= r0.length) title = decoder(enc).decode(r0.subarray(tOff, tOff + tLen)) || title;
      if (hl >= 0xe4) extra = d0.getUint16(0xf2);
      // EXTH: author (100), updated title (503)
      if (d0.getUint32(0x80) & 0x40) {
        let p = 16 + hl;
        if (String.fromCharCode(...r0.subarray(p, p + 4)) === 'EXTH') {
          const n = d0.getUint32(p + 8); p += 12;
          for (let k = 0; k < n && p + 8 <= r0.length; k++) {
            const type = d0.getUint32(p), len = d0.getUint32(p + 4), v = decoder(enc).decode(r0.subarray(p + 8, p + len));
            if (type === 100) author = author ? author + ', ' + clean(v) : clean(v);
            if (type === 503) title = clean(v) || title;
            p += len;
          }
        }
      }
    }
    // the trailing entries some records carry (multibyte overlaps, indexing data), read from the end
    const trim = (a) => {
      for (let f = extra >> 1; f; f >>= 1) if (f & 1) {
        let v = 0;
        for (const x of a.subarray(-4)) { if (x & 0x80) v = 0; v = (v << 7) | (x & 0x7f); }
        a = a.subarray(0, a.length - v);
      }
      if (extra & 1) a = a.subarray(0, a.length - ((a[a.length - 1] & 3) + 1));
      return a;
    };
    const lz77 = (a) => {
      const out = new Uint8Array(a.length * 8); let o = 0;
      for (let i = 0; i < a.length;) {
        const c = a[i++];
        if (c >= 1 && c <= 8) { for (let j = 0; j < c && i < a.length; j++) out[o++] = a[i++]; }
        else if (c < 128) out[o++] = c;
        else if (c >= 192) { out[o++] = 32; out[o++] = c ^ 128; }
        else { const v = (c << 8) | a[i++], dist = (v >> 3) & 0x7ff, len = (v & 7) + 3; for (let j = 0; j < len; j++, o++) out[o] = out[o - dist]; }
      }
      return out.subarray(0, o);
    };
    let unpack;
    if (comp === 1) unpack = (a) => a;
    else if (comp === 2) unpack = lz77;
    else fail("Ce livre Kindle utilise une compression qu’on ne sait pas encore lire ici.");
    const parts = []; let total = 0;
    for (let k = 1; k <= count && k < nrec && total < textLen; k++) { const t = unpack(trim(rec(k))); parts.push(t); total += t.length; }
    const all = new Uint8Array(total); let o = 0; for (const t of parts) { all.set(t, o); o += t.length; }
    const text = decoder(enc).decode(all.subarray(0, textLen || total));
    if (!isMobi) return plain(text, name);
    const doc = parseHtml(text.replace(/<mbp:pagebreak\s*\/?>/gi, '<hr class="mbp">'), false);
    // page breaks are chapter breaks, not scene breaks
    for (const hr of doc.querySelectorAll('hr.mbp')) hr.remove();
    return finish(htmlBlocks(doc.body), title, author, name);
  }
  /* ---- PDF ---- */
  // pdf.js is only downloaded when a PDF is opened. Its worker runs in the page (no separate worker file).
  const addScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new ImportError('load')); document.head.append(s); });
  let pdfReady = null;
  function loadPdfJs() {
    const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
    return pdfReady || (pdfReady = addScript(base + 'pdf.worker.min.js').then(() => addScript(base + 'pdf.min.js')).catch((e) => { pdfReady = null; throw e; }));
  }
  // The positioned lines of each page: [{h, lines: [{y, x, xe, size, text}]}], top to bottom; chars: the page's letters.
  // pdf.js, without a worker, answers through promises only: a long book would hold the page (no paint, no click, no
  // « Arrêter ») until its last page. A short pause every ~40 ms of work gives the page its turn (a message, not a timer:
  // a hidden window slows timers to one a second).
  const breathe = () => new Promise((res) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); res(); }; c.port2.postMessage(0); });
  async function pdfPages(doc, onProgress, signal) {
    const pages = [];
    let since = performance.now();
    for (let p = 1; p <= doc.numPages; p++) {
      if (performance.now() - since > 40) { await breathe(); since = performance.now(); }
      if (signal && signal.aborted) throw new DOMException('stop', 'AbortError');
      const page = await doc.getPage(p);
      const h = page.view[3] - page.view[1];
      const tc = await page.getTextContent();
      const lines = [];
      for (const it of tc.items) {
        if (!it.str || !it.transform) continue;
        const t = it.transform, size = Math.hypot(t[2], t[3]) || it.height || 10, x = t[4], y = t[5];
        let L = null;
        // Tolerance follows the larger of the two sizes so superscripts (XXe, note calls) stay on their line.
        for (let k = lines.length - 1; k >= 0 && k >= lines.length - 4; k--) {
          if (Math.abs(lines[k].y - y) < Math.max(size, lines[k].size0) * 0.5) { L = lines[k]; break; }
        }
        if (!L) { L = { y, size0: size, items: [] }; lines.push(L); }
        L.items.push({ x, w: it.width, s: it.str, size });
      }
      const out = [];
      let chars = 0;
      for (const L of lines) {
        L.items.sort((a, b) => a.x - b.x);
        let text = '', end = -Infinity, x0 = Infinity, sz = 0, n = 0;
        for (const it of L.items) {
          if (text && it.x - end > it.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(it.s)) text += ' ';
          text += it.s;
          end = Math.max(end, it.x + it.w);
          const k = it.s.trim().length;
          if (k) { x0 = Math.min(x0, it.x); sz += it.size * k; n += k; }
        }
        text = text.replace(/\s+/g, ' ').trim();
        chars += text.replace(/\s/g, '').length;
        if (text) out.push({ y: L.y, x: x0, xe: end, size: n ? sz / n : 0, text });
      }
      out.sort((a, b) => b.y - a.y);
      pages.push({ h, lines: out, chars });
      page.cleanup();
      if (onProgress) onProgress(p / doc.numPages);
    }
    return pages;
  }

  // Rebuilds paragraphs and headings from the positioned lines of the pages (PDF text, or OCR).
  // A line read by OCR may carry its column's margins (left, right), a place at the top or bottom of its column (edge)
  // and a mark for a scene-break ornament (orn).
  function layout(pages) {
    // Body text metrics: most frequent size, left margin and line pitch.
    const sizeHist = new Map(), xHist = new Map(), ends = [], pitches = [];
    const sizeKey = (l) => (l.ocr ? Math.round(l.size * 2) / 2 : Math.round(l.size));
    for (const pg of pages) for (const l of pg.lines) { const k = sizeKey(l); sizeHist.set(k, (sizeHist.get(k) || 0) + l.text.length); }
    const body = [...sizeHist].sort((a, b) => b[1] - a[1])[0]?.[0] || 12;
    const isBody = (l) => Math.abs(l.size - body) < body * 0.12;
    for (const pg of pages) {
      let prev = null;
      for (const l of pg.lines) {
        if (!isBody(l)) { prev = null; continue; }
        const kx = Math.round(l.x); xHist.set(kx, (xHist.get(kx) || 0) + 1); ends.push(l.xe);
        if (prev) { const dy = prev.y - l.y; if (dy > 0 && dy < body * 3) pitches.push(dy); }
        prev = l;
      }
    }
    const left0 = [...xHist].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
    ends.sort((a, b) => a - b); pitches.sort((a, b) => a - b);
    const right0 = ends[Math.floor(ends.length * 0.9)] || 0;
    const pitch = pitches[Math.floor(pitches.length / 2)] || body * 1.2;
    const leftOf = (l) => (l.left != null ? l.left : left0), rightOf = (l) => (l.right != null ? l.right : right0);

    // Running headers, footers and page numbers: short lines at the page edges, numeric or repeated.
    const norm = (s) => s.toLowerCase().replace(/\d+/g, '#');
    const atEdge = (l, pg) => (l.edge != null ? l.edge : l.y > pg.h * 0.93 || l.y < pg.h * 0.07);
    const edgeCount = new Map();
    for (const pg of pages) for (const l of pg.lines) if (atEdge(l, pg)) edgeCount.set(norm(l.text), (edgeCount.get(norm(l.text)) || 0) + 1);
    const noise = (l, pg) => atEdge(l, pg) && (l.ocr
      ? l.size < body * 1.15 && (/^[\divxlcm\s.\-–—]+$/i.test(l.text) || edgeCount.get(norm(l.text)) >= 2 || (l.text.length < 60 && (l.margin || l.size < body * 0.9)))
      : /^[\divxlcm\s.\-–—]+$/i.test(l.text) || edgeCount.get(norm(l.text)) >= 3);

    // A line-end hyphen is removed only when the word continues in the same case (syllable break).
    const join = (a, b) => ((/[a-zà-ÿ]-$/.test(a) && /^[a-zà-ÿ]/.test(b)) || (/[A-ZÀ-Þ]-$/.test(a) && /^[A-ZÀ-Þ]/.test(b)) ? a.slice(0, -1) + b : a + ' ' + b);
    const NUMBERED = /^([\divxlc]+|chapitre \S+|partie \S+)$/i;
    const blocks = [];
    let cur = null, prev = null, lastHead = null;
    for (const pg of pages) {
      let prevY = null;
      for (const l of pg.lines) {
        if (noise(l, pg)) continue;
        // Ornaments such as § or * * * mark a section break.
        if (l.orn || (!/[\p{L}\p{N}]/u.test(l.text) && l.text.length <= 8)) {
          blocks.push({ type: 'sep', text: l.orn ? '* * *' : l.text });
          cur = null; prev = null; prevY = l.y; lastHead = null;
          continue;
        }
        if (l.size >= body * 1.15 && l.text.length < 140) {
          const level = l.size >= body * 1.25 ? 1 : 2;
          const last = blocks[blocks.length - 1];
          // Same heading on several lines: next line, same size, close below.
          const near = lastHead && lastHead.pg === pg && lastHead.y - l.y < l.size * 1.7 && Math.abs(lastHead.size - l.size) < (l.ocr ? body * 0.12 : 1.5);
          if (last && last.type === 'h' && !cur && (near || NUMBERED.test(last.text))) {
            last.text = near ? join(last.text, l.text) : last.text + ' · ' + l.text;
            last.level = Math.min(last.level, level);
          } else blocks.push({ type: 'h', level, text: l.text });
          lastHead = { pg, y: l.y, size: l.size };
          cur = null; prev = null; prevY = l.y;
          continue;
        }
        lastHead = null;
        const left = leftOf(l), right = rightOf(l), span = right - left;
        const centered = l.x > left + span * 0.18 && l.xe < right - span * 0.18;
        const gap = prevY != null && prevY - l.y > pitch * 1.5;
        const prevEnded = prev && prev.xe < rightOf(prev) - body * (prev.just ? 1 : 2.5) && /[.!?:…»"”)]$/.test(prev.text);
        // An indented line opens a paragraph, unless the previous line had the same indent (indented quotation).
        const indent = l.x > left + body * 0.8 && !(prev && Math.abs(prev.x - l.x) < (l.ocr ? body * 0.3 : 2));
        if (!cur || indent || gap || prevEnded || centered || (prev && prev.centered)) {
          cur = { type: 'p', text: l.text };
          if (centered) cur.center = true;
          blocks.push(cur);
        } else cur.text = join(cur.text, l.text);
        l.centered = centered;
        prev = l; prevY = l.y;
      }
    }
    // Long mixed-case "headings" are set-off quotations in large type: keep them as centred text.
    for (const b of blocks) {
      if (b.type !== 'h') continue;
      const letters = b.text.match(/\p{L}/gu) || [], lower = b.text.match(/\p{Ll}/gu) || [];
      if (b.text.length > 80 && lower.length > letters.length * 0.5) { b.type = 'p'; b.center = true; delete b.level; }
    }
    return blocks;
  }

  /* ---- OCR (Tesseract.js, in workers) ---- */
  const CDN = 'https://cdn.jsdelivr.net/npm/';
  const TESS = { js: CDN + 'tesseract.js@7.0.0/dist/tesseract.min.js', worker: CDN + 'tesseract.js@7.0.0/dist/worker.min.js', core: CDN + 'tesseract.js-core@7.0.0', lang: (l) => CDN + '@tesseract.js-data/' + l + '@1.0.0/4.0.0_best_int' };
  let tessReady = null;
  const loadTesseract = () => tessReady || (tessReady = addScript(TESS.js).catch((e) => { tessReady = null; throw e; }));
  const OPT = { flatten: true, sauvola: true, split: true };
  async function ocrWorker(lang) {
    // (the engine and the language come down the first time: a slow connection gets two minutes)
    let w;
    try {
      w = await Promise.race([
        window.Tesseract.createWorker(lang, 1, { workerPath: TESS.worker, corePath: TESS.core, langPath: TESS.lang(lang) }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 120000)),
      ]);
    } catch { fail("La reconnaissance de texte n’a pas pu démarrer dans cette page. Vérifie la connexion, puis réessaie."); }
    // Sauvola thresholding copes with the uneven light of a photo
    if (OPT.sauvola) await w.setParameters({ thresholding_method: '2' });
    return w;
  }
  // The light of the paper, evened out: each pixel divided by the brightness of the paper around it (the brightest
  // in its cell, smoothed), so shadows and yellowed pages turn white and the ink stays dark. Grey, in place.
  function flatten(c) {
    const w = c.width, h = c.height, g = c.getContext('2d', { willReadFrequently: true });
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const k = Math.max(12, Math.round(Math.max(w, h) / 90)), sw = Math.ceil(w / k), sh = Math.ceil(h / k);
    const gray = new Uint8Array(w * h);
    let bg = new Float32Array(sw * sh);
    for (let y = 0, i = 0; y < h; y++) {
      const row = ((y / k) | 0) * sw;
      for (let x = 0; x < w; x++, i++) {
        const v = (d[i * 4] * 77 + d[i * 4 + 1] * 151 + d[i * 4 + 2] * 28) >> 8;
        gray[i] = v;
        const ci = row + ((x / k) | 0); if (v > bg[ci]) bg[ci] = v;
      }
    }
    // a cell all ink (a heading's thick letters) takes its neighbours' light; then two box blurs
    for (let pass = 0; pass < 3; pass++) {
      const nb = new Float32Array(sw * sh);
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        let sum = 0, n = 0, mx = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= sh || xx >= sw) continue;
          const v = bg[yy * sw + xx]; sum += v; n++; if (v > mx) mx = v;
        }
        nb[y * sw + x] = pass === 0 ? mx : sum / n;
      }
      bg = nb;
    }
    for (let y = 0, i = 0; y < h; y++) {
      const fy = Math.min(sh - 1.001, Math.max(0, y / k - 0.5)), y0 = fy | 0, ty = fy - y0;
      for (let x = 0; x < w; x++, i++) {
        const fx = Math.min(sw - 1.001, Math.max(0, x / k - 0.5)), x0 = fx | 0, tx = fx - x0;
        const a = bg[y0 * sw + x0], b = bg[y0 * sw + x0 + 1], cc = bg[(y0 + 1) * sw + x0], dd = bg[(y0 + 1) * sw + x0 + 1];
        const L = Math.max(24, (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + dd * tx) * ty);
        const v = Math.min(255, (gray[i] / L) * 255);
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
        gray[i] = v;
      }
    }
    g.putImageData(img, 0, 0);
    return gray;
  }
  // An open book photographed flat: two pages, with a white gutter down the middle. The split, in pixels, or null.
  function gutter(gray, w, h) {
    if (w < h * 1.15) return null;
    const ink = new Float32Array(w);
    for (let y = Math.round(h * 0.1); y < h * 0.9; y += 2) for (let x = 0; x < w; x += 1) if (gray[y * w + x] < 110) ink[x]++;
    const win = Math.max(3, Math.round(w * 0.006)), sm = new Float32Array(w);
    for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k = -win; k <= win; k++) { const v = ink[x + k]; if (v != null) { s += v; n++; } } sm[x] = s / n; }
    let best = -1, bx = 0;
    for (let x = Math.round(w * 0.38); x < w * 0.62; x++) if (best < 0 || sm[x] < best) { best = sm[x]; bx = x; }
    const side = (a, z) => { const v = [...sm.subarray(Math.round(w * a), Math.round(w * z))].sort((p, q) => p - q); return v[Math.floor(v.length / 2)]; };
    const l = side(0.12, 0.36), r = side(0.64, 0.88);
    return l > 0 && r > 0 && best < Math.min(l, r) * 0.08 ? bx : null;
  }
  // A canvas ready for the OCR: evened out, and cut in two when it shows two pages.
  function prepare(c) {
    if (!OPT.flatten && !OPT.split) return [c];
    const gray = OPT.flatten ? flatten(c) : null;
    const x = OPT.split && gray ? gutter(gray, c.width, c.height) : null;
    if (x == null) return [c];
    return [[0, x], [x, c.width]].map(([a, z]) => {
      const p = document.createElement('canvas'); p.width = z - a; p.height = c.height;
      p.getContext('2d').drawImage(c, a, 0, z - a, c.height, 0, 0, z - a, c.height);
      return p;
    });
  }
  const FR = /^(le|la|les|de|des|du|et|est|que|qui|une|un|dans|pour|pas|il|elle|sur|au|avec|ne|se)$/, EN = /^(the|and|of|to|is|was|that|with|his|her|it|in|for|on|as|had|he|she|not|you)$/;
  function language(text) {
    let fr = 0, en = 0;
    for (const w of text.toLowerCase().split(/[^a-zà-ÿ]+/)) { if (FR.test(w)) fr++; else if (EN.test(w)) en++; }
    return en > 12 && en > fr * 2 ? 'eng' : 'fra';
  }
  // A page read by OCR, in the units of its source (pdf points, or pixels): its lines, column by column (a photo of an
  // open book has two), each with its column's margins.
  function ocrPage(data, scale, height) {
    let lines = [];
    for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) {
      const text = clean(l.text);
      if (!text) continue;
      const bb = l.bbox, size = (l.rowAttributes && l.rowAttributes.rowHeight) || bb.y1 - bb.y0;
      const base = l.baseline ? (l.baseline.y0 + l.baseline.y1) / 2 : bb.y1;
      lines.push({ x: bb.x0 / scale, xe: bb.x1 / scale, top: bb.y0 / scale, bottom: bb.y1 / scale, base: base / scale, size: size / scale, text, conf: l.confidence, ocr: true });
    }
    if (!lines.length) return { h: height / scale || 1, lines: [], chars: 0, ocr: true };
    const hs = lines.map((l) => l.bottom - l.top).sort((a, b) => a - b), mh = hs[Math.floor(hs.length / 2)];
    // ornaments (* * *) come out as a few odd letters, small and centred; noise is unsure and has few letters
    const W = Math.max(...lines.map((l) => l.xe)), X0 = Math.min(...lines.map((l) => l.x));
    lines = lines.filter((l) => {
      const mid = (l.x + l.xe) / 2, short = l.text.replace(/\s/g, '').length <= 6;
      if (short && l.bottom - l.top < mh * 0.6 && Math.abs(mid - (X0 + W) / 2) < (W - X0) * 0.12 && !/^\d+$/.test(l.text)) { l.orn = true; return true; }
      const letters = (l.text.match(/[\p{L}\p{N}]/gu) || []).length;
      return !(l.conf < 45 && letters < l.text.length * 0.6) && l.conf >= 25;
    });
    // columns: a gutter down the middle that almost no line crosses
    const cols = [];
    const minX = Math.min(...lines.map((l) => l.x)), maxX = Math.max(...lines.map((l) => l.xe)), span = maxX - minX;
    let split = null;
    if (lines.length >= 12) {
      let best = 0;
      for (let f = 0.35; f <= 0.65; f += 0.01) {
        const x = minX + span * f, crossing = lines.filter((l) => l.x < x && l.xe > x).length;
        const leftN = lines.filter((l) => l.xe <= x).length, rightN = lines.filter((l) => l.x >= x).length;
        if (crossing <= lines.length * 0.04 && leftN >= 5 && rightN >= 5 && Math.min(leftN, rightN) > best) { best = Math.min(leftN, rightN); split = x; }
      }
    }
    if (split != null) cols.push(lines.filter((l) => (l.x + l.xe) / 2 < split), lines.filter((l) => (l.x + l.xe) / 2 >= split));
    else cols.push(lines);
    const H = height ? height / scale : Math.max(...lines.map((l) => l.bottom)) + 10, out = [];
    for (const col of cols) {
      col.sort((a, b) => a.top - b.top);
      const full = col.filter((l) => l.text.length > 25);
      const xs = full.map((l) => l.x).sort((a, b) => a - b), es = full.map((l) => l.xe).sort((a, b) => a - b);
      const left = xs.length >= 3 ? xs[Math.floor(xs.length * 0.25)] : null, right = es.length >= 3 ? es[Math.floor(es.length * 0.9)] : null;
      // justified text: most full lines reach the right margin, so a line ending short of it closes its paragraph
      const just = right != null && full.filter((l) => l.xe >= right - mh * 0.7).length >= full.length * 0.6;
      // the text block: from its first full line to its last; lines well above or below it are in the margins
      const steps = []; for (let k = 1; k < full.length; k++) steps.push(full[k].base - full[k - 1].base);
      steps.sort((a, b) => a - b);
      const pitch = steps[Math.floor(steps.length / 2)] || mh * 1.4, b0 = full.length ? full[0].base : -Infinity, b1 = full.length ? full[full.length - 1].base : Infinity;
      col.forEach((l, k) => {
        const margin = full.length >= 4 && (l.base < b0 - pitch * 1.6 || l.base > b1 + pitch * 1.6);
        out.push({ y: H - l.base, x: l.x, xe: l.xe, size: l.size, text: l.orn ? '* * *' : l.text, ocr: true, orn: l.orn, left, right, just, margin, edge: margin || k === 0 || k === col.length - 1 });
      });
    }
    return { h: H, lines: out, chars: out.reduce((n, l) => n + l.text.length, 0), ocr: true };
  }
  // Reads pages with OCR. sources[i]() gives {image (canvas or blob), scale (pixels per unit), height (pixels)}.
  // Several workers share the pages; the first page alone decides the language (French, or English).
  async function ocr(sources, ctx) {
    try { await loadTesseract(); } catch { fail("La reconnaissance de texte n’a pas pu se charger. Vérifie la connexion, puis réessaie."); }
    const total = sources.length, pages = new Array(total);
    const nw = Math.min(total, Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2)));
    const t0 = performance.now();
    let done = 0, lang = 'fra', workers = [];
    const say = () => {
      let msg = total > 1 ? `Reconnaissance du texte · page ${Math.min(done + 1, total)} sur ${total}` : 'Reconnaissance du texte…';
      if (done >= 2 && done < total) { const left = ((performance.now() - t0) / done) * (total - done) / 1000; msg += left > 90 ? ` · encore ${Math.round(left / 60)} min environ` : left > 15 ? ` · encore ${Math.round(left / 5) * 5} s environ` : ''; }
      ctx.progress(done / total, msg);
    };
    const stop = () => Promise.all(workers.map((w) => w.terminate().catch(() => {})));
    const read = async (w, i) => {
      if (ctx.signal && ctx.signal.aborted) throw new DOMException('stop', 'AbortError');
      const src = await sources[i]();
      const parts = src.image instanceof HTMLCanvasElement ? prepare(src.image) : [src.image], got = [];
      let text = '';
      for (const im of parts) {
        const r = await w.recognize(im, {}, { blocks: true, text: true });
        got.push(ocrPage(r.data, src.scale, src.height)); text += (r.data.text || '') + '\n';
        if (im !== src.image) im.width = im.height = 0;
      }
      if (src.release) src.release();
      return { page: got, text };
    };
    try {
      say();
      workers = [await ocrWorker(lang)];
      const first = await read(workers[0], 0);
      if (language(first.text) === 'eng') {
        lang = 'eng'; await stop(); workers = [await ocrWorker(lang)];
        pages[0] = (await read(workers[0], 0)).page;
      } else pages[0] = first.page;
      done = 1; say();
      if (total > 1) {
        workers.push(...(await Promise.all(Array.from({ length: nw - 1 }, () => ocrWorker(lang)))));
        let next = 1;
        await Promise.all(workers.map(async (w) => {
          while (next < total) { const i = next++; pages[i] = (await read(w, i)).page; done++; say(); }
        }));
      }
    } finally { await stop(); }
    return { pages: pages.map((p) => p).flat(), byPage: pages, lang };
  }
  // Pictures of pages: drawn on a canvas (turned upright from their EXIF, at a size the OCR likes).
  function imageSource(blob) {
    return async () => {
      let bmp;
      try { bmp = await createImageBitmap(blob); } catch {
        const h = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
        if ((h[0] === 0x49 && h[1] === 0x49) || (h[0] === 0x4d && h[1] === 0x4d)) return { image: blob, scale: 1, height: 0 };
        fail("Une des images n’a pas pu être lue (format HEIC ?). Exporte-la en JPEG ou en PNG, puis réessaie.");
      }
      const long = Math.max(bmp.width, bmp.height), k = long > 4000 ? 4000 / long : long < 1400 ? 1400 / long : 1;
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
      return { image: c, scale: 1, height: c.height, release: () => { c.width = c.height = 0; } };
    };
  }
  function pdfPageSource(doc, n) {
    return async () => {
      const page = await doc.getPage(n + 1);
      const v1 = page.getViewport({ scale: 1 });
      const k = Math.min(300 / 72, 3400 / Math.max(v1.width, v1.height));
      const vp = page.getViewport({ scale: k });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      page.cleanup();
      return { image: c, scale: k, height: c.height, release: () => { c.width = c.height = 0; } };
    };
  }

  async function pdf(bytes, name, ctx) {
    try { await loadPdfJs(); } catch { fail("Le lecteur de PDF n’a pas pu se charger. Vérifie la connexion, puis réessaie."); }
    let doc;
    try { doc = await window.pdfjsLib.getDocument({ data: bytes, isEvalSupported: false, verbosity: 0 }).promise; }
    catch (err) { fail(err && err.name === 'PasswordException' ? 'Ce PDF est protégé par un mot de passe.' : "Ce PDF n’a pas pu être lu."); }
    try {
      let title = baseName(name), author = '';
      try {
        const m = await doc.getMetadata();
        if (m.info && m.info.Title && m.info.Title.trim()) title = m.info.Title.trim();
        if (m.info && m.info.Author) author = m.info.Author.trim();
      } catch {}
      const pages = await pdfPages(doc, (p) => ctx.progress(p, 'Lecture du texte…'), ctx.signal);
      // pages without text: scans. When they are a good share of the book, OCR reads them.
      const bare = pages.map((pg, i) => (pg.chars < 25 ? i : -1)).filter((i) => i >= 0);
      let ocrInfo = null;
      if (bare.length && bare.length >= pages.length * 0.3) {
        const r = await ocr(bare.map((i) => pdfPageSource(doc, i)), ctx);
        bare.forEach((i, k) => { pages[i] = r.byPage[k]; });
        pages.splice(0, pages.length, ...pages.flat());
        ocrInfo = { pages: bare.length, lang: r.lang, kind: 'pdf' };
      }
      const blocks = layout(pages);
      return { title, author, blocks, ocr: ocrInfo };
    } finally { doc.destroy(); }
  }
  async function picturePages(blobs, name, ctx) {
    const r = await ocr(blobs.map(imageSource), ctx);
    return { title: name, author: '', blocks: layout(r.pages), ocr: { pages: blobs.length, lang: r.lang, kind: 'img' } };
  }

  /* ---- what a file is ---- */
  const IMG = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i;
  const isImage = (f) => /^image\//.test(f.type || '') || IMG.test(f.name || '');
  const ascii = (b, a, z) => String.fromCharCode(...b.subarray(a, z));
  function sniffZip(zip) {
    const n = zip.names;
    if (zip.has('META-INF/container.xml') || n.some((x) => /\.opf$/i.test(x))) return 'epub';
    if (zip.has('word/document.xml')) return 'docx';
    if (zip.has('content.xml')) return 'odt';
    if (n.some((x) => /\.fb2$/i.test(x))) return 'fb2zip';
    if (zip.has('Index/Document.iwa') || zip.has('index.xml')) return 'pages';
    if (n.some((x) => /^(ppt|xl)\//.test(x))) return 'office';
    if (n.some((x) => IMG.test(x))) return 'cbz';
    return 'zip';
  }
  // Opens the files given (a file input's, or a drop's) and returns {title, author, blocks, ocr?}.
  // ctx: {progress(fraction, message), signal}. Several pictures make one book, in the order of their names.
  async function open(list, ctx = {}) {
    ctx = { progress: () => {}, ...ctx };
    const files = [...list].filter(Boolean);
    if (!files.length) return null;
    const imgs = files.filter(isImage).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (imgs.length && (imgs.length > 1 || files.length === 1)) {
      const name = imgs.length > 1 ? baseName(imgs[0].name).replace(/[\s_-]*\d+$/, '') || 'Pages photographiées' : baseName(imgs[0].name);
      return picturePages(imgs, name, ctx);
    }
    const file = files.find((f) => !isImage(f)) || files[0], name = file.name || 'document';
    const b = new Uint8Array(await file.arrayBuffer());
    if (!b.length) fail('Ce fichier est vide.');
    const head = ascii(b, 0, Math.min(b.length, 1024));
    if (head.includes('%PDF-')) return pdf(b, name, ctx);
    if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4) {
      const zip = unzip(b), kind = sniffZip(zip);
      if (kind === 'epub') return epub(zip, name, ctx);
      if (kind === 'docx') return docx(zip, name);
      if (kind === 'odt') {
        const mt = (await zip.text('mimetype')) || '';
        if (/spreadsheet|presentation|graphics/.test(mt)) fail("Ce fichier OpenDocument n’est pas un texte (tableur ou présentation).");
        return odt(zip, name);
      }
      if (kind === 'fb2zip') { const f = zip.names.find((x) => /\.fb2$/i.test(x)); const raw = await zip.get(f); return fb2(decodeXml(raw), name); }
      if (kind === 'cbz') {
        const names = zip.names.filter((x) => IMG.test(x) && !/(^|\/)(__MACOSX|\.)/.test(x)).sort((a, z) => a.localeCompare(z, undefined, { numeric: true }));
        const blobs = await Promise.all(names.map(async (x) => new Blob([await zip.get(x)])));
        return picturePages(blobs, baseName(name), ctx);
      }
      if (kind === 'pages') fail("Les documents Pages ne s’ouvrent pas ici : dans Pages, choisis Fichier › Exporter vers › Word ou ePub.");
      if (kind === 'office') fail("Ce fichier n’est pas un texte (présentation ou tableur).");
      fail("Cette archive ne contient aucun livre ni document lisible.");
    }
    if (b.length > 68 && /^(BOOKMOBI|TEXtREAd)$/.test(ascii(b, 60, 68))) return mobi(b, name);
    if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) fail("Les anciens fichiers Word (.doc) ne s’ouvrent pas ici : enregistre ce document en .docx ou en PDF depuis Word, Pages ou LibreOffice.");
    if (/^\{\\rtf/.test(head)) return rtf(decoder('windows-1252').decode(b), name);
    const ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1]?.toLowerCase() || '';
    if (/^(epub|docx|odt|mobi|azw3?|prc)$/.test(ext)) fail('Ce fichier semble abîmé : il ne ressemble pas à un ' + ext.toUpperCase() + '.');
    // text formats: rule out binary first
    let zeros = 0; for (let i = 0, n = Math.min(b.length, 8000); i < n; i++) if (!b[i]) zeros++;
    const utf16 = (b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff) || zeros > Math.min(b.length, 8000) * 0.3;
    if (zeros > 8 && !utf16) fail("Ce format n’est pas reconnu. Essaie un PDF, un ePub, un document Word ou un fichier texte.");
    const text = /<\?xml[^>]+encoding=/i.test(head) ? decodeXml(b) : decode(b);
    if (/<FictionBook[\s>]/.test(text.slice(0, 2000))) return fb2(text, name);
    if (/^(html?|xhtml|xht)$/.test(ext) || /^\s*(<\?xml[^>]*>\s*)?(<!doctype html|<html[\s>])/i.test(text.slice(0, 500))) return html(text, name);
    if (/^(md|markdown|mdown|mkd|mkdn|mdtext|rmd|qmd)$/.test(ext) || (ext !== 'txt' && /^#{1,3} \S/m.test(text) && /^---\n[\s\S]*?\n---\n|^#{1,3} .*\n\n/m.test(text))) return markdown(text, name);
    return plain(text, name);
  }
  // XML in the encoding its declaration names (a .fb2 is often in windows-1251).
  function decodeXml(b) {
    const m = /<\?xml[^>]+encoding=["']([\w-]+)["']/i.exec(ascii(b, 0, Math.min(b.length, 300)));
    return decode(b, m ? m[1].toLowerCase() : null);
  }

  return { OPT, _t: { unzip, decode, finish, docx, odt, epub, plain, markdown, rtf, fb2, html, mobi, htmlBlocks, parseXml, parseHtml }, open, layout, pdfPages, loadPdfJs, ImportError, isImage, accept: '.pdf,.epub,.docx,.odt,.rtf,.txt,.text,.md,.markdown,.html,.htm,.xhtml,.fb2,.mobi,.azw,.azw3,.prc,.pdb,.cbz,.zip,image/*,application/pdf,application/epub+zip,text/plain,text/markdown,text/html' };
})();
