// Liseuse à la lampe — pack sonore pour la scène « onsen » (bain thermal en plein air, vallée d'automne).
(function () {
  const TAU = Math.PI * 2;

  // Filtre biquad appliqué directement sur un Float32Array (pour sculpter résonances modales, bois, eau et formants).
  function biquadPass(d, sr, type, f, Q = 1) {
    const w0 = TAU * Math.max(20, Math.min(sr * 0.45, f)) / sr;
    const cos = Math.cos(w0), sin = Math.sin(w0), alpha = sin / (2 * Math.max(0.1, Q));
    let b0, b1, b2, a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
    if (type === 'lowpass') {
      b0 = (1 - cos) * 0.5; b1 = 1 - cos; b2 = (1 - cos) * 0.5;
    } else if (type === 'highpass') {
      b0 = (1 + cos) * 0.5; b1 = -(1 + cos); b2 = (1 + cos) * 0.5;
    } else {
      // bandpass (constant 0 dB peak)
      b0 = alpha; b1 = 0; b2 = -alpha;
    }
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < d.length; i++) {
      const x0 = d[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0;
      d[i] = y0;
    }
    return d;
  }

  // Enveloppe douce en début et fin de buffer pour garantir zéro saut d'échantillon (click).
  function declick(d, sr, fadeSec = 0.004) {
    const m = Math.min(d.length >> 2, Math.max(8, Math.round(sr * fadeSec)));
    for (let i = 0; i < m; i++) {
      const w = 0.5 - 0.5 * Math.cos(Math.PI * i / m);
      d[i] *= w;
      d[d.length - 1 - i] *= w;
    }
    return d;
  }

  // Envoi d'un buffer mono vers out et optionnellement vers un bus de réverbération.
  function playBuf(ctx, out, K, d, sr, lpHz, verb, verbSend = 0) {
    const buf = ctx.createBuffer(1, d.length, sr);
    buf.getChannelData(0).set(d);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = lpHz ? K.filt(ctx, 'lowpass', lpHz, 0.65) : null;
    if (lp) K.chain(src, lp, out);
    else K.chain(src, out);
    let sendGain = null;
    if (verb && verbSend > 0) {
      sendGain = K.gain(ctx, verbSend);
      (lp || src).connect(sendGain);
      sendGain.connect(verb);
    }
    const t = ctx.currentTime;
    src.onended = () => {
      src.disconnect();
      if (lp) lp.disconnect();
      if (sendGain) sendGain.disconnect();
    };
    src.start(t);
    return src;
  }

  // Adaptation de la présence des détails proches lorsque la pluie ou l'orage élève le niveau du lit.
  function weatherBoost(st, kRain = 1.45, kStorm = 1.65) {
    return 1 + kRain * (st.r || 0) + kStorm * (st.storm || 0);
  }

  // Calcule les cibles de niveaux et de filtres du lit continu selon l'état st.
  function bedTargets(st) {
    const rain = Math.max(0, Math.min(1, st.r || 0));
    const snow = Math.max(0, Math.min(1, st.s || 0));
    const storm = Math.max(0, Math.min(1, st.storm || 0));
    const wind = Math.max(0, Math.min(1, st.wind == null ? 0.15 : st.wind));
    const night = st.e < -0.1 ? Math.min(1, (-0.1 - st.e) / 0.5) : 0;

    // L'eau chaude du kakehi coule en permanence ; claire et vivante, un peu plus feutrée la nuit et sous la neige.
    const waterGain = 0.27 + 0.04 * rain - 0.012 * snow - 0.012 * night;
    const waterCut = Math.round(1850 - 220 * night - 260 * snow + 220 * rain);

    // Le vent dans la vallée et les érables/bambous : léger le jour, calme la nuit, feutré sous la neige, ample sous l'orage.
    const windGain = (0.10 + 0.17 * wind + 0.08 * storm) * (1 - 0.25 * snow) * (1 - 0.14 * night);
    const windCut = Math.round(780 + 750 * wind + 500 * storm - 240 * snow - 140 * night);

    // La pluie sur l'eau chaude du bain, les rochers et l'auvent en bois : progression continue dès 0 pour une transition midi->pluie parfaitement fluide.
    const rainAmt = Math.max(rain, storm * 0.95);
    const rainGain = 0.42 * Math.pow(rainAmt, 1.12) + 0.09 * storm;
    const rainCut = Math.round(950 + 1450 * Math.pow(rainAmt, 0.8) + 450 * storm);

    return { waterGain, waterCut, windGain, windCut, rainGain, rainCut };
  }

  window.SCENE_SOUNDS = window.SCENE_SOUNDS || {};

  window.SCENE_SOUNDS.onsen = {
    bed(ctx, out, K, st) {
      const R = K.rng(3082026);
      const t0 = bedTargets(st);

      // 1. Eau thermale : filet du conduit en bambou (kakehi, à droite ch=1) et clapotis doux du bain (17.3 s)
      const waterBuf = K.loopBuffer(ctx, 'onsen:water:v4', 17.3, (n, sr, ch) => {
        const d = new Float32Array(n);
        const flow = new Float32Array(n);
        K.brownInto(flow, 0.50, 0.035, R);
        K.pinkInto(flow, 0.68, R);
        biquadPass(flow, sr, 'highpass', 215, 0.7);
        biquadPass(flow, sr, 'lowpass', ch === 1 ? 1480 : 960, 0.7);

        const spoutWeight = ch === 1 ? 1.18 : 0.74;
        const p1 = R() * TAU, p2 = R() * TAU, p3 = R() * TAU;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const mod = 0.76
            + 0.13 * Math.sin(TAU * (t / 5.77) + p1)
            + 0.08 * Math.sin(TAU * (t / 3.46) + p2)
            + 0.06 * Math.sin(TAU * (t / 1.73) + p3);
          d[i] = flow[i] * mod * spoutWeight * 0.62;
        }

        // Gouttelettes et petits remous distincts du filet d'eau tombant du bambou (espacés pour être bien lisibles)
        const dropsPerSec = ch === 1 ? 15 : 7;
        const totalDrops = Math.floor((n / sr) * dropsPerSec);
        const tex = new Float32Array(n);
        for (let m = 0; m < totalDrops; m++) {
          const idx = Math.floor(R() * (n - Math.ceil(sr * 0.035)));
          const dur = 0.008 + 0.016 * Math.pow(R(), 1.3);
          const len = Math.floor(dur * sr);
          const f0 = R() < 0.55 ? (340 + 310 * R()) : (650 + 800 * Math.pow(R(), 1.3));
          const chirp = 1.10 + 0.16 * R();
          const amp = (0.18 + 0.26 * Math.pow(R(), 1.4)) * (ch === 1 ? 1.25 : 0.70);
          let phase = R() * TAU;
          for (let k = 0; k < len; k++) {
            const u = k / len;
            const env = Math.sin(Math.PI * u) * Math.exp(-3.4 * u);
            const fInst = f0 * (1 + (chirp - 1) * u * u);
            phase += TAU * fInst / sr;
            const splash = (R() * 2 - 1) * Math.exp(-8 * u) * 0.55;
            tex[idx + k] += (Math.sin(phase) * 0.50 + splash) * env * amp;
          }
        }
        biquadPass(tex, sr, 'highpass', 260, 0.7);
        biquadPass(tex, sr, 'lowpass', ch === 1 ? 1950 : 1400, 0.75);
        for (let i = 0; i < n; i++) d[i] += tex[i] * 1.18;
        return d;
      }, 0.15);

      // 2. Brise de la vallée d'automne dans l'érable (à gauche) et les bambous (à droite) (21.7 s)
      const windBuf = K.loopBuffer(ctx, 'onsen:wind:v4', 21.7, (n, sr, ch) => {
        const d = new Float32Array(n);
        const air = new Float32Array(n);
        const leaves = new Float32Array(n);
        K.brownInto(air, 0.60, 0.04, R);
        K.pinkInto(air, 0.58, R);
        biquadPass(air, sr, 'highpass', 190, 0.7);
        biquadPass(air, sr, 'lowpass', 680, 0.7);

        K.pinkInto(leaves, 0.95, R);
        biquadPass(leaves, sr, 'bandpass', ch === 0 ? 1280 : 1020, 1.0);

        const q1 = R() * TAU, q2 = R() * TAU, q3 = R() * TAU;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const swell = 0.50
            + 0.27 * Math.sin(TAU * (t / 10.85) + q1)
            + 0.16 * Math.sin(TAU * (t / 7.23) + q2)
            + 0.09 * Math.sin(TAU * (t / 4.34) + q3);
          const flutter = 0.70 + 0.30 * Math.sin(TAU * 16.5 * t + Math.sin(TAU * 2.3 * t) * 1.6);
          const leafEnv = Math.max(0, swell - 0.30) * flutter;
          d[i] = air[i] * swell * 0.75 + leaves[i] * leafEnv * 0.48;
        }
        return d;
      }, 0.15);

      // 3. Pluie sur la surface du bain chaud, les pierres mouillées et l'auvent en bois (19.1 s)
      const rainBuf = K.loopBuffer(ctx, 'onsen:rain:v4', 19.1, (n, sr, ch) => {
        const d = new Float32Array(n);
        K.brownInto(d, 0.70, 0.045, R);
        K.pinkInto(d, 0.75, R);
        biquadPass(d, sr, 'highpass', 220, 0.7);
        biquadPass(d, sr, 'lowpass', 2100, 0.65);

        const drops = new Float32Array(n);
        const count = Math.floor((n / sr) * 110);
        for (let m = 0; m < count; m++) {
          const idx = Math.floor(R() * (n - Math.ceil(sr * 0.016)));
          const onWater = R() < 0.70;
          const len = Math.floor(sr * (onWater ? (0.004 + 0.006 * R()) : (0.002 + 0.003 * R())));
          const amp = (0.09 + 0.22 * Math.pow(R(), 1.8)) * (0.85 + 0.3 * (ch === 0 ? R() : 1 - R()));
          const fRes = onWater ? (520 + 980 * R()) : (380 + 720 * R());
          let ph = R() * TAU;
          for (let k = 0; k < len; k++) {
            const u = k / len;
            const env = (1 - u) * Math.exp(-3.0 * u);
            ph += TAU * fRes * (1 + 0.12 * u) / sr;
            const w = (R() * 2 - 1) * 0.60 + (onWater ? Math.sin(ph) * 0.40 : 0);
            drops[idx + k] += w * env * amp;
          }
        }
        biquadPass(drops, sr, 'bandpass', 980, 0.75);
        for (let i = 0; i < n; i++) d[i] += drops[i] * 0.85;
        return d;
      }, 0.15);

      const waterSrc = K.loop(ctx, waterBuf, 1, R() * 10);
      const waterLp = K.filt(ctx, 'lowpass', t0.waterCut, 0.6);
      const waterGain = K.gain(ctx, t0.waterGain);
      K.chain(waterSrc, waterLp, waterGain, out);

      const windSrc = K.loop(ctx, windBuf, 1, R() * 10);
      const windHp = K.filt(ctx, 'highpass', 180, 0.6);
      const windLp = K.filt(ctx, 'lowpass', t0.windCut, 0.65);
      const windGain = K.gain(ctx, t0.windGain);
      K.chain(windSrc, windHp, windLp, windGain, out);

      const rainSrc = K.loop(ctx, rainBuf, 1, R() * 10);
      const rainHp = K.filt(ctx, 'highpass', 230, 0.65);
      const rainLp = K.filt(ctx, 'lowpass', t0.rainCut, 0.6);
      const rainGain = K.gain(ctx, t0.rainGain);
      K.chain(rainSrc, rainHp, rainLp, rainGain, out);

      // Deux espaces acoustiques : les rochers/eau proches (bathVerb) et la grande vallée brumeuse (valleyVerb)
      const bathVerb = K.reverb(ctx, out, 0.85, 4.0, 0.52, 0.28);
      const valleyVerb = K.reverb(ctx, out, 2.5, 2.6, 0.65, 0.42);

      return {
        nodes: [waterSrc, windSrc, rainSrc],
        bathVerb,
        valleyVerb,
        set(stNow) {
          const tgt = bedTargets(stNow);
          K.glide(ctx, waterGain.gain, tgt.waterGain, 1.2);
          K.glide(ctx, waterLp.frequency, tgt.waterCut, 1.2);
          K.glide(ctx, windGain.gain, tgt.windGain, 1.2);
          K.glide(ctx, windLp.frequency, tgt.windCut, 1.2);
          K.glide(ctx, rainGain.gain, tgt.rainGain, 1.2);
          K.glide(ctx, rainLp.frequency, tgt.rainCut, 1.2);
        },
      };
    },

    details: {
      // 1. Inflexion liquide du filet d'eau sortant du conduit en bambou (kakehi, à droite)
      filet_bambou: {
        rate: (st) => 2.5 + (st.r || 0) * 1.0,
        gap: 11,
        gain: 0.66,
        pan: [0.42, 0.72],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, sr = ctx.sampleRate;
          const dur = 0.68 + R() * 0.38, n = Math.round(sr * dur);
          const d = new Float32Array(n);
          const wb = weatherBoost(st);
          K.pinkInto(d, 0.78, R);
          for (let i = 0; i < n; i++) {
            const u = i / n;
            d[i] *= Math.sin(Math.PI * u) * (0.65 + 0.35 * Math.sin(TAU * (3.5 + R() * 2) * u)) * wb;
          }
          biquadPass(d, sr, 'bandpass', 620 + R() * 220, 1.0);

          const count = 5 + Math.floor(R() * 4);
          for (let m = 0; m < count; m++) {
            const t0 = (0.08 + 0.78 * (m + 0.25 * R()) / count) * dur;
            const i0 = Math.floor(t0 * sr), len = Math.floor((0.014 + 0.012 * R()) * sr);
            const f0 = 420 + 520 * R(), f1 = f0 * (1.15 + 0.16 * R());
            const amp = (0.48 + 0.28 * R()) * wb;
            let ph = 0;
            for (let k = 0; k < len && i0 + k < n; k++) {
              const u = k / len;
              const env = Math.sin(Math.PI * u) * Math.exp(-2.8 * u);
              ph += TAU * (f0 + (f1 - f0) * u * u) / sr;
              const imp = (R() * 2 - 1) * Math.exp(-6.5 * u) * 0.52;
              d[i0 + k] += (Math.sin(ph) * 0.55 + imp) * env * amp;
            }
          }
          for (let i = 0; i < n; i++) d[i] *= 1.25;
          declick(d, sr, 0.008);
          playBuf(ctx, out, K, d, sr, 1750, X.bathVerb, 0.38);
        },
      },

      // 2. Clapotis lent de l'eau du bain contre les rochers du bord
      clapotis_roche: {
        rate: (st) => 2.3 + (st.wind || 0.15) * 1.4,
        gap: 12,
        gain: 0.64,
        pan: [-0.75, 0.65],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, sr = ctx.sampleRate;
          const dur = 0.78 + R() * 0.40, n = Math.round(sr * dur);
          const d = new Float32Array(n);
          const wb = weatherBoost(st);
          const body = new Float32Array(n);
          K.brownInto(body, 0.90, 0.045, R);
          K.pinkInto(body, 0.80, R);
          biquadPass(body, sr, 'bandpass', 430 + R() * 160, 0.9);

          const split = 0.42 + R() * 0.14;
          for (let i = 0; i < n; i++) {
            const u = i / n;
            const w1 = u < split ? Math.sin(Math.PI * (u / split)) ** 1.4 : 0;
            const w2 = u >= split * 0.70 ? Math.sin(Math.PI * Math.min(1, (u - split * 0.70) / (1 - split * 0.70))) ** 1.6 * 0.75 : 0;
            d[i] = body[i] * (w1 + w2) * 1.35 * wb;
          }
          for (let m = 0; m < 3; m++) {
            const i0 = Math.floor((0.15 + m * 0.22 + R() * 0.08) * n);
            const len = Math.floor((0.016 + 0.012 * R()) * sr);
            const f0 = 460 + 380 * R();
            let ph = 0;
            for (let k = 0; k < len && i0 + k < n; k++) {
              const u = k / len;
              ph += TAU * f0 * (1 + 0.14 * u) / sr;
              d[i0 + k] += (Math.sin(ph) * 0.48 + (R() * 2 - 1) * 0.52) * Math.sin(Math.PI * u) * Math.exp(-3.0 * u) * 0.42 * wb;
            }
          }
          declick(d, sr, 0.01);
          playBuf(ctx, out, K, d, sr, 1500, X.bathVerb, 0.38);
        },
      },

      // 3. Petites bulles thermales remontant du fond et éclatant doucement à la surface
      bulles_source: {
        rate: () => 2.2,
        gap: 13,
        gain: 0.66,
        pan: [-0.5, 0.55],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, sr = ctx.sampleRate;
          const dur = 0.55 + R() * 0.30, n = Math.round(sr * dur);
          const d = new Float32Array(n);
          const wb = weatherBoost(st);
          K.pinkInto(d, 0.45, R);
          for (let i = 0; i < n; i++) d[i] *= Math.sin(Math.PI * i / n) * 0.65 * wb;
          biquadPass(d, sr, 'bandpass', 480, 1.1);

          const nb = 4 + Math.floor(R() * 4);
          for (let b = 0; b < nb; b++) {
            const t0 = 0.04 + (b / nb) * (dur - 0.14) + R() * 0.04;
            const i0 = Math.floor(t0 * sr);
            const len = Math.floor((0.014 + 0.011 * R()) * sr);
            const f0 = 380 + 460 * R();
            const amp = (0.45 + 0.28 * R()) * (0.75 + 0.25 * Math.sin(Math.PI * (b + 0.5) / nb)) * wb;
            let ph = 0;
            for (let k = 0; k < len && i0 + k < n; k++) {
              const u = k / len;
              const env = Math.sin(Math.PI * u) * Math.exp(-3.2 * u);
              ph += TAU * (f0 * (1 + 0.26 * u * u)) / sr;
              const noise = (R() * 2 - 1) * Math.exp(-5.5 * u) * 0.48;
              d[i0 + k] += (Math.sin(ph) * 0.56 + noise) * env * amp;
            }
          }
          biquadPass(d, sr, 'lowpass', 1600, 0.7);
          for (let i = 0; i < n; i++) d[i] *= 1.25;
          declick(d, sr, 0.005);
          playBuf(ctx, out, K, d, sr, 1550, X.bathVerb, 0.38);
        },
      },

      // 4. Gouttes d'eau tombant d'un rocher humide ou du rebord en bois dans le bain
      goutte_pierre: {
        rate: (st) => 2.1 + (st.r || 0) * 1.5 + (st.s || 0) * 0.8,
        gap: 11,
        gain: 0.66,
        pan: [-0.68, 0.72],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, sr = ctx.sampleRate;
          const drops = 2 + (R() < 0.5 ? 1 : 0);
          const dur = 0.40 + drops * 0.16, n = Math.round(sr * dur);
          const d = new Float32Array(n);
          const wb = weatherBoost(st);
          // Léger frémissement de la surface de l'eau sous les gouttes
          K.pinkInto(d, 0.35, R);
          for (let i = 0; i < n; i++) d[i] *= Math.sin(Math.PI * i / n) * 0.55 * wb;
          biquadPass(d, sr, 'bandpass', 560, 1.1);

          let t = 0.03;
          for (let m = 0; m < drops; m++) {
            const i0 = Math.floor(t * sr);
            const len = Math.floor((0.018 + 0.010 * R()) * sr);
            const f0 = 460 + 520 * R();
            const amp = (0.55 + 0.25 * R()) * wb / (1 + m * 0.22);
            let ph = 0;
            for (let k = 0; k < len && i0 + k < n; k++) {
              const u = k / len;
              const splash = (R() * 2 - 1) * Math.exp(-7.5 * u) * 0.62;
              ph += TAU * (f0 * (1 + 0.22 * u * u)) / sr;
              const cav = Math.sin(ph) * Math.sin(Math.PI * u) * Math.exp(-3.2 * u) * 0.55;
              d[i0 + k] += (splash + cav) * amp;
            }
            t += 0.11 + R() * 0.14;
          }
          biquadPass(d, sr, 'bandpass', 780, 0.72);
          for (let i = 0; i < n; i++) d[i] *= 1.28;
          declick(d, sr, 0.004);
          playBuf(ctx, out, K, d, sr, 1700, X.bathVerb, 0.44);
        },
      },

      // 5. Frémissement des feuilles d'érable (momiji à gauche) ou du feuillage doré (à droite)
      feuilles_automne: {
        when: (st) => (st.r || 0) < 0.65,
        rate: (st) => 1.8 + (st.wind || 0.15) * 2.8,
        gap: 14,
        gain: 0.64,
        pan: [-0.85, 0.80],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, sr = ctx.sampleRate;
          const dur = 1.15 + R() * 0.80, n = Math.round(sr * dur);
          const d = new Float32Array(n);
          const wb = weatherBoost(st, 0.8, 0.7);
          K.pinkInto(d, 1.0, R);
          const flutterHz = 19 + R() * 14, ph0 = R() * TAU;
          for (let i = 0; i < n; i++) {
            const u = i / n, t = i / sr;
            const env = Math.pow(Math.sin(Math.PI * u), 1.5) * (0.65 + 0.35 * Math.sin(TAU * 1.7 * u + ph0));
            const grain = 0.50 + 0.50 * Math.sin(TAU * flutterHz * t + Math.sin(TAU * 3.4 * t) * 2.2);
            d[i] *= env * grain * 1.15 * wb;
          }
          biquadPass(d, sr, 'highpass', 480, 0.7);
          biquadPass(d, sr, 'bandpass', 1420 + R() * 480, 0.85);
          biquadPass(d, sr, 'lowpass', 2900, 0.7);
          for (let i = 0; i < n; i++) d[i] *= 1.35;
          declick(d, sr, 0.015);
          playBuf(ctx, out, K, d, sr, 2700, X.valleyVerb, 0.32);
        },
      },

      // 6. Léger travail du bambou (palissade takegaki à droite) ou du seau en cèdre (oke) — synthèse modale boisée
      bambou_bois: {
        rate: (st) => 1.4 + (st.wind || 0.15) * 1.4,
        gap: 17,
        gain: 0.64,
        pan: [0.35, 0.82],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, sr = ctx.sampleRate;
          const dur = 0.42 + R() * 0.22, n = Math.round(sr * dur);
          const d = new Float32Array(n);
          const wb = weatherBoost(st);
          const ticks = 2 + (R() < 0.55 ? 1 : 0);
          let t = 0.025;
          const baseF = 360 + R() * 150;
          for (let m = 0; m < ticks; m++) {
            const i0 = Math.floor(t * sr), len = Math.floor((0.026 + 0.014 * R()) * sr);
            const m1 = new Float32Array(len), m2 = new Float32Array(len);
            for (let k = 0; k < len; k++) {
              const u = k / len;
              const exc = (R() * 2 - 1) * Math.exp(-6.5 * u) * (0.85 / (1 + m * 0.28)) * wb;
              m1[k] = exc;
              m2[k] = exc;
            }
            biquadPass(m1, sr, 'bandpass', baseF * (1 + m * 0.06), 6.5);
            biquadPass(m2, sr, 'bandpass', baseF * 2.28 * (1 + m * 0.04), 8.0);
            for (let k = 0; k < len && i0 + k < n; k++) d[i0 + k] += (m1[k] * 2.8 + m2[k] * 1.5);
            t += 0.06 + R() * 0.080;
          }
          biquadPass(d, sr, 'lowpass', 1800, 0.7);
          declick(d, sr, 0.004);
          playBuf(ctx, out, K, d, sr, 1700, X.bathVerb, 0.36);
        },
      },

      // 7. Oiseau de montagne lointain dans la vallée d'automne (matin et midi secs : pic kogera ou tourterelle kijibato)
      oiseau_vallee: {
        when: (st) => st.e > 0.05 && (st.r || 0) < 0.25 && (st.s || 0) < 0.5,
        rate: (st) => (st.h < 10 ? 3.2 : 1.9) * (1 - (st.r || 0)),
        gap: 15,
        gain: 0.56,
        pan: [-0.80, 0.75],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, sr = ctx.sampleRate;
          if (R() < 0.52) {
            // Variante A : Pic pygmée japonais (kogera) tambourinant doucement sur un tronc creux dans la vallée
            const taps = 6 + Math.floor(R() * 4);
            const dur = 0.25 + taps * 0.055, n = Math.round(sr * dur);
            const d = new Float32Array(n);
            const fTrunk = 560 + R() * 240;
            let t = 0.03;
            for (let m = 0; m < taps; m++) {
              const i0 = Math.floor(t * sr), len = Math.floor(0.020 * sr);
              const sub = new Float32Array(len);
              const envTap = Math.sin(Math.PI * (m + 0.5) / taps);
              for (let k = 0; k < len; k++) {
                sub[k] = (R() * 2 - 1) * Math.exp(-8.0 * k / len) * (0.78 * (0.45 + 0.55 * envTap));
              }
              biquadPass(sub, sr, 'bandpass', fTrunk * (1 + 0.03 * Math.sin(m)), 6.0);
              for (let k = 0; k < len && i0 + k < n; k++) d[i0 + k] += sub[k] * 2.8;
              t += 0.048 + R() * 0.010;
            }
            biquadPass(d, sr, 'lowpass', 1550, 0.7);
            declick(d, sr, 0.006);
            playBuf(ctx, out, K, d, sr, 1500, X.valleyVerb, 0.80);
          } else {
            // Variante B : Tourterelle orientale de montagne (kijibato) au loin — roucoulement boisé et roulé
            const dur = 1.25, n = Math.round(sr * dur);
            const d = new Float32Array(n);
            const fBase = 435 + R() * 42;
            const sylls = [
              { t0: 0.04, len: 0.20, fMul: 0.96, drop: -0.04, amp: 0.45 },
              { t0: 0.30, len: 0.14, fMul: 1.05, drop: 0.04, amp: 0.36 },
              { t0: 0.50, len: 0.26, fMul: 0.94, drop: -0.08, amp: 0.46 },
              { t0: 0.82, len: 0.18, fMul: 0.89, drop: -0.06, amp: 0.32 },
            ];
            for (const sy of sylls) {
              const i0 = Math.floor(sy.t0 * sr), len = Math.floor(sy.len * sr);
              const sub = new Float32Array(len);
              let ph = 0;
              for (let k = 0; k < len; k++) {
                const u = k / len, tk = k / sr;
                const env = Math.pow(Math.sin(Math.PI * u), 1.5) * Math.exp(-1.1 * u);
                const warble = 0.82 + 0.18 * Math.sin(TAU * 17.5 * tk);
                const f = fBase * sy.fMul * (1 + sy.drop * u * u) * (1 + 0.008 * Math.sin(TAU * 17.5 * tk));
                ph += TAU * f / sr;
                const breath = (R() * 2 - 1) * 0.52;
                const throat = Math.sin(ph) * 0.48;
                sub[k] = (throat + breath) * env * warble * sy.amp;
              }
              biquadPass(sub, sr, 'bandpass', fBase * sy.fMul, 7.0);
              for (let k = 0; k < len && i0 + k < n; k++) d[i0 + k] += sub[k] * 2.3;
            }
            biquadPass(d, sr, 'lowpass', 820, 0.7);
            declick(d, sr, 0.010);
            playBuf(ctx, out, K, d, sr, 800, X.valleyVerb, 0.82);
          }
        },
      },

      // 8. Corbeau (karasu) très lointain dans la vallée d'automne (jour et crépuscule secs)
      corbeau_vallee: {
        when: (st) => st.e > -0.12 && (st.r || 0) < 0.3,
        rate: (st) => (st.e < 0.25 ? 1.8 : 1.2) * (1 - 0.3 * (st.s || 0)),
        gap: 24,
        gain: 0.56,
        pan: [-0.85, 0.85],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, sr = ctx.sampleRate;
          const calls = R() < 0.65 ? 2 : 1;
          const dur = 0.55 + calls * 0.42, n = Math.round(sr * dur);
          const d = new Float32Array(n);
          const f0Base = 285 + R() * 42;
          let t = 0.04;
          for (let c = 0; c < calls; c++) {
            const cDur = 0.25 + R() * 0.08;
            const i0 = Math.floor(t * sr), len = Math.floor(cDur * sr);
            const f1 = new Float32Array(len), f2 = new Float32Array(len);
            let ph = 0, roughPh = 0;
            for (let k = 0; k < len; k++) {
              const u = k / len;
              const arch = Math.sin(Math.PI * Math.pow(u, 0.75));
              const env = Math.pow(arch, 1.3) * Math.exp(-1.0 * u);
              const f0 = f0Base * (0.95 + 0.12 * arch - 0.14 * u * u);
              roughPh += TAU * 68 / sr;
              ph += TAU * f0 * (1 + 0.025 * Math.sin(roughPh)) / sr;
              const glot = Math.sin(ph) + 0.58 * Math.sin(2 * ph) + 0.38 * Math.sin(3 * ph) + 0.22 * Math.sin(4 * ph);
              const src = (glot * 0.58 + (R() * 2 - 1) * 0.42) * env * (0.54 / (1 + c * 0.18));
              f1[k] = src;
              f2[k] = src;
            }
            biquadPass(f1, sr, 'bandpass', 650, 2.8);
            biquadPass(f2, sr, 'bandpass', 1200, 3.4);
            for (let k = 0; k < len && i0 + k < n; k++) d[i0 + k] += (f1[k] * 1.5 + f2[k] * 1.1);
            t += cDur + 0.14 + R() * 0.08;
          }
          biquadPass(d, sr, 'lowpass', 1300, 0.7);
          declick(d, sr, 0.01);
          playBuf(ctx, out, K, d, sr, 1250, X.valleyVerb, 0.82);
        },
      },

      // 9. Insecte d'automne (suzumushi / koorogi) au crépuscule et la nuit : impulsions modales de frottement d'élytres
      suzumushi: {
        when: (st) => st.e < 0.05 && (st.r || 0) < 0.35 && (st.s || 0) < 0.2,
        rate: (st) => st.e > -0.25 ? 3.8 : 2.8,
        gap: 10,
        gain: 0.56,
        pan: [-0.80, 0.80],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, sr = ctx.sampleRate;
          const strokes = 2 + (R() < 0.35 ? 1 : 0);
          const dur = 0.35 + strokes * 0.44, n = Math.round(sr * dur);
          const d = new Float32Array(n);
          const fWing = 2550 + R() * 320;
          let t = 0.04;
          for (let s = 0; s < strokes; s++) {
            const sDur = 0.30 + R() * 0.08;
            const i0 = Math.floor(t * sr), len = Math.floor(sDur * sr);
            const sub1 = new Float32Array(len), sub2 = new Float32Array(len);
            const pulses = 11 + Math.floor(R() * 4);
            for (let p = 0; p < pulses; p++) {
              const uStroke = (p + 0.5) / pulses;
              const strokeEnv = Math.pow(Math.sin(Math.PI * uStroke), 1.5) * (0.9 / (1 + s * 0.22));
              const pStart = Math.floor((p / pulses + (R() - 0.5) * 0.01) * len);
              const pLen = Math.floor(0.0085 * sr);
              let ph = R() * TAU;
              const fPulse = fWing * (0.97 + 0.05 * Math.sin(Math.PI * uStroke));
              for (let k = 0; k < pLen && pStart + k < len; k++) {
                if (pStart + k < 0) continue;
                const u = k / pLen;
                const pEnv = Math.sin(Math.PI * u) * Math.exp(-3.5 * u) * strokeEnv;
                ph += TAU * (fPulse * (1 - 0.04 * u)) / sr;
                const exc = ((R() * 2 - 1) * 0.62 + Math.sin(ph) * 0.38) * pEnv * 0.68;
                sub1[pStart + k] += exc;
                sub2[pStart + k] += exc;
              }
            }
            biquadPass(sub1, sr, 'bandpass', fWing, 9.0);
            biquadPass(sub2, sr, 'bandpass', fWing * 0.52, 5.5);
            for (let k = 0; k < len && i0 + k < n; k++) d[i0 + k] += (sub1[k] * 2.2 + sub2[k] * 1.1);
            t += sDur + 0.10 + R() * 0.06;
          }
          biquadPass(d, sr, 'lowpass', 3100, 0.7);
          declick(d, sr, 0.01);
          playBuf(ctx, out, K, d, sr, 3000, X.valleyVerb, 0.70);
        },
      },

      // 10. Chouette de montagne (fukuro) très lointaine dans la forêt nocturne
      chouette_lointaine: {
        when: (st) => st.e < -0.25 && (st.r || 0) < 0.35,
        rate: () => 2.5,
        gap: 22,
        gain: 0.48,
        pan: [-0.80, 0.70],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, sr = ctx.sampleRate;
          const dur = 1.65, n = Math.round(sr * dur);
          const d = new Float32Array(n);
          const fBase = 325 + R() * 35;
          const notes = [
            { t0: 0.05, len: 0.34, fMul: 1.0, drop: 0.93, amp: 0.42 },
            { t0: 0.68, len: 0.18, fMul: 1.02, drop: 0.97, amp: 0.30 },
            { t0: 0.94, len: 0.44, fMul: 0.98, drop: 0.89, amp: 0.38 },
          ];
          for (const nt of notes) {
            const i0 = Math.floor(nt.t0 * sr), len = Math.floor(nt.len * sr);
            const sub = new Float32Array(len);
            let ph = 0;
            for (let k = 0; k < len; k++) {
              const u = k / len;
              const env = Math.pow(Math.sin(Math.PI * u), 1.4) * Math.exp(-1.0 * u);
              const f = fBase * nt.fMul * (1 + (nt.drop - 1) * u * u);
              ph += TAU * f / sr;
              const breath = (R() * 2 - 1) * 0.38;
              const body = Math.sin(ph) * 0.62;
              sub[k] = (body + breath) * env * nt.amp;
            }
            biquadPass(sub, sr, 'bandpass', fBase * nt.fMul, 6.5);
            for (let k = 0; k < len && i0 + k < n; k++) d[i0 + k] += sub[k] * 1.85;
          }
          biquadPass(d, sr, 'lowpass', 720, 0.7);
          declick(d, sr, 0.012);
          playBuf(ctx, out, K, d, sr, 700, X.valleyVerb, 0.82);
        },
      },

      // 11. Gouttes lourdes de l'auvent en bois tombant dans le bain chaud par temps de pluie/orage
      goutte_auvent: {
        when: (st) => (st.r || 0) > 0.15 || (st.storm || 0) > 0.15,
        rate: (st) => 2.5 + (st.r || 0) * 3.0 + (st.storm || 0) * 1.5,
        gap: 9,
        gain: 0.68,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, sr = ctx.sampleRate;
          const count = 3 + Math.floor(R() * 3);
          const dur = 0.42 + count * 0.15, n = Math.round(sr * dur);
          const d = new Float32Array(n);
          const wb = weatherBoost(st, 1.45, 1.75);
          K.pinkInto(d, 0.45, R);
          for (let i = 0; i < n; i++) d[i] *= Math.sin(Math.PI * i / n) * 0.65 * wb;
          biquadPass(d, sr, 'bandpass', 580, 1.0);

          let t = 0.03;
          for (let m = 0; m < count; m++) {
            const i0 = Math.floor(t * sr), len = Math.floor((0.020 + 0.012 * R()) * sr);
            const f0 = 360 + 420 * R();
            const amp = (0.52 + 0.22 * R()) * wb;
            let ph = 0;
            for (let k = 0; k < len && i0 + k < n; k++) {
              const u = k / len;
              ph += TAU * (f0 * (1 + 0.24 * u * u)) / sr;
              const woodTap = (R() * 2 - 1) * Math.exp(-7.5 * u) * 0.58;
              const plop = Math.sin(ph) * Math.sin(Math.PI * u) * Math.exp(-3.0 * u) * 0.55;
              d[i0 + k] += (woodTap + plop) * amp;
            }
            t += 0.09 + R() * 0.13;
          }
          biquadPass(d, sr, 'bandpass', 720, 0.78);
          for (let i = 0; i < n; i++) d[i] *= 1.25;
          declick(d, sr, 0.005);
          playBuf(ctx, out, K, d, sr, 1700, X.bathVerb, 0.44);
        },
      },

      // 12. Neige fraîche glissant doucement d'une branche d'érable ou de la clôture en bambou (scénario neige)
      neige_branche: {
        when: (st) => (st.s || 0) > 0.2,
        rate: (st) => 2.8 * (st.s || 0.7),
        gap: 12,
        gain: 0.60,
        pan: [-0.80, 0.80],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, sr = ctx.sampleRate;
          const dur = 0.68 + R() * 0.35, n = Math.round(sr * dur);
          const d = new Float32Array(n);
          K.pinkInto(d, 1.0, R);
          for (let i = 0; i < n; i++) {
            const u = i / n;
            const slide = u < 0.65 ? Math.sin(Math.PI * (u / 0.65)) ** 1.5 * 0.52 : 0;
            const thud = u >= 0.42 ? Math.sin(Math.PI * Math.min(1, (u - 0.42) / 0.58)) ** 1.8 * Math.exp(-2.8 * (u - 0.42)) * 0.85 : 0;
            d[i] *= (slide + thud);
          }
          biquadPass(d, sr, 'lowpass', 850, 0.75);
          declick(d, sr, 0.01);
          playBuf(ctx, out, K, d, sr, 920, X.bathVerb, 0.38);
        },
      },
    },

    sfx: {
      // Cloche de temple bouddhiste (bonshō) au loin dans la vallée à 6 h et 18 h : grave, profonde, battement lent (unari)
      bell(ctx, out, R, st, X) {
        const K = window.SOUND_KIT, sr = ctx.sampleRate;
        const dur = 6.2, n = Math.round(sr * dur);
        const d = new Float32Array(n);
        const f0 = 104 + R() * 8;
        const partials = [
          [1.0, 0.27, 2.3],
          [1.0042, 0.21, 2.2],
          [1.996, 0.15, 1.5],
          [2.003, 0.10, 1.4],
          [2.62, 0.05, 0.9],
          [2.98, 0.055, 0.85],
          [4.12, 0.025, 0.45],
        ];
        const strikeLen = Math.floor(0.14 * sr);
        const strike = new Float32Array(strikeLen);
        K.brownInto(strike, 0.75, 0.05, R);
        for (let i = 0; i < strikeLen; i++) {
          const u = i / strikeLen;
          strike[i] *= Math.sin(Math.PI * Math.min(1, u * 5)) * Math.exp(-5.5 * u) * 0.38;
        }
        biquadPass(strike, sr, 'lowpass', 290, 0.8);
        for (let i = 0; i < strikeLen; i++) d[i] += strike[i];

        for (const [mult, amp, tau] of partials) {
          const f = f0 * mult;
          let ph = R() * 0.4;
          for (let i = 0; i < n; i++) {
            const t = i / sr;
            const atk = t < 0.028 ? (0.5 - 0.5 * Math.cos(Math.PI * t / 0.028)) : 1;
            const dec = Math.exp(-t / tau);
            ph += TAU * f / sr;
            d[i] += Math.sin(ph) * amp * atk * dec;
          }
        }
        biquadPass(d, sr, 'lowpass', 850, 0.65);
        declick(d, sr, 0.015);
        playBuf(ctx, out, K, d, sr, 820, X && X.valleyVerb, 0.68);
      },

      // Allumage d'une lanterne en papier (chōchin) ou de la lanterne de pierre (ishi-dōrō) : frottement court + souffle chaud
      match(ctx, out, R, st, X) {
        const K = window.SOUND_KIT, sr = ctx.sampleRate;
        const dur = 0.62, n = Math.round(sr * dur);
        const d = new Float32Array(n);

        // 1. Frottement court et boisé de l'allumette (0 à 65 ms)
        const scLen = Math.floor((0.058 + 0.015 * R()) * sr);
        const sc = new Float32Array(scLen);
        const grainHz = 55 + R() * 25;
        for (let i = 0; i < scLen; i++) {
          const u = i / scLen, t = i / sr;
          const env = Math.sin(Math.PI * u) * (0.45 + 0.55 * Math.abs(Math.sin(Math.PI * grainHz * t)));
          sc[i] = (R() * 2 - 1) * env * 0.85;
        }
        biquadPass(sc, sr, 'bandpass', 1750, 1.0);
        for (let i = 0; i < scLen; i++) d[i] += sc[i] * 1.6;

        // 2. Petit souffle chaud d'embrasement de la mèche (de 45 ms à 480 ms)
        const flStart = Math.floor(0.045 * sr), flLen = Math.floor(0.42 * sr);
        const fl = new Float32Array(flLen);
        K.brownInto(fl, 0.70, 0.045, R);
        K.pinkInto(fl, 1.0, R);
        for (let i = 0; i < flLen; i++) {
          const u = i / flLen;
          const env = (u < 0.16 ? Math.sin((Math.PI * 0.5) * (u / 0.16)) : Math.exp(-3.2 * (u - 0.16)));
          fl[i] *= env * 0.85;
        }
        biquadPass(fl, sr, 'bandpass', 560, 0.70);
        for (let i = 0; i < flLen && flStart + i < n; i++) d[flStart + i] += fl[i] * 1.85;

        // 3. Trois micro-crépitements très doux du bois d'allumette
        for (let c = 0; c < 3; c++) {
          const i0 = flStart + Math.floor((0.06 + c * 0.08 + R() * 0.05) * sr);
          const cLen = Math.floor(0.004 * sr);
          const cr = new Float32Array(cLen);
          for (let k = 0; k < cLen; k++) cr[k] = (R() * 2 - 1) * Math.exp(-5 * k / cLen) * 0.32;
          biquadPass(cr, sr, 'bandpass', 2200 + R() * 800, 1.2);
          for (let k = 0; k < cLen && i0 + k < n; k++) d[i0 + k] += cr[k] * 1.5;
        }

        declick(d, sr, 0.004);
        playBuf(ctx, out, K, d, sr, 2400, X && X.bathVerb, 0.28);
      },

      // Extinction douce de la lanterne : un souffle rond et feutré qui s'évanouit
      puff(ctx, out, R, st, X) {
        const K = window.SOUND_KIT, sr = ctx.sampleRate;
        const dur = 0.38, n = Math.round(sr * dur);
        const d = new Float32Array(n);
        K.brownInto(d, 0.65, 0.045, R);
        K.pinkInto(d, 1.0, R);
        for (let i = 0; i < n; i++) {
          const u = i / n;
          const env = (u < 0.15 ? 0.5 - 0.5 * Math.cos(Math.PI * u / 0.15) : Math.exp(-3.5 * (u - 0.15)));
          d[i] *= env * 0.85;
        }
        biquadPass(d, sr, 'highpass', 140, 0.7);
        biquadPass(d, sr, 'lowpass', 780, 0.75);
        for (let i = 0; i < n; i++) d[i] *= 1.65;
        declick(d, sr, 0.005);
        playBuf(ctx, out, K, d, sr, 820, X && X.bathVerb, 0.28);
      },
    },
  };
})();
