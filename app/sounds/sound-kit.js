// Liseuse à la lampe — the sound kit shared by every scene's sound pack.
// Plain browser script, no imports. It defines window.SOUND_KIT (helpers + the scheduler) and window.SCENE_SOUNDS
// (the packs register into it). The app and the render harness both use this same file, so what you hear in a render
// is what the reader hears. Everything is generated in the browser: no audio files.
(function () {
  const TAU = Math.PI * 2;
  const white = () => Math.random() * 2 - 1;
  // A seeded random generator (0..1), for a pack that wants the same texture every time.
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // Noise colours added into a Float32Array d (amt = level).
  function brownInto(d, amt, leak = 0.02, R = Math.random) { let last = 0; for (let i = 0; i < d.length; i++) { last = (last + leak * (R() * 2 - 1)) / (1 + leak); d[i] += last * amt; } }
  function pinkInto(d, amt, R = Math.random) { // Paul Kellet's filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = R() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] += (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11 * amt; b6 = w * 0.115926;
    }
  }

  // A looping stereo buffer whose tail is cross-faded into its head, so the seam can't be heard.
  // gen(n, sr, ch) returns a Float32Array of n samples for channel ch. Levels are normalised to an RMS of 0.15
  // (rms = false keeps the levels as generated). Cached by key for the page's life: generate it once.
  const bufCache = {};
  function loopBuffer(ctx, key, secs, gen, rms = 0.15) {
    const sr = ctx.sampleRate, hit = bufCache[key];
    if (hit && hit.sampleRate === sr) return hit;
    const n = Math.round(sr * secs), F = Math.round(sr * 0.25), b = ctx.createBuffer(2, n, sr);
    let sum = 0;
    for (let ch = 0; ch < 2; ch++) {
      const g = gen(n + F, sr, ch), d = b.getChannelData(ch);
      d.set(g.subarray(0, n));
      for (let k = 0; k < F; k++) { const a = (k / F) * Math.PI / 2; d[k] = g[n + k] * Math.cos(a) + g[k] * Math.sin(a); }
      for (let i = 0; i < n; i++) sum += d[i] * d[i];
    }
    if (rms) { const k = rms / (Math.sqrt(sum / (2 * n)) || 1); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] *= k; } }
    return (bufCache[key] = b);
  }
  // A mono buffer (not looping), cached by key when a key is given. gen(n, sr) returns the samples.
  function buffer(ctx, key, secs, gen) {
    const sr = ctx.sampleRate;
    if (key && bufCache[key] && bufCache[key].sampleRate === sr) return bufCache[key];
    const n = Math.max(1, Math.round(sr * secs)), b = ctx.createBuffer(1, n, sr);
    b.getChannelData(0).set(gen(n, sr));
    if (key) bufCache[key] = b;
    return b;
  }
  // An explicit loop end one sample before the buffer's end. With the default end, Chrome 152 (the Claude app) turns
  // some durations (21.1 s, 19.1 s at 48 and 44.1 kHz) into one frame past the buffer: at each wrap it reads outside the
  // buffer, and through a filter that grows into a full-scale whistle within a second. One sample less is inaudible.
  function loop(ctx, buf, rate = 1, offset = 0) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = 0; s.loopEnd = (buf.length - 1) / buf.sampleRate; s.playbackRate.value = rate; s.start(ctx.currentTime, offset % s.loopEnd); return s; }
  function filt(ctx, type, f, q) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
  function gain(ctx, v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function pan(ctx, p = 0) { if (!ctx.createStereoPanner) return gain(ctx, 1); const s = ctx.createStereoPanner(); s.pan.value = Math.max(-1, Math.min(1, p)); return s; }
  const chain = (...n) => { for (let i = 1; i < n.length; i++) n[i - 1].connect(n[i]); return n[n.length - 1]; };
  // Glide an AudioParam to v with time constant tau (seconds), from now.
  function glide(ctx, param, v, tau = 0.5) { param.cancelScheduledValues(ctx.currentTime); param.setTargetAtTime(v, ctx.currentTime, tau); }

  // A decaying-noise impulse response for a ConvolverNode (a room, a valley, a stairwell...). secs = length,
  // decay = how fast it dies (higher = shorter), damp = how much darker the tail gets (0..1). Cached by its settings.
  function ir(ctx, secs = 2, decay = 3, damp = 0.5) {
    const key = `ir:${secs}:${decay}:${damp}`, sr = ctx.sampleRate;
    if (bufCache[key] && bufCache[key].sampleRate === sr) return bufCache[key];
    const n = Math.round(sr * secs), b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) { const t = i / n, a = 1 - damp * t * 0.98; lp = lp * (1 - a) + white() * a; d[i] = lp * Math.pow(1 - t, decay); }
    }
    return (bufCache[key] = b);
  }
  // A send: returns a node to connect sources into; it feeds `out` through a convolver (wet) only.
  // Make one or two in a pack's bed and hand them to the details through the bed's return value.
  function reverb(ctx, out, secs, decay, damp, wet = 0.3) {
    const inp = gain(ctx, 1), cv = ctx.createConvolver(), w = gain(ctx, wet);
    cv.buffer = ir(ctx, secs, decay, damp); chain(inp, cv, w, out);
    return inp;
  }

  // One-shot helpers (the same ones the app's current sounds use). t = start time in seconds (ctx time).
  function tone(ctx, out, t, f, peak, a, dec, type = 'sine', to) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + a + dec * 2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(0, t + a, dec);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + a + dec * 7);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    return o;
  }
  // Plays src from t until end through the nodes into out; disconnects everything once src has ended.
  function run(ctx, out, t, end, src, ...nodes) {
    chain(src, ...nodes, out);
    src.onended = () => { src.disconnect(); for (const n of nodes) n.disconnect(); };
    src.start(t); src.stop(end);
    return src;
  }
  function noiseBuf(ctx, len, fn) { return buffer(ctx, null, len, (n, sr) => { const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = white() * (fn ? fn(i / sr) : 1); return d; }); }
  // A filtered noise burst: sharp attack, decay of tau seconds.
  function noiseHit(ctx, out, t, len, peak, type, f, q, tau) {
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = noiseBuf(ctx, len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.003); g.gain.setTargetAtTime(0, t + 0.003, tau);
    return run(ctx, out, t, t + len, s, filt(ctx, type, f, q), g);
  }
  // A snap or a crackle: noise band-passed between lo and hi (Hz), decay tau.
  function snap(ctx, out, t, peak, lo, hi, tau) {
    const s = ctx.createBufferSource(), g = ctx.createGain(), len = tau * 7; s.buffer = noiseBuf(ctx, len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.0002); g.gain.setTargetAtTime(0, t + 0.0002, tau);
    return run(ctx, out, t, t + len, s, filt(ctx, 'highpass', lo, 0.7), filt(ctx, 'lowpass', hi, 0.7), g);
  }

  // ---- the scheduler: identical in the app and in the render harness ----
  // Called every 0.5 s with the scene's state st. For each detail d of the pack: skipped when d.when(st) is false or
  // when fewer than d.gap seconds have passed since it last played; otherwise it plays with probability rate/120
  // (rate = d.rate(st) in plays per minute). fire(name, d, gain, pan) is the caller's way to play it.
  function schedule(pack, st, t, R, last, fire) {
    const D = pack.details || {};
    for (const name in D) {
      const d = D[name];
      if (d.when && !d.when(st)) continue;
      if (last[name] != null && t - last[name] < (d.gap || 0)) continue;
      const rate = Math.max(0, d.rate ? d.rate(st) : 0);
      if (R() < rate / 120) {
        last[name] = t;
        const [lo, hi] = d.pan || [0, 0];
        fire(name, d, (d.gain == null ? 0.5 : d.gain) * (0.75 + 0.25 * R()), lo + (hi - lo) * R());
      }
    }
  }
  // Plays one detail (or an sfx override) now: its own gain and panner into master; cleaned up after d.dur seconds.
  function play(ctx, master, fn, g, p, R, st, X, dur = 16) {
    const G = gain(ctx, g), P = pan(ctx, p); chain(G, P, master);
    try { fn(ctx, G, R, st, X); } catch (e) { console.error('sound detail failed', e); }
    setTimeout(() => { G.disconnect(); P.disconnect(); }, dur * 1000 + 500);
  }

  window.SOUND_KIT = { TAU, white, rng, brownInto, pinkInto, loopBuffer, buffer, loop, filt, gain, pan, chain, glide, ir, reverb, tone, run, noiseBuf, noiseHit, snap, schedule, play };
  window.SCENE_SOUNDS = window.SCENE_SOUNDS || {};
})();
