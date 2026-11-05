// Liseuse à la lampe — Sound pack for scene 'paris' (Toits de Paris)
// Plain browser script registering window.SCENE_SOUNDS.paris.
(function () {
  const K = window.SOUND_KIT;
  const TAU = K.TAU;

  // Fast 2-pole bandpass filter (constant f0) for sample-level organic buffer synthesis
  function biquadBand(d, sr, f0, q, gainAmt) {
    const out = new Float32Array(d.length);
    const w0 = (TAU * Math.min(sr * 0.45, Math.max(20, f0))) / sr;
    const alpha = Math.sin(w0) / (2 * Math.max(0.2, q));
    const b0 = alpha, b2 = -alpha;
    const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
    const kb0 = (b0 / a0) * gainAmt, kb2 = (b2 / a0) * gainAmt;
    const ka1 = a1 / a0, ka2 = a2 / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < d.length; i++) {
      const x0 = d[i] || 0;
      const y0 = kb0 * x0 + kb2 * x2 - ka1 * y1 - ka2 * y2;
      out[i] = Number.isFinite(y0) ? y0 : 0;
      x2 = x1; x1 = x0; y2 = y1; y1 = out[i];
    }
    return out;
  }

  // Time-varying 2-pole resonator (fArr[i] = instantaneous resonant frequency in Hz)
  // Allows shaped air/turbulence noise to excite moving vocal-tract / syrinx / cavity resonances
  function varResonator(d, sr, fArr, q, gainAmt) {
    const out = new Float32Array(d.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    let kb0 = 0, kb2 = 0, ka1 = 0, ka2 = 0;
    const inv2Q = 1 / (2 * Math.max(0.3, q));
    for (let i = 0; i < d.length; i++) {
      if ((i & 15) === 0) {
        const f0 = Math.min(sr * 0.44, Math.max(30, fArr[i] || 400));
        const w0 = (TAU * f0) / sr;
        const alpha = Math.sin(w0) * inv2Q;
        const a0 = 1 + alpha;
        kb0 = (alpha / a0) * gainAmt;
        kb2 = -kb0;
        ka1 = (-2 * Math.cos(w0)) / a0;
        ka2 = (1 - alpha) / a0;
      }
      const x0 = d[i] || 0;
      const y0 = kb0 * x0 + kb2 * x2 - ka1 * y1 - ka2 * y2;
      out[i] = Number.isFinite(y0) ? y0 : 0;
      x2 = x1; x1 = x0; y2 = y1; y1 = out[i];
    }
    return out;
  }

  function onePoleLp(d, sr, fc) {
    const a = Math.min(1, (TAU * fc) / sr);
    let y = 0;
    for (let i = 0; i < d.length; i++) {
      const x = Number.isFinite(d[i]) ? d[i] : 0;
      y += a * (x - y);
      d[i] = y;
    }
    return d;
  }

  // Safe raised-sine window: never NaN even if u is slightly outside [0, 1]
  function sinWin(u, p) {
    if (u <= 0 || u >= 1) return 0;
    const s = Math.sin(Math.PI * u);
    return s > 0 ? Math.pow(s, p) : 0;
  }

  // Compute target bed parameters smoothly from scene state st
  function bedTargets(st) {
    const e = st.e == null ? 0.5 : st.e;
    const r = Math.max(0, Math.min(1, st.r || 0));
    const s = Math.max(0, Math.min(1, st.s || 0));
    const storm = Math.max(0, Math.min(1, st.storm || 0));
    const wind = Math.max(0, Math.min(1, st.wind == null ? 0.15 : st.wind));

    // Day/activity curve: 1 at midday, ~0.72 morning/evening, ~0.38 deep night (keeps night median ~ -30.5 dBFS)
    const dayFactor = e > 0.25 ? 1.0 : e > -0.1 ? 0.68 + (e + 0.1) * 0.91 : Math.max(0.38, 0.68 + (e + 0.1) * 0.55);
    const snowMuffle = 1 - 0.30 * s;

    // 1. Distant city rumble/wash 6 stories down (dry median target: -30.8 to -27.8 dBFS)
    const cityGain = (0.28 + 0.21 * dayFactor) * snowMuffle * (1 + 0.06 * r);
    const cityFreq = (215 + 155 * dayFactor + 60 * r) * (1 - 0.34 * s);

    // 2. Rooftop open air & chimney/foliage breeze
    const airGain = 0.17 + 0.23 * wind + 0.08 * storm + 0.07 * s;
    const airFreq = 315 + 225 * wind + 110 * storm - 55 * s;

    // 3. Wide urban rain wash (calibrated so pluie ~ -25.6 dBFS and orage ~ -23.0 dBFS, strictly <= -22)
    const wet = Math.min(1, r + storm * 0.25);
    const rainWashGain = wet > 0.01 ? Math.pow(wet, 0.85) * (0.33 + 0.08 * storm) : 0.0001;
    const rainWashFreq = 980 + 520 * wet + 240 * storm;

    // 4. Tactile patter of rain on the zinc mansard roof & balcony railing
    const zincRainGain = wet > 0.01 ? Math.pow(wet, 0.9) * (0.30 + 0.10 * storm) : 0.0001;

    return { cityGain, cityFreq, airGain, airFreq, rainWashGain, rainWashFreq, zincRainGain };
  }

  window.SCENE_SOUNDS.paris = {
    bed(ctx, out, K, st) {
      // Layer 1: Distant Parisian city wash (22.0 s stereo loop)
      // Muffled urban horizon 6 stories below: deep brown + pink noise with slow boulevard swells
      const cityBuf = K.loopBuffer(ctx, 'paris:city:v4', 22.0, (n, sr, ch) => {
        const R = K.rng(101 + ch * 43);
        const d = new Float32Array(n);
        K.brownInto(d, 1.35, 0.014, R);
        K.pinkInto(d, 0.36, R);
        const dur = n / sr;
        const p1 = R() * TAU, p2 = R() * TAU, p3 = R() * TAU;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const mod = 0.82
            + 0.11 * Math.sin((TAU * t) / dur + p1)
            + 0.08 * Math.sin((TAU * 2 * t) / dur + p2)
            + 0.06 * Math.sin((TAU * 3 * t) / dur + p3);
          d[i] *= mod;
        }
        // 4 soft, distant avenue waves (3.6-5.6 s wide, never individual cars)
        let t0 = 1.2 + ch * 1.9;
        while (t0 < dur - 5.2) {
          const wDur = 3.6 + R() * 2.0;
          const i0 = (t0 * sr) | 0, len = (wDur * sr) | 0;
          const amp = 0.18 + R() * 0.15;
          let lp = 0;
          for (let k = 0; k < len && i0 + k < n; k++) {
            const env = sinWin(k / len, 2);
            lp = 0.96 * lp + 0.04 * (R() * 2 - 1);
            d[i0 + k] += lp * amp * env;
          }
          t0 += 4.5 + R() * 3.2;
        }
        return d;
      });

      // Layer 2: Open rooftop air & chimney draft (18.5 s stereo loop)
      const airBuf = K.loopBuffer(ctx, 'paris:air:v4', 18.5, (n, sr, ch) => {
        const R = K.rng(211 + ch * 59);
        const d = new Float32Array(n);
        K.pinkInto(d, 0.92, R);
        K.brownInto(d, 0.58, 0.024, R);
        const dur = n / sr;
        const p1 = R() * TAU, p2 = R() * TAU;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const gust = 0.72
            + 0.18 * Math.sin((TAU * t) / dur + p1)
            + 0.12 * Math.sin((TAU * 2 * t) / dur + p2);
          d[i] *= gust;
        }
        return d;
      });

      // Layer 3: Wide rain wash over roofs & courtyard below (16.4 s stereo loop)
      const rainWashBuf = K.loopBuffer(ctx, 'paris:rainwash:v4', 16.4, (n, sr, ch) => {
        const R = K.rng(307 + ch * 71);
        const d = new Float32Array(n);
        K.pinkInto(d, 0.95, R);
        K.brownInto(d, 0.55, 0.028, R);
        const dur = n / sr, p1 = R() * TAU, p2 = R() * TAU;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          d[i] *= 0.82 + 0.12 * Math.sin((TAU * t) / dur + p1) + 0.07 * Math.sin((TAU * 2 * t) / dur + p2);
        }
        return d;
      });

      // Layer 4: Tactile rain pattering on zinc mansard roofs & wrought-iron rail (19.3 s stereo loop)
      const zincRainBuf = K.loopBuffer(ctx, 'paris:zincrain:v4', 19.3, (n, sr, ch) => {
        const R = K.rng(409 + ch * 83);
        const raw = new Float32Array(n);
        K.pinkInto(raw, 0.20, R);
        const dur = n / sr, p1 = R() * TAU;
        for (let i = 0; i < n; ) {
          const t = i / sr;
          const density = 0.75 + 0.25 * Math.sin((TAU * t) / dur + p1);
          i += Math.max(6, (sr * (0.0014 + R() * 0.0075) / density) | 0);
          const isMed = R() < 0.22;
          const amp = (0.14 + R() * 0.36) * (isMed ? 1.55 : 0.75);
          const len = (sr * (isMed ? 0.0032 + R() * 0.0025 : 0.0015 + R() * 0.002)) | 0;
          const fDrop = isMed ? 540 + R() * 680 : 820 + R() * 1250;
          const wStep = (TAU * fDrop) / sr;
          for (let k = 0; k < len && i + k < n; k++) {
            const u = k / len;
            const env = Math.sin(Math.PI * u) * Math.exp(-3.4 * u);
            raw[i + k] += (Math.sin(wStep * k * (1 + 0.06 * u)) * 0.52 + (R() * 2 - 1) * 0.48) * amp * env;
          }
        }
        return biquadBand(raw, sr, 1120, 0.78, 1.0);
      });

      const t0 = bedTargets(st || {});

      // Build Web Audio graph for bed (10 nodes total: 5 sources + 5 filters)
      const citySrc = K.loop(ctx, cityBuf, 1.0, 0);
      const cityLp = K.filt(ctx, 'lowpass', t0.cityFreq, 0.65);
      const cityGain = K.gain(ctx, t0.cityGain);
      K.chain(citySrc, cityLp, cityGain, out);

      const airSrc = K.loop(ctx, airBuf, 1.0, 2.3);
      const airBp = K.filt(ctx, 'bandpass', t0.airFreq, 0.75);
      const airGain = K.gain(ctx, t0.airGain);
      const airLfo = ctx.createOscillator();
      const airLfoG = K.gain(ctx, 55);
      airLfo.frequency.value = 0.037;
      airLfo.start(ctx.currentTime);
      K.chain(airLfo, airLfoG, airBp.frequency);
      K.chain(airSrc, airBp, airGain, out);

      const rainWashSrc = K.loop(ctx, rainWashBuf, 1.0, 1.1);
      const rainWashLp = K.filt(ctx, 'lowpass', t0.rainWashFreq, 0.6);
      const rainWashGain = K.gain(ctx, t0.rainWashGain);
      K.chain(rainWashSrc, rainWashLp, rainWashGain, out);

      const zincRainSrc = K.loop(ctx, zincRainBuf, 1.0, 3.7);
      const zincRainHp = K.filt(ctx, 'highpass', 360, 0.7);
      const zincRainLp = K.filt(ctx, 'lowpass', 2500, 0.65);
      const zincRainGain = K.gain(ctx, t0.zincRainGain);
      K.chain(zincRainSrc, zincRainHp, zincRainLp, zincRainGain, out);

      // Shared spatial sends for details:
      const farVerb = K.reverb(ctx, out, 2.3, 2.8, 0.68, 0.42);
      const nearVerb = K.reverb(ctx, out, 0.7, 4.4, 0.55, 0.18);

      return {
        nodes: [citySrc, airSrc, airLfo, rainWashSrc, zincRainSrc],
        farVerb,
        nearVerb,
        set(s2) {
          const tgt = bedTargets(s2 || {});
          const tau = 1.45;
          K.glide(ctx, cityGain.gain, tgt.cityGain, tau);
          K.glide(ctx, cityLp.frequency, tgt.cityFreq, tau);
          K.glide(ctx, airGain.gain, tgt.airGain, tau);
          K.glide(ctx, airBp.frequency, tgt.airFreq, tau);
          K.glide(ctx, rainWashGain.gain, tgt.rainWashGain, tau);
          K.glide(ctx, rainWashLp.frequency, tgt.rainWashFreq, tau);
          K.glide(ctx, zincRainGain.gain, tgt.zincRainGain, tau);
        },
      };
    },

    details: {
      // 1. Wood pigeon / rooftop pigeon cooing on a nearby mansard ridge
      // Warm, hollow, throat-rolled crop resonance around 320-368 Hz
      pigeon_coo: {
        when: (st) => st.e > -0.08 && (st.r || 0) < 0.45 && (st.storm || 0) < 0.25,
        rate: (st) => (st.h < 10 ? 3.6 : st.e > 0.2 ? 2.6 : 3.1) * (1 - (st.s || 0) * 0.5),
        gap: 15,
        gain: 0.34,
        pan: [-0.65, 0.65],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime, sr = ctx.sampleRate;
          const dur = 2.2;
          const baseF = 320 + R() * 48;
          const trillHz = 27.5 + R() * 3.5;
          const nSyl = R() < 0.6 ? 4 : 3;
          const syls = [
            [0.04, 0.24, 0.95, 1.01, 0.97, 0.54],
            [0.33, 0.96, 0.97, 1.05, 0.93, 1.0],
            [1.08, 1.42, 0.96, 1.02, 0.94, 0.78],
          ];
          if (nSyl === 4) syls.push([1.53, 1.82, 0.95, 0.99, 0.91, 0.52]);

          const buf = K.buffer(ctx, null, dur, (n) => {
            const raw = new Float32Array(n);
            const fArr = new Float32Array(n);
            fArr.fill(baseF);
            let phase = 0;
            for (const [s0, s1, p0, pMid, p1, amp] of syls) {
              const i0 = (s0 * sr) | 0, i1 = Math.min(n, (s1 * sr) | 0), len = i1 - i0;
              for (let k = 0; k < len; k++) {
                const u = k / len;
                const env = u < 0.22 ? 0.5 - 0.5 * Math.cos((Math.PI * u) / 0.22)
                  : u > 0.68 ? 0.5 + 0.5 * Math.cos((Math.PI * (u - 0.68)) / 0.32)
                  : 1.0;
                const pCurve = u < 0.30
                  ? p0 + (pMid - p0) * Math.sin((Math.PI * 0.5 * u) / 0.30)
                  : pMid + (p1 - pMid) * Math.pow((u - 0.30) / 0.70, 1.3);
                const t = (i0 + k) / sr;
                const flutter = 0.56 + 0.44 * Math.sin(TAU * trillHz * t + 0.35 * Math.sin(TAU * 4.5 * t));
                const fInst = baseF * pCurve * (1 + 0.008 * Math.sin(TAU * trillHz * t));
                fArr[i0 + k] = fInst;
                phase += (TAU * fInst) / sr;
                const voice = Math.sin(phase) * 0.74;
                const breath = (R() * 2 - 1) * 0.46;
                raw[i0 + k] += (voice + breath) * env * flutter * amp * 0.62;
              }
            }
            const res = varResonator(raw, sr, fArr, 5.2, 1.65);
            return onePoleLp(res, sr, 650);
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 670, 0.7);
          const dryG = K.gain(ctx, 0.85);
          K.run(ctx, out, t0, t0 + dur, src, lp, dryG);
          if (X && X.nearVerb) {
            const sendNear = K.gain(ctx, 0.42);
            lp.connect(sendNear); sendNear.connect(X.nearVerb);
          }
          if (X && X.farVerb) {
            const sendFar = K.gain(ctx, 0.32);
            lp.connect(sendFar); sendFar.connect(X.farVerb);
          }
        },
      },

      // 2. Pigeon wing flutter taking off or landing on the zinc roof edge
      wing_flutter: {
        when: (st) => st.e > -0.1 && (st.storm || 0) < 0.45,
        rate: (st) => ((st.r || 0) > 0.4 ? 1.1 : 2.3),
        gap: 18,
        gain: 0.42,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime, sr = ctx.sampleRate;
          const flaps = 4 + ((R() * 4) | 0);
          const dur = 0.18 + flaps * 0.11;
          const buf = K.buffer(ctx, null, dur, (n) => {
            const d = new Float32Array(n);
            const low = new Float32Array(n);
            const feather = new Float32Array(n);
            if (R() < 0.55) {
              const c0 = (0.02 * sr) | 0, cLen = (0.008 * sr) | 0;
              for (let k = 0; k < cLen && c0 + k < n; k++) {
                feather[c0 + k] += (R() * 2 - 1) * 0.45 * sinWin(k / cLen, 1);
              }
            }
            let t = 0.06;
            for (let f = 0; f < flaps; f++) {
              const fade = (1 - (f / (flaps + 1.5)) * 0.50) * (0.85 + 0.3 * R());
              const fDur = 0.054 + R() * 0.016;
              const i0 = (t * sr) | 0, len = (fDur * sr) | 0;
              for (let k = 0; k < len && i0 + k < n; k++) {
                const u = k / len;
                const env = sinWin(u, 1.5) * fade;
                low[i0 + k] += (R() * 2 - 1) * env * 1.25;
                feather[i0 + k] += (R() * 2 - 1) * env * (0.7 + 0.35 * Math.sin(Math.PI * 2 * u));
              }
              t += 0.082 + R() * 0.024;
            }
            const bLow = biquadBand(low, sr, 205 + R() * 45, 1.25, 1.2);
            const bHi = biquadBand(feather, sr, 1380 + R() * 350, 1.15, 0.95);
            for (let i = 0; i < n; i++) d[i] = bLow[i] + bHi[i];
            return onePoleLp(d, sr, 2700);
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const g = K.gain(ctx, 0.96);
          K.run(ctx, out, t0, t0 + dur, src, g);
          if (X && X.nearVerb) {
            const send = K.gain(ctx, 0.42);
            src.connect(send); send.connect(X.nearVerb);
          }
        },
      },

      // 3. Rooftop house sparrows (moineaux domestiques) in the eaves — morning & midday
      // Aperiodic air-turbulence syrinx excitation through a moving formant resonator
      sparrow_chirp: {
        when: (st) => st.e > 0.05 && (st.r || 0) < 0.25 && (st.storm || 0) < 0.2,
        rate: (st) => (st.h < 11 ? 3.2 : 2.0) * (1 - (st.s || 0) * 0.6),
        gap: 15,
        gain: 0.40,
        pan: [-0.8, 0.8],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime, sr = ctx.sampleRate;
          const count = 1 + ((R() * 2.6) | 0);
          const dur = 0.22 + count * 0.22;
          const buf = K.buffer(ctx, null, dur, (n) => {
            const exc = new Float32Array(n);
            const fArr = new Float32Array(n);
            const fBase = 2650 + R() * 380;
            fArr.fill(fBase);
            let t = 0.03;
            let lpTurb = 0;
            for (let c = 0; c < count; c++) {
              const cDur = 0.054 + R() * 0.022;
              const i0 = (t * sr) | 0, len = (cDur * sr) | 0;
              const f0 = fBase * (0.90 + R() * 0.12);
              const f1 = f0 * (1.18 + R() * 0.10);
              const amp = (0.85 + R() * 0.15) * (c === 0 ? 1 : 0.86);
              let ph = 0;
              for (let k = 0; k < len && i0 + k < n; k++) {
                const u = k / len;
                const env = sinWin(u, 1.4) * Math.exp(-1.1 * u);
                const fInst = u < 0.45 ? f0 + (f1 - f0) * (u / 0.45) : f1 - (f1 - f0 * 0.90) * ((u - 0.45) / 0.55);
                fArr[i0 + k] = fInst;
                // Aperiodic syrinx turbulence (no periodic ring-mod buzz)
                lpTurb = 0.92 * lpTurb + 0.08 * (R() * 2 - 1);
                const burr = 0.72 + 0.55 * lpTurb;
                ph += (TAU * fInst * (1 + 0.02 * lpTurb)) / sr;
                const pulse = Math.sin(ph) * 0.38 + (R() * 2 - 1) * 0.62;
                exc[i0 + k] += pulse * burr * env * amp;
              }
              t += cDur + 0.095 + R() * 0.09;
            }
            const res1 = varResonator(exc, sr, fArr, 7.2, 2.3);
            return onePoleLp(res1, sr, 3400);
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 3250, 0.7);
          const g = K.gain(ctx, 0.88);
          K.run(ctx, out, t0, t0 + dur, src, lp, g);
          if (X && X.farVerb) {
            const send = K.gain(ctx, 0.62);
            lp.connect(send); send.connect(X.farVerb);
          }
        },
      },

      // 4. Distant swifts (martinets noirs) wheeling high in the summer evening sky
      // Airy, aperiodic turbulence-excited dual-formant glide (soft, high and far, zero metallic buzz)
      swifts_distant: {
        when: (st) => st.h >= 15.5 && st.h <= 21.5 && st.e > -0.18 && (st.r || 0) < 0.2 && (st.s || 0) < 0.2,
        rate: (st) => (st.h >= 18 && st.h <= 21 ? 3.2 : 1.7),
        gap: 16,
        gain: 0.34,
        pan: [-0.7, 0.7],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime, sr = ctx.sampleRate;
          const calls = R() < 0.5 ? 2 : 1;
          const dur = 0.45 + calls * 0.55;
          const f0 = 2850 + R() * 340;
          const buf = K.buffer(ctx, null, dur, (n) => {
            const exc = new Float32Array(n);
            const fArr = new Float32Array(n);
            fArr.fill(f0);
            let t = 0.04;
            let turb = 0;
            for (let c = 0; c < calls; c++) {
              const cDur = 0.36 + R() * 0.14;
              const i0 = (t * sr) | 0, len = (cDur * sr) | 0;
              const amp = c === 0 ? 0.92 : 0.68;
              let ph = 0;
              for (let k = 0; k < len && i0 + k < n; k++) {
                const u = k / len;
                const env = sinWin(u, 1.8);
                const fInst = f0 * (1 + 0.12 * Math.sin(Math.PI * u) - 0.07 * u);
                fArr[i0 + k] = fInst;
                // Smooth aperiodic air turbulence (~120-280 Hz bandwidth) instead of periodic sine AM
                turb = 0.94 * turb + 0.06 * (R() * 2 - 1);
                ph += (TAU * fInst * (1 + 0.025 * turb)) / sr;
                const sig = (R() * 2 - 1) * 0.72 + Math.sin(ph) * 0.28;
                exc[i0 + k] += sig * (0.75 + 0.5 * turb) * env * amp;
              }
              t += cDur + 0.16 + R() * 0.15;
            }
            const res = varResonator(exc, sr, fArr, 6.2, 2.2);
            return onePoleLp(res, sr, 2850);
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 2750, 0.7);
          const dryG = K.gain(ctx, 0.52);
          K.run(ctx, out, t0, t0 + dur, src, lp, dryG);
          if (X && X.farVerb) {
            const send = K.gain(ctx, 0.88);
            lp.connect(send); send.connect(X.farVerb);
          }
        },
      },

      // 5. Soft rustling of balcony geraniums, lavender stems and ivy in terracotta pots
      balcony_leaves: {
        when: () => true,
        rate: (st) => 1.7 + 2.8 * (st.wind == null ? 0.15 : st.wind),
        gap: 12,
        gain: 0.30,
        pan: [-0.85, 0.85],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime, sr = ctx.sampleRate;
          const dur = 1.25 + R() * 0.55;
          const wetBoost = 1 + 0.35 * Math.max(st.r || 0, st.storm || 0);
          const buf = K.buffer(ctx, null, dur, (n) => {
            const d = new Float32Array(n);
            const pink = new Float32Array(n);
            K.pinkInto(pink, 1.05, R);
            const brushes = 8 + ((R() * 6) | 0);
            for (let b = 0; b < brushes; b++) {
              const bStart = R() * (dur - 0.22);
              const bDur = 0.09 + R() * 0.14;
              const i0 = (bStart * sr) | 0, len = (bDur * sr) | 0;
              const amp = 0.32 + R() * 0.45;
              for (let k = 0; k < len && i0 + k < n; k++) {
                const env = sinWin(k / len, 2.2) * sinWin((i0 + k) / n, 1.2);
                d[i0 + k] += pink[i0 + k] * env * amp;
              }
            }
            const f1 = biquadBand(d, sr, 1150 + R() * 450, 1.1, 1.05);
            const f2 = biquadBand(d, sr, 2350 + R() * 550, 1.4, 0.62);
            for (let i = 0; i < n; i++) d[i] = f1[i] + f2[i];
            return onePoleLp(d, sr, 3400);
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const g = K.gain(ctx, 0.92 * wetBoost);
          K.run(ctx, out, t0, t0 + dur, src, g);
          if (X && X.nearVerb) {
            const send = K.gain(ctx, 0.28 * wetBoost);
            src.connect(send); send.connect(X.nearVerb);
          }
        },
      },

      // 6. Distant footsteps on cobblestones down in the courtyard/street
      cobble_steps: {
        when: (st) => (st.r || 0) < 0.55 && (st.storm || 0) < 0.3,
        rate: (st) => (st.e < -0.3 ? 1.2 : 2.1) * (1 - (st.s || 0) * 0.65),
        gap: 24,
        gain: 0.44,
        pan: [-0.5, 0.5],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime, sr = ctx.sampleRate;
          const steps = 5 + ((R() * 4) | 0);
          const pace = 0.47 + R() * 0.09;
          const dur = steps * pace + 0.35;
          const buf = K.buffer(ctx, null, dur, (n) => {
            const heel = new Float32Array(n);
            const sole = new Float32Array(n);
            let t = 0.08;
            for (let s = 0; s < steps; s++) {
              const arch = sinWin((s + 0.7) / (steps + 0.4), 1.2);
              const amp = arch * (0.88 + R() * 0.22);
              const iHeel = (t * sr) | 0, hLen = (0.018 * sr) | 0;
              for (let k = 0; k < hLen && iHeel + k < n; k++) {
                const env = sinWin(k / hLen, 1) * Math.exp((-2.4 * k) / hLen);
                heel[iHeel + k] += (R() * 2 - 1) * env * amp * 1.35;
              }
              const iSole = ((t + 0.022 + R() * 0.008) * sr) | 0, sLen = (0.026 * sr) | 0;
              for (let k = 0; k < sLen && iSole + k < n; k++) {
                const env = sinWin(k / sLen, 1) * Math.exp((-1.9 * k) / sLen);
                sole[iSole + k] += (R() * 2 - 1) * env * amp * 0.98;
              }
              t += pace * (0.95 + R() * 0.1);
            }
            const b1 = biquadBand(heel, sr, 540 + R() * 140, 2.0, 1.45);
            const b2 = biquadBand(sole, sr, 880 + R() * 180, 1.5, 1.15);
            const outD = new Float32Array(n);
            for (let i = 0; i < n; i++) outD[i] = b1[i] + b2[i];
            return onePoleLp(outD, sr, 1380);
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 1280, 0.7);
          const dryG = K.gain(ctx, 0.78);
          K.run(ctx, out, t0, t0 + dur, src, lp, dryG);
          if (X && X.farVerb) {
            const send = K.gain(ctx, 0.80);
            lp.connect(send); send.connect(X.farVerb);
          }
        },
      },

      // 7. Wooden casement window or shutter closing gently across the courtyard
      window_shutter: {
        when: (st) => (st.storm || 0) < 0.6,
        rate: (st) => (st.h < 9 || (st.h > 18.5 && st.h < 23.8) || (st.r || 0) > 0.25 ? 1.8 : 1.0),
        gap: 28,
        gain: 0.42,
        pan: [-0.6, 0.6],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime, sr = ctx.sampleRate;
          const dur = 0.85;
          const wetBoost = 1 + 0.25 * (st.r || 0);
          const buf = K.buffer(ctx, null, dur, (n) => {
            const creak = new Float32Array(n);
            const thud = new Float32Array(n);
            let tc = 0.04;
            while (tc < 0.31) {
              const ic = (tc * sr) | 0, cLen = (0.006 * sr) | 0;
              const envC = sinWin((tc - 0.04) / 0.27, 1);
              for (let k = 0; k < cLen && ic + k < n; k++) {
                creak[ic + k] += (R() * 2 - 1) * envC * 0.48 * sinWin(k / cLen, 1);
              }
              tc += 0.013 + R() * 0.011;
            }
            for (const [tHit, aHit, fWood] of [[0.35, 1.15, 142 + R() * 28], [0.394, 0.56, 210 + R() * 32]]) {
              const ih = (tHit * sr) | 0, hLen = (0.098 * sr) | 0;
              for (let k = 0; k < hLen && ih + k < n; k++) {
                const u = k / hLen;
                const attack = k < sr * 0.003 ? k / (sr * 0.003) : 1;
                const decay = Math.exp(-4.8 * u);
                const mode = Math.sin((TAU * fWood * k) / sr) * 0.62 + Math.sin((TAU * fWood * 1.72 * k) / sr) * 0.28;
                const woodNoise = (R() * 2 - 1) * 0.52 * Math.exp(-10 * u);
                thud[ih + k] += (mode + woodNoise) * attack * decay * aHit;
              }
            }
            const cFilt = biquadBand(creak, sr, 520 + R() * 150, 2.7, 1.1);
            const tFilt = onePoleLp(thud, sr, 760);
            const outD = new Float32Array(n);
            for (let i = 0; i < n; i++) outD[i] = cFilt[i] + tFilt[i];
            return onePoleLp(outD, sr, 1100);
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 1080, 0.7);
          const dryG = K.gain(ctx, 0.80 * wetBoost);
          K.run(ctx, out, t0, t0 + dur, src, lp, dryG);
          if (X && X.farVerb) {
            const send = K.gain(ctx, 0.78 * wetBoost);
            lp.connect(send); send.connect(X.farVerb);
          }
        },
      },

      // 8. Very distant scooter / moped passing along a street 6 stories down (rare, muffled)
      distant_scooter: {
        when: (st) => st.e > -0.18 && (st.r || 0) < 0.5 && (st.storm || 0) < 0.2 && (st.s || 0) < 0.3,
        rate: (st) => (st.e > 0.1 ? 1.3 : 0.9),
        gap: 36,
        gain: 0.40,
        pan: [-0.55, 0.55],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime, sr = ctx.sampleRate;
          const dur = 4.6;
          const buf = K.buffer(ctx, null, dur, (n) => {
            const eng = new Float32Array(n);
            const tire = new Float32Array(n);
            K.pinkInto(tire, 0.90, R);
            const fBase = 62 + R() * 14;
            let ph = 0;
            for (let i = 0; i < n; i++) {
              const u = i / n;
              const env = sinWin(u, 2.2) * (0.85 + 0.15 * Math.sin(TAU * 1.7 * u));
              const doppler = 1 + 0.065 * Math.cos(Math.PI * u) - 0.015 * u;
              const f = fBase * doppler * (1 + (R() - 0.5) * 0.03);
              ph += (TAU * f) / sr;
              const pulse = Math.sin(ph) * 0.65 + Math.sin(2 * ph + 0.5) * 0.28 + Math.sin(3 * ph + 1.1) * 0.07;
              eng[i] = pulse * env * 0.68;
              tire[i] *= env * 0.76;
            }
            const m1 = biquadBand(eng, sr, 148, 1.9, 1.22);
            const m2 = biquadBand(eng, sr, 290, 2.1, 0.78);
            const tBand = biquadBand(tire, sr, 350, 1.2, 0.98);
            const outD = new Float32Array(n);
            for (let i = 0; i < n; i++) outD[i] = m1[i] + m2[i] + tBand[i];
            return onePoleLp(outD, sr, 495);
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 485, 0.7);
          const dryG = K.gain(ctx, 0.74);
          K.run(ctx, out, t0, t0 + dur, src, lp, dryG);
          if (X && X.farVerb) {
            const send = K.gain(ctx, 0.80);
            lp.connect(send); send.connect(X.farVerb);
          }
        },
      },

      // 9. Distant Parisian church bell floating over the rooftops (Saint-Sulpice / Sainte-Clotilde)
      church_bell: {
        when: (st) => st.e > -0.15 && (st.storm || 0) < 0.5,
        rate: (st) => (st.h < 9.5 || (st.h > 18 && st.h < 21) ? 1.55 : 1.1),
        gap: 38,
        gain: 0.45,
        pan: [-0.45, 0.35],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime, sr = ctx.sampleRate;
          const strikes = R() < 0.48 ? 2 : 1;
          const spacing = 2.05 + R() * 0.2;
          const dur = (strikes - 1) * spacing + 4.4;
          const f0 = 205 + R() * 36;
          const modes = [
            [0.5, 0.42, 1.85],
            [1.0, 0.98, 1.55],
            [1.0035, 0.52, 1.50],
            [1.188, 0.62, 1.10],
            [1.506, 0.42, 0.85],
            [2.0, 0.50, 0.65],
            [2.005, 0.25, 0.58],
            [2.514, 0.20, 0.40],
            [3.011, 0.13, 0.28],
          ];

          const buf = K.buffer(ctx, null, dur, (n) => {
            const d = new Float32Array(n);
            for (let s = 0; s < strikes; s++) {
              const sStart = s * spacing + 0.03;
              const i0 = (sStart * sr) | 0;
              const strikeAmp = s === 0 ? 1.0 : 0.88 + R() * 0.1;
              for (const [ratio, mAmp, tau] of modes) {
                const f = f0 * ratio;
                const w = (TAU * f) / sr;
                const ph0 = R() * TAU;
                const maxK = Math.min(n - i0, (tau * 5.5 * sr) | 0);
                for (let k = 0; k < maxK; k++) {
                  const t = k / sr;
                  const att = t < 0.016 ? 0.5 - 0.5 * Math.cos((Math.PI * t) / 0.016) : 1.0;
                  const airDrift = 0.88 + 0.12 * Math.sin(TAU * 1.4 * t + ph0);
                  d[i0 + k] += Math.sin(w * k + ph0) * mAmp * strikeAmp * att * Math.exp(-t / tau) * airDrift * 0.38;
                }
              }
              const cLen = (0.045 * sr) | 0;
              for (let k = 0; k < cLen && i0 + k < n; k++) {
                const env = sinWin(k / cLen, 1) * Math.exp((-3.5 * k) / cLen);
                d[i0 + k] += (R() * 2 - 1) * 0.16 * env * strikeAmp;
              }
            }
            return onePoleLp(d, sr, 1720);
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 1680, 0.7);
          const dryG = K.gain(ctx, 0.70);
          K.run(ctx, out, t0, t0 + dur, src, lp, dryG);
          if (X && X.farVerb) {
            const send = K.gain(ctx, 0.90);
            lp.connect(send); send.connect(X.farVerb);
          }
        },
      },

      // 10. Sleeping cat's soft breath-purr on the wooden bistro chair (center-left of balcony)
      cat_breath_purr: {
        when: (st) => (st.r || 0) < 0.4 && (st.storm || 0) < 0.2,
        rate: (st) => (st.e < -0.1 ? 2.5 : 1.5),
        gap: 20,
        gain: 0.36,
        pan: [-0.25, 0.05],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime, sr = ctx.sampleRate;
          const dur = 2.05;
          const fPurr = 25.0 + R() * 3.0;
          const buf = K.buffer(ctx, null, dur, (n) => {
            const glot = new Float32Array(n);
            const air = new Float32Array(n);
            K.pinkInto(air, 0.70, R);
            let ph = 0;
            for (let i = 0; i < n; i++) {
              const t = i / sr;
              const env = t < 0.88
                ? sinWin(t / 0.88, 1.6) * 0.86
                : t > 0.98 && t < 2.02
                ? sinWin((t - 0.98) / 1.04, 1.5) * 1.0
                : 0.04;
              const fInst = fPurr * (t < 0.9 ? 1.03 : 0.97) * (1 + (R() - 0.5) * 0.04);
              ph += (TAU * fInst) / sr;
              const pulse = Math.sin(ph) * 0.6 + Math.sin(2 * ph + 0.3) * 0.3 + Math.sin(3 * ph + 0.8) * 0.1;
              glot[i] = pulse * env * 0.95;
              air[i] *= env * (0.55 + 0.45 * Math.sin(ph));
            }
            const chest = biquadBand(glot, sr, 185 + R() * 25, 1.6, 1.38);
            const breath = biquadBand(air, sr, 410 + R() * 50, 1.4, 0.88);
            const outD = new Float32Array(n);
            for (let i = 0; i < n; i++) outD[i] = chest[i] + breath[i];
            return onePoleLp(outD, sr, 580);
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 560, 0.7);
          const g = K.gain(ctx, 0.94);
          K.run(ctx, out, t0, t0 + dur, src, lp, g);
        },
      },

      // 11. Matte thermal expansion ticks / soft settling of the zinc roof flashing
      zinc_ticks: {
        when: (st) => (st.r || 0) < 0.5,
        rate: (st) => (st.e > 0.5 || st.e < -0.2 || (st.s || 0) > 0.2 ? 2.2 : 1.4),
        gap: 18,
        gain: 0.35,
        pan: [-0.8, 0.8],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime, sr = ctx.sampleRate;
          const count = 1 + ((R() * 2.4) | 0);
          const dur = 0.45;
          const buf = K.buffer(ctx, null, dur, (n) => {
            const d = new Float32Array(n);
            let t = 0.03;
            for (let c = 0; c < count; c++) {
              const i0 = (t * sr) | 0, len = (0.026 * sr) | 0;
              const f1 = 540 + R() * 230, f2 = f1 * (1.85 + R() * 0.35);
              const amp = (0.78 + R() * 0.22) * (c === 0 ? 1 : 0.72);
              for (let k = 0; k < len && i0 + k < n; k++) {
                const att = k < sr * 0.0022 ? k / (sr * 0.0022) : 1;
                const dec = Math.exp((-4.4 * k) / len);
                const sig = Math.sin((TAU * f1 * k) / sr) * 0.52 + Math.sin((TAU * f2 * k) / sr) * 0.26 + (R() * 2 - 1) * 0.22;
                d[i0 + k] += sig * att * dec * amp * 0.74;
              }
              t += 0.07 + R() * 0.11;
            }
            return onePoleLp(d, sr, 1950);
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const g = K.gain(ctx, 0.92);
          K.run(ctx, out, t0, t0 + dur, src, g);
          if (X && X.nearVerb) {
            const send = K.gain(ctx, 0.36);
            src.connect(send); send.connect(X.nearVerb);
          }
        },
      },

      // 12. Rain drops falling from the mansard eave onto the zinc ledge or metal watering can
      zinc_rain_drip: {
        when: (st) => (st.r || 0) > 0.12 || (st.storm || 0) > 0.15,
        rate: (st) => 4.5 + 4.8 * Math.max(st.r || 0, st.storm || 0),
        gap: 6.0,
        gain: 0.56,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime, sr = ctx.sampleRate;
          const drops = 3 + ((R() * 4) | 0);
          const dur = 0.25 + drops * 0.15;
          const stormBoost = 1 + 0.32 * (st.storm || 0);
          const buf = K.buffer(ctx, null, dur, (n) => {
            const d = new Float32Array(n);
            let t = 0.02;
            const baseF = 620 + R() * 460;
            for (let dr = 0; dr < drops; dr++) {
              const i0 = (t * sr) | 0, len = (0.036 * sr) | 0;
              const f0 = baseF * (0.9 + R() * 0.22);
              const amp = 0.76 + R() * 0.24;
              let ph = 0;
              for (let k = 0; k < len && i0 + k < n; k++) {
                const u = k / len;
                const att = k < sr * 0.002 ? k / (sr * 0.002) : 1;
                const dec = Math.exp(-3.8 * u);
                const fInst = f0 * (1 + 0.12 * u * u);
                ph += (TAU * fInst) / sr;
                const sig = Math.sin(ph) * 0.58 + Math.sin(ph * 1.62) * 0.24 + (R() * 2 - 1) * 0.32 * Math.exp(-5.5 * u);
                d[i0 + k] += sig * att * dec * amp * 0.85;
              }
              t += 0.072 + R() * 0.12;
            }
            return onePoleLp(d, sr, 2450);
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const g = K.gain(ctx, 0.96 * stormBoost);
          K.run(ctx, out, t0, t0 + dur, src, g);
          if (X && X.nearVerb) {
            const send = K.gain(ctx, 0.50 * stormBoost);
            src.connect(send); send.connect(X.nearVerb);
          }
        },
      },

      // 13. Hollow draft across the terracotta chimney pots (mitres de cheminée)
      chimney_gust: {
        when: (st) => (st.wind || 0) > 0.18 || (st.s || 0) > 0.2 || (st.storm || 0) > 0.15 || st.e < -0.2,
        rate: (st) => 1.5 + 3.0 * Math.max(st.wind || 0, (st.s || 0) * 0.8),
        gap: 15,
        gain: 0.44,
        pan: [-0.7, 0.7],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime, sr = ctx.sampleRate;
          const dur = 2.3 + R() * 0.6;
          const stormBoost = 1 + 0.30 * (st.storm || 0);
          const buf = K.buffer(ctx, null, dur, (n) => {
            const raw = new Float32Array(n);
            K.pinkInto(raw, 1.05, R);
            K.brownInto(raw, 0.80, 0.025, R);
            for (let i = 0; i < n; i++) {
              const u = i / n;
              const env = sinWin(u, 1.8) * (0.82 + 0.18 * Math.sin(TAU * 2.1 * u));
              raw[i] *= env;
            }
            const c1 = biquadBand(raw, sr, 215 + R() * 55, 2.3, 1.35);
            const c2 = biquadBand(raw, sr, 460 + R() * 90, 1.8, 0.85);
            const outD = new Float32Array(n);
            for (let i = 0; i < n; i++) outD[i] = c1[i] + c2[i];
            return onePoleLp(outD, sr, 820);
          });

          const src = ctx.createBufferSource();
          src.buffer = buf;
          const g = K.gain(ctx, 0.92 * stormBoost);
          K.run(ctx, out, t0, t0 + dur, src, g);
          if (X && X.farVerb) {
            const send = K.gain(ctx, 0.52 * stormBoost);
            src.connect(send); send.connect(X.farVerb);
          }
        },
      },
    },

    // Soft, organic overrides for lamp & scene sfx
    sfx: {
      match(ctx, out, R) {
        const t0 = ctx.currentTime, sr = ctx.sampleRate;
        const dur = 0.68;
        const buf = K.buffer(ctx, null, dur, (n) => {
          const d = new Float32Array(n);
          const sLen = (0.085 * sr) | 0, iS = (0.01 * sr) | 0;
          for (let k = 0; k < sLen; k++) {
            const u = k / sLen;
            const grain = 0.35 + 0.65 * Math.abs(Math.sin(Math.PI * 58 * (k / sr)));
            d[iS + k] += (R() * 2 - 1) * grain * sinWin(u, 1) * 0.48;
          }
          const fLen = (0.5 * sr) | 0, iF = (0.08 * sr) | 0;
          let lp = 0;
          for (let k = 0; k < fLen && iF + k < n; k++) {
            const u = k / fLen;
            const env = (u < 0.12 ? u / 0.12 : 1) * Math.exp(-3.4 * u);
            lp = 0.82 * lp + 0.18 * (R() * 2 - 1);
            d[iF + k] += lp * env * 0.42;
          }
          return onePoleLp(biquadBand(d, sr, 1350, 0.9, 1.1), sr, 2400);
        });
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = K.gain(ctx, 0.55);
        K.run(ctx, out, t0, t0 + dur, src, g);
      },

      puff(ctx, out, R) {
        const t0 = ctx.currentTime, sr = ctx.sampleRate;
        const dur = 0.42;
        const buf = K.buffer(ctx, null, dur, (n) => {
          const d = new Float32Array(n);
          K.pinkInto(d, 0.9, R);
          for (let i = 0; i < n; i++) {
            const u = i / n;
            const env = (u < 0.1 ? u / 0.1 : 1) * Math.exp(-4.2 * u);
            d[i] *= env * 0.45;
          }
          return onePoleLp(d, sr, 820);
        });
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hp = K.filt(ctx, 'highpass', 140, 0.7);
        const g = K.gain(ctx, 0.5);
        K.run(ctx, out, t0, t0 + dur, src, hp, g);
      },

      click(ctx, out, R) {
        const t0 = ctx.currentTime, sr = ctx.sampleRate;
        const dur = 0.08;
        const buf = K.buffer(ctx, null, dur, (n) => {
          const d = new Float32Array(n);
          for (const [tHit, amp, fMode] of [[0.003, 0.55, 220], [0.021, 0.28, 175]]) {
            const i0 = (tHit * sr) | 0, len = (0.016 * sr) | 0;
            for (let k = 0; k < len && i0 + k < n; k++) {
              const att = k < sr * 0.0015 ? k / (sr * 0.0015) : 1;
              const dec = Math.exp((-6.0 * k) / len);
              d[i0 + k] += (Math.sin((TAU * fMode * k) / sr) * 0.55 + (R() * 2 - 1) * 0.45) * att * dec * amp;
            }
          }
          return onePoleLp(d, sr, 2400);
        });
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = K.gain(ctx, 0.5);
        K.run(ctx, out, t0, t0 + dur, src, g);
      },

      bell(ctx, out, R, st, X) {
        window.SCENE_SOUNDS.paris.details.church_bell.play(ctx, out, R, st || {}, X || {});
      },

      chime(ctx, out, R, st, X) {
        const t0 = ctx.currentTime, sr = ctx.sampleRate;
        const dur = 0.65;
        const f0 = 1480 + R() * 240;
        const buf = K.buffer(ctx, null, dur, (n) => {
          const d = new Float32Array(n);
          for (let i = 0; i < n; i++) {
            const t = i / sr;
            const att = t < 0.003 ? t / 0.003 : 1;
            const sig = Math.sin(TAU * f0 * t) * Math.exp(-t / 0.14) * 0.5
              + Math.sin(TAU * f0 * 2.41 * t) * Math.exp(-t / 0.06) * 0.25;
            d[i] = sig * att * 0.35;
          }
          return onePoleLp(d, sr, 2800);
        });
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = K.gain(ctx, 0.42);
        K.run(ctx, out, t0, t0 + dur, src, g);
        if (X && X.nearVerb) {
          const send = K.gain(ctx, 0.25);
          src.connect(send); send.connect(X.nearVerb);
        }
      },

      knock(ctx, out, R, st, X) {
        const t0 = ctx.currentTime, sr = ctx.sampleRate;
        const dur = 0.18;
        const f0 = 310 + R() * 45;
        const buf = K.buffer(ctx, null, dur, (n) => {
          const d = new Float32Array(n);
          for (let i = 0; i < n; i++) {
            const t = i / sr;
            const att = t < 0.0025 ? t / 0.0025 : 1;
            const mode = Math.sin(TAU * f0 * t) * Math.exp(-t / 0.028) * 0.6
              + (R() * 2 - 1) * Math.exp(-t / 0.009) * 0.4;
            d[i] = mode * att * 0.45;
          }
          return onePoleLp(d, sr, 1200);
        });
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = K.gain(ctx, 0.45);
        K.run(ctx, out, t0, t0 + dur, src, g);
        if (X && X.nearVerb) {
          const send = K.gain(ctx, 0.25);
          src.connect(send); send.connect(X.nearVerb);
        }
      },

      owl(ctx, out, R, st, X) {
        const t0 = ctx.currentTime, sr = ctx.sampleRate;
        const dur = 1.65;
        const f0 = 370 + R() * 30;
        const buf = K.buffer(ctx, null, dur, (n) => {
          const raw = new Float32Array(n);
          for (const [s0, s1, p0, p1, a] of [[0.04, 0.48, 1.02, 0.94, 0.7], [0.88, 1.48, 1.0, 0.91, 0.55]]) {
            const i0 = (s0 * sr) | 0, len = ((s1 - s0) * sr) | 0;
            let ph = 0;
            for (let k = 0; k < len && i0 + k < n; k++) {
              const u = k / len;
              const env = sinWin(u, 1.6);
              const f = f0 * (p0 + (p1 - p0) * u);
              ph += (TAU * f) / sr;
              raw[i0 + k] += (Math.sin(ph) * 0.72 + (R() * 2 - 1) * 0.28) * env * a * 0.35;
            }
          }
          return onePoleLp(biquadBand(raw, sr, f0, 4.0, 1.2), sr, 720);
        });
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = K.gain(ctx, 0.4);
        K.run(ctx, out, t0, t0 + dur, src, g);
        if (X && X.farVerb) {
          const send = K.gain(ctx, 0.65);
          src.connect(send); send.connect(X.farVerb);
        }
      },
    },
  };
})();
