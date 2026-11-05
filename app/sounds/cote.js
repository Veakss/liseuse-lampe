// Liseuse à la lampe — Sound pack for scene 'cote' (Côte sauvage)
(function () {
  const TAU = Math.PI * 2;
  const getK = () => window.SOUND_KIT;

  // Compute bed filter and gain targets smoothly from scene state st
  function bedTargets(st) {
    const e = st.e ?? 0.5;
    const r = st.r ?? 0;
    const s = st.s ?? 0;
    const storm = st.storm ?? 0;
    const wind = st.wind ?? 0.15;

    // Night calm factor: deep night (e < -0.3) is calmer and darker
    const dayness = Math.max(0, Math.min(1, (e + 0.35) / 0.85));
    const snowMuffle = 1 - 0.18 * s;

    // Layer 1: Primary Atlantic swell & foam wash
    const surfGain = (0.285 + 0.085 * dayness + 0.08 * wind + 0.04 * r + 0.095 * storm) * snowMuffle;
    const surfFreq = 1380 + 880 * dayness + 650 * wind + 520 * storm - 380 * s;

    // Layer 2: Cross-swell & rocky headland boom
    const crossGain = (0.215 + 0.06 * dayness + 0.06 * wind + 0.03 * r + 0.085 * storm) * snowMuffle;
    const crossFreq = 980 + 560 * dayness + 450 * wind + 450 * storm - 260 * s;

    // Layer 3: Coastal breeze & marram grass (oyats) whisper
    const windGain = 0.080 + 0.038 * dayness + 0.20 * Math.pow(wind, 1.15) + 0.085 * storm + 0.055 * s;
    const windFreq = 940 + 1380 * wind + 650 * storm - 200 * s;

    // Layer 4: Rain on cove, wet sand, rocks & storm spray
    const rainGain = 0.265 * Math.pow(r, 0.85) + 0.145 * storm + 0.045 * s;
    const rainFreq = 2150 + 850 * r + 750 * storm - 650 * s;

    return { surfGain, surfFreq, crossGain, crossFreq, windGain, windFreq, rainGain, rainFreq };
  }

  // Weather boost so details remain gently audible (+1.5..+5 dB salience) over rain, snow, or storm beds
  function weatherBoost(st) {
    return 1 + 0.58 * (st.r || 0) + 1.05 * (st.storm || 0) + 0.38 * (st.s || 0);
  }

  // Helper: route a node to both dry `out` (already scaled by event gain) and wet `X.verb` proportionally
  function sendWet(ctx, srcNode, out, X, wetRatio) {
    srcNode.connect(out);
    if (X && X.verb && wetRatio > 0) {
      const g = ctx.createGain();
      g.gain.value = (out.gain ? out.gain.value : 0.35) * wetRatio;
      srcNode.connect(g);
      g.connect(X.verb);
      return g;
    }
    return null;
  }

  window.SCENE_SOUNDS = window.SCENE_SOUNDS || {};

  window.SCENE_SOUNDS.cote = {
    bed(ctx, out, K, st) {
      const R = K.rng(741923);

      // 1. Primary Atlantic swell & shore wash (22.7 s stereo loop)
      // Distinct rolling swells with a low booming crest and a long foaming draw-back
      const surfBuf = K.loopBuffer(ctx, 'cote:surfSlow:v3', 22.7, (n, sr, ch) => {
        const d = new Float32Array(n);
        const roar = new Float32Array(n);
        const wash = new Float32Array(n);
        K.brownInto(roar, 1.2, 0.015, R);
        K.pinkInto(roar, 0.26, R);
        let lp = 0;
        for (let i = 0; i < n; i++) {
          const w = R() * 2 - 1;
          lp = 0.86 * lp + 0.14 * w;
          wash[i] = (w - lp) * 0.62 + lp * 0.38;
        }
        // 3 swells across the 22.7s loop, offset between L (cliffs) and R (lighthouse rocks)
        const offsets = ch === 0 ? [0.9, 8.3, 15.5] : [3.9, 11.4, 18.2];
        const spans = ch === 0 ? [6.5, 7.1, 6.4] : [6.8, 6.2, 4.3];
        const amps = ch === 0 ? [0.95, 1.12, 0.84] : [1.04, 0.86, 0.98];

        for (let wIdx = 0; wIdx < 3; wIdx++) {
          const s0 = Math.floor(offsets[wIdx] * sr);
          const len = Math.floor(spans[wIdx] * sr);
          const amp = amps[wIdx];
          for (let k = 0; k < len && s0 + k < n; k++) {
            const x = k / len;
            const env = x < 0.30
              ? Math.sin((x / 0.30) * (Math.PI / 2)) ** 1.8
              : Math.cos(((x - 0.30) / 0.70) * (Math.PI / 2)) ** 1.45;
            const foamEnv = x > 0.20
              ? Math.sin(Math.min(1, (x - 0.20) / 0.80) * Math.PI) ** 1.35
              : 0;
            const idx = s0 + k;
            d[idx] += roar[idx] * env * 1.45 * amp + wash[idx] * foamEnv * 0.58 * amp;
          }
        }
        for (let i = 0; i < n; i++) {
          const slow = 0.80 + 0.20 * Math.sin((i / sr) * (TAU / 11.35) + ch * 1.2);
          d[i] += roar[i] * 0.25 * slow + wash[i] * 0.05;
        }
        return d;
      });

      // 2. Cross-swell & rocky headland undertow (16.9 s stereo loop, incommensurate with 22.7 s)
      const crossBuf = K.loopBuffer(ctx, 'cote:surfCross:v3', 16.9, (n, sr, ch) => {
        const d = new Float32Array(n);
        const deep = new Float32Array(n);
        const fizz = new Float32Array(n);
        K.brownInto(deep, 1.25, ch === 1 ? 0.012 : 0.017, R);
        K.pinkInto(fizz, 0.68, R);

        const offsets = ch === 0 ? [2.1, 10.0] : [0.6, 7.6, 12.9];
        const spans = ch === 0 ? [6.2, 5.9] : [5.4, 4.9, 3.6];
        for (let wIdx = 0; wIdx < offsets.length; wIdx++) {
          const s0 = Math.floor(offsets[wIdx] * sr);
          const len = Math.floor(spans[wIdx] * sr);
          const amp = 0.80 + 0.28 * R();
          for (let k = 0; k < len && s0 + k < n; k++) {
            const x = k / len;
            const swell = Math.sin(Math.PI * x) ** 1.65 * amp;
            const undertow = x > 0.35 ? Math.sin(Math.PI * ((x - 0.35) / 0.65)) ** 1.3 : 0;
            const idx = s0 + k;
            d[idx] += deep[idx] * swell * 1.30 + fizz[idx] * undertow * 0.42 * amp;
          }
        }
        for (let i = 0; i < n; i++) {
          d[i] += deep[i] * 0.23 + fizz[i] * 0.05;
        }
        return d;
      });

      // 3. Coastal wind & marram grass (oyats) whisper (18.3 s stereo loop)
      const windBuf = K.loopBuffer(ctx, 'cote:windGrass:v3', 18.3, (n, sr, ch) => {
        const d = new Float32Array(n);
        const air = new Float32Array(n);
        const grass = new Float32Array(n);
        K.brownInto(air, 1.1, 0.035, R);
        K.pinkInto(air, 0.35, R);
        let bp1 = 0, bp2 = 0;
        for (let i = 0; i < n; i++) {
          const w = R() * 2 - 1;
          bp1 = 0.82 * bp1 + 0.18 * w;
          bp2 = 0.94 * bp2 + 0.06 * bp1;
          grass[i] = bp1 - bp2;
        }
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const gust = 0.54
            + 0.28 * Math.sin(TAU * t / 9.15 + ch * 0.9)
            + 0.18 * Math.sin(TAU * t / 6.1 + ch * 2.1);
          const stem = 0.40 + 0.60 * Math.max(0, Math.sin(TAU * t / 4.57 + ch * 1.4)) ** 1.5;
          d[i] = air[i] * gust * 0.85 + grass[i] * gust * stem * (ch === 0 ? 0.40 : 0.32);
        }
        return d;
      });

      // 4. Rain on cove water, wet sand & storm sea-spray (15.6 s stereo loop)
      const rainBuf = K.loopBuffer(ctx, 'cote:rainSpray:v3', 15.6, (n, sr, ch) => {
        const d = new Float32Array(n);
        K.pinkInto(d, 0.95, R);
        K.brownInto(d, 0.45, 0.04, R);
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const sheet = 0.70 + 0.30 * Math.sin(TAU * t / 7.8 + ch * 1.2 + Math.sin(TAU * t / 3.9) * 0.6);
          d[i] *= sheet;
        }
        let idx = Math.floor(0.02 * sr);
        while (idx < n - 300) {
          idx += Math.floor(sr * (0.006 + R() * 0.022));
          const len = Math.floor(sr * (0.0025 + R() * 0.0035));
          const amp = 0.05 + R() * 0.10;
          let lp = 0;
          for (let k = 0; k < len && idx + k < n; k++) {
            const w = R() * 2 - 1;
            lp = 0.75 * lp + 0.25 * w;
            const env = Math.sin((k / len) * Math.PI);
            d[idx + k] += lp * amp * env;
          }
        }
        return d;
      });

      const t0 = bedTargets(st);

      const s1 = K.loop(ctx, surfBuf, 1, 0);
      const surfLP = K.filt(ctx, 'lowpass', t0.surfFreq, 0.55);
      const surfGain = K.gain(ctx, t0.surfGain);
      K.chain(s1, surfLP, surfGain, out);

      const s2 = K.loop(ctx, crossBuf, 1, 3.7);
      const crossLP = K.filt(ctx, 'lowpass', t0.crossFreq, 0.6);
      const crossGain = K.gain(ctx, t0.crossGain);
      K.chain(s2, crossLP, crossGain, out);

      const s3 = K.loop(ctx, windBuf, 1, 5.2);
      const windLP = K.filt(ctx, 'lowpass', t0.windFreq, 0.65);
      const windGain = K.gain(ctx, t0.windGain);
      K.chain(s3, windLP, windGain, out);

      const s4 = K.loop(ctx, rainBuf, 1, 1.9);
      const rainLP = K.filt(ctx, 'lowpass', t0.rainFreq, 0.55);
      const rainGain = K.gain(ctx, t0.rainGain);
      K.chain(s4, rainLP, rainGain, out);

      // Slow organic spectral drift LFO so static scenarios subtly breathe
      const driftLfo = ctx.createOscillator();
      const driftSurf = K.gain(ctx, 160);
      const driftWind = K.gain(ctx, 120);
      driftLfo.frequency.value = 0.037;
      K.chain(driftLfo, driftSurf, surfLP.frequency);
      K.chain(driftLfo, driftWind, windLP.frequency);
      driftLfo.start(ctx.currentTime);

      // Open coastal cove & cliff reverb send for distant details
      const verb = K.reverb(ctx, out, 2.4, 3.0, 0.62, 0.26);

      return {
        nodes: [s1, s2, s3, s4, driftLfo],
        verb,
        set(s2State) {
          const tgt = bedTargets(s2State);
          K.glide(ctx, surfGain.gain, tgt.surfGain, 1.6);
          K.glide(ctx, surfLP.frequency, tgt.surfFreq, 1.6);
          K.glide(ctx, crossGain.gain, tgt.crossGain, 1.6);
          K.glide(ctx, crossLP.frequency, tgt.crossFreq, 1.6);
          K.glide(ctx, windGain.gain, tgt.windGain, 1.6);
          K.glide(ctx, windLP.frequency, tgt.windFreq, 1.6);
          K.glide(ctx, rainGain.gain, tgt.rainGain, 1.6);
          K.glide(ctx, rainLP.frequency, tgt.rainFreq, 1.6);
        },
      };
    },

    details: {
      // 1. Deep Atlantic swell booming in a granite cleft under the lighthouse (right side)
      vagueRocher: {
        when: () => true,
        rate: (st) => {
          const base = st.e < -0.25 ? 1.8 : 2.6;
          return base + 2.0 * (st.wind || 0) + 2.4 * (st.storm || 0);
        },
        gap: 12,
        gain: 0.56,
        pan: [0.35, 0.85],
        play(ctx, out, R, st, X) {
          const K = getK();
          const t = ctx.currentTime;
          const dur = 2.5 + R() * 1.0;
          const wb = weatherBoost(st);
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n);
            K.brownInto(d, 1.08, 0.024, R);
            K.pinkInto(d, 0.48, R);
            for (let i = 0; i < n; i++) {
              const x = i / n;
              const env = x < 0.20
                ? Math.sin((x / 0.20) * (Math.PI / 2)) ** 1.4
                : Math.exp(-2.8 * (x - 0.20));
              d[i] *= env;
            }
            return d;
          });

          const s = ctx.createBufferSource();
          s.buffer = buf;
          const bp1 = K.filt(ctx, 'bandpass', 130 + R() * 45, 1.05);
          const lp = K.filt(ctx, 'lowpass', 680 + 280 * (st.wind || 0), 0.7);
          const g = K.gain(ctx, 0.96 * wb);
          K.chain(s, bp1, lp, g);
          sendWet(ctx, g, out, X, 0.38);
          s.start(t);
          s.stop(t + dur);

          // Secondary splash falling back over wet granite 0.25s later
          const t2 = t + 0.22 + R() * 0.14;
          const splashDur = 1.6 + R() * 0.6;
          const s2 = ctx.createBufferSource();
          s2.buffer = K.noiseBuf(ctx, splashDur, (sec) => {
            const x = sec / splashDur;
            return x < 0.14 ? Math.sin((x / 0.14) * (Math.PI / 2)) : Math.exp(-2.6 * (x - 0.14));
          });
          const bp2 = K.filt(ctx, 'bandpass', 620 + R() * 240, 0.85);
          const lp2 = K.filt(ctx, 'lowpass', 1750, 0.7);
          const g2 = K.gain(ctx, 0.38 * wb);
          bp2.frequency.setValueAtTime(820, t2);
          bp2.frequency.exponentialRampToValueAtTime(360, t2 + splashDur);
          K.chain(s2, bp2, lp2, g2);
          sendWet(ctx, g2, out, X, 0.32);
          s2.start(t2);
          s2.stop(t2 + splashDur);
        },
      },

      // 2. Pebbles and shells rolling back in the undertow (galets)
      galets: {
        when: (st) => (st.s || 0) < 0.85,
        rate: (st) => {
          const snowDamp = 1 - 0.45 * (st.s || 0);
          const nightDamp = st.e < -0.25 ? 0.72 : 1;
          return (2.8 + 1.8 * (st.wind || 0) + 1.2 * (st.storm || 0)) * snowDamp * nightDamp;
        },
        gap: 11,
        gain: 0.50,
        pan: [-0.45, 0.65],
        play(ctx, out, R, st, X) {
          const K = getK();
          const t0 = ctx.currentTime;
          const dur = 2.2 + R() * 1.0;
          const wb = weatherBoost(st);
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n);
            K.pinkInto(d, 0.40, R);
            for (let i = 0; i < n; i++) {
              const x = i / n;
              d[i] *= Math.sin(Math.PI * x) ** 1.5;
            }
            const count = 38 + Math.floor(R() * 20);
            for (let c = 0; c < count; c++) {
              const pos = 0.08 + 0.82 * R();
              const envScale = Math.sin(Math.PI * pos) ** 1.25;
              const sIdx = Math.floor(pos * n);
              const cLen = Math.floor(sr * (0.0028 + R() * 0.0045));
              const f1 = (1080 + R() * 1550) * TAU / sr;
              const f2 = f1 * (1.48 + R() * 0.38);
              const amp = (0.28 + R() * 0.32) * envScale;
              for (let k = 0; k < cLen && sIdx + k < n; k++) {
                const w = 0.45 + 0.55 * (R() * 2 - 1);
                const decay = Math.sin((k / cLen) * Math.PI) * Math.exp(-3.8 * (k / cLen));
                d[sIdx + k] += amp * decay * w * (Math.sin(f1 * k) * 0.55 + Math.sin(f2 * k) * 0.45);
              }
            }
            return d;
          });

          const s = ctx.createBufferSource();
          s.buffer = buf;
          const hp = K.filt(ctx, 'highpass', 420, 0.7);
          const bp = K.filt(ctx, 'bandpass', 1480 + R() * 350, 0.75);
          const lp = K.filt(ctx, 'lowpass', 2950 - 550 * (st.s || 0), 0.7);
          bp.frequency.setValueAtTime(1800, t0);
          bp.frequency.exponentialRampToValueAtTime(840, t0 + dur);
          const g = K.gain(ctx, 0.68 * wb);
          K.chain(s, hp, bp, lp, g);
          sendWet(ctx, g, out, X, 0.16);
          s.start(t0);
          s.stop(t0 + dur);
        },
      },

      // 3. Soft sheet of foam fizzing and dissolving on wet sand (écume)
      ecume: {
        when: (st) => (st.s || 0) < 0.6,
        rate: (st) => (st.e < -0.25 ? 2.0 : 3.0) + 1.2 * (st.wind || 0),
        gap: 10,
        gain: 0.42,
        pan: [-0.60, 0.60],
        play(ctx, out, R, st) {
          const K = getK();
          const t0 = ctx.currentTime;
          const dur = 2.4 + R() * 1.1;
          const wb = weatherBoost(st);
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n);
            K.pinkInto(d, 0.78, R);
            let lp = 0;
            for (let i = 0; i < n; i++) {
              const x = i / n;
              const env = x < 0.18
                ? Math.sin((x / 0.18) * (Math.PI / 2)) ** 1.3
                : Math.cos(((x - 0.18) / 0.82) * (Math.PI / 2)) ** 1.45;
              const flutter = 0.76 + 0.24 * Math.sin((i / sr) * 18 + R() * 0.4);
              lp = 0.72 * lp + 0.28 * d[i];
              d[i] = (d[i] - 0.45 * lp) * env * flutter;
            }
            return d;
          });
          const s = ctx.createBufferSource();
          s.buffer = buf;
          const bp = K.filt(ctx, 'bandpass', 1520 + R() * 450, 0.7);
          const lp = K.filt(ctx, 'lowpass', 3050, 0.7);
          bp.frequency.setValueAtTime(1880, t0);
          bp.frequency.exponentialRampToValueAtTime(980, t0 + dur);
          const g = K.gain(ctx, 0.56 * wb);
          K.run(ctx, out, t0, t0 + dur, s, bp, lp, g);
        },
      },

      // 4. Breeze brushing through the marram grass (oyats) on the foreground dunes
      oyats: {
        when: (st) => (st.wind || 0) >= 0.08,
        rate: (st) => 1.8 + 5.0 * (st.wind || 0) + 1.8 * (st.storm || 0),
        gap: 9,
        gain: 0.46,
        pan: [-0.85, 0.85],
        play(ctx, out, R, st) {
          const K = getK();
          const t0 = ctx.currentTime;
          const dur = 2.0 + R() * 1.1;
          const wb = weatherBoost(st);
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n);
            K.pinkInto(d, 0.86, R);
            for (let i = 0; i < n; i++) {
              const x = i / n;
              const t = i / sr;
              const env = Math.sin(Math.PI * x) ** 1.45;
              const blades = 0.62 + 0.38 * Math.sin(TAU * (5.5 + R() * 2) * t + Math.sin(TAU * 1.7 * t));
              d[i] *= env * blades;
            }
            return d;
          });
          const s = ctx.createBufferSource();
          s.buffer = buf;
          const fBase = 1420 + R() * 500;
          const bp = K.filt(ctx, 'bandpass', fBase, 1.3);
          const lp = K.filt(ctx, 'lowpass', 3250 - 550 * (st.s || 0), 0.7);
          bp.frequency.setValueAtTime(fBase * 0.82, t0);
          bp.frequency.linearRampToValueAtTime(fBase * 1.25, t0 + dur * 0.45);
          bp.frequency.exponentialRampToValueAtTime(fBase * 0.78, t0 + dur);
          const g = K.gain(ctx, 0.58 * wb);
          K.run(ctx, out, t0, t0 + dur, s, bp, lp, g);
        },
      },

      // 5. Chestnut wood sand-fence (ganivelles) rattling & creaking in a gust on the left dune
      ganivelles: {
        when: (st) => (st.wind || 0) >= 0.12,
        rate: (st) => 0.9 + 4.5 * Math.pow(st.wind || 0, 1.2) + 2.2 * (st.storm || 0),
        gap: 12,
        gain: 0.48,
        pan: [-0.85, -0.40],
        play(ctx, out, R, st, X) {
          const K = getK();
          const t0 = ctx.currentTime;
          const taps = 2 + Math.floor(R() * 3);
          const totalDur = 1.35;
          const wb = weatherBoost(st);
          const buf = K.buffer(ctx, null, totalDur, (n, sr) => {
            const d = new Float32Array(n);
            K.pinkInto(d, 0.22, R);
            for (let i = 0; i < n; i++) {
              d[i] *= Math.sin(Math.PI * (i / n)) ** 1.4;
            }
            let tTap = 0.08 + R() * 0.08;
            for (let i = 0; i < taps; i++) {
              const s0 = Math.floor(tTap * sr);
              const len = Math.floor(sr * (0.018 + R() * 0.015));
              const amp = (0.52 + R() * 0.24) / (1 + i * 0.22);
              const w1 = (320 + R() * 90) * TAU / sr;
              const w2 = w1 * (2.18 + R() * 0.22);
              const w3 = w1 * (3.85 + R() * 0.30);
              let lp = 0;
              for (let k = 0; k < len && s0 + k < n; k++) {
                const x = k / len;
                const att = Math.min(1, k / (sr * 0.0025));
                const dec1 = Math.exp(-7.5 * x);
                const dec2 = Math.exp(-12.0 * x);
                const wn = R() * 2 - 1;
                lp = 0.62 * lp + 0.38 * wn;
                const wood = (Math.sin(w1 * k) * 0.42 * dec1
                  + Math.sin(w2 * k) * 0.26 * dec2
                  + Math.sin(w3 * k) * 0.14 * dec2) * (0.55 + 0.45 * lp)
                  + lp * 0.44 * Math.exp(-9.5 * x);
                d[s0 + k] += amp * att * wood;
              }
              tTap += 0.14 + R() * 0.24;
            }
            return d;
          });
          const s = ctx.createBufferSource();
          s.buffer = buf;
          const hp = K.filt(ctx, 'highpass', 230, 0.7);
          const lp = K.filt(ctx, 'lowpass', 2300, 0.7);
          const g = K.gain(ctx, 0.68 * wb);
          K.chain(s, hp, lp, g);
          sendWet(ctx, g, out, X, 0.20);
          s.start(t0);
          s.stop(t0 + totalDur);
        },
      },

      // 6. Distant gull call high on the coastal wind (purely noise-excited resonant formant sweep — zero sine oscillator)
      goeland: {
        when: (st) => st.e > -0.02 && (st.storm || 0) < 0.45 && (st.r || 0) < 0.6,
        rate: (st) => {
          const snowFactor = 1 - 0.60 * (st.s || 0);
          const timeFactor = st.h < 10 ? 1.1 : st.e > 0.3 ? 0.95 : 0.55;
          return 1.6 * timeFactor * snowFactor;
        },
        gap: 20,
        gain: 0.38,
        pan: [-0.70, 0.60],
        play(ctx, out, R, st, X) {
          const K = getK();
          const t0 = ctx.currentTime;
          const wb = weatherBoost(st);
          const twoCalls = R() < 0.55;
          const calls = twoCalls
            ? [[0, 0.48 + R() * 0.16, 1.0], [0.64 + R() * 0.18, 0.34 + R() * 0.12, 0.68]]
            : [[0, 0.54 + R() * 0.18, 1.0]];

          for (const [offset, dur, scale] of calls) {
            const tc = t0 + offset;
            const buf = K.buffer(ctx, null, dur, (n, sr) => {
              const d = new Float32Array(n);
              K.pinkInto(d, 0.95, R);
              for (let i = 0; i < n; i++) {
                const x = i / n;
                const env = x < 0.22
                  ? Math.sin((x / 0.22) * (Math.PI / 2)) ** 1.5
                  : Math.cos(((x - 0.22) / 0.78) * (Math.PI / 2)) ** 1.65;
                // Subtle natural throat roughness (non-periodic)
                const throat = 0.72 + 0.28 * Math.sin(TAU * (24 + 5 * x) * (i / sr));
                d[i] *= env * throat;
              }
              return d;
            });

            const s = ctx.createBufferSource();
            s.buffer = buf;
            const fPeak = (1140 + R() * 180) * (offset > 0 ? 0.92 : 1.0);
            // Cascaded high-Q resonant bandpass filters shape the noise into an airy, distant gull cry
            const bp1 = K.filt(ctx, 'bandpass', fPeak * 0.85, 11);
            const bp2 = K.filt(ctx, 'bandpass', fPeak * 0.86, 9);
            const lp = K.filt(ctx, 'lowpass', 2100, 0.7);

            bp1.frequency.setValueAtTime(fPeak * 0.84, tc);
            bp1.frequency.linearRampToValueAtTime(fPeak, tc + dur * 0.26);
            bp1.frequency.exponentialRampToValueAtTime(fPeak * 0.66, tc + dur);

            bp2.frequency.setValueAtTime(fPeak * 0.85, tc);
            bp2.frequency.linearRampToValueAtTime(fPeak * 1.02, tc + dur * 0.26);
            bp2.frequency.exponentialRampToValueAtTime(fPeak * 0.67, tc + dur);

            const g = K.gain(ctx, 1.45 * scale * wb);
            K.chain(s, bp1, bp2, lp, g);
            sendWet(ctx, g, out, X, 0.78);
            s.start(tc);
            s.stop(tc + dur);
          }
        },
      },

      // 7. Distant shorebird / sandpiper breathy whistle carried on the breeze over wet sand (noise-excited formant)
      huitrier: {
        when: (st) => st.e > -0.10 && (st.r || 0) < 0.45 && (st.storm || 0) < 0.3,
        rate: (st) => {
          const snowFactor = 1 - 0.55 * (st.s || 0);
          const dawnDusk = st.e < 0.35 ? 1.15 : 0.75;
          return 1.35 * dawnDusk * snowFactor;
        },
        gap: 21,
        gain: 0.36,
        pan: [-0.65, 0.75],
        play(ctx, out, R, st, X) {
          const K = getK();
          const t0 = ctx.currentTime;
          const wb = weatherBoost(st);
          const twoNotes = R() < 0.65;
          const notes = twoNotes
            ? [[0, 0.22 + R() * 0.06, 1.0], [0.30 + R() * 0.09, 0.18 + R() * 0.05, 0.72]]
            : [[0, 0.25 + R() * 0.07, 1.0]];

          for (const [offset, dur, scale] of notes) {
            const tn = t0 + offset;
            const buf = K.buffer(ctx, null, dur, (n, sr) => {
              const d = new Float32Array(n);
              K.pinkInto(d, 0.95, R);
              for (let i = 0; i < n; i++) {
                const x = i / n;
                const env = Math.sin(Math.PI * x) ** 1.7;
                const flutter = 0.78 + 0.22 * Math.sin(TAU * 29 * (i / sr));
                d[i] *= env * flutter;
              }
              return d;
            });

            const s = ctx.createBufferSource();
            s.buffer = buf;
            const f0 = (1480 + R() * 220) * (offset > 0 ? 0.93 : 1.0);
            const bp1 = K.filt(ctx, 'bandpass', f0 * 0.88, 12);
            const bp2 = K.filt(ctx, 'bandpass', f0 * 0.89, 10);
            const lp = K.filt(ctx, 'lowpass', 2250, 0.7);

            bp1.frequency.setValueAtTime(f0 * 0.86, tn);
            bp1.frequency.linearRampToValueAtTime(f0 * 1.06, tn + dur * 0.38);
            bp1.frequency.exponentialRampToValueAtTime(f0 * 0.82, tn + dur);

            bp2.frequency.setValueAtTime(f0 * 0.87, tn);
            bp2.frequency.linearRampToValueAtTime(f0 * 1.07, tn + dur * 0.38);
            bp2.frequency.exponentialRampToValueAtTime(f0 * 0.83, tn + dur);

            const g = K.gain(ctx, 1.55 * scale * wb);
            K.chain(s, bp1, bp2, lp, g);
            sendWet(ctx, g, out, X, 0.75);
            s.start(tn);
            s.stop(tn + dur);
          }
        },
      },

      // 8. Very rare distant weathered iron-and-bronze sea-mark buoy clanking & ringing on the swell
      bouee: {
        when: () => true,
        rate: (st) => 0.42 + 0.35 * (st.wind || 0) + 0.35 * (st.storm || 0),
        gap: 52,
        gain: 0.38,
        pan: [-0.35, 0.45],
        play(ctx, out, R, st, X) {
          const K = getK();
          const t0 = ctx.currentTime;
          const f = 310 + R() * 35;
          const dur = 2.4;
          const wb = weatherBoost(st);

          // Damped, sea-worn iron/bronze buoy resonance heavily modulated by turbulent air/water noise
          // Short physical decay (0.14..0.30s) fed into the coastal reverb so it never sounds like an organ or electric piano
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n);
            const modes = [
              [1.00, 0.42, 0.28],
              [1.018, 0.32, 0.25],
              [1.34, 0.30, 0.19],
              [1.78, 0.22, 0.14],
              [2.39, 0.14, 0.09],
            ];
            let lp = 0;
            for (let k = 0; k < n; k++) {
              const sec = k / sr;
              const att = Math.min(1, sec / 0.003);
              const w = R() * 2 - 1;
              lp = 0.86 * lp + 0.14 * w;
              const mod = 0.42 + 0.58 * lp;
              let sample = 0;
              for (let p = 0; p < modes.length; p++) {
                const [mult, amp, tau] = modes[p];
                sample += Math.sin(TAU * f * mult * sec) * amp * Math.exp(-sec / tau);
              }
              // Weathered iron clapper & chain scrape transient
              const clank = (w - lp) * 0.45 * Math.exp(-sec / 0.018) + lp * 0.35 * Math.exp(-sec / 0.065);
              d[k] = (sample * mod + clank) * att * 0.52;
            }
            return d;
          });

          const s = ctx.createBufferSource();
          s.buffer = buf;
          const bp = K.filt(ctx, 'bandpass', 480, 0.85);
          const lp = K.filt(ctx, 'lowpass', 1450 - 250 * (st.r || 0), 0.7);
          const g = K.gain(ctx, 0.62 * wb);
          K.chain(s, bp, lp, g);
          sendWet(ctx, g, out, X, 0.85);
          s.start(t0);
          s.stop(t0 + dur);
        },
      },

      // 9. Dusk & night coastal dune insect stridulation hidden in the marram grass (filtered noise bursts, no sine beep)
      grillonDune: {
        when: (st) => st.e < 0.06 && (st.r || 0) < 0.2 && (st.s || 0) < 0.2 && (st.storm || 0) < 0.2,
        rate: (st) => (st.e < -0.2 ? 3.4 : 2.5),
        gap: 9,
        gain: 0.34,
        pan: [-0.80, 0.80],
        play(ctx, out, R, st, X) {
          const K = getK();
          const t0 = ctx.currentTime;
          const pulses = 2 + Math.floor(R() * 3);
          const dur = 0.85;
          const f = 2650 + R() * 350;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n);
            let pSec = 0.04;
            for (let p = 0; p < pulses; p++) {
              const pLen = Math.floor((0.036 + R() * 0.014) * sr);
              const s0 = Math.floor(pSec * sr);
              for (let k = 0; k < pLen && s0 + k < n; k++) {
                const x = k / pLen;
                const env = Math.sin(Math.PI * x) ** 1.6;
                const rasp = Math.sin(TAU * 68 * (k / sr)) * 0.5 + 0.5;
                d[s0 + k] += (R() * 2 - 1) * env * rasp * 0.65;
              }
              pSec += 0.058 + R() * 0.025;
            }
            return d;
          });
          const s = ctx.createBufferSource();
          s.buffer = buf;
          const bp1 = K.filt(ctx, 'bandpass', f, 10);
          const bp2 = K.filt(ctx, 'bandpass', f * 1.02, 8);
          const lp = K.filt(ctx, 'lowpass', 3300, 0.7);
          const g = K.gain(ctx, 0.95);
          K.chain(s, bp1, bp2, lp, g);
          sendWet(ctx, g, out, X, 0.25);
          s.start(t0);
          s.stop(t0 + dur);
        },
      },

      // 10. Quiet nocturnal water lapping in a tidal rock pool
      clapotisRocher: {
        when: (st) => st.e < 0.08 && (st.wind || 0) < 0.35 && (st.storm || 0) < 0.2,
        rate: (st) => (st.e < -0.25 ? 3.2 : 2.0),
        gap: 10,
        gain: 0.44,
        pan: [-0.30, 0.70],
        play(ctx, out, R, st, X) {
          const K = getK();
          const t0 = ctx.currentTime;
          const laps = 2 + Math.floor(R() * 2);
          const dur = 1.45;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n);
            let tLap = 0.04;
            for (let l = 0; l < laps; l++) {
              const lLen = Math.floor((0.22 + R() * 0.12) * sr);
              const s0 = Math.floor(tLap * sr);
              const f0 = 360 + R() * 150;
              let bp1 = 0, bp2 = 0;
              for (let k = 0; k < lLen && s0 + k < n; k++) {
                const x = k / lLen;
                const env = Math.sin(Math.PI * x) ** 1.5;
                const w = R() * 2 - 1;
                bp1 = 0.84 * bp1 + 0.16 * w;
                bp2 = 0.93 * bp2 + 0.07 * bp1;
                const ripple = (bp1 - bp2) * 0.78 + Math.sin(TAU * f0 * (1 + 0.28 * x) * (k / sr)) * 0.22 * (bp1 - bp2);
                d[s0 + k] += ripple * env * 0.92;
              }
              tLap += 0.28 + R() * 0.18;
            }
            return d;
          });
          const s = ctx.createBufferSource();
          s.buffer = buf;
          const bp = K.filt(ctx, 'bandpass', 620 + R() * 180, 1.2);
          const lp = K.filt(ctx, 'lowpass', 1600, 0.7);
          const g = K.gain(ctx, 0.66);
          K.chain(s, bp, lp, g);
          sendWet(ctx, g, out, X, 0.30);
          s.start(t0);
          s.stop(t0 + dur);
        },
      },

      // 11. Storm / rain / snow gust sweeping sea spray across the rocks and dunes
      embrunsRafale: {
        when: (st) => (st.r || 0) >= 0.25 || (st.storm || 0) >= 0.25 || (st.s || 0) >= 0.25,
        rate: (st) => 2.2 + 3.0 * (st.r || 0) + 3.8 * (st.storm || 0) + 2.0 * (st.s || 0),
        gap: 10,
        gain: 0.52,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          const K = getK();
          const t0 = ctx.currentTime;
          const dur = 2.4 + R() * 1.1;
          const wb = weatherBoost(st);
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n);
            K.pinkInto(d, 0.90, R);
            K.brownInto(d, 0.50, 0.03, R);
            for (let i = 0; i < n; i++) {
              const x = i / n;
              const env = x < 0.35
                ? Math.sin((x / 0.35) * (Math.PI / 2)) ** 1.4
                : Math.cos(((x - 0.35) / 0.65) * (Math.PI / 2)) ** 1.4;
              const grain = 0.70 + 0.30 * Math.sin(TAU * 11 * (i / sr));
              d[i] *= env * grain;
            }
            return d;
          });
          const s = ctx.createBufferSource();
          s.buffer = buf;
          const fStart = 640 + R() * 220;
          const bp = K.filt(ctx, 'bandpass', fStart, 0.95);
          const lp = K.filt(ctx, 'lowpass', 2700 - 550 * (st.s || 0), 0.7);
          bp.frequency.setValueAtTime(fStart, t0);
          bp.frequency.linearRampToValueAtTime(fStart * 1.65, t0 + dur * 0.4);
          bp.frequency.exponentialRampToValueAtTime(fStart * 0.85, t0 + dur);
          const g = K.gain(ctx, 0.66 * wb);
          K.chain(s, bp, lp, g);
          sendWet(ctx, g, out, X, 0.25);
          s.start(t0);
          s.stop(t0 + dur);
        },
      },
    },

    sfx: {
      // Far coastal chapel or sea-buoy bell at 18 h (weathered metallic resonance + coastal reverb)
      bell(ctx, out, R, st, X) {
        const K = getK();
        const t0 = ctx.currentTime;
        const f = 325 + R() * 30;
        const dur = 2.6;
        const buf = K.buffer(ctx, null, dur, (n, sr) => {
          const d = new Float32Array(n);
          const modes = [
            [1.00, 0.44, 0.32],
            [1.015, 0.32, 0.28],
            [1.33, 0.30, 0.22],
            [1.76, 0.22, 0.16],
            [2.38, 0.14, 0.10],
          ];
          let lp = 0;
          for (let i = 0; i < n; i++) {
            const sec = i / sr;
            const att = Math.min(1, sec / 0.003);
            const w = R() * 2 - 1;
            lp = 0.85 * lp + 0.15 * w;
            const mod = 0.45 + 0.55 * lp;
            let v = 0;
            for (const [m, a, tau] of modes) {
              v += Math.sin(TAU * f * m * sec) * a * Math.exp(-sec / tau);
            }
            const clank = (w - lp) * 0.40 * Math.exp(-sec / 0.016) + lp * 0.32 * Math.exp(-sec / 0.06);
            d[i] = (v * mod + clank) * att * 0.54;
          }
          return d;
        });
        const s = ctx.createBufferSource();
        s.buffer = buf;
        const bp = K.filt(ctx, 'bandpass', 500, 0.85);
        const lp = K.filt(ctx, 'lowpass', 1550, 0.7);
        const g = K.gain(ctx, 0.68);
        K.chain(s, bp, lp, g);
        sendWet(ctx, g, out, X, 0.82);
        s.start(t0);
        s.stop(t0 + dur);
      },

      // Match struck to light the lighthouse keeper's lamp
      match(ctx, out, R) {
        const K = getK();
        const t0 = ctx.currentTime;
        const dur = 0.68;
        const buf = K.buffer(ctx, null, dur, (n, sr) => {
          const d = new Float32Array(n);
          for (let i = 0; i < n; i++) {
            const sec = i / sr;
            const w = R() * 2 - 1;
            const scratch = sec < 0.095
              ? Math.sin((sec / 0.095) * Math.PI) * (0.4 + 0.6 * Math.abs(Math.sin(TAU * 68 * sec))) * 0.48
              : 0;
            const flare = sec > 0.075
              ? Math.min(1, (sec - 0.075) / 0.035) * Math.exp(-(sec - 0.075) / 0.15) * 0.38
              : 0;
            d[i] = w * (scratch + flare);
          }
          return d;
        });
        const s = ctx.createBufferSource();
        s.buffer = buf;
        const hp = K.filt(ctx, 'highpass', 240, 0.7);
        const lp = K.filt(ctx, 'lowpass', 2600, 0.7);
        lp.frequency.setValueAtTime(2800, t0);
        lp.frequency.exponentialRampToValueAtTime(1150, t0 + dur);
        const g = K.gain(ctx, 0.72);
        K.run(ctx, out, t0, t0 + dur, s, hp, lp, g);
      },

      // Soft breath putting out the lamp
      puff(ctx, out, R) {
        const K = getK();
        const t0 = ctx.currentTime;
        const dur = 0.45;
        const s = ctx.createBufferSource();
        s.buffer = K.noiseBuf(ctx, dur, (sec) => {
          const x = sec / dur;
          return Math.sin(Math.PI * x) ** 1.35 * Math.exp(-2.0 * x);
        });
        const hp = K.filt(ctx, 'highpass', 160, 0.7);
        const lp = K.filt(ctx, 'lowpass', 1100 + R() * 180, 0.8);
        lp.frequency.setValueAtTime(1200, t0);
        lp.frequency.exponentialRampToValueAtTime(420, t0 + dur);
        const g = K.gain(ctx, 0.52);
        K.run(ctx, out, t0, t0 + dur, s, hp, lp, g);
      },

      // Warm brass/bakelite lamp switch click (smooth attack, no sample jump)
      click(ctx, out, R) {
        const K = getK();
        const t0 = ctx.currentTime;
        const dur = 0.09;
        const buf = K.buffer(ctx, null, dur, (n, sr) => {
          const d = new Float32Array(n);
          const f1 = 220 + R() * 60;
          const f2 = 1400 + R() * 350;
          for (let i = 0; i < n; i++) {
            const sec = i / sr;
            const att = Math.min(1, sec / 0.0025);
            const body = Math.sin(TAU * f1 * Math.exp(-10 * sec) * sec) * Math.exp(-sec / 0.015) * 0.38;
            const latch = (Math.sin(TAU * f2 * sec) * 0.5 + (R() * 2 - 1) * 0.5) * Math.exp(-sec / 0.0045) * 0.40;
            d[i] = (body + latch) * att;
          }
          return d;
        });
        const s = ctx.createBufferSource();
        s.buffer = buf;
        const lp = K.filt(ctx, 'lowpass', 3200, 0.7);
        const g = K.gain(ctx, 0.68);
        K.run(ctx, out, t0, t0 + dur, s, lp, g);
      },

      // Weathered wood knock
      knock(ctx, out, R, st, X) {
        const K = getK();
        const t0 = ctx.currentTime;
        const dur = 0.24;
        const buf = K.buffer(ctx, null, dur, (n, sr) => {
          const d = new Float32Array(n);
          const f = 330 + R() * 50;
          for (let i = 0; i < n; i++) {
            const sec = i / sr;
            const att = Math.min(1, sec / 0.003);
            d[i] = att * (
              Math.sin(TAU * f * Math.exp(-4 * sec) * sec) * Math.exp(-sec / 0.035) * 0.48 +
              (R() * 2 - 1) * Math.exp(-sec / 0.009) * 0.26
            );
          }
          return d;
        });
        const s = ctx.createBufferSource();
        s.buffer = buf;
        const lp = K.filt(ctx, 'lowpass', 1750, 0.7);
        const g = K.gain(ctx, 0.66);
        K.chain(s, lp, g);
        sendWet(ctx, g, out, X, 0.24);
        s.start(t0);
        s.stop(t0 + dur);
      },

      // Driftwood & sea-shell mobile clinking gently on the keeper's porch
      chime(ctx, out, R, st, X) {
        const K = getK();
        const t0 = ctx.currentTime;
        const dur = 1.4;
        const buf = K.buffer(ctx, null, dur, (n, sr) => {
          const d = new Float32Array(n);
          const clinks = [0.02, 0.16 + R() * 0.08, 0.38 + R() * 0.12, 0.68 + R() * 0.14];
          for (let c = 0; c < clinks.length; c++) {
            const s0 = Math.floor(clinks[c] * sr);
            const len = Math.floor(0.14 * sr);
            const f1 = (980 + R() * 480) * TAU / sr;
            const f2 = f1 * (1.62 + R() * 0.25);
            const scale = 0.42 / (1 + c * 0.18);
            for (let k = 0; k < len && s0 + k < n; k++) {
              const sec = k / sr;
              const att = Math.min(1, sec / 0.0025);
              const w = 0.50 + 0.50 * (R() * 2 - 1);
              const shell = (Math.sin(f1 * k) * Math.exp(-sec / 0.032) * 0.6 +
                Math.sin(f2 * k) * Math.exp(-sec / 0.018) * 0.4) * w;
              d[s0 + k] += shell * att * scale;
            }
          }
          return d;
        });
        const s = ctx.createBufferSource();
        s.buffer = buf;
        const hp = K.filt(ctx, 'highpass', 550, 0.7);
        const lp = K.filt(ctx, 'lowpass', 2600, 0.7);
        const g = K.gain(ctx, 0.68);
        K.chain(s, hp, lp, g);
        sendWet(ctx, g, out, X, 0.48);
        s.start(t0);
        s.stop(t0 + dur);
      },

      // Distant coastal cliff owl (noise-excited resonant air cavity — zero sine wave)
      owl(ctx, out, R, st, X) {
        const K = getK();
        const t0 = ctx.currentTime;
        const f = 370 + R() * 35;
        const notes = [[0.03, 0.38, 1.0], [0.68, 0.20, 1.03], [0.96, 0.44, 0.94]];
        for (const [offset, dur, mult] of notes) {
          const tn = t0 + offset;
          const buf = K.buffer(ctx, null, dur, (n) => {
            const d = new Float32Array(n);
            K.pinkInto(d, 0.95, R);
            for (let i = 0; i < n; i++) {
              const x = i / n;
              d[i] *= Math.sin(Math.PI * x) ** 1.65;
            }
            return d;
          });
          const s = ctx.createBufferSource();
          s.buffer = buf;
          const fNote = f * mult;
          const bp1 = K.filt(ctx, 'bandpass', fNote, 12);
          const bp2 = K.filt(ctx, 'bandpass', fNote * 1.01, 10);
          const lp = K.filt(ctx, 'lowpass', 850, 0.7);
          bp1.frequency.setValueAtTime(fNote, tn);
          bp1.frequency.exponentialRampToValueAtTime(fNote * 0.92, tn + dur);
          bp2.frequency.setValueAtTime(fNote * 1.01, tn);
          bp2.frequency.exponentialRampToValueAtTime(fNote * 0.93, tn + dur);
          const g = K.gain(ctx, 1.50);
          K.chain(s, bp1, bp2, lp, g);
          sendWet(ctx, g, out, X, 0.72);
          s.start(tn);
          s.stop(tn + dur);
        }
      },
    },
  };
})();
