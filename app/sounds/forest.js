// Liseuse à la lampe — Pack sonore : forest (Forêt de sapins vue de la fenêtre du chalet)
(function () {
  const K = window.SOUND_KIT;
  if (!K) return;
  const TAU = K.TAU;

  // Générateur de bruit filtré et normalisé (RMS = 0.26) mis en cache
  function softNoise(ctx, key, secs, lpHz = 2400, hpHz = 120, targetRms = 0.26) {
    return K.buffer(ctx, 'forest:' + key, secs, (n, sr) => {
      const d = new Float32Array(n);
      K.pinkInto(d, 1.0);
      const aLp = Math.min(0.95, (TAU * lpHz) / (sr + TAU * lpHz));
      const aHp = Math.min(0.95, (TAU * hpHz) / (sr + TAU * hpHz));
      let lp = 0, hp = 0, sum = 0;
      for (let i = 0; i < n; i++) {
        lp += aLp * (d[i] - lp);
        hp += aHp * (lp - hp);
        const v = lp - hp;
        d[i] = v;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / n) || 1;
      const scale = targetRms / rms;
      for (let i = 0; i < n; i++) d[i] *= scale;
      return d;
    });
  }

  // Enveloppe douce sans clic (attaque progressive + maintien + décroissance exponentielle jusqu'à 0)
  function envAt(ctx, gParam, t0, atk, hold, rel, peak) {
    const p = Math.max(0.00002, peak);
    const a = Math.max(0.002, atk);
    const h = Math.max(0, hold);
    const r = Math.max(0.01, rel);
    gParam.setValueAtTime(0.00001, t0);
    gParam.linearRampToValueAtTime(p, t0 + a);
    if (h > 0) gParam.setValueAtTime(p, t0 + a + h);
    gParam.exponentialRampToValueAtTime(0.00001, t0 + a + h + r);
    gParam.setValueAtTime(0, t0 + a + h + r + 0.005);
  }

  // Facteur d'échelle dynamique pour que les détails émergent toujours de +1.5 à +4.5 dB
  // même lorsque la pluie ou l'orage relève le niveau du lit sonore.
  function weatherBoost(st) {
    const r = st.r || 0;
    const storm = st.storm || 0;
    return 1 + r * 0.65 + storm * 0.90;
  }

  // Note vocale d'oiseau lointain 100 % organique :
  // Ondes sinusoïdales pures filtrées bas, inflexion douce en 3 points (f0 -> fMid -> f1),
  // trémolo en série (multiplicatif, jamais additif sur l'enveloppe) et souffle boisé.
  function syrinxNote(ctx, dryOut, wetOut, t0, f0, fMid, f1, dur, amp, tremHz = 0, tremDepth = 0, breath = 0.25) {
    const end = t0 + dur + 0.06;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sine';
    o2.type = 'sine';

    o1.frequency.setValueAtTime(f0, t0);
    o1.frequency.exponentialRampToValueAtTime(Math.max(80, fMid), t0 + dur * 0.44);
    o1.frequency.exponentialRampToValueAtTime(Math.max(80, f1), t0 + dur * 0.96);

    o2.frequency.setValueAtTime(f0 * 1.004, t0);
    o2.frequency.exponentialRampToValueAtTime(Math.max(80, fMid * 0.997), t0 + dur * 0.44);
    o2.frequency.exponentialRampToValueAtTime(Math.max(80, f1 * 1.003), t0 + dur * 0.96);

    const g2 = K.gain(ctx, 0.32);
    const maxF = Math.max(f0, fMid, f1);
    const lp = K.filt(ctx, 'lowpass', Math.min(1850, maxF * 1.05), 0.7);
    const tremG = K.gain(ctx, 1.0);
    const g = K.gain(ctx, 0);
    const atk = Math.min(0.042, dur * 0.32);
    const rel = Math.max(0.038, dur * 0.48);
    const hold = Math.max(0, dur - atk - rel);
    envAt(ctx, g.gain, t0, atk, hold, rel, amp);

    if (tremHz > 0 && tremDepth > 0) {
      const am = ctx.createOscillator();
      const amG = K.gain(ctx, tremDepth);
      am.frequency.setValueAtTime(tremHz, t0);
      am.connect(amG);
      amG.connect(tremG.gain);
      am.start(t0);
      am.stop(end);
      am.onended = () => { am.disconnect(); amG.disconnect(); };
    }

    o1.connect(lp);
    o2.connect(g2);
    g2.connect(lp);
    lp.connect(tremG);
    tremG.connect(g);
    if (dryOut) g.connect(dryOut);
    if (wetOut) g.connect(wetOut);
    o1.start(t0);
    o2.start(t0);
    o1.stop(end);
    o2.stop(end);
    o1.onended = () => { o1.disconnect(); o2.disconnect(); g2.disconnect(); lp.disconnect(); tremG.disconnect(); g.disconnect(); };

    if (breath > 0) {
      const ns = ctx.createBufferSource();
      ns.buffer = softNoise(ctx, 'syrinx', 0.6, 2200, 280, 0.14);
      const bp = K.filt(ctx, 'bandpass', fMid, 3.5);
      const ng = K.gain(ctx, 0);
      envAt(ctx, ng.gain, t0, atk, hold, rel, amp * breath);
      ns.connect(bp);
      bp.connect(ng);
      if (dryOut) ng.connect(dryOut);
      if (wetOut) ng.connect(wetOut);
      ns.start(t0, Math.random() * 0.25);
      ns.stop(end);
      ns.onended = () => { ns.disconnect(); bp.disconnect(); ng.disconnect(); };
    }
  }

  // Cibles du lit continu selon l'état st (calibrées pour -30..-28.5 dBFS à sec, -26..-23.5 dBFS sous pluie/orage)
  function bedTargets(st) {
    const wind = st.wind == null ? 0.15 : st.wind;
    const rain = st.r || 0;
    const snow = st.s || 0;
    const storm = st.storm || 0;
    const night = st.e < -0.2 ? Math.min(1, (-st.e - 0.2) * 2) : 0;

    // Aiguilles de pin : souffle soyeux et aérien dans les cimes
    const needlesGain = (0.22 + wind * 0.22 + storm * 0.08) * (1 - snow * 0.14) * (1 - night * 0.07);
    const needlesCut = (1320 + wind * 880 + storm * 280) * (1 - snow * 0.24);

    // Ruisseau lointain dans le vallon et air profond de la forêt
    const streamGain = (0.25 + (1 - wind) * 0.05) * (1 - snow * 0.16) * (1 - night * 0.05) * (1 + rain * 0.10);
    const streamCut = (760 + rain * 200) * (1 - snow * 0.20);

    // Pluie sur la canopée de sapins et le toit en bardeaux de bois
    const canopyGain = rain > 0.005 ? Math.pow(rain, 0.76) * (0.38 + storm * 0.09) : 0.0001;
    const canopyCut = 1460 + rain * 780 + storm * 260;

    // Pluie fine sur la vitre du chalet et le rebord
    const glassGain = rain > 0.02 ? Math.pow(rain, 0.84) * (0.20 + storm * 0.06 + wind * 0.03) : 0.0001;
    const glassCut = 1720 + rain * 680 + storm * 240;

    return { needlesGain, needlesCut, streamGain, streamCut, canopyGain, canopyCut, glassGain, glassCut };
  }

  window.SCENE_SOUNDS.forest = {
    bed(ctx, out, K, st) {
      const R = K.rng(48271);
      const T = bedTargets(st);

      // 1. Souffle du vent dans les aiguilles de pin (19.3 s, stéréo avec risées déphasées G/D)
      const needlesBuf = K.loopBuffer(ctx, 'forest:needles:v5', 19.3, (n, sr, ch) => {
        const d = new Float32Array(n);
        K.pinkInto(d, 1.0, R);
        let lp = 0, hp = 0;
        const phase = ch * 1.55;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const swell = 0.66 + 0.22 * Math.sin(TAU * t / 9.65 + phase) + 0.12 * Math.sin(TAU * t / 6.43 - phase * 0.7);
          const w = d[i] + (R() * 2 - 1) * 0.14;
          lp = 0.68 * lp + 0.32 * w;
          hp = 0.94 * hp + 0.06 * lp;
          d[i] = (lp - hp) * swell;
        }
        return d;
      }, 0.15);

      const needlesSrc = K.loop(ctx, needlesBuf, 1.0, 0);
      const needlesLp = K.filt(ctx, 'lowpass', T.needlesCut, 0.6);
      const needlesG = K.gain(ctx, T.needlesGain);
      K.chain(needlesSrc, needlesLp, needlesG, out);

      const breezeLfo = ctx.createOscillator();
      const breezeLfoG = K.gain(ctx, 180);
      breezeLfo.frequency.value = 0.053;
      breezeLfo.connect(breezeLfoG);
      breezeLfoG.connect(needlesLp.frequency);
      breezeLfo.start();

      // 2. Ruisseau au fond du vallon et air profond de la forêt (22.7 s)
      const streamBuf = K.loopBuffer(ctx, 'forest:streamAir:v5', 22.7, (n, sr, ch) => {
        const d = new Float32Array(n);
        K.pinkInto(d, 0.85, R);
        K.brownInto(d, 0.45, 0.03, R);
        let hp = 0, lp = 0;
        let env = 0.75, target = 0.75;
        for (let i = 0; i < n; i++) {
          if (i % 960 === 0) target = 0.52 + 0.48 * R();
          env += 0.0018 * (target - env);
          const t = i / sr;
          const slow = 0.80 + 0.20 * Math.sin(TAU * t / 11.35 + ch * 1.15);
          lp = 0.82 * lp + 0.18 * d[i];
          hp = 0.982 * hp + 0.018 * lp;
          d[i] = (lp - hp) * env * slow;
        }
        return d;
      }, 0.15);

      const streamSrc = K.loop(ctx, streamBuf, 1.0, 3.1);
      const streamLp = K.filt(ctx, 'lowpass', T.streamCut, 0.55);
      const streamG = K.gain(ctx, T.streamGain);
      K.chain(streamSrc, streamLp, streamG, out);

      // 3. Pluie sur la canopée de sapins et le toit en bardeaux de bois (16.9 s)
      const canopyBuf = K.loopBuffer(ctx, 'forest:rainCanopy:v5', 16.9, (n, sr, ch) => {
        const d = new Float32Array(n);
        K.pinkInto(d, 0.95, R);
        K.brownInto(d, 0.4, 0.035, R);
        let i = Math.floor(R() * 200);
        while (i < n - 500) {
          const len = Math.floor(sr * (0.005 + R() * 0.009));
          const amp = 0.06 + R() * 0.12;
          let lp = 0;
          for (let k = 0; k < len && i + k < n; k++) {
            const w = R() * 2 - 1;
            lp = 0.78 * lp + 0.22 * w;
            d[i + k] += lp * amp * Math.sin(Math.PI * (k / len));
          }
          i += Math.floor(sr * (0.004 + R() * 0.014));
        }
        let hp = 0;
        const ph = ch * 0.9;
        for (let k = 0; k < n; k++) {
          const t = k / sr;
          hp = 0.975 * hp + 0.025 * d[k];
          d[k] = (d[k] - hp) * (0.84 + 0.16 * Math.sin(TAU * t / 8.45 + ph));
        }
        return d;
      }, 0.15);

      const canopySrc = K.loop(ctx, canopyBuf, 1.0, 1.7);
      const canopyLp = K.filt(ctx, 'lowpass', T.canopyCut, 0.5);
      const canopyG = K.gain(ctx, T.canopyGain);
      K.chain(canopySrc, canopyLp, canopyG, out);

      // 4. Pluie douce sur la vitre du chalet et le rebord en bois (21.1 s)
      const glassBuf = K.loopBuffer(ctx, 'forest:rainGlass:v5', 21.1, (n, sr) => {
        const d = new Float32Array(n);
        K.pinkInto(d, 0.22, R);
        let i = Math.floor(sr * 0.02);
        while (i < n - 900) {
          const len = Math.floor(sr * (0.005 + R() * 0.008));
          const f = 520 + R() * 1150;
          const amp = 0.07 + R() * 0.16;
          for (let k = 0; k < len && i + k < n; k++) {
            const x = k / len;
            const env = Math.sin(Math.PI * Math.min(1, x * 3.2)) * Math.exp(-3.6 * x);
            d[i + k] += (Math.sin(TAU * f * (k / sr)) * 0.5 + (R() * 2 - 1) * 0.5) * amp * env;
          }
          i += Math.floor(sr * (0.014 + R() * 0.055));
        }
        let lp = 0;
        for (let k = 0; k < n; k++) {
          lp = 0.62 * lp + 0.38 * d[k];
          d[k] = lp;
        }
        return d;
      }, 0.15);

      const glassSrc = K.loop(ctx, glassBuf, 1.0, 5.3);
      const glassLp = K.filt(ctx, 'lowpass', T.glassCut, 0.6);
      const glassG = K.gain(ctx, T.glassGain);
      K.chain(glassSrc, glassLp, glassG, out);

      // Deux bus de réverbération partagés avec les détails et les sfx
      const verbFar = K.reverb(ctx, out, 2.6, 2.6, 0.65, 0.48);
      const verbNear = K.reverb(ctx, out, 0.9, 4.0, 0.45, 0.28);

      return {
        nodes: [needlesSrc, breezeLfo, streamSrc, canopySrc, glassSrc],
        verbFar,
        verbNear,
        set(s2) {
          const t2 = bedTargets(s2);
          K.glide(ctx, needlesG.gain, t2.needlesGain, 1.4);
          K.glide(ctx, needlesLp.frequency, t2.needlesCut, 1.4);
          K.glide(ctx, streamG.gain, t2.streamGain, 1.4);
          K.glide(ctx, streamLp.frequency, t2.streamCut, 1.4);
          K.glide(ctx, canopyG.gain, t2.canopyGain, 1.2);
          K.glide(ctx, canopyLp.frequency, t2.canopyCut, 1.2);
          K.glide(ctx, glassG.gain, t2.glassGain, 1.2);
          K.glide(ctx, glassLp.frequency, t2.glassCut, 1.2);
        },
      };
    },

    details: {
      // 1. Pigeon ramier au loin dans les sapins (roucoulement sourd, chaud et très organique)
      ramier: {
        when: (st) => st.e > 0.02 && (st.r || 0) < 0.35 && (st.s || 0) < 0.3 && (st.storm || 0) < 0.2,
        rate: (st) => (st.h < 10 ? 1.8 : 1.5),
        gap: 22,
        gain: 0.42,
        pan: [-0.8, 0.8],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.02;
          const base = 415 + R() * 45;
          const dry = K.filt(ctx, 'lowpass', 740, 0.7);
          const dg = K.gain(ctx, 0.40);
          K.chain(dry, dg, out);
          const wet = X && X.verbFar ? X.verbFar : out;
          setTimeout(() => { dry.disconnect(); dg.disconnect(); }, 4500);

          const notes = [
            [0.0, base * 0.94, base * 1.03, base * 0.98, 0.22, 0.17],
            [0.30, base * 0.97, base * 1.10, base * 0.94, 0.48, 0.24],
            [0.90, base * 0.95, base * 1.01, base * 0.92, 0.20, 0.15],
            [1.18, base * 1.01, base * 1.06, base * 0.90, 0.36, 0.19],
          ];
          for (const [dt, f0, fMid, f1, dur, amp] of notes) {
            syrinxNote(ctx, dry, wet, t0 + dt + R() * 0.02, f0, fMid, f1, dur, amp, 15, 0.12, 0.26);
          }
        },
      },

      // 2. Grive musicienne dans le vallon (notes flûtées boisées à l'aube et au crépuscule)
      grive: {
        when: (st) => st.e > -0.12 && st.e < 0.55 && (st.r || 0) < 0.4 && (st.s || 0) < 0.25 && (st.storm || 0) < 0.2,
        rate: (st) => (st.h < 9 ? 2.4 : 2.0),
        gap: 15,
        gain: 0.44,
        pan: [-0.85, 0.85],
        play(ctx, out, R, st, X) {
          let t = ctx.currentTime + 0.02;
          const dry = K.filt(ctx, 'lowpass', 1480, 0.7);
          const dg = K.gain(ctx, 0.30);
          K.chain(dry, dg, out);
          const wet = X && X.verbFar ? X.verbFar : out;
          setTimeout(() => { dry.disconnect(); dg.disconnect(); }, 3600);

          const fBase = 1020 + R() * 240;
          const motifs = 2 + (R() * 2 | 0);
          for (let i = 0; i < motifs; i++) {
            const f0 = fBase * (0.92 + R() * 0.16);
            const up = R() < 0.55;
            const fMid = f0 * (up ? 1.10 : 0.94);
            const f1 = f0 * (up ? 1.03 : 0.88);
            const dur = 0.14 + R() * 0.07;
            syrinxNote(ctx, dry, wet, t, f0, fMid, f1, dur, 0.21, 20, 0.14, 0.32);
            if (R() < 0.65) {
              syrinxNote(ctx, dry, wet, t + dur + 0.07, f0 * 1.01, fMid * 1.01, f1 * 0.99, dur * 0.95, 0.18, 20, 0.14, 0.32);
              t += (dur + 0.07) * 2 + 0.12;
            } else {
              t += dur + 0.14 + R() * 0.07;
            }
          }
        },
      },

      // 3. Rougegorge familier (filet doux et feutré dans les sapins humides)
      rougegorge: {
        when: (st) => st.e > -0.15 && (st.r || 0) < 0.78 && (st.s || 0) < 0.35 && (st.storm || 0) < 0.3,
        rate: (st) => (st.e < 0.3 ? 2.3 : 1.6) * (1 - (st.r || 0) * 0.35),
        gap: 14,
        gain: 0.42,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          let t = ctx.currentTime + 0.02;
          const boost = weatherBoost(st);
          const dry = K.filt(ctx, 'lowpass', 1620, 0.7);
          const dg = K.gain(ctx, 0.28);
          K.chain(dry, dg, out);
          const wet = X && X.verbFar ? X.verbFar : out;
          setTimeout(() => { dry.disconnect(); dg.disconnect(); }, 3400);

          const nNotes = 3 + (R() * 2 | 0);
          let f = 1260 + R() * 280;
          for (let i = 0; i < nNotes; i++) {
            const fMid = f * (0.93 + R() * 0.16);
            const fNext = Math.max(1040, Math.min(1650, fMid * (0.91 + R() * 0.18)));
            const dur = 0.085 + R() * 0.055;
            const amp = (0.19 + R() * 0.04) * (1 - i * 0.08) * boost;
            syrinxNote(ctx, dry, wet, t, f, fMid, fNext, dur, amp, 24, 0.16, 0.34);
            t += dur + 0.035 + R() * 0.04;
            f = fNext;
          }
        },
      },

      // 4. Mésange noire des conifères (appel doux et boisé dans les aiguilles)
      mesange: {
        when: (st) => st.e > 0.05 && (st.r || 0) < 0.45 && (st.storm || 0) < 0.2,
        rate: (st) => (st.s > 0.2 ? 1.6 : 1.8),
        gap: 16,
        gain: 0.40,
        pan: [-0.8, 0.8],
        play(ctx, out, R, st, X) {
          let t = ctx.currentTime + 0.02;
          const dry = K.filt(ctx, 'lowpass', 1580, 0.7);
          const dg = K.gain(ctx, 0.26);
          K.chain(dry, dg, out);
          const wet = X && X.verbFar ? X.verbFar : out;
          setTimeout(() => { dry.disconnect(); dg.disconnect(); }, 2800);

          const fHi = 1380 + R() * 190;
          const fLo = fHi * (0.79 + R() * 0.04);
          const pairs = 2 + (R() * 2 | 0);
          for (let i = 0; i < pairs; i++) {
            syrinxNote(ctx, dry, wet, t, fHi * 0.96, fHi * 1.02, fHi * 0.97, 0.08, 0.18, 18, 0.12, 0.36);
            syrinxNote(ctx, dry, wet, t + 0.10, fLo * 1.02, fLo * 0.98, fLo * 0.94, 0.10, 0.16, 15, 0.10, 0.36);
            t += 0.25 + R() * 0.05;
          }
        },
      },

      // 5. Pic épeiche tambourinant sur un tronc sec au loin
      pic: {
        when: (st) => st.e > -0.08 && (st.r || 0) < 0.35 && (st.storm || 0) < 0.2,
        rate: (st) => (st.h < 15 ? 1.7 : 1.3) * (1 - (st.s || 0) * 0.15),
        gap: 20,
        gain: 0.48,
        pan: [-0.9, 0.9],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.02;
          const count = 10 + (R() * 4 | 0);
          const trunkHz = 470 + R() * 130;
          const barkHz = trunkHz * (1.95 + R() * 0.25);
          const distLp = K.filt(ctx, 'lowpass', 1750, 0.7);
          const dryG = K.gain(ctx, 0.52);
          K.chain(distLp, dryG, out);
          if (X && X.verbFar) distLp.connect(X.verbFar);
          setTimeout(() => { distLp.disconnect(); dryG.disconnect(); }, 2600);

          const rollDur = count * 0.041;
          const ts = ctx.createBufferSource();
          ts.buffer = softNoise(ctx, 'trunkRes', 0.8, 1200, 150);
          const tbp = K.filt(ctx, 'bandpass', trunkHz, 1.8);
          const tg = K.gain(ctx, 0);
          envAt(ctx, tg.gain, t0, 0.04, rollDur * 0.65, 0.18, 0.22);
          K.run(ctx, distLp, t0, t0 + rollDur + 0.22, ts, tbp, tg);

          let t = t0;
          for (let i = 0; i < count; i++) {
            const x = i / (count - 1);
            const env = Math.sin(Math.PI * Math.pow(x, 0.72)) * (0.85 + 0.15 * R());
            K.tone(ctx, distLp, t, trunkHz * (0.99 + R() * 0.02), 0.24 * env, 0.002, 0.016, 'triangle', trunkHz * 0.78);
            const s = ctx.createBufferSource();
            s.buffer = softNoise(ctx, 'woodHit', 0.05, 2200, 200);
            const bp = K.filt(ctx, 'bandpass', barkHz, 2.2);
            const g = K.gain(ctx, 0);
            envAt(ctx, g.gain, t, 0.002, 0.002, 0.020, 0.28 * env);
            K.run(ctx, distLp, t, t + 0.036, s, bp, g);
            t += 0.042 - x * 0.006 + R() * 0.004;
          }
        },
      },

      // 6. Chouette hulotte perchée la nuit (et parfois au crépuscule)
      chouette: {
        when: (st) => st.e < -0.02 && (st.storm || 0) < 0.4,
        rate: (st) => (st.e < -0.25 ? 2.4 : 1.1) * (1 - (st.r || 0) * 0.5),
        gap: 18,
        gain: 0.46,
        pan: [-0.45, 0.8],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.02;
          const f = 372 + R() * 34;
          const distLp = K.filt(ctx, 'lowpass', 850, 0.7);
          const dryG = K.gain(ctx, 0.44);
          K.chain(distLp, dryG, out);
          const wet = X && X.verbFar ? X.verbFar : out;
          setTimeout(() => { distLp.disconnect(); dryG.disconnect(); }, 5200);

          syrinxNote(ctx, distLp, wet, t0, f * 0.96, f * 1.04, f * 0.91, 0.62, 0.24, 6, 0.08, 0.24);
          const t2 = t0 + 0.78 + R() * 0.12;
          syrinxNote(ctx, distLp, wet, t2, f * 0.98, f * 1.02, f * 0.95, 0.16, 0.17, 8, 0.10, 0.22);
          syrinxNote(ctx, distLp, wet, t2 + 0.22, f * 1.02, f * 1.00, f * 0.88, 0.76, 0.23, 15, 0.20, 0.26);
        },
      },

      // 7. Grillons des bois dans les fougères au crépuscule et la nuit
      // Synthèse par impulsions perlées courtes (11 ms) sans aucun bourdonnement basse fréquence
      grillons: {
        when: (st) => st.e < 0.05 && (st.r || 0) < 0.3 && (st.s || 0) < 0.2,
        rate: (st) => (st.e < -0.2 ? 4.4 : 4.6),
        gap: 6.5,
        gain: 0.44,
        pan: [-0.85, 0.85],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.02;
          const f = 3150 + R() * 380;
          const lp = K.filt(ctx, 'lowpass', 3600, 0.7);
          const hp = K.filt(ctx, 'highpass', 1800, 0.7);
          const dg = K.gain(ctx, 0.55);
          K.chain(hp, lp, dg, out);
          if (X && X.verbNear) lp.connect(X.verbNear);
          setTimeout(() => { hp.disconnect(); lp.disconnect(); dg.disconnect(); }, 2500);

          let t = t0;
          const chirps = 2 + (R() < 0.45 ? 1 : 0);
          for (let c = 0; c < chirps; c++) {
            const pulses = 4 + (R() * 2 | 0);
            for (let p = 0; p < pulses; p++) {
              const w = Math.sin(Math.PI * ((p + 0.5) / pulses));
              const o = ctx.createOscillator();
              const g = K.gain(ctx, 0);
              o.type = 'sine';
              o.frequency.setValueAtTime(f * (0.99 + p * 0.004), t);
              envAt(ctx, g.gain, t, 0.003, 0.003, 0.008, 0.14 * w);
              o.connect(g);
              g.connect(hp);
              o.start(t);
              o.stop(t + 0.022);
              o.onended = () => { o.disconnect(); g.disconnect(); };
              t += 0.028 + R() * 0.004;
            }
            // Légère texture d'élytre boisée sous chaque cri
            const ns = ctx.createBufferSource();
            ns.buffer = softNoise(ctx, 'cricketWing', 0.25, 3800, 1800, 0.22);
            const bp = K.filt(ctx, 'bandpass', f * 0.92, 3.5);
            const ng = K.gain(ctx, 0);
            const cDur = pulses * 0.029;
            envAt(ctx, ng.gain, t - cDur, 0.015, cDur * 0.5, 0.04, 0.16);
            K.run(ctx, hp, t - cDur, t + 0.05, ns, bp, ng);

            t += 0.15 + R() * 0.09;
          }
        },
      },

      // 8. Craquement souple d'une branche de sapin ou de la charpente du chalet
      branche: {
        when: () => true,
        rate: (st) => 1.5 + (st.wind || 0.15) * 2.2 + (st.s || 0) * 1.6 + (st.storm || 0) * 1.2,
        gap: 11,
        gain: 0.44,
        pan: [-0.85, 0.85],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.02;
          const boost = weatherBoost(st);
          const grains = 9 + (R() * 6 | 0);
          const fWood1 = 270 + R() * 140;
          const fWood2 = fWood1 * (2.05 + R() * 0.3);
          const lp = K.filt(ctx, 'lowpass', 1350, 0.7);
          lp.connect(out);
          if (X && X.verbNear) lp.connect(X.verbNear);
          setTimeout(() => lp.disconnect(), 2200);

          const bodyDur = 0.40 + R() * 0.16;
          const bs = ctx.createBufferSource();
          bs.buffer = softNoise(ctx, 'woodBody', 0.7, 1100, 110);
          const bbp = K.filt(ctx, 'bandpass', fWood1 * 0.95, 1.6);
          const bg = K.gain(ctx, 0);
          envAt(ctx, bg.gain, t0, 0.06, bodyDur * 0.45, bodyDur * 0.5, 0.24 * boost);
          K.run(ctx, lp, t0, t0 + bodyDur + 0.05, bs, bbp, bg);

          let t = t0;
          for (let i = 0; i < grains; i++) {
            const x = i / grains;
            const amp = Math.sin(Math.PI * x) * (0.22 + 0.08 * R()) * boost;
            const f1 = fWood1 * (1 - x * 0.15);
            K.tone(ctx, lp, t, f1, amp * 0.5, 0.002, 0.016, 'triangle', f1 * 0.82);
            const s = ctx.createBufferSource();
            s.buffer = softNoise(ctx, 'creakGrain', 0.05, 1800, 120);
            const bp1 = K.filt(ctx, 'bandpass', f1, 2.8);
            const bp2 = K.filt(ctx, 'peaking', fWood2 * (1 - x * 0.1), 2.5);
            bp2.gain.value = 4;
            const g = K.gain(ctx, 0);
            envAt(ctx, g.gain, t, 0.0025, 0.002, 0.024, amp);
            K.run(ctx, lp, t, t + 0.04, s, bp1, bp2, g);
            t += 0.022 + x * 0.020 + R() * 0.009;
          }
        },
      },

      // 9. Chute d'une pomme de pin, brindille ou glissement de neige d'une branche de sapin
      pommeDePin: {
        when: (st) => (st.r || 0) < 0.4,
        rate: (st) => 1.5 + (st.wind || 0.15) * 1.1 + (st.s || 0) * 1.3,
        gap: 17,
        gain: 0.42,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.02;
          const snowy = (st.s || 0) > 0.2;
          const brushDur = snowy ? 0.36 + R() * 0.14 : 0.22 + R() * 0.10;
          const bs = ctx.createBufferSource();
          bs.buffer = softNoise(ctx, 'needleBrush', 0.6, 2800, 200);
          const bbp = K.filt(ctx, 'bandpass', snowy ? 780 + R() * 280 : 1380 + R() * 420, 1.3);
          const bg = K.gain(ctx, 0);
          envAt(ctx, bg.gain, t0, 0.04, brushDur * 0.4, brushDur * 0.55, snowy ? 0.26 : 0.22);
          K.run(ctx, out, t0, t0 + brushDur + 0.04, bs, bbp, bg);

          const tHit = t0 + brushDur * 0.76;
          const hs = ctx.createBufferSource();
          hs.buffer = softNoise(ctx, 'coneThud', 0.35, 1400, 80);
          const hlp = K.filt(ctx, 'lowpass', snowy ? 360 + R() * 110 : 480 + R() * 160, 1.1);
          const hg = K.gain(ctx, 0);
          envAt(ctx, hg.gain, tHit, 0.006, 0.03, 0.18, 0.34);
          K.run(ctx, out, tHit, tHit + 0.26, hs, hlp, hg);
          if (X && X.verbNear) hg.connect(X.verbNear);
        },
      },

      // 10. Rissée de vent dans les sapins proches et les fougères
      rissee: {
        when: () => true,
        rate: (st) => 1.6 + (st.wind || 0.15) * 2.8 + (st.storm || 0) * 1.5,
        gap: 11,
        gain: 0.38,
        pan: [-0.7, 0.7],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.02;
          const boost = weatherBoost(st);
          const dur = 1.9 + R() * 0.9;
          const s = ctx.createBufferSource();
          s.buffer = softNoise(ctx, 'gustNoise', 3.5, 2600, 200);
          const bp = K.filt(ctx, 'bandpass', 620, 1.0);
          const fPeak = 980 + R() * 420 * (1 - (st.s || 0) * 0.3);
          bp.frequency.setValueAtTime(540, t0);
          bp.frequency.exponentialRampToValueAtTime(fPeak, t0 + 0.55);
          bp.frequency.exponentialRampToValueAtTime(490, t0 + dur);

          const g = K.gain(ctx, 0);
          envAt(ctx, g.gain, t0, 0.45, 0.22, dur - 0.67, (0.20 + (st.wind || 0.15) * 0.05) * boost);
          K.run(ctx, out, t0, t0 + dur + 0.05, s, bp, g);
          if (X && X.verbFar) g.connect(X.verbFar);
        },
      },

      // 11. Égouttement de l'avant-toit et des aiguilles sur le rebord en bois et les fougères
      egouttement: {
        when: (st) => (st.r || 0) > 0.1 || (st.s || 0) > 0.2 || (st.h >= 6 && st.h <= 9),
        rate: (st) => (st.r || 0) > 0.1 ? 2.6 + st.r * 2.4 : (st.s || 0) > 0.2 ? 2.4 : 1.4,
        gap: 8.0,
        gain: 0.44,
        pan: [-0.8, 0.8],
        play(ctx, out, R, st, X) {
          let t = ctx.currentTime + 0.02;
          const boost = weatherBoost(st);
          const drops = 3 + (R() * 3 | 0);
          const lp = K.filt(ctx, 'lowpass', 1800, 0.7);
          lp.connect(out);
          if (X && X.verbNear) lp.connect(X.verbNear);
          setTimeout(() => lp.disconnect(), 2200);

          const ws = ctx.createBufferSource();
          ws.buffer = softNoise(ctx, 'sillWater', 0.65, 1600, 200);
          const wbp = K.filt(ctx, 'bandpass', 560 + R() * 240, 1.4);
          const wg = K.gain(ctx, 0);
          envAt(ctx, wg.gain, t, 0.04, 0.20, 0.28, 0.22 * boost);
          K.run(ctx, lp, t, t + 0.55, ws, wbp, wg);

          for (let i = 0; i < drops; i++) {
            const f0 = 560 + R() * 440;
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.setValueAtTime(f0 * 0.76, t);
            o.frequency.exponentialRampToValueAtTime(f0 * 1.30, t + 0.022);
            const g = K.gain(ctx, 0);
            envAt(ctx, g.gain, t, 0.0025, 0.003, 0.028, 0.18 * (0.75 + 0.25 * R()) * boost);
            o.connect(g);
            g.connect(lp);
            o.start(t);
            o.stop(t + 0.045);
            o.onended = () => { o.disconnect(); g.disconnect(); };

            const ns = ctx.createBufferSource();
            ns.buffer = softNoise(ctx, 'dropTap', 0.05, 1800, 200);
            const bp = K.filt(ctx, 'bandpass', 420 + R() * 340, 1.8);
            const ng = K.gain(ctx, 0);
            envAt(ctx, ng.gain, t, 0.002, 0.003, 0.028, 0.22 * boost);
            K.run(ctx, lp, t, t + 0.042, ns, bp, ng);

            t += 0.12 + R() * 0.18;
          }
        },
      },

      // 12. Ondée de pluie fouettant doucement la vitre du chalet
      vitrePluie: {
        when: (st) => (st.r || 0) > 0.22,
        rate: (st) => 2.0 + (st.r || 0) * 2.4 + (st.storm || 0) * 1.5,
        gap: 9.0,
        gain: 0.44,
        pan: [-0.65, 0.65],
        play(ctx, out, R, st, X) {
          let t = ctx.currentTime + 0.02;
          const boost = weatherBoost(st);
          const count = 10 + (R() * 8 | 0);
          const lp = K.filt(ctx, 'lowpass', 2100, 0.7);
          lp.connect(out);
          if (X && X.verbNear) lp.connect(X.verbNear);
          setTimeout(() => lp.disconnect(), 2600);

          const gs = ctx.createBufferSource();
          gs.buffer = softNoise(ctx, 'paneSheet', 0.85, 2200, 240);
          const gbp = K.filt(ctx, 'bandpass', 820 + R() * 340, 1.3);
          const gg = K.gain(ctx, 0);
          envAt(ctx, gg.gain, t, 0.12, 0.24, 0.35, 0.24 * boost);
          K.run(ctx, lp, t, t + 0.75, gs, gbp, gg);

          for (let i = 0; i < count; i++) {
            const x = i / count;
            const env = Math.sin(Math.PI * x) * (0.75 + 0.25 * R());
            const ns = ctx.createBufferSource();
            ns.buffer = softNoise(ctx, 'glassTap', 0.04, 2400, 300);
            const bp = K.filt(ctx, 'bandpass', 720 + R() * 880, 2.2);
            const g = K.gain(ctx, 0);
            envAt(ctx, g.gain, t, 0.002, 0.002, 0.022, 0.22 * env * boost);
            K.run(ctx, lp, t, t + 0.036, ns, bp, g);
            t += 0.038 + R() * 0.07;
          }
        },
      },
    },

    sfx: {
      // Allumette craquée pour allumer la lanterne sur le rebord en bois
      match(ctx, out, R = Math.random, st, X) {
        const t0 = ctx.currentTime + 0.01;
        const scrLen = 0.08 + R() * 0.035;
        const s1 = ctx.createBufferSource();
        s1.buffer = K.noiseBuf(ctx, scrLen + 0.02, (x) => 0.35 + 0.65 * Math.abs(Math.sin(Math.PI * 58 * x)));
        const bp1 = K.filt(ctx, 'bandpass', 1850, 1.4);
        bp1.frequency.setValueAtTime(1600, t0);
        bp1.frequency.linearRampToValueAtTime(2350, t0 + scrLen);
        const lp1 = K.filt(ctx, 'lowpass', 2800, 0.7);
        const g1 = K.gain(ctx, 0);
        envAt(ctx, g1.gain, t0, 0.008, scrLen * 0.55, scrLen * 0.35, 0.34);
        K.run(ctx, out, t0, t0 + scrLen + 0.02, s1, bp1, lp1, g1);

        const tFlare = t0 + scrLen * 0.80;
        const flareLen = 0.42;
        const s2 = ctx.createBufferSource();
        s2.buffer = softNoise(ctx, 'matchFlare', 0.5, 2200, 140);
        const lp2 = K.filt(ctx, 'lowpass', 1750, 0.8);
        lp2.frequency.setValueAtTime(1850, tFlare);
        lp2.frequency.exponentialRampToValueAtTime(580, tFlare + flareLen);
        const g2 = K.gain(ctx, 0);
        envAt(ctx, g2.gain, tFlare, 0.032, 0.06, flareLen - 0.10, 0.28);
        K.run(ctx, out, tFlare, tFlare + flareLen + 0.02, s2, lp2, g2);
        if (X && X.verbNear) g2.connect(X.verbNear);

        for (let i = 0; i < 4; i++) {
          const tc = tFlare + 0.05 + i * 0.065 + R() * 0.03;
          const sc = ctx.createBufferSource();
          sc.buffer = softNoise(ctx, 'matchPop', 0.03, 2600, 600);
          const bpc = K.filt(ctx, 'bandpass', 1600 + R() * 900, 2.5);
          const gc = K.gain(ctx, 0);
          envAt(ctx, gc.gain, tc, 0.002, 0.001, 0.012, 0.11);
          K.run(ctx, out, tc, tc + 0.022, sc, bpc, gc);
        }
      },

      // Souffle doux éteignant la bougie de la lanterne
      puff(ctx, out, R = Math.random, st, X) {
        const t0 = ctx.currentTime + 0.01;
        const dur = 0.36;
        const s = ctx.createBufferSource();
        s.buffer = softNoise(ctx, 'puffAir', 0.45, 1800, 130);
        const bp = K.filt(ctx, 'bandpass', 720, 1.0);
        bp.frequency.setValueAtTime(880, t0);
        bp.frequency.exponentialRampToValueAtTime(320, t0 + dur);
        const lp = K.filt(ctx, 'lowpass', 1350, 0.7);
        const g = K.gain(ctx, 0);
        envAt(ctx, g.gain, t0, 0.035, 0.04, dur - 0.08, 0.25);
        K.run(ctx, out, t0, t0 + dur + 0.02, s, bp, lp, g);
        if (X && X.verbNear) g.connect(X.verbNear);
      },

      click(ctx, out, R = Math.random, st, X) {
        const t0 = ctx.currentTime + 0.005;
        const s = ctx.createBufferSource();
        s.buffer = softNoise(ctx, 'woodClick', 0.05, 2400, 200);
        const bp = K.filt(ctx, 'bandpass', 950 + R() * 300, 2.2);
        const g = K.gain(ctx, 0);
        envAt(ctx, g.gain, t0, 0.002, 0.003, 0.020, 0.24);
        K.run(ctx, out, t0, t0 + 0.035, s, bp, g);
        if (X && X.verbNear) g.connect(X.verbNear);
      },

      owl(ctx, out, R = Math.random, st, X) {
        window.SCENE_SOUNDS.forest.details.chouette.play(ctx, out, R, st || { e: -0.5 }, X);
      },

      bell(ctx, out, R = Math.random, st, X) {
        const t0 = ctx.currentTime + 0.01;
        const f = 165 + R() * 18;
        const lp = K.filt(ctx, 'lowpass', 1200, 0.7);
        lp.connect(out);
        if (X && X.verbFar) lp.connect(X.verbFar);
        setTimeout(() => lp.disconnect(), 4500);
        for (const [m, amp, dec] of [[1, 0.12, 2.2], [2.01, 0.06, 1.6], [2.98, 0.03, 1.1]]) {
          K.tone(ctx, lp, t0, f * m, amp, 0.018, dec, 'sine');
        }
      },

      knock(ctx, out, R = Math.random, st, X) {
        const t0 = ctx.currentTime + 0.01;
        const lp = K.filt(ctx, 'lowpass', 1350, 0.7);
        lp.connect(out);
        if (X && X.verbNear) lp.connect(X.verbNear);
        setTimeout(() => lp.disconnect(), 1200);
        K.tone(ctx, lp, t0, 440 + R() * 60, 0.24, 0.002, 0.045, 'triangle', 290);
        const s = ctx.createBufferSource();
        s.buffer = softNoise(ctx, 'woodKnock', 0.06, 1800, 180);
        const bp = K.filt(ctx, 'bandpass', 680 + R() * 140, 2.4);
        const g = K.gain(ctx, 0);
        envAt(ctx, g.gain, t0, 0.002, 0.003, 0.030, 0.22);
        K.run(ctx, lp, t0, t0 + 0.05, s, bp, g);
      },

      chime(ctx, out, R = Math.random, st, X) {
        const t0 = ctx.currentTime + 0.01;
        const f = 1450 + R() * 320;
        const lp = K.filt(ctx, 'lowpass', 2800, 0.7);
        lp.connect(out);
        if (X && X.verbNear) lp.connect(X.verbNear);
        setTimeout(() => lp.disconnect(), 2600);
        for (const [m, amp, dec] of [[1, 0.08, 0.75], [2.28, 0.035, 0.45]]) {
          K.tone(ctx, lp, t0, f * m, amp, 0.004, dec, 'sine');
        }
      },
    },
  };
})();
