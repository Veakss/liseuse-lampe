// Liseuse à la lampe — scène « fuji » (Mont Fuji, lac, cerisiers, ponton et torii)
(function () {
  const TAU = Math.PI * 2;

  // Crée un AudioBuffer mono avec fondu anti-clic et normalisation à un pic cible précis
  function makeBuf(ctx, secs, peakTarget, fn) {
    const sr = ctx.sampleRate;
    const n = Math.max(1, Math.round(sr * secs));
    const b = ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    fn(d, n, sr);
    const fade = Math.min(Math.round(sr * 0.008), n >> 2);
    for (let i = 0; i < fade; i++) {
      const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
      d[i] *= w;
      d[n - 1 - i] *= w;
    }
    if (peakTarget > 0) {
      let maxAbs = 0;
      for (let i = 0; i < n; i++) {
        const a = Math.abs(d[i]);
        if (a > maxAbs) maxAbs = a;
      }
      if (maxAbs > 1e-6) {
        const scale = peakTarget / maxAbs;
        for (let i = 0; i < n; i++) d[i] *= scale;
      }
    }
    return b;
  }

  // Envoi dans out (déjà panné et mis à l'échelle par K.play) + envois de réverbération proportionnels au gain du détail
  function sendSpace(ctx, srcNode, out, X, dryAmt, nearAmt, farAmt) {
    const gVal = out && out.gain ? out.gain.value : 0.35;
    if (dryAmt > 0) {
      const dg = ctx.createGain();
      dg.gain.value = dryAmt;
      srcNode.connect(dg);
      dg.connect(out);
    }
    if (X && X.verbNear && nearAmt > 0) {
      const ng = ctx.createGain();
      ng.gain.value = nearAmt * gVal;
      srcNode.connect(ng);
      ng.connect(X.verbNear);
    }
    if (X && X.verbFar && farAmt > 0) {
      const fg = ctx.createGain();
      fg.gain.value = farAmt * gVal;
      srcNode.connect(fg);
      fg.connect(X.verbFar);
    }
  }

  // Calcul des cibles de niveau et de filtrage du fond selon l'état st
  function bedTargets(st) {
    const r = st.r || 0;
    const s = st.s || 0;
    const storm = st.storm || 0;
    const wind = st.wind == null ? 0.15 : st.wind;
    const e = st.e == null ? 0.5 : st.e;
    const night = e < -0.15 ? Math.min(1, (-0.15 - e) * 2.2) : 0;
    const dusk = e < 0.12 && e > -0.35 ? Math.max(0, 1 - Math.abs(e + 0.08) * 4.5) : 0;
    const dry = Math.max(0, 1 - r * 1.1 - s * 0.8);

    // 1. Eau du lac : clapot doux et constant contre les rives
    const lacGain = (0.31 + 0.08 * wind + 0.02 * storm) * (1 - 0.16 * s) * (1 - 0.04 * night);
    const lacCut = (1220 + 480 * wind + 260 * storm) * (1 - 0.22 * s) * (1 - 0.08 * night);

    // 2. Brise du Fuji dans les pins et les cerisiers
    const briseGain = 0.15 + 0.23 * Math.pow(wind, 1.15) + 0.06 * storm + 0.09 * s;
    const briseCut = 780 + 1020 * wind + 450 * storm - 110 * s;

    // 3. Pluie sur le lac et les branches de sakura
    const pluieGain = r > 0.005 ? 0.02 + 0.46 * Math.pow(r, 1.05) + 0.03 * storm : 0.0001;
    const pluieCut = 1650 + 920 * r + 350 * storm;

    // 4. Air velouté des berges au crépuscule et la nuit (roseaux et murmure lointain)
    const riveGain = Math.max(0.0001, (0.11 * dusk + 0.12 * night) * dry + 0.03 * (1 - s));
    const riveCut = 1450 + 450 * dusk - 180 * night;

    return { lacGain, lacCut, briseGain, briseCut, pluieGain, pluieCut, riveGain, riveCut };
  }

  window.SCENE_SOUNDS = window.SCENE_SOUNDS || {};

  window.SCENE_SOUNDS.fuji = {
    bed(ctx, out, K, st) {
      const R = K.rng(73109);

      // Envois de réverbération : rive proche et vaste vallée du lac
      const verbNear = K.reverb(ctx, out, 1.85, 3.3, 0.54, 0.28);
      const farLP = K.filt(ctx, 'lowpass', 1950, 0.6);
      farLP.connect(out);
      const verbFar = K.reverb(ctx, farLP, 3.8, 2.2, 0.68, 0.48);

      // --- Couche 1 : Lac calme et clapot de rive (boucle 19.3 s) ---
      const lacBuf = K.loopBuffer(ctx, 'fuji:lac:v4', 19.3, (n, sr, ch) => {
        const d = new Float32Array(n);
        const body = new Float32Array(n);
        const wash = new Float32Array(n);
        K.brownInto(body, 1.0, 0.016, R);
        K.pinkInto(wash, 0.9, R);

        let lp = 0, hp = 0;
        for (let i = 0; i < n; i++) {
          lp += 0.14 * (wash[i] - lp);
          hp += 0.018 * (lp - hp);
          wash[i] = lp - hp;
          d[i] = body[i] * 0.46 + wash[i] * 0.25;
        }

        // Vagues lentes et asymétriques (montée douce, long retrait sur la rive)
        let t = 0.4 + ch * 1.7;
        const durTot = n / sr;
        while (t < durTot - 3.6) {
          const wDur = 3.2 + R() * 2.8;
          const s0 = Math.floor(t * sr);
          const len = Math.floor(wDur * sr);
          const amp = 0.42 + R() * 0.38;
          for (let k = 0; k < len && s0 + k < n; k++) {
            const x = k / len;
            const env = x < 0.35
              ? Math.sin((x / 0.35) * (Math.PI * 0.5))
              : Math.pow(0.5 + 0.5 * Math.cos(((x - 0.35) / 0.65) * Math.PI), 1.4);
            const crest = x > 0.22 && x < 0.78 ? Math.sin(((x - 0.22) / 0.56) * Math.PI) : 0;
            d[s0 + k] += (body[s0 + k] * 0.50 * env + wash[s0 + k] * 0.75 * crest) * amp;
          }
          t += 3.9 + R() * 3.1;
        }
        return d;
      });

      // --- Couche 2 : Brise du mont Fuji dans les pins et les cerisiers (boucle 23.7 s) ---
      const briseBuf = K.loopBuffer(ctx, 'fuji:brise:v4', 23.7, (n, sr, ch) => {
        const d = new Float32Array(n);
        const lowAir = new Float32Array(n);
        const needles = new Float32Array(n);
        K.brownInto(lowAir, 0.85, 0.035, R);
        K.pinkInto(needles, 0.95, R);

        let lp1 = 0, lp2 = 0;
        const p1 = ch * 1.9 + 0.4;
        const p2 = ch * 2.7 + 1.1;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const swell = 0.62
            + 0.22 * Math.sin((TAU * t) / 23.7 + p1)
            + 0.14 * Math.sin((TAU * t) / 11.85 + p2)
            + 0.09 * Math.cos((TAU * t) / 7.9 - p1);
          lp1 += 0.11 * (needles[i] - lp1);
          lp2 += 0.025 * (lp1 - lp2);
          const fol = lp1 - lp2;
          d[i] = (lowAir[i] * 0.52 + fol * 0.82) * swell;
        }
        return d;
      });

      // --- Couche 3 : Pluie fine sur le lac et les fleurs de cerisier (boucle 17.9 s) ---
      const pluieBuf = K.loopBuffer(ctx, 'fuji:pluie:v4', 17.9, (n, sr) => {
        const d = new Float32Array(n);
        K.pinkInto(d, 0.85, R);
        let lp = 0, hp = 0;
        for (let i = 0; i < n; i++) {
          const w = R() * 2 - 1;
          lp += 0.22 * (w * 0.35 + d[i] - lp);
          hp += 0.028 * (lp - hp);
          d[i] = (lp - hp) * 0.75;
        }
        let idx = Math.floor(sr * 0.01 * R());
        while (idx < n - 240) {
          idx += Math.floor(sr * (0.0025 + R() * 0.014));
          const a = 0.05 + R() * 0.15;
          const dLen = Math.floor(sr * (0.0018 + R() * 0.0028));
          let bp1 = 0, bp2 = 0;
          const c = 0.12 + R() * 0.16;
          for (let k = 0; k < dLen && idx + k < n; k++) {
            const env = Math.sin((Math.PI * k) / dLen) * (1 - k / dLen);
            const w = R() * 2 - 1;
            bp1 += c * (w - bp1);
            bp2 += 0.04 * (bp1 - bp2);
            d[idx + k] += (bp1 - bp2) * a * env * 1.6;
          }
        }
        return d;
      });

      // --- Couche 4 : Souffle feutré des roseaux et de la rive au soir/nuit (boucle 21.1 s) ---
      const riveBuf = K.loopBuffer(ctx, 'fuji:rive:v4', 21.1, (n, sr, ch) => {
        const d = new Float32Array(n);
        K.pinkInto(d, 0.75, R);
        let bp1 = 0, bp2 = 0;
        const ph0 = ch * 2.1;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const env = 0.58 + 0.26 * Math.sin((TAU * t) / 21.1 + ph0) + 0.14 * Math.cos((TAU * t) / 7.03 - ph0);
          bp1 += 0.16 * (d[i] - bp1);
          bp2 += 0.045 * (bp1 - bp2);
          d[i] = (bp1 - bp2) * env;
        }
        return d;
      });

      const tgt0 = bedTargets(st);

      const sLac = K.loop(ctx, lacBuf, 1, 0);
      const fLacHP = K.filt(ctx, 'highpass', 85, 0.7);
      const fLacLP = K.filt(ctx, 'lowpass', tgt0.lacCut, 0.65);
      const gLac = K.gain(ctx, tgt0.lacGain);
      K.chain(sLac, fLacHP, fLacLP, gLac, out);

      const sBrise = K.loop(ctx, briseBuf, 1, 3.1);
      const fBriseHP = K.filt(ctx, 'highpass', 140, 0.7);
      const fBriseLP = K.filt(ctx, 'lowpass', tgt0.briseCut, 0.8);
      const gBrise = K.gain(ctx, tgt0.briseGain);
      K.chain(sBrise, fBriseHP, fBriseLP, gBrise, out);

      const lfoBrise = ctx.createOscillator();
      const lfoBriseG = K.gain(ctx, 150);
      lfoBrise.frequency.value = 0.037;
      K.chain(lfoBrise, lfoBriseG, fBriseLP.frequency);
      lfoBrise.start(ctx.currentTime);

      const sPluie = K.loop(ctx, pluieBuf, 1, 1.7);
      const fPluieHP = K.filt(ctx, 'highpass', 240, 0.7);
      const fPluieLP = K.filt(ctx, 'lowpass', tgt0.pluieCut, 0.55);
      const gPluie = K.gain(ctx, tgt0.pluieGain);
      K.chain(sPluie, fPluieHP, fPluieLP, gPluie, out);

      const sRive = K.loop(ctx, riveBuf, 1, 5.3);
      const fRiveBP = K.filt(ctx, 'bandpass', 760, 0.9);
      const fRiveLP = K.filt(ctx, 'lowpass', tgt0.riveCut, 0.6);
      const gRive = K.gain(ctx, tgt0.riveGain);
      K.chain(sRive, fRiveBP, fRiveLP, gRive, out);

      return {
        nodes: [sLac, sBrise, lfoBrise, sPluie, sRive],
        verbNear,
        verbFar,
        set(s2) {
          const tgt = bedTargets(s2);
          K.glide(ctx, gLac.gain, tgt.lacGain, 1.4);
          K.glide(ctx, fLacLP.frequency, tgt.lacCut, 1.4);
          K.glide(ctx, gBrise.gain, tgt.briseGain, 1.4);
          K.glide(ctx, fBriseLP.frequency, tgt.briseCut, 1.4);
          K.glide(ctx, gPluie.gain, tgt.pluieGain, 1.4);
          K.glide(ctx, fPluieLP.frequency, tgt.pluieCut, 1.4);
          K.glide(ctx, gRive.gain, tgt.riveGain, 1.6);
          K.glide(ctx, fRiveLP.frequency, tgt.riveCut, 1.6);
        },
      };
    },

    details: {
      // 1. Clapotis de l'eau contre les pilotis de bois du ponton gauche
      clapotisPonton: {
        when: (st) => (st.s || 0) < 0.6,
        rate: (st) => 3.5 + (st.wind || 0.15) * 3.2 + (st.r || 0) * 1.8,
        gap: 8,
        gain: 0.68,
        pan: [-0.75, -0.35],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const count = 3 + Math.floor(R() * 2);
          const wetBoost = 1 + 0.55 * (st.r || 0) + 0.70 * (st.storm || 0);
          const bus = ctx.createGain();
          bus.gain.value = wetBoost;
          sendSpace(ctx, bus, out, X, 0.90, 0.48, 0.16);

          let offset = 0.02;
          for (let i = 0; i < count; i++) {
            const dur = 0.22 + R() * 0.12;
            const f0 = 280 + R() * 120;
            const f1 = f0 * (1.38 + R() * 0.32);
            const amp = (0.85 + R() * 0.22) * (1 - i * 0.13);
            const buf = makeBuf(ctx, dur, 0.68, (d, n) => {
              let lp = 0, bp = 0;
              for (let k = 0; k < n; k++) {
                const x = k / n;
                const env = Math.sin(Math.PI * x) * Math.exp(-1.9 * x);
                const w = R() * 2 - 1;
                lp += (0.09 + 0.08 * x) * (w - lp);
                bp += 0.035 * (lp - bp);
                d[k] = (lp - bp) * env;
              }
            });
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.Q.value = 1.6 + R() * 0.6;
            bp.frequency.setValueAtTime(f0, t0 + offset);
            bp.frequency.exponentialRampToValueAtTime(f1, t0 + offset + dur * 0.85);
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 1520;
            const g = ctx.createGain();
            g.gain.value = amp;
            src.connect(bp);
            bp.connect(lp);
            lp.connect(g);
            g.connect(bus);
            src.start(t0 + offset);
            src.stop(t0 + offset + dur);
            offset += 0.19 + R() * 0.15;
          }
        },
      },

      // 2. Risée d'eau claire sur les pierres du quai et le pied du torii à droite
      ondulationTorii: {
        when: (st) => (st.r || 0) < 0.85,
        rate: (st) => 3.0 + (st.wind || 0.15) * 2.6,
        gap: 9,
        gain: 0.62,
        pan: [0.35, 0.80],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const dur = 0.90 + R() * 0.28;
          const bus = ctx.createGain();
          bus.gain.value = 1 + 0.45 * (st.r || 0);
          sendSpace(ctx, bus, out, X, 0.88, 0.45, 0.18);

          const buf = makeBuf(ctx, dur, 0.62, (d, n) => {
            let s1 = 0, s2 = 0;
            const pulses = 4 + Math.floor(R() * 2);
            const centers = [];
            for (let p = 0; p < pulses; p++) {
              centers.push({
                pos: 0.14 + (p / pulses) * 0.70 + (R() - 0.5) * 0.07,
                w: 0.065 + R() * 0.045,
                a: 0.55 + R() * 0.45,
                c: 0.11 + R() * 0.08,
              });
            }
            for (let i = 0; i < n; i++) {
              const x = i / n;
              const w = R() * 2 - 1;
              let env = 0;
              let rateC = 0.13;
              for (let p = 0; p < centers.length; p++) {
                const cp = centers[p];
                const dist = (x - cp.pos) / cp.w;
                if (Math.abs(dist) < 2.5) {
                  env += Math.exp(-dist * dist * 1.6) * cp.a;
                  rateC = cp.c;
                }
              }
              s1 += rateC * (w - s1);
              s2 += 0.035 * (s1 - s2);
              d[i] = (s1 - s2) * env;
            }
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 520 + R() * 200;
          bp.Q.value = 1.25;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 1750;
          src.connect(bp);
          bp.connect(lp);
          lp.connect(bus);
          src.start(t0);
          src.stop(t0 + dur);
        },
      },

      // 3. Grincement sourd du ponton de cèdre ou d'une barque amarrée à gauche (micro-grains sur filtres boisés)
      boisPonton: {
        rate: (st) => 2.0 + (st.wind || 0.15) * 3.4 + (st.storm || 0) * 2.2,
        gap: 12,
        gain: 0.58,
        pan: [-0.72, -0.32],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const dur = 0.44 + R() * 0.20;
          const bus = ctx.createGain();
          bus.gain.value = 1 + 0.50 * (st.r || 0) + 0.70 * (st.storm || 0);
          sendSpace(ctx, bus, out, X, 0.88, 0.40, 0.14);

          const buf = makeBuf(ctx, dur, 0.66, (d, n, sr) => {
            let lp = 0, hp = 0;
            const grains = 7 + Math.floor(R() * 5);
            const gTimes = [];
            let cur = 0.04;
            for (let g = 0; g < grains; g++) {
              gTimes.push({
                t: cur,
                dec: 0.006 + R() * 0.005,
                amp: (0.55 + R() * 0.45) * Math.sin(((g + 0.5) / grains) * Math.PI),
              });
              cur += (0.025 + R() * 0.032) * (0.85 + 0.4 * (g / grains));
              if (cur > dur - 0.03) break;
            }
            for (let i = 0; i < n; i++) {
              const t = i / sr;
              const w = R() * 2 - 1;
              lp += 0.16 * (w - lp);
              hp += 0.035 * (lp - hp);
              const woodNoise = lp - hp;
              let env = 0;
              for (let g = 0; g < gTimes.length; g++) {
                const gt = gTimes[g];
                const dt = t - gt.t;
                if (dt >= 0 && dt < gt.dec * 6) {
                  env += gt.amp * (dt / gt.dec) * Math.exp(1 - dt / gt.dec);
                }
              }
              d[i] = woodNoise * env;
            }
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const f1 = 290 + R() * 90;
          const bp1 = ctx.createBiquadFilter();
          bp1.type = 'bandpass';
          bp1.frequency.setValueAtTime(f1, t0);
          bp1.frequency.linearRampToValueAtTime(f1 * (0.88 + R() * 0.18), t0 + dur);
          bp1.Q.value = 2.6;

          const pk = ctx.createBiquadFilter();
          pk.type = 'peaking';
          pk.frequency.value = f1 * 2.25;
          pk.Q.value = 2.2;
          pk.gain.value = 5.0;

          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 1250;

          src.connect(bp1);
          bp1.connect(pk);
          pk.connect(lp);
          lp.connect(bus);
          src.start(t0);
          src.stop(t0 + dur);
        },
      },

      // 4. Frémissement soyeux des branches de cerisier (sakura) dans la brise
      briseSakura: {
        when: (st) => (st.r || 0) < 0.75,
        rate: (st) => 2.8 + (st.wind || 0.15) * 4.0,
        gap: 10,
        gain: 0.54,
        pan: [-0.80, 0.80],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const dur = 1.05 + R() * 0.28;
          const bus = ctx.createGain();
          bus.gain.value = 1 + 0.40 * (st.r || 0);
          sendSpace(ctx, bus, out, X, 0.88, 0.38, 0.20);

          const buf = makeBuf(ctx, dur, 0.58, (d, n, sr) => {
            let lp = 0, hp = 0, flutter = 0;
            const flFreq = 11 + R() * 6;
            for (let i = 0; i < n; i++) {
              const x = i / n;
              const env = Math.pow(Math.sin(Math.PI * x), 1.5);
              const w = R() * 2 - 1;
              flutter += 0.008 * ((R() * 2 - 1) - flutter);
              const mod = 0.72 + 0.28 * Math.sin((TAU * flFreq * i) / sr + flutter * 8);
              lp += (0.16 + 0.08 * env) * (w - lp);
              hp += 0.032 * (lp - hp);
              d[i] = (lp - hp) * env * mod;
            }
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(760 + R() * 280, t0);
          bp.frequency.linearRampToValueAtTime(1120 + R() * 320, t0 + dur * 0.5);
          bp.frequency.linearRampToValueAtTime(680 + R() * 200, t0 + dur);
          bp.Q.value = 1.15;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 2350;
          src.connect(bp);
          bp.connect(lp);
          lp.connect(bus);
          src.start(t0);
          src.stop(t0 + dur);
        },
      },

      // 5. Anneau de poisson / petit clapot liquide isolé au milieu du lac calme
      anneauPoisson: {
        when: (st) => (st.r || 0) < 0.35 && (st.wind || 0.15) < 0.5 && (st.s || 0) < 0.4,
        rate: (st) => (st.e < 0.25 ? 2.8 : 2.1),
        gap: 13,
        gain: 0.62,
        pan: [-0.45, 0.45],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const bus = ctx.createGain();
          sendSpace(ctx, bus, out, X, 0.86, 0.54, 0.30);

          const dur1 = 0.18;
          const buf1 = makeBuf(ctx, dur1, 0.68, (d, n) => {
            let lp = 0, hp = 0;
            for (let i = 0; i < n; i++) {
              const x = i / n;
              const w = R() * 2 - 1;
              lp += 0.22 * (w - lp);
              hp += 0.04 * (lp - hp);
              const env = (x < 0.12 ? x / 0.12 : 1) * Math.exp(-4.6 * x);
              d[i] = (lp - hp) * env;
            }
          });
          const s1 = ctx.createBufferSource();
          s1.buffer = buf1;
          const bp1 = ctx.createBiquadFilter();
          bp1.type = 'bandpass';
          const fStart = 420 + R() * 140;
          bp1.frequency.setValueAtTime(fStart, t0);
          bp1.frequency.exponentialRampToValueAtTime(fStart * 1.95, t0 + 0.070);
          bp1.Q.value = 2.8;
          const lp1 = ctx.createBiquadFilter();
          lp1.type = 'lowpass';
          lp1.frequency.value = 1800;
          s1.connect(bp1);
          bp1.connect(lp1);
          lp1.connect(bus);
          s1.start(t0);
          s1.stop(t0 + dur1);

          const t2 = t0 + 0.10 + R() * 0.05;
          const dur2 = 0.26;
          const buf2 = makeBuf(ctx, dur2, 0.54, (d, n) => {
            let lp = 0, hp = 0;
            for (let i = 0; i < n; i++) {
              const x = i / n;
              const w = R() * 2 - 1;
              lp += 0.16 * (w - lp);
              hp += 0.03 * (lp - hp);
              const env = Math.sin(Math.PI * x) * Math.exp(-2.5 * x);
              d[i] = (lp - hp) * env;
            }
          });
          const s2 = ctx.createBufferSource();
          s2.buffer = buf2;
          const bp2 = ctx.createBiquadFilter();
          bp2.type = 'bandpass';
          bp2.frequency.setValueAtTime(360 + R() * 110, t2);
          bp2.frequency.exponentialRampToValueAtTime(640 + R() * 140, t2 + dur2 * 0.8);
          bp2.Q.value = 1.9;
          s2.connect(bp2);
          bp2.connect(bus);
          s2.start(t2);
          s2.stop(t2 + dur2);
        },
      },

      // 6. Grues (tsuru) passant au loin au-dessus du lac : battements d'ailes lents et souffle formant lointain
      grueLointaine: {
        when: (st) => st.e > -0.15 && (st.r || 0) < 0.25 && (st.storm || 0) === 0,
        rate: (st) => (st.e < 0.35 ? 1.8 : 1.1),
        gap: 22,
        gain: 0.56,
        pan: [-0.45, 0.45],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const dur = 1.25;
          const bus = ctx.createGain();
          sendSpace(ctx, bus, out, X, 0.72, 0.44, 0.76);

          const buf = makeBuf(ctx, dur, 0.62, (d, n, sr) => {
            let lpW = 0, hpW = 0, lpC = 0, hpC = 0;
            const strokes = 3 + Math.floor(R() * 2);
            for (let i = 0; i < n; i++) {
              const t = i / sr;
              const x = i / n;
              const w = R() * 2 - 1;

              let wingEnv = 0;
              for (let s = 0; s < strokes; s++) {
                const stC = 0.14 + s * 0.31;
                const dist = (t - stC) / 0.095;
                if (Math.abs(dist) < 2.6) {
                  wingEnv += Math.exp(-dist * dist * 1.8) * (1 - 0.12 * s);
                }
              }
              lpW += (0.09 + 0.08 * wingEnv) * (w - lpW);
              hpW += 0.022 * (lpW - hpW);
              const wing = (lpW - hpW) * wingEnv * 0.68;

              let callEnv = 0;
              if (t > 0.18 && t < 0.74) {
                const cx = (t - 0.18) / 0.56;
                callEnv = Math.sin(Math.PI * cx) * Math.exp(-1.5 * cx);
              }
              const flutter = 0.55 + 0.45 * Math.sin(TAU * 33 * t);
              lpC += 0.24 * (w - lpC);
              hpC += 0.08 * (lpC - hpC);
              const call = (lpC - hpC) * callEnv * flutter * 0.56;

              const globalArch = Math.sin(Math.PI * x);
              d[i] = (wing + call) * globalArch;
            }
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(640 + R() * 90, t0);
          bp.frequency.linearRampToValueAtTime(790 + R() * 90, t0 + 0.45);
          bp.frequency.linearRampToValueAtTime(580 + R() * 70, t0 + dur);
          bp.Q.value = 2.0;

          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 1450;

          src.connect(bp);
          bp.connect(lp);
          lp.connect(bus);
          src.start(t0);
          src.stop(t0 + dur);
        },
      },

      // 7. Oiseau dans les pins au matin (courtes notes soufflées filtrées + frémissement d'aiguilles)
      oiseauMatin: {
        when: (st) => st.e > -0.05 && (st.r || 0) < 0.25 && (st.s || 0) < 0.35,
        rate: (st) => (st.h >= 5 && st.h <= 10 ? 3.5 : 1.9),
        gap: 11,
        gain: 0.54,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const bus = ctx.createGain();
          sendSpace(ctx, bus, out, X, 0.74, 0.46, 0.66);

          const notes = 3 + Math.floor(R() * 2);
          let offset = 0.02;
          const fBase = 1480 + R() * 320;
          for (let i = 0; i < notes; i++) {
            const nDur = 0.095 + R() * 0.045;
            const buf = makeBuf(ctx, nDur, 0.62, (d, n) => {
              let lp = 0, hp = 0;
              for (let k = 0; k < n; k++) {
                const x = k / n;
                const w = R() * 2 - 1;
                lp += 0.34 * (w - lp);
                hp += 0.09 * (lp - hp);
                const env = Math.sin(Math.PI * x) * Math.exp(-2.8 * x);
                d[k] = (lp - hp) * env;
              }
            });
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            const fStart = fBase * (0.92 + i * 0.07 + (R() - 0.5) * 0.08);
            const fEnd = fStart * (i === notes - 1 ? 0.88 : 1.14);
            bp.frequency.setValueAtTime(fStart, t0 + offset);
            bp.frequency.exponentialRampToValueAtTime(fEnd, t0 + offset + nDur * 0.85);
            bp.Q.value = 3.8;

            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 2250;

            const g = ctx.createGain();
            g.gain.value = 0.80 + 0.25 * Math.sin(((i + 0.5) / notes) * Math.PI);

            src.connect(bp);
            bp.connect(lp);
            lp.connect(g);
            g.connect(bus);
            src.start(t0 + offset);
            src.stop(t0 + offset + nDur);
            offset += nDur + 0.055 + R() * 0.065;
          }
        },
      },

      // 8. Grenouilles des berges au crépuscule et la nuit (grains de bruit filtrés par passe-bande boisé, zéro sinus)
      grenouilleSoir: {
        when: (st) => st.e < 0.08 && (st.r || 0) < 0.55 && (st.s || 0) === 0,
        rate: (st) => (st.e > -0.25 ? 3.2 : 2.2),
        gap: 11,
        gain: 0.56,
        pan: [-0.65, 0.65],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const croaks = 2 + Math.floor(R() * 2);
          const dur = 0.82;
          const bus = ctx.createGain();
          sendSpace(ctx, bus, out, X, 0.84, 0.50, 0.38);

          const buf = makeBuf(ctx, dur, 0.64, (d, n, sr) => {
            let lp = 0, hp = 0;
            const pulseRate = 36 + R() * 10;
            let phPulse = 0;
            for (let i = 0; i < n; i++) {
              const t = i / sr;
              let env = 0;
              let rateMod = 1.0;
              for (let c = 0; c < croaks; c++) {
                const cStart = 0.04 + c * 0.24;
                const cDur = 0.14;
                if (t >= cStart && t <= cStart + cDur) {
                  const x = (t - cStart) / cDur;
                  env = Math.sin(Math.PI * x) * Math.exp(-1.5 * x) * (0.82 + 0.1 * c);
                  rateMod = 0.92 + 0.16 * x;
                }
              }
              phPulse += (TAU * pulseRate * rateMod) / sr;
              const grain = Math.pow(Math.max(0, Math.sin(phPulse)), 3);
              const w = R() * 2 - 1;
              lp += 0.22 * (w - lp);
              hp += 0.05 * (lp - hp);
              d[i] = (lp - hp) * grain * env;
            }
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const f1 = 520 + R() * 95;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(f1, t0);
          bp.frequency.linearRampToValueAtTime(f1 * 1.15, t0 + dur * 0.7);
          bp.Q.value = 2.7;

          const pk = ctx.createBiquadFilter();
          pk.type = 'peaking';
          pk.frequency.value = f1 * 2.15;
          pk.Q.value = 2.4;
          pk.gain.value = 5.5;

          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 1580;

          src.connect(bp);
          bp.connect(pk);
          pk.connect(lp);
          lp.connect(bus);
          src.start(t0);
          src.stop(t0 + dur);
        },
      },

      // 9. Stridulation feutrée d'insectes dans les herbes de la rive (bruit rose filtré, sans sinus aigu)
      insectesRive: {
        when: (st) => st.e < 0.05 && (st.r || 0) < 0.3 && (st.s || 0) === 0,
        rate: (st) => (st.e > -0.25 ? 3.4 : 2.8),
        gap: 10,
        gain: 0.50,
        pan: [-0.70, 0.70],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const dur = 0.85 + R() * 0.25;
          const bus = ctx.createGain();
          sendSpace(ctx, bus, out, X, 0.84, 0.46, 0.26);

          const buf = makeBuf(ctx, dur, 0.58, (d, n, sr) => {
            let lp = 0, hp = 0;
            const pulseHz = 30 + R() * 8;
            for (let i = 0; i < n; i++) {
              const t = i / sr;
              const x = i / n;
              const stroke = Math.sin(Math.PI * x) * (0.55 + 0.45 * Math.max(0, Math.sin(TAU * 2.2 * x)));
              const pulse = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(TAU * pulseHz * t), 2);
              const w = R() * 2 - 1;
              lp += 0.42 * (w - lp);
              hp += 0.14 * (lp - hp);
              d[i] = (lp - hp) * stroke * pulse;
            }
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 2480 + R() * 380;
          bp.Q.value = 3.2;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 3100;
          src.connect(bp);
          bp.connect(lp);
          lp.connect(bus);
          src.start(t0);
          src.stop(t0 + dur);
        },
      },

      // 10. Chouette de l'Oural (fukurō) lointaine et feutrée dans les collines de cèdres la nuit
      chouetteLointaine: {
        when: (st) => st.e < -0.25 && (st.r || 0) < 0.3 && (st.storm || 0) === 0,
        rate: () => 2.0,
        gap: 19,
        gain: 0.56,
        pan: [-0.70, 0.70],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const dur = 1.25;
          const bus = ctx.createGain();
          sendSpace(ctx, bus, out, X, 0.70, 0.42, 0.80);

          const buf = makeBuf(ctx, dur, 0.66, (d, n, sr) => {
            let lp = 0, hp = 0;
            for (let i = 0; i < n; i++) {
              const t = i / sr;
              const w = R() * 2 - 1;
              lp += 0.08 * (w - lp);
              hp += 0.018 * (lp - hp);
              let env = 0;
              if (t < 0.40) {
                const x = t / 0.40;
                env = Math.pow(Math.sin(Math.PI * x), 1.6) * 0.88;
              } else if (t > 0.56 && t < 1.15) {
                const x = (t - 0.56) / 0.59;
                env = Math.pow(Math.sin(Math.PI * x), 1.5) * Math.exp(-1.1 * x) * 0.80;
              }
              d[i] = (lp - hp) * env;
            }
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const f0 = 335 + R() * 30;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(f0, t0);
          bp.frequency.linearRampToValueAtTime(f0 * 0.93, t0 + 0.40);
          bp.frequency.setValueAtTime(f0 * 1.02, t0 + 0.56);
          bp.frequency.linearRampToValueAtTime(f0 * 0.89, t0 + 1.15);
          bp.Q.value = 4.6;

          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 660;

          src.connect(bp);
          bp.connect(lp);
          lp.connect(bus);
          src.start(t0);
          src.stop(t0 + dur);
        },
      },

      // 11. Gouttes tombant des fleurs de cerisier mouillées sur la surface du lac (pluie & orage)
      gouttesSakura: {
        when: (st) => (st.r || 0) > 0.15,
        rate: (st) => 3.8 + (st.r || 0) * 4.5 + (st.storm || 0) * 2.5,
        gap: 6.5,
        gain: 0.72,
        pan: [-0.80, 0.80],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const dur = 1.02;
          const bus = ctx.createGain();
          bus.gain.value = 1 + 0.55 * (st.r || 0) + 0.75 * (st.storm || 0);
          sendSpace(ctx, bus, out, X, 0.92, 0.52, 0.24);

          const drops = 5 + Math.floor(R() * 4);
          const list = [];
          for (let k = 0; k < drops; k++) {
            list.push({
              t: 0.03 + (k / drops) * 0.82 + (R() - 0.5) * 0.06,
              c: 0.14 + R() * 0.14,
              a: 0.58 + R() * 0.42,
            });
          }

          const buf = makeBuf(ctx, dur, 0.70, (d, n, sr) => {
            let lp = 0, hp = 0;
            for (let i = 0; i < n; i++) {
              const t = i / sr;
              const w = R() * 2 - 1;
              let sum = 0;
              for (let k = 0; k < list.length; k++) {
                const dr = list[k];
                const dt = t - dr.t;
                if (dt >= 0 && dt < 0.052) {
                  const x = dt / 0.052;
                  lp += (dr.c * (1 + 0.6 * x)) * (w - lp);
                  hp += 0.045 * (lp - hp);
                  const env = Math.sin(Math.PI * x) * Math.exp(-3.2 * x);
                  sum += (lp - hp) * env * dr.a;
                }
              }
              d[i] = sum;
            }
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 820 + R() * 320;
          bp.Q.value = 1.4;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 2400;
          src.connect(bp);
          bp.connect(lp);
          lp.connect(bus);
          src.start(t0);
          src.stop(t0 + dur);
        },
      },

      // 12. Neige poudreuse glissant doucement d'une branche de pin ou de cerisier (scénario neige)
      neigeBranche: {
        when: (st) => (st.s || 0) > 0.15,
        rate: (st) => 3.8 + (st.s || 0) * 3.4,
        gap: 8,
        gain: 0.54,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const dur = 0.85 + R() * 0.25;
          const bus = ctx.createGain();
          sendSpace(ctx, bus, out, X, 0.88, 0.46, 0.24);

          const buf = makeBuf(ctx, dur, 0.60, (d, n) => {
            let lp = 0, sub = 0;
            for (let i = 0; i < n; i++) {
              const x = i / n;
              const w = R() * 2 - 1;
              const slideEnv = Math.pow(Math.sin(Math.PI * x), 1.5);
              const thudEnv = Math.exp(-Math.pow((x - 0.62) / 0.11, 2)) * 0.62;
              lp += (0.09 + 0.08 * slideEnv) * (w - lp);
              sub += 0.022 * (lp - sub);
              d[i] = (lp - sub) * slideEnv * 0.74 + sub * thudEnv * 0.90;
            }
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 1200;
          src.connect(lp);
          lp.connect(bus);
          src.start(t0);
          src.stop(t0 + dur);
        },
      },
    },

    sfx: {
      // Cloche de temple bouddhiste (bonshō) résonnant au loin par-delà le lac à 6 h et 18 h
      bell(ctx, out, R, st, X) {
        const t0 = ctx.currentTime;
        const f0 = 93 + R() * 5; // Bourdon grave autour de Sol2/Fa#2 (~95 Hz)

        const distLP = ctx.createBiquadFilter();
        distLP.type = 'lowpass';
        distLP.frequency.setValueAtTime(1180, t0);
        distLP.frequency.exponentialRampToValueAtTime(420, t0 + 4.8);

        sendSpace(ctx, distLP, out, X, 0.85, 0.48, 0.95);

        // 1. Impact sourd du billot de bois suspendu (shumoku) contre le bronze épais
        const thudBuf = makeBuf(ctx, 0.26, 0.54, (d, n) => {
          let lp = 0, bp = 0;
          for (let i = 0; i < n; i++) {
            const x = i / n;
            const env = Math.sin(Math.min(1, x / 0.08) * (Math.PI * 0.5)) * Math.exp(-8 * x);
            const w = R() * 2 - 1;
            lp += 0.10 * (w - lp);
            bp += 0.028 * (lp - bp);
            d[i] = (lp * 0.62 + (lp - bp) * 0.38) * env;
          }
        });
        const thud = ctx.createBufferSource();
        thud.buffer = thudBuf;
        thud.connect(distLP);
        thud.start(t0);
        thud.stop(t0 + 0.26);

        // 2. Modes propres inharmoniques du bonshō avec doublets de battement lent (unari)
        const partials = [
          [1.0000, 0.300, 5.2, 0.028],
          [1.0044, 0.235, 5.0, 0.032],
          [2.0080, 0.195, 3.6, 0.020],
          [2.0155, 0.142, 3.3, 0.024],
          [2.9720, 0.098, 2.2, 0.016],
          [4.1350, 0.058, 1.35, 0.014],
          [5.4100, 0.030, 0.85, 0.012],
          [6.8400, 0.016, 0.45, 0.010],
        ];

        for (let i = 0; i < partials.length; i++) {
          const [ratio, amp, dec, att] = partials[i];
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          const freq = f0 * ratio * (1 + (R() - 0.5) * 0.0015);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq * 1.003, t0);
          osc.frequency.exponentialRampToValueAtTime(freq, t0 + 0.09);

          g.gain.setValueAtTime(0.0001, t0);
          g.gain.linearRampToValueAtTime(amp, t0 + att);
          g.gain.setTargetAtTime(0.00001, t0 + att, dec);

          osc.connect(g);
          g.connect(distLP);
          osc.start(t0);
          const stopT = t0 + att + dec * 6.5;
          osc.stop(stopT);
          osc.onended = () => {
            osc.disconnect();
            g.disconnect();
          };
        }
      },

      // Allumage doux d'une lanterne de papier (chōchin) ou de pierre (tōrō)
      match(ctx, out, R, st, X) {
        const t0 = ctx.currentTime;
        const dur = 0.50;
        const bus = ctx.createGain();
        sendSpace(ctx, bus, out, X, 0.90, 0.36, 0.12);

        const buf = makeBuf(ctx, dur, 0.68, (d, n, sr) => {
          let lp = 0, hp = 0;
          const strikeEnd = 0.075;
          for (let i = 0; i < n; i++) {
            const t = i / sr;
            const w = R() * 2 - 1;
            let sample = 0;
            if (t < strikeEnd) {
              const x = t / strikeEnd;
              const grain = 0.4 + 0.6 * Math.abs(Math.sin(Math.PI * 52 * t));
              lp += 0.32 * (w - lp);
              hp += 0.08 * (lp - hp);
              sample = (lp - hp) * grain * Math.sin(Math.PI * x) * 0.62;
            } else {
              const x = (t - strikeEnd) / (dur - strikeEnd);
              const env = Math.sin(Math.min(1, x / 0.14) * (Math.PI * 0.5)) * Math.exp(-3.8 * x);
              lp += (0.14 - 0.07 * x) * (w - lp);
              hp += 0.025 * (lp - hp);
              sample = (lp - hp) * env * 0.50;
            }
            d[i] = sample;
          }
          for (let c = 0; c < 3; c++) {
            const ct = Math.floor(sr * (0.11 + c * 0.09 + R() * 0.05));
            const clen = Math.floor(sr * 0.0025);
            const camp = 0.10 + R() * 0.06;
            for (let k = 0; k < clen && ct + k < n; k++) {
              d[ct + k] += (R() * 2 - 1) * camp * (1 - k / clen);
            }
          }
        });

        const src = ctx.createBufferSource();
        src.buffer = buf;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2450;
        src.connect(lp);
        lp.connect(bus);
        src.start(t0);
        src.stop(t0 + dur);
      },

      // Souffle feutré éteignant une lanterne
      puff(ctx, out, R, st, X) {
        const t0 = ctx.currentTime;
        const dur = 0.36;
        const bus = ctx.createGain();
        sendSpace(ctx, bus, out, X, 0.90, 0.32, 0.12);

        const buf = makeBuf(ctx, dur, 0.62, (d, n) => {
          let lp = 0, hp = 0;
          for (let i = 0; i < n; i++) {
            const x = i / n;
            const env = Math.sin(Math.min(1, x / 0.16) * (Math.PI * 0.5)) * Math.exp(-4.0 * x);
            const w = R() * 2 - 1;
            const cut = 0.16 * (1 - 0.58 * x);
            lp += cut * (w - lp);
            hp += 0.024 * (lp - hp);
            d[i] = (lp - hp) * env;
          }
        });

        const src = ctx.createBufferSource();
        src.buffer = buf;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1020, t0);
        lp.frequency.exponentialRampToValueAtTime(380, t0 + dur);
        src.connect(lp);
        lp.connect(bus);
        src.start(t0);
        src.stop(t0 + dur);
      },
    },
  };
})();
