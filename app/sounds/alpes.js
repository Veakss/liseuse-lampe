// Liseuse à la lampe — pack sonore « alpes » (Refuge alpin)
// Tout est généré dans le navigateur via Web Audio API et SOUND_KIT, sans fichiers externes.
(function () {
  const TAU = Math.PI * 2;

  // Bus spatial : envoie le signal sec vers `out` (déjà panoramiqué par SOUND_KIT.play)
  // et une part réverbérée (proportionnelle au gain de `out`) vers la vallée et/ou la galerie en bois.
  function makeSpaceBus(ctx, K, out, X, dryAmt, valleyAmt, woodAmt, stopAt) {
    const bus = K.gain(ctx, 1);
    const dryG = K.gain(ctx, dryAmt);
    bus.connect(dryG);
    dryG.connect(out);
    const baseG = out && out.gain ? out.gain.value : 0.45;
    const nodes = [bus, dryG];
    if (X && X.valleyVerb && valleyAmt > 0) {
      const vg = K.gain(ctx, baseG * valleyAmt);
      bus.connect(vg);
      vg.connect(X.valleyVerb);
      nodes.push(vg);
    }
    if (X && X.woodVerb && woodAmt > 0) {
      const wg = K.gain(ctx, baseG * woodAmt);
      bus.connect(wg);
      wg.connect(X.woodVerb);
      nodes.push(wg);
    }
    const delayMs = Math.max(200, (stopAt - ctx.currentTime + 0.35) * 1000);
    setTimeout(() => {
      for (const n of nodes) {
        try { n.disconnect(); } catch (e) {}
      }
    }, delayMs);
    return bus;
  }

  // Enveloppe douce sans clic (attaque progressive puis décroissance exponentielle)
  function softEnv(ctx, t0, attack, hold, tau, peak) {
    const g = ctx.createGain();
    const t1 = t0 + Math.max(0.002, attack);
    const t2 = t1 + Math.max(0, hold);
    g.gain.setValueAtTime(0.00001, t0);
    g.gain.linearRampToValueAtTime(peak, t1);
    if (hold > 0) g.gain.setValueAtTime(peak, t2);
    g.gain.setTargetAtTime(0.00001, t2, Math.max(0.004, tau));
    return { node: g, end: t2 + tau * 6.5 };
  }

  // Cible des paramètres du lit continu selon l'état `st`
  // Calibré pour :
  // - scénarios secs (matin, midi, soir, nuit, neige) : médiane court-terme entre -30.0 et -27.8 dBFS (cible [-32, -26])
  // - pluie : ~ -25.0 dBFS ; orage : ~ -22.8 dBFS (cible >= -22 dBFS max)
  function bedTargets(st) {
    const wind = st.wind != null ? st.wind : 0.15;
    const rain = st.r || 0;
    const snow = st.s || 0;
    const storm = st.storm || 0;
    const elev = st.e != null ? st.e : 0.3;
    const dayFactor = Math.max(0, Math.min(1, (elev + 0.25) / 0.85)); // 0 la nuit profonde, 1 le jour
    const nightAir = Math.max(0, -elev) * 0.10; // maintien d'un souffle d'altitude profond la nuit
    const snowHush = 1 - snow * 0.42;

    // 1. Souffle d'altitude sur les crêtes (ridge)
    const ridgeGain = (0.31 + 0.05 * dayFactor + nightAir + 0.14 * wind + 0.10 * storm) * (1 - snow * 0.12);
    const ridgeFreq = (435 + 115 * dayFactor + 240 * wind + 250 * storm) * (1 - snow * 0.18);

    // 2. Torrent glaciaire au fond de la vallée et brise dans les mélèzes (valley)
    const valleyGain = (0.17 + 0.10 * dayFactor + 0.04 * wind) * snowHush * (1 - storm * 0.35);
    const valleyFreq = (740 + 350 * dayFactor + 140 * wind) * snowHush;

    // 3. Filet d'air sous l'avant-toit / souffle de col / poudreuse (eaves)
    const eavesGain = 0.10 + 0.10 * wind + 0.12 * storm + 0.11 * snow;
    const eavesFreq = snow > 0.3 ? 960 : (490 + 220 * wind + 230 * storm);

    // 4. Pluie sur les bardeaux de mélèze et sur la vallée
    const rainGain = rain > 0.01 ? (0.50 * Math.pow(rain, 0.82) * (1 - storm * 0.12)) : 0.0001;
    const rainFreq = 1500 + 820 * rain + 240 * storm;

    return { ridgeGain, ridgeFreq, valleyGain, valleyFreq, eavesGain, eavesFreq, rainGain, rainFreq };
  }

  window.SCENE_SOUNDS.alpes = {
    bed(ctx, out, K, st) {
      // Deux espaces acoustiques :
      // 1) Grande vallée alpine (écho feutré et large au loin)
      const valleyVerbIn = K.reverb(ctx, out, 3.0, 2.5, 0.68, 0.42);
      const valleyVerb = K.filt(ctx, 'lowpass', 2100, 0.6);
      valleyVerb.connect(valleyVerbIn);

      // 2) Galerie en bois du refuge (réflexions courtes et chaudes sous l'avant-toit)
      const woodVerb = K.reverb(ctx, out, 0.62, 4.4, 0.55, 0.26);

      // --- Couche 1 : Air d'altitude et vent sur les arêtes (17.9 s, passe unique rapide) ---
      const ridgeBuf = K.loopBuffer(ctx, 'alpes:ridge:v4', 17.9, (n, sr, ch) => {
        const R = K.rng(1041 + ch * 199);
        const d = new Float32Array(n);
        let br = 0, lp = 0;
        const p1 = ch * 1.15, p2 = ch * 2.05, p3 = ch * 0.75;
        for (let i = 0; i < n; i++) {
          const w = R() * 2 - 1;
          br = (br + 0.015 * w) / 1.015;
          lp = 0.94 * lp + 0.06 * w;
          const ph = (i / n) * TAU;
          const swell = 0.68
            + 0.18 * Math.sin(ph + p1)
            + 0.11 * Math.sin(2 * ph - p2)
            + 0.08 * Math.cos(3 * ph + p3)
            + 0.05 * Math.sin(5 * ph + 0.4);
          d[i] = (br * 0.78 + lp * 0.42) * swell;
        }
        return d;
      });

      // --- Couche 2 : Torrent glaciaire très lointain et mélèzes dans la vallée (15.7 s) ---
      const valleyBuf = K.loopBuffer(ctx, 'alpes:valley:v4', 15.7, (n, sr, ch) => {
        const R = K.rng(2083 + ch * 311);
        const d = new Float32Array(n);
        let lp1 = 0, lp2 = 0, mod = 0;
        const p1 = ch * 1.4;
        for (let i = 0; i < n; i++) {
          const w = R() * 2 - 1;
          mod = 0.996 * mod + 0.004 * w;
          const ph = (i / n) * TAU;
          const slow = 0.82 + 0.12 * Math.sin(ph + p1) + 0.08 * Math.cos(2 * ph - p1 * 0.7);
          lp1 = 0.84 * lp1 + 0.16 * w;      // passe-bas ~1300 Hz
          lp2 = 0.982 * lp2 + 0.018 * lp1;  // coupe-bas doux sous ~130 Hz
          d[i] = (lp1 - lp2 * 0.82) * slow * (1 + mod * 1.35);
        }
        return d;
      });

      // --- Couche 3 : Filet d'air sous l'avant-toit / vent de col / grésil de neige (19.7 s) ---
      const eavesBuf = K.loopBuffer(ctx, 'alpes:eaves:v4', 19.7, (n, sr, ch) => {
        const R = K.rng(3197 + ch * 409);
        const d = new Float32Array(n);
        let b1 = 0, b2 = 0;
        const p1 = ch * 0.95;
        for (let i = 0; i < n; i++) {
          const w = R() * 2 - 1;
          const ph = (i / n) * TAU;
          const gust = 0.64
            + 0.21 * Math.sin(ph - p1)
            + 0.11 * Math.sin(3 * ph + p1 * 1.3)
            + 0.07 * Math.cos(4 * ph - 0.6);
          b1 = 0.89 * b1 + 0.11 * w;
          b2 = 0.972 * b2 + 0.028 * b1;
          d[i] = (b1 - b2 * 0.76) * gust;
        }
        return d;
      });

      // --- Couche 4 : Pluie de montagne sur les bardeaux de mélèze et la vallée (15.2 s) ---
      const rainBuf = K.loopBuffer(ctx, 'alpes:rain:v4', 15.2, (n, sr, ch) => {
        const R = K.rng(4271 + ch * 523);
        const d = new Float32Array(n);
        let br = 0, lp = 0;
        for (let i = 0; i < n; i++) {
          const w = R() * 2 - 1;
          br = (br + 0.03 * w) / 1.03;
          lp = 0.76 * lp + 0.24 * (w * 0.45 + br * 0.85);
          const ph = (i / n) * TAU;
          const wave = 0.86 + 0.10 * Math.sin(ph + ch * 0.9) + 0.06 * Math.cos(2 * ph - ch * 0.5);
          d[i] = lp * wave;
        }
        // Micro-impacts doux de gouttes sur les bardeaux de bois
        let idx = Math.floor(sr * 0.01);
        while (idx < n - Math.floor(sr * 0.02)) {
          idx += Math.floor(sr * (0.004 + R() * 0.013));
          const amp = 0.045 + R() * 0.085;
          const freq = 460 + R() * 1300;
          const decay = 0.0018 + R() * 0.003;
          const len = Math.min(n - idx, Math.floor(sr * decay * 5));
          for (let k = 0; k < len; k++) {
            const t = k / sr;
            const env = Math.sin(Math.min(1, t / 0.0008) * (Math.PI / 2)) * Math.exp(-t / decay);
            const wood = Math.sin(TAU * freq * t) * 0.5 + (R() * 2 - 1) * 0.5;
            d[idx + k] += wood * amp * env;
          }
        }
        return d;
      });

      const T = bedTargets(st || {});

      const ridgeSrc = K.loop(ctx, ridgeBuf, 1, 1.7);
      const ridgeLp = K.filt(ctx, 'lowpass', T.ridgeFreq, 0.55);
      const ridgeGain = K.gain(ctx, T.ridgeGain);
      K.chain(ridgeSrc, ridgeLp, ridgeGain, out);

      const valleySrc = K.loop(ctx, valleyBuf, 1, 5.3);
      const valleyLp = K.filt(ctx, 'lowpass', T.valleyFreq, 0.5);
      const valleyGain = K.gain(ctx, T.valleyGain);
      K.chain(valleySrc, valleyLp, valleyGain, out);

      const eavesSrc = K.loop(ctx, eavesBuf, 1, 9.1);
      const eavesFilt = K.filt(ctx, 'bandpass', T.eavesFreq, 0.65);
      const eavesGain = K.gain(ctx, T.eavesGain);
      K.chain(eavesSrc, eavesFilt, eavesGain, out);

      const rainSrc = K.loop(ctx, rainBuf, 1, 3.4);
      const rainHp = K.filt(ctx, 'highpass', 190, 0.6);
      const rainLp = K.filt(ctx, 'lowpass', T.rainFreq, 0.55);
      const rainGain = K.gain(ctx, T.rainGain);
      K.chain(rainSrc, rainHp, rainLp, rainGain, out);

      return {
        nodes: [ridgeSrc, valleySrc, eavesSrc, rainSrc],
        valleyVerb,
        woodVerb,
        set(s2) {
          const t2 = bedTargets(s2 || {});
          K.glide(ctx, ridgeGain.gain, t2.ridgeGain, 1.4);
          K.glide(ctx, ridgeLp.frequency, t2.ridgeFreq, 1.6);
          K.glide(ctx, valleyGain.gain, t2.valleyGain, 1.5);
          K.glide(ctx, valleyLp.frequency, t2.valleyFreq, 1.6);
          K.glide(ctx, eavesGain.gain, t2.eavesGain, 1.4);
          K.glide(ctx, eavesFilt.frequency, t2.eavesFreq, 1.6);
          K.glide(ctx, rainGain.gain, t2.rainGain, 1.5);
          K.glide(ctx, rainLp.frequency, t2.rainFreq, 1.6);
        },
      };
    },

    details: {
      // 1. Clarines / sonnailles d'un troupeau lointain dans les alpages (jour et crépuscule sec)
      clarines: {
        when: (st) => st.e > -0.12 && (st.r || 0) < 0.55 && (st.storm || 0) < 0.3 && (st.s || 0) < 0.35,
        rate: (st) => (st.e > 0.2 ? 2.8 : 2.2) * (1 - (st.r || 0) * 1.4),
        gap: 15,
        gain: 0.54,
        pan: [-0.65, 0.68],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime + 0.02;
          const count = 3 + Math.floor(R() * 3); // 3 à 5 petits coups irréguliers de broutage
          const dur = 3.8;
          const bus = makeSpaceBus(ctx, K, out, X, 0.68, 0.95, 0, t0 + dur);
          const distLp = K.filt(ctx, 'lowpass', 1750 + R() * 450, 0.65);
          distLp.connect(bus);

          // Deux cloches différentes dans le troupeau (une grave, une plus claire)
          const baseA = 500 + R() * 150;
          const baseB = baseA * (1.18 + R() * 0.16);
          let t = t0;
          for (let i = 0; i < count; i++) {
            const f0 = (i % 2 === 0 || R() < 0.55) ? baseA * (0.99 + R() * 0.02) : baseB * (0.99 + R() * 0.02);
            const vel = (0.76 + 0.24 * R()) * (i === 0 ? 1.0 : 0.86);
            const modes = [
              [1.0, 0.27, 0.24],
              [1.49, 0.165, 0.16],
              [2.13, 0.095, 0.095],
              [2.86, 0.048, 0.055],
            ];
            for (const [m, amp, dec] of modes) {
              const o = ctx.createOscillator();
              const env = softEnv(ctx, t, 0.004, 0.003, dec, amp * vel);
              o.type = 'sine';
              o.frequency.setValueAtTime(f0 * m * (0.997 + R() * 0.006), t);
              o.frequency.exponentialRampToValueAtTime(f0 * m * 0.994, t + dec * 2.5);
              o.connect(env.node);
              env.node.connect(distLp);
              o.start(t);
              o.stop(env.end);
              o.onended = () => { o.disconnect(); env.node.disconnect(); };
            }
            K.noiseHit(ctx, distLp, t, 0.05, 0.115 * vel, 'bandpass', f0 * 1.35, 3.0, 0.011);
            t += 0.24 + R() * 0.46;
          }
        },
      },

      // 2. Drapeaux de prière (fanions en haut à droite sous l'avant-toit)
      fanions: {
        when: (st) => (st.wind || 0) > 0.06,
        rate: (st) => 1.7 + (st.wind || 0.15) * 3.0 + (st.storm || 0) * 1.5,
        gap: 12,
        gain: 0.44,
        pan: [0.38, 0.85],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime + 0.02;
          const flaps = 2 + Math.floor(R() * 4);
          const windScale = 0.80 + 0.45 * Math.min(1, st.wind || 0.2);
          const bus = makeSpaceBus(ctx, K, out, X, 0.90, 0.10, 0.40, t0 + 2.5);

          let t = t0;
          for (let i = 0; i < flaps; i++) {
            const len = 0.095 + R() * 0.085;
            const amp = (0.28 + R() * 0.15) * windScale * (1 - i * 0.11);
            const buf = K.noiseBuf(ctx, len, (s) => {
              const x = s / len;
              return Math.sin(Math.PI * x) ** 1.6 * (0.7 + 0.3 * Math.sin(TAU * (16 + R() * 12) * s));
            });
            const s1 = ctx.createBufferSource();
            s1.buffer = buf;
            const bp1 = K.filt(ctx, 'bandpass', 350 + R() * 160, 1.3);
            const g1 = K.gain(ctx, amp * 1.0);
            K.run(ctx, bus, t, t + len, s1, bp1, g1);

            const s2 = ctx.createBufferSource();
            s2.buffer = buf;
            const bp2 = K.filt(ctx, 'bandpass', 1200 + R() * 600, 1.7);
            const g2 = K.gain(ctx, amp * 0.45);
            K.run(ctx, bus, t, t + len, s2, bp2, g2);

            t += 0.11 + R() * 0.21;
          }
        },
      },

      // 3. Chocard à bec jaune (bref appel sifflé-roulé de haute paroi avec écho de falaise, par temps sec)
      chocard: {
        when: (st) => st.e > 0.02 && (st.r || 0) < 0.35 && (st.s || 0) < 0.25 && (st.storm || 0) < 0.25,
        rate: (st) => st.e > 0.3 ? 1.7 : 1.2,
        gap: 22,
        gain: 0.40,
        pan: [-0.35, 0.82],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime + 0.03;
          const bus = makeSpaceBus(ctx, K, out, X, 0.45, 0.98, 0, t0 + 3.6);
          const distLp = K.filt(ctx, 'lowpass', 2250, 0.7);
          distLp.connect(bus);

          const fBase = 1750 + R() * 280;
          const dur = 0.15 + R() * 0.05; // Appel vif et court (« kri-i »)

          // Appel principal + écho de paroi rocheuse 0.31 s plus tard
          const passes = [
            { dt: 0, scale: 1.0, lp: 2200 },
            { dt: 0.29 + R() * 0.09, scale: 0.36, lp: 1450 },
          ];
          for (const p of passes) {
            const t = t0 + p.dt;
            const passLp = K.filt(ctx, 'lowpass', p.lp, 0.7);
            passLp.connect(distLp);

            const vBuf = K.buffer(ctx, null, dur + 0.05, (n, sr) => {
              const d = new Float32Array(n);
              let ph1 = 0, lpN = 0;
              for (let i = 0; i < n; i++) {
                const s = i / sr;
                const x = Math.min(1, s / dur);
                const curve = x < 0.55 ? (0.86 + 0.26 * (x / 0.55)) : (1.12 - 0.14 * ((x - 0.55) / 0.45));
                const flutter = 0.75 + 0.25 * Math.sin(TAU * 38 * s);
                const f = fBase * curve;
                ph1 += (TAU * f) / sr;
                lpN = 0.65 * lpN + 0.35 * (Math.random() * 2 - 1);
                const env = Math.sin(Math.PI * x) ** 1.5 * Math.exp(-0.9 * x);
                const sig = (Math.sin(ph1) * 0.32 + lpN * 0.68) * flutter;
                d[i] = sig * env * 0.42 * p.scale;
              }
              return d;
            });

            const src = ctx.createBufferSource();
            src.buffer = vBuf;
            const form1 = K.filt(ctx, 'bandpass', fBase * 1.05, 5.5);
            K.run(ctx, passLp, t, t + dur + 0.04, src, form1);
          }
        },
      },

      // 4. Marmotte très lointaine dans les pierriers (avec écho naturel de la paroi d'en face)
      marmotte: {
        when: (st) => st.e > 0.10 && (st.r || 0) < 0.2 && (st.s || 0) < 0.25 && (st.storm || 0) < 0.2,
        rate: (st) => st.e > 0.45 ? 1.7 : 1.25,
        gap: 28,
        gain: 0.38,
        pan: [-0.78, 0.78],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime + 0.03;
          const bus = makeSpaceBus(ctx, K, out, X, 0.42, 0.98, 0, t0 + 4.2);
          const f0 = 2280 + R() * 280;
          const dur = 0.24 + R() * 0.07;

          const echoes = [
            { delay: 0, gain: 0.175, cutoff: 2350 },
            { delay: 0.33 + R() * 0.10, gain: 0.062, cutoff: 1550 },
          ];
          for (const ec of echoes) {
            const t = t0 + ec.delay;
            const lp = K.filt(ctx, 'lowpass', ec.cutoff, 0.7);
            lp.connect(bus);

            const wBuf = K.buffer(ctx, null, dur + 0.08, (n, sr) => {
              const d = new Float32Array(n);
              let ph = 0;
              for (let i = 0; i < n; i++) {
                const s = i / sr;
                const x = Math.min(1, s / dur);
                const f = f0 * (x < 0.14 ? 0.91 + 0.11 * (x / 0.14) : 1.02 - 0.06 * ((x - 0.14) / 0.86));
                ph += (TAU * f) / sr;
                const env = Math.sin(Math.min(1, x / 0.12) * (Math.PI / 2)) * Math.pow(1 - x, 0.75);
                d[i] = (Math.sin(ph) * 0.62 + (Math.random() * 2 - 1) * 0.38) * env * ec.gain;
              }
              return d;
            });
            const src = ctx.createBufferSource();
            src.buffer = wBuf;
            const bp = K.filt(ctx, 'bandpass', f0, 4.8);
            K.run(ctx, lp, t, t + dur + 0.06, src, bp);
          }
        },
      },

      // 5. Rougequeue noir / accenteur alpin (petits « tsip » minéraux et brèves notes flûtées soufflées, hors neige/pluie)
      rougequeue: {
        when: (st) => st.e > -0.05 && (st.r || 0) < 0.25 && (st.s || 0) < 0.25 && (st.storm || 0) < 0.2,
        rate: (st) => st.h < 10 ? 2.5 : st.e > 0.2 ? 1.6 : 1.8,
        gap: 16,
        gain: 0.38,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime + 0.02;
          const notes = 3 + Math.floor(R() * 3);
          const bus = makeSpaceBus(ctx, K, out, X, 0.65, 0.72, 0.16, t0 + 3.0);
          const lp = K.filt(ctx, 'lowpass', 2750, 0.65);
          lp.connect(bus);

          const base = 2250 + R() * 480;
          let t = t0;
          for (let i = 0; i < notes; i++) {
            const d = 0.042 + R() * 0.032;
            const f1 = base * (0.92 + R() * 0.22);
            const f2 = f1 * (R() < 0.55 ? 1.09 + R() * 0.08 : 0.90 - R() * 0.06);

            const sBuf = K.buffer(ctx, null, d + 0.04, (n, sr) => {
              const arr = new Float32Array(n);
              let ph = 0;
              for (let k = 0; k < n; k++) {
                const s = k / sr;
                const x = Math.min(1, s / d);
                const f = f1 + (f2 - f1) * x;
                ph += (TAU * f) / sr;
                const env = Math.sin(Math.PI * x) ** 1.5 * Math.exp(-1.4 * x);
                arr[k] = (Math.sin(ph) * 0.50 + (Math.random() * 2 - 1) * 0.50) * env * 0.22;
              }
              return arr;
            });
            const src = ctx.createBufferSource();
            src.buffer = sBuf;
            const bp = K.filt(ctx, 'bandpass', (f1 + f2) * 0.5, 5.5);
            K.run(ctx, lp, t, t + d + 0.03, src, bp);

            t += d + 0.065 + R() * 0.095;
          }
        },
      },

      // 6. Poutres et charpente en mélèze du refuge (craquement thermique doux du bois)
      boisRefuge: {
        when: () => true,
        rate: (st) => 1.5 + (st.e < 0 ? 1.1 : 0.35) + (st.s || 0) * 0.9 + (st.storm || 0) * 1.2,
        gap: 14,
        gain: 0.44,
        pan: [-0.85, 0.85],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime + 0.02;
          const grains = 2 + Math.floor(R() * 3);
          const bus = makeSpaceBus(ctx, K, out, X, 0.90, 0.06, 0.52, t0 + 1.8);

          const root = 175 + R() * 85;
          let t = t0;
          for (let i = 0; i < grains; i++) {
            const vel = (0.76 + 0.24 * R()) * Math.pow(0.8, i);
            for (const [mult, q, amp, tau] of [[1.0, 6.5, 0.27, 0.028], [2.35, 8.5, 0.18, 0.018], [4.7, 5.5, 0.095, 0.010]]) {
              K.noiseHit(ctx, bus, t, tau * 6, amp * vel, 'bandpass', root * mult * (0.97 + R() * 0.06), q, tau);
            }
            t += 0.032 + R() * 0.075;
          }
        },
      },

      // 7. Lanterne en fer forgé (micro-impulsions stick-slip sur le crochet en fer et le poteau en bois, sans onde pure)
      lanterne: {
        when: (st) => (st.wind || 0) > 0.10,
        rate: (st) => 1.0 + (st.wind || 0.15) * 2.1 + (st.storm || 0) * 1.2,
        gap: 15,
        gain: 0.38,
        pan: [-0.82, -0.45],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime + 0.02;
          const bus = makeSpaceBus(ctx, K, out, X, 0.88, 0.06, 0.45, t0 + 1.8);
          const ticks = 3 + Math.floor(R() * 3);
          const fIron1 = 560 + R() * 160;
          const fIron2 = 1480 + R() * 380;

          let t = t0;
          for (let i = 0; i < ticks; i++) {
            const vel = (0.70 + 0.30 * R()) * Math.sin(Math.PI * (i + 0.5) / ticks);
            K.noiseHit(ctx, bus, t, 0.07, 0.22 * vel, 'bandpass', 220 + R() * 50, 5.0, 0.014);
            K.noiseHit(ctx, bus, t, 0.06, 0.17 * vel, 'bandpass', fIron1 * (0.98 + R() * 0.04), 11.0, 0.010);
            K.noiseHit(ctx, bus, t, 0.04, 0.085 * vel, 'bandpass', fIron2 * (0.98 + R() * 0.04), 14.0, 0.006);
            t += 0.024 + R() * 0.045;
          }
        },
      },

      // 8. Craquement sourd de glacier / sérac au loin (nuit froide ou neige)
      glaceNuit: {
        when: (st) => (st.e < -0.15 || (st.s || 0) > 0.3) && (st.r || 0) < 0.35,
        rate: (st) => st.e < -0.3 ? 2.1 : 1.6,
        gap: 20,
        gain: 0.44,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime + 0.03;
          const bus = makeSpaceBus(ctx, K, out, X, 0.56, 0.98, 0, t0 + 4.5);
          const distLp = K.filt(ctx, 'lowpass', 1100, 0.75);
          distLp.connect(bus);

          const lowLen = 0.55 + R() * 0.3;
          const lowSrc = ctx.createBufferSource();
          lowSrc.buffer = K.noiseBuf(ctx, lowLen + 0.2);
          const lowBp = K.filt(ctx, 'bandpass', 95 + R() * 45, 2.2);
          const lowEnv = softEnv(ctx, t0, 0.045, 0.08, 0.16, 0.38);
          K.run(ctx, distLp, t0, lowEnv.end, lowSrc, lowBp, lowEnv.node);

          const cracks = 2 + Math.floor(R() * 2);
          for (let i = 0; i < cracks; i++) {
            const tc = t0 + i * (0.09 + R() * 0.14);
            const fCrack = 340 + R() * 380;
            K.noiseHit(ctx, distLp, tc, 0.22, 0.25 * (1 - i * 0.2), 'bandpass', fCrack, 3.8, 0.032);
          }
        },
      },

      // 9. Chouette de Tengmalm lointaine dans la forêt d'épicéas en contrebas (nuit noire)
      chouette: {
        when: (st) => st.e < -0.25 && (st.r || 0) < 0.3 && (st.storm || 0) < 0.2,
        rate: () => 2.1,
        gap: 22,
        gain: 0.42,
        pan: [-0.72, 0.45],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime + 0.03;
          const notes = 4 + Math.floor(R() * 3); // Chant flûté boisé « pou-pou-pou-pou »
          const bus = makeSpaceBus(ctx, K, out, X, 0.50, 0.98, 0, t0 + 4.4);
          const lp = K.filt(ctx, 'lowpass', 940, 0.7);
          lp.connect(bus);

          const f0 = 455 + R() * 55;
          let t = t0;
          for (let i = 0; i < notes; i++) {
            const vel = Math.sin(Math.PI * (i + 0.7) / (notes + 0.4));
            const noteDur = 0.14 + R() * 0.03;
            const nBuf = K.buffer(ctx, null, noteDur + 0.06, (n, sr) => {
              const d = new Float32Array(n);
              let ph = 0, lpNoise = 0;
              for (let k = 0; k < n; k++) {
                const s = k / sr;
                const x = Math.min(1, s / noteDur);
                const f = f0 * (x < 0.25 ? 0.96 + 0.05 * (x / 0.25) : 1.01 - 0.03 * ((x - 0.25) / 0.75));
                ph += (TAU * f) / sr;
                lpNoise = 0.82 * lpNoise + 0.18 * (Math.random() * 2 - 1);
                const env = Math.sin(Math.PI * x) ** 1.6 * Math.exp(-1.1 * x);
                d[k] = (Math.sin(ph) * 0.56 + lpNoise * 0.44) * env * 0.27 * vel;
              }
              return d;
            });
            const src = ctx.createBufferSource();
            src.buffer = nBuf;
            const bp = K.filt(ctx, 'bandpass', f0, 4.2);
            K.run(ctx, lp, t, t + noteDur + 0.05, src, bp);

            t += 0.25 + R() * 0.05;
          }
        },
      },

      // 10. Grillon / orthoptère d'alpage dans l'herbe au crépuscule et matin doux
      grillonAlpage: {
        when: (st) => st.e > -0.25 && st.e < 0.22 && (st.r || 0) < 0.15 && (st.s || 0) < 0.1 && (st.storm || 0) < 0.2,
        rate: (st) => st.h > 16 ? 2.6 : 1.6,
        gap: 12,
        gain: 0.34,
        pan: [-0.7, 0.7],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime + 0.02;
          const chirps = 2 + Math.floor(R() * 2);
          const bus = makeSpaceBus(ctx, K, out, X, 0.84, 0.45, 0.15, t0 + 2.5);
          const lp = K.filt(ctx, 'lowpass', 3600, 0.7);
          lp.connect(bus);

          const f0 = 3050 + R() * 380;
          let t = t0;
          for (let c = 0; c < chirps; c++) {
            for (let p = 0; p < 3; p++) {
              const tp = t + p * 0.028;
              K.noiseHit(ctx, lp, tp, 0.032, 0.115, 'bandpass', f0, 11, 0.0055);
              const o = ctx.createOscillator();
              o.type = 'sine';
              o.frequency.setValueAtTime(f0, tp);
              const env = softEnv(ctx, tp, 0.003, 0.006, 0.005, 0.042);
              o.connect(env.node);
              env.node.connect(lp);
              o.start(tp);
              o.stop(env.end);
              o.onended = () => { o.disconnect(); env.node.disconnect(); };
            }
            t += 0.28 + R() * 0.18;
          }
        },
      },

      // 11. Gouttes d'eau tombant de l'avant-toit sur la rambarde en bois et la jardinière (sans onde sinusoïdale)
      gouttesToit: {
        when: (st) => (st.r || 0) > 0.12,
        rate: (st) => 2.6 + (st.r || 0) * 3.2,
        gap: 9,
        gain: 0.48,
        pan: [-0.8, 0.8],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime + 0.02;
          const drops = 3 + Math.floor(R() * 3);
          const bus = makeSpaceBus(ctx, K, out, X, 0.92, 0.10, 0.48, t0 + 2.4);

          let t = t0;
          for (let i = 0; i < drops; i++) {
            const vel = 0.75 + 0.25 * R();
            const fWood = 380 + R() * 280;
            const fSplash = 1350 + R() * 850;
            // Corps mat de la goutte sur la rambarde en mélèze + petit impact clair d'eau/feuille
            K.noiseHit(ctx, bus, t, 0.065, 0.26 * vel, 'bandpass', fWood, 3.6, 0.011);
            K.noiseHit(ctx, bus, t + 0.002, 0.045, 0.19 * vel, 'bandpass', fSplash, 7.5, 0.0065);
            t += 0.15 + R() * 0.30;
          }
        },
      },

      // 12. Poudreuse qui glisse d'une branche de mélèze ou du bord du toit (temps de neige)
      neigeBranche: {
        when: (st) => (st.s || 0) > 0.2,
        rate: (st) => 3.0 * (st.s || 0.7),
        gap: 13,
        gain: 0.44,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime + 0.02;
          const slideDur = 0.42 + R() * 0.28;
          const bus = makeSpaceBus(ctx, K, out, X, 0.86, 0.32, 0.40, t0 + 2.2);

          const sBuf = K.noiseBuf(ctx, slideDur + 0.15, (s) => Math.sin(Math.PI * Math.min(1, s / slideDur)) ** 1.4);
          const sSrc = ctx.createBufferSource();
          sSrc.buffer = sBuf;
          const sBp = K.filt(ctx, 'bandpass', 1150 + R() * 450, 1.3);
          const sLp = K.filt(ctx, 'lowpass', 2200, 0.7);
          const sG = K.gain(ctx, 0.25);
          K.run(ctx, bus, t0, t0 + slideDur + 0.1, sSrc, sBp, sLp, sG);

          const tThump = t0 + slideDur * 0.72;
          K.noiseHit(ctx, bus, tThump, 0.28, 0.35, 'lowpass', 230 + R() * 70, 0.8, 0.052);
        },
      },

      // 13. Onde de brise ou bourrasque passant sur le col
      rafaleCol: {
        when: () => true,
        rate: (st) => 1.1 + (st.wind || 0.15) * 1.9 + (st.storm || 0) * 1.2,
        gap: 16,
        gain: 0.38,
        pan: [-0.55, 0.55],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime + 0.02;
          const dur = 2.2 + R() * 1.3;
          const bus = makeSpaceBus(ctx, K, out, X, 0.82, 0.45, 0.20, t0 + dur + 0.8);

          const buf = K.noiseBuf(ctx, dur + 0.2, (s) => {
            const x = Math.min(1, s / dur);
            return Math.sin(Math.PI * x) ** 1.8;
          });
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const bp = K.filt(ctx, 'bandpass', 260 + R() * 120, 1.2);
          const fPeak = 380 + (st.wind || 0.2) * 300 + R() * 140;
          bp.frequency.setValueAtTime(240, t0);
          bp.frequency.exponentialRampToValueAtTime(fPeak, t0 + dur * 0.45);
          bp.frequency.exponentialRampToValueAtTime(220, t0 + dur);

          const lp = K.filt(ctx, 'lowpass', 950 + (st.wind || 0.2) * 450, 0.6);
          const g = K.gain(ctx, 0.23 + (st.wind || 0.15) * 0.10);
          K.run(ctx, bus, t0, t0 + dur + 0.15, src, bp, lp, g);
        },
      },

      // 14. Tasse en émail / thermos et givre sur la lisse en bois à gauche (froid, soir, nuit, matin, neige)
      givreLisse: {
        when: (st) => st.e < 0.25 || (st.s || 0) > 0.2,
        rate: (st) => (st.e < -0.2 ? 1.9 : 1.3) + (st.s || 0) * 1.1,
        gap: 16,
        gain: 0.38,
        pan: [-0.78, -0.35],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime + 0.02;
          const bus = makeSpaceBus(ctx, K, out, X, 0.90, 0.05, 0.48, t0 + 1.5);
          const fWood = 310 + R() * 110;
          const fCeram = 1320 + R() * 380;
          K.noiseHit(ctx, bus, t0, 0.06, 0.25, 'bandpass', fWood, 6.5, 0.014);
          K.noiseHit(ctx, bus, t0 + 0.008 + R() * 0.015, 0.045, 0.15, 'bandpass', fCeram, 12.0, 0.008);
        },
      },
    },

    sfx: {
      // Petite cloche de la chapelle du hameau en bas à gauche dans la vallée (2 à 3 coups lents et lointains)
      // Calibrée pour être bien audible à gain=0.14 (appelée par l'image) et rester sous +9 dB à gain=0.5
      bell(ctx, out, R, st, X) {
        const K = window.SOUND_KIT;
        const rnd = R || Math.random;
        const t0 = ctx.currentTime + 0.02;
        const strokes = 2 + (rnd() < 0.45 ? 1 : 0);
        const bus = makeSpaceBus(ctx, K, out, X, 0.72, 1.05, 0, t0 + 7.5);
        const distLp = K.filt(ctx, 'lowpass', 1850, 0.65);
        distLp.connect(bus);

        const f0 = 396 + rnd() * 36;
        for (let s = 0; s < strokes; s++) {
          const ts = t0 + s * (1.36 + rnd() * 0.16);
          const vel = (s === 0 ? 1.0 : s === 1 ? 0.88 : 0.76) * (0.94 + 0.12 * rnd());
          const partials = [
            [0.5, 0.25, 1.45],
            [1.0, 0.45, 1.15],
            [1.003, 0.22, 1.10],
            [1.183, 0.31, 0.78],
            [1.506, 0.18, 0.52],
            [2.0, 0.19, 0.42],
            [2.51, 0.085, 0.24],
          ];
          for (const [m, amp, dec] of partials) {
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.setValueAtTime(f0 * m, ts);
            const env = softEnv(ctx, ts, 0.007, 0.005, dec, amp * vel);
            o.connect(env.node);
            env.node.connect(distLp);
            o.start(ts);
            o.stop(env.end);
            o.onended = () => { o.disconnect(); env.node.disconnect(); };
          }
          K.noiseHit(ctx, distLp, ts, 0.08, 0.15 * vel, 'bandpass', f0 * 1.4, 2.5, 0.016);
        }
      },

      // Allumage de la lanterne du refuge (frottement boisé de l'allumette, souffle de flamme et petits crépitements)
      match(ctx, out, R, st, X) {
        const K = window.SOUND_KIT;
        const rnd = R || Math.random;
        const t0 = ctx.currentTime + 0.01;
        const bus = makeSpaceBus(ctx, K, out, X, 0.96, 0.06, 0.42, t0 + 1.4);

        const strikeLen = 0.08 + rnd() * 0.035;
        const grainRate = 48 + rnd() * 28;
        const sBuf = K.noiseBuf(ctx, strikeLen, (x) => {
          const env = Math.sin(Math.PI * (x / strikeLen));
          return env * (0.4 + 0.6 * Math.abs(Math.sin(Math.PI * grainRate * x)));
        });
        const sSrc = ctx.createBufferSource();
        sSrc.buffer = sBuf;
        const sBp = K.filt(ctx, 'bandpass', 1950, 1.3);
        sBp.frequency.setValueAtTime(2250, t0);
        sBp.frequency.exponentialRampToValueAtTime(1350, t0 + strikeLen);
        const sLp = K.filt(ctx, 'lowpass', 3300, 0.7);
        const sG = K.gain(ctx, 0.72);
        K.run(ctx, bus, t0, t0 + strikeLen, sSrc, sBp, sLp, sG);

        const tFlare = t0 + strikeLen * 0.82;
        const flareLen = 0.48;
        const fSrc = ctx.createBufferSource();
        fSrc.buffer = K.noiseBuf(ctx, flareLen);
        const fHp = K.filt(ctx, 'highpass', 160, 0.7);
        const fLp = K.filt(ctx, 'lowpass', 1750, 0.8);
        fLp.frequency.setValueAtTime(1900, tFlare);
        fLp.frequency.exponentialRampToValueAtTime(780, tFlare + 0.4);
        const fEnv = softEnv(ctx, tFlare, 0.032, 0.04, 0.075, 0.42);
        K.run(ctx, bus, tFlare, fEnv.end, fSrc, fHp, fLp, fEnv.node);

        const snaps = 4 + Math.floor(rnd() * 3);
        for (let i = 0; i < snaps; i++) {
          const ts = tFlare + 0.04 + rnd() * 0.34;
          K.noiseHit(ctx, bus, ts, 0.02, 0.10 + rnd() * 0.07, 'bandpass', 1600 + rnd() * 1400, 2.2, 0.0024);
        }
      },

      // Extinction de la lanterne (souffle doux dans le verre de la lanterne)
      puff(ctx, out, R, st, X) {
        const K = window.SOUND_KIT;
        const rnd = R || Math.random;
        const t0 = ctx.currentTime + 0.01;
        const bus = makeSpaceBus(ctx, K, out, X, 0.96, 0.06, 0.42, t0 + 0.9);

        const len = 0.38;
        const src = ctx.createBufferSource();
        src.buffer = K.noiseBuf(ctx, len);
        const hp = K.filt(ctx, 'highpass', 140, 0.7);
        const lp = K.filt(ctx, 'lowpass', 1020, 0.85);
        lp.frequency.setValueAtTime(1100, t0);
        lp.frequency.exponentialRampToValueAtTime(380, t0 + 0.28);
        const env = softEnv(ctx, t0, 0.026, 0.03, 0.055, 0.40 * (0.9 + 0.2 * rnd()));
        K.run(ctx, bus, t0, env.end, src, hp, lp, env.node);
      },

      // Petit déclic mécanique feutré (loquet / interrupteur en bois et laiton)
      click(ctx, out, R, st, X) {
        const K = window.SOUND_KIT;
        const rnd = R || Math.random;
        const t0 = ctx.currentTime + 0.005;
        const bus = makeSpaceBus(ctx, K, out, X, 0.96, 0.03, 0.35, t0 + 0.4);
        K.noiseHit(ctx, bus, t0, 0.028, 0.36, 'bandpass', 1650 + rnd() * 400, 2.4, 0.0028);
        K.noiseHit(ctx, bus, t0 + 0.014 + rnd() * 0.01, 0.028, 0.18, 'bandpass', 1100 + rnd() * 300, 2.2, 0.0032);
        K.noiseHit(ctx, bus, t0, 0.045, 0.20, 'lowpass', 240, 0.8, 0.006);
      },

      // Chouette lointaine (si déclenchée via sfx)
      owl(ctx, out, R, st, X) {
        window.SCENE_SOUNDS.alpes.details.chouette.play(ctx, out, R || Math.random, st || { e: -0.5 }, X);
      },
    },
  };
})();
