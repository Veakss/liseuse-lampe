// Liseuse à la lampe — Sound pack for scene "snow" (Neige) — Round 4 (Final)
// Outdoors at a snowy cabin on a hill; seen from a cozy wooden window seat with candles.
(function () {
  const K = window.SOUND_KIT;
  const TAU = K.TAU;

  function sendTo(src, dest, amt) {
    if (!dest || amt <= 0) return;
    const g = src.context.createGain();
    g.gain.value = amt;
    src.connect(g);
    g.connect(dest);
    return g;
  }

  // Scales detail level gently when rain, snow or storm raises the bed level,
  // keeping detail salience in the natural +1..+6 dB range across all scenarios.
  function weatherBoost(st) {
    if (!st) return 1;
    return 1 + (st.r || 0) * 0.80 + (st.storm || 0) * 0.90 + (st.s || 0) * 0.28;
  }

  // Real tawny owl (Strix aluco) call, far and soft across the snowy valley.
  // Used both as the night detail and as the sfx.owl override.
  function playTawnyOwl(ctx, out, R, st, X, isSfx = false) {
    const t0 = ctx.currentTime + 0.02;
    const fBase = 378 + R() * 44; // 378..422 Hz hollow fundamental
    const scale = isSfx ? 1.02 : 0.95;

    const callBus = K.gain(ctx, scale);
    const bodyLP = K.filt(ctx, 'lowpass', 710 + R() * 85, 1.4);
    const bodyHP = K.filt(ctx, 'highpass', 220, 0.7);
    K.chain(callBus, bodyHP, bodyLP, out);
    if (X && X.verbFar) sendTo(bodyLP, X.verbFar, 0.78);

    function owlNote(tStart, dur, f0, f1, fEnd, amp, vibHz, vibDepth) {
      const n = Math.ceil(ctx.sampleRate * (dur + 0.08));
      const sr = ctx.sampleRate;
      const buf = ctx.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      let ph1 = R() * TAU, ph2 = R() * TAU;
      let bpLow = 0, bpBand = 0;

      for (let i = 0; i < n; i++) {
        const t = i / sr;
        if (t > dur) break;
        const u = t / dur;
        const env = u < 0.14
          ? Math.sin((u / 0.14) * Math.PI * 0.5) ** 1.6
          : u < 0.68
            ? 1 - 0.12 * ((u - 0.14) / 0.54)
            : Math.cos(((u - 0.68) / 0.32) * Math.PI * 0.5) ** 1.8;

        let f = u < 0.22
          ? f0 + (f1 - f0) * Math.sin((u / 0.22) * Math.PI * 0.5)
          : f1 + (fEnd - f1) * ((u - 0.22) / 0.78) ** 1.3;

        let trem = 1;
        if (vibHz > 0 && u > 0.18) {
          const vw = Math.min(1, (u - 0.18) / 0.35);
          const vSin = Math.sin(TAU * vibHz * t);
          f *= 1 + vibDepth * vw * vSin;
          trem = 1 - 0.24 * vw * (0.5 - 0.5 * vSin);
        }

        ph1 += TAU * f / sr;
        ph2 += TAU * (f * 2.003) / sr;

        const svF = 2 * Math.sin(Math.PI * Math.min(0.25, f / sr));
        const w = (Math.random() * 2 - 1);
        bpLow += svF * bpBand;
        const bpHigh = w - bpLow - 0.14 * bpBand;
        bpBand += svF * bpHigh;

        const toneSig = Math.sin(ph1) * 0.78 + Math.sin(ph2) * 0.08;
        const breathSig = bpBand * 0.25;
        d[i] = (toneSig + breathSig) * env * trem * amp;
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(callBus);
      src.start(tStart);
      src.stop(tStart + dur + 0.06);
      src.onended = () => src.disconnect();
    }

    // Phrase 1: Long hollow "hoooo..."
    const d1 = 0.58 + R() * 0.16;
    owlNote(t0, d1, fBase * 0.95, fBase * 1.02, fBase * 0.91, 0.32, 0, 0);

    // Pause of 0.68..0.98 s, then Phrase 2: short "hoo-" followed by quivering "-hoooooou"
    const t2 = t0 + d1 + 0.68 + R() * 0.30;
    const d2 = 0.13 + R() * 0.04;
    owlNote(t2, d2, fBase * 0.97, fBase * 1.04, fBase * 0.96, 0.22, 0, 0);

    const t3 = t2 + d2 + 0.09 + R() * 0.05;
    const d3 = 0.68 + R() * 0.22;
    owlNote(t3, d3, fBase * 1.01, fBase * 0.98, fBase * 0.86, 0.29, 16.5 + R() * 3, 0.012);

    setTimeout(() => {
      try { callBus.disconnect(); bodyHP.disconnect(); bodyLP.disconnect(); } catch (e) {}
    }, (t3 - t0 + d3 + 0.5) * 1000);
  }

  window.SCENE_SOUNDS.snow = {
    bed(ctx, out, K, st) {
      // 1) verbFar: wide, snow-damped mountain valley (snow absorbs high frequencies -> damp = 0.68)
      // 2) verbNear: warm, intimate wooden window-seat & cabin eaves reflection
      const verbFar = K.reverb(ctx, out, 2.4, 2.8, 0.68, 0.38);
      const verbNear = K.reverb(ctx, out, 0.85, 4.5, 0.55, 0.24);

      // ---- Layer 1: Open snowy valley hush & pine-needle air (16 s stereo loop) ----
      const airBuf = K.loopBuffer(ctx, 'snow:valleyAir:v4', 16, (n, sr, ch) => {
        const d = new Float32Array(n);
        const R = K.rng(1009 + ch * 97);
        K.pinkInto(d, 0.88, R);
        K.brownInto(d, 0.52, 0.016, R);

        const ph0 = R() * TAU, ph1 = R() * TAU, ph2 = R() * TAU;
        let lpPine = 0, envMain = 1, envPine = 0.25;
        for (let i = 0; i < n; i++) {
          if ((i & 63) === 0) {
            const t = i / sr;
            envMain = 0.78 + 0.22 * Math.sin(TAU * t / 16 + ph0) * Math.cos(TAU * t * 2 / 16 + ph1);
            envPine = 0.20 + 0.16 * (0.5 + 0.5 * Math.sin(TAU * t * 3 / 16 + ph2));
          }
          const w = R() * 2 - 1;
          lpPine = lpPine * 0.84 + w * 0.16;
          const pineAir = (w - lpPine) * envPine * 0.18;
          d[i] = d[i] * envMain + pineAir;
        }
        return d;
      }, 0.15);

      // ---- Layer 2: Cold mountain gusts, eaves sigh & powdery spindrift (19 s stereo loop) ----
      const gustBuf = K.loopBuffer(ctx, 'snow:gusts:v4', 19, (n, sr, ch) => {
        const d = new Float32Array(n);
        const R = K.rng(2027 + ch * 131);

        const ctrlN = (n >> 6) + 2;
        const velEnv = new Float32Array(ctrlN);
        const driftEnv = new Float32Array(ctrlN);
        const p0 = R() * TAU, p1 = R() * TAU, p2 = R() * TAU;
        for (let k = 0; k < ctrlN; k++) {
          const t = (k * 64) / sr;
          const w1 = 0.5 + 0.5 * Math.sin(TAU * t / 19 + p0);
          const w2 = 0.5 + 0.5 * Math.sin(TAU * t * 2 / 19 + p1);
          const w3 = 0.5 + 0.5 * Math.cos(TAU * t * 3 / 19 + p2);
          const v = 0.20 + 0.80 * (0.45 * w1 + 0.35 * w2 + 0.20 * w3) ** 1.55;
          velEnv[k] = v;
          driftEnv[k] = Math.max(0, v - 0.30) ** 1.45;
        }

        let low1 = 0, band1 = 0, low2 = 0, band2 = 0, hpState = 0, lpDrift = 0;
        let svF1 = 0.03, svF2 = 0.07, vCur = 0.3, dCur = 0.1;

        for (let i = 0; i < n; i++) {
          if ((i & 63) === 0) {
            const idx = i >> 6;
            vCur = velEnv[idx];
            dCur = driftEnv[idx];
            const f1 = 190 + 200 * vCur;
            const f2 = 520 + 530 * vCur;
            svF1 = 2 * Math.sin(Math.PI * f1 / sr);
            svF2 = 2 * Math.sin(Math.PI * f2 / sr);
          }
          const w = R() * 2 - 1;
          low1 += svF1 * band1;
          const high1 = w - low1 - 0.34 * band1;
          band1 += svF1 * high1;

          low2 += svF2 * band2;
          const high2 = w - low2 - 0.36 * band2;
          band2 += svF2 * high2;

          hpState = hpState * 0.80 + w * 0.20;
          lpDrift = lpDrift * 0.55 + (w - hpState) * 0.45;
          const spindrift = lpDrift * dCur * 0.32;

          d[i] = (band1 * 0.52 + band2 * 0.42 + low1 * 0.28) * vCur + spindrift;
        }
        return d;
      }, 0.15);

      // ---- Layer 3: Snowfall crystalline hiss (15 s stereo loop) ----
      const snowBuf = K.loopBuffer(ctx, 'snow:snowfall:v4', 15, (n, sr, ch) => {
        const d = new Float32Array(n);
        const R = K.rng(3049 + ch * 173);
        let lpA = 0, lpB = 0;
        const ph0 = R() * TAU, ph1 = R() * TAU;
        let waft = 1;

        for (let i = 0; i < n; i++) {
          if ((i & 63) === 0) {
            const t = i / sr;
            waft = 0.72 + 0.28 * Math.sin(TAU * t / 15 + ph0) * Math.cos(TAU * t * 2 / 15 + ph1);
          }
          const w = R() * 2 - 1;
          lpA = lpA * 0.76 + w * 0.24;
          const hi = w - lpA;
          lpB = lpB * 0.52 + hi * 0.48;
          d[i] = lpB * 0.48 * waft;
        }

        let pos = Math.floor(R() * 200);
        while (pos < n - 300) {
          const gLen = 80 + Math.floor(R() * 160);
          const gAmp = 0.10 + R() * 0.18;
          let gLp = 0;
          for (let k = 0; k < gLen; k++) {
            const w = R() * 2 - 1;
            gLp = gLp * 0.68 + w * 0.32;
            const win = Math.sin((Math.PI * k) / gLen);
            d[pos + k] += (w - gLp) * win * gAmp;
          }
          pos += 100 + Math.floor(R() * 340);
        }
        return d;
      }, 0.15);

      // ---- Layer 4: Rain on cabin shingles, window glass & deep snow (17 s stereo loop) ----
      const rainBuf = K.loopBuffer(ctx, 'snow:rainOnSnow:v4', 17, (n, sr, ch) => {
        const d = new Float32Array(n);
        const R = K.rng(4073 + ch * 199);
        let brown = 0, lp = 0;
        const ph = R() * TAU;
        let swell = 1;

        for (let i = 0; i < n; i++) {
          if ((i & 63) === 0) {
            const t = i / sr;
            swell = 0.84 + 0.16 * Math.sin(TAU * t / 17 + ph);
          }
          const w = R() * 2 - 1;
          brown = (brown + 0.035 * w) / 1.035;
          lp = lp * 0.65 + (w * 0.38 + brown * 1.35) * 0.35;
          d[i] = lp * swell * 0.68;
        }

        let idx = Math.floor(R() * 400);
        while (idx < n - 600) {
          const isGlass = R() < 0.40;
          const fDrop = isGlass ? (1400 + R() * 1200) : (420 + R() * 520);
          const len = Math.floor(sr * (isGlass ? (0.003 + R() * 0.004) : (0.005 + R() * 0.006)));
          const amp = (isGlass ? 0.18 : 0.24) * (0.5 + 0.5 * R());
          const svF = 2 * Math.sin(Math.PI * fDrop / sr);
          let bL = 0, bB = 0;
          for (let k = 0; k < len; k++) {
            const w = R() * 2 - 1;
            bL += svF * bB;
            const bH = w - bL - 0.25 * bB;
            bB += svF * bH;
            const win = Math.sin((Math.PI * k) / len) ** 1.3;
            d[idx + k] += bB * win * amp;
          }
          idx += Math.floor(sr * (0.004 + R() * 0.020));
        }
        return d;
      }, 0.15);

      const sAir = K.loop(ctx, airBuf, 1.0, 0);
      const sGust = K.loop(ctx, gustBuf, 0.97, 3.7);
      const sSnow = K.loop(ctx, snowBuf, 1.03, 2.1);
      const sRain = K.loop(ctx, rainBuf, 1.0, 5.3);

      const airLP = K.filt(ctx, 'lowpass', 760, 0.55);
      const airG = K.gain(ctx, 0.36);
      K.chain(sAir, airLP, airG, out);

      const gustLP = K.filt(ctx, 'lowpass', 820, 0.65);
      const gustG = K.gain(ctx, 0.21);
      K.chain(sGust, gustLP, gustG, out);

      const snowBP = K.filt(ctx, 'bandpass', 2800, 0.55);
      const snowG = K.gain(ctx, 0.0);
      K.chain(sSnow, snowBP, snowG, out);

      const rainLP = K.filt(ctx, 'lowpass', 1900, 0.5);
      const rainG = K.gain(ctx, 0.0);
      K.chain(sRain, rainLP, rainG, out);

      let stepCount = 0;
      function applyState(s, immediate) {
        stepCount++;
        const wind = s.wind != null ? s.wind : 0.15;
        const rain = s.r || 0;
        const snow = s.s || 0;
        const storm = s.storm || 0;
        const elev = s.e != null ? s.e : 0.2;
        const dayFactor = Math.max(0, Math.min(1, (elev + 0.35) / 1.1));

        const drift1 = Math.sin(stepCount * 0.41) * 0.05 + Math.cos(stepCount * 0.17) * 0.04;
        const drift2 = Math.cos(stepCount * 0.29) * 0.06 + Math.sin(stepCount * 0.13) * 0.04;

        // 1. Open snowy valley hush: calibrated so dry short-term median sits between -30.8 (nuit) and -28.3 dBFS (neige)
        const targetAirG = (0.345 + 0.065 * dayFactor + 0.06 * wind + 0.02 * storm) * (1 + drift1);
        const targetAirF = (660 + 250 * dayFactor + 340 * wind + 180 * storm) * (1 + drift2 * 0.5);

        // 2. Cold gusts & spindrift: gentle sigh in calm dry weather, rich cold moaning wind in storm
        const targetGustG = (0.165 + 0.24 * (wind ** 1.25) + 0.055 * snow + 0.08 * storm) * (1 + drift2);
        const targetGustF = (660 + 940 * (wind ** 1.1) + 240 * snow + 300 * storm) * (1 + drift1 * 0.6);

        // 3. Snowfall crystalline hiss: velvety veil in snow, tiny frost-drift in high dry wind
        const frostDrift = (rain < 0.1 && wind > 0.22) ? (wind - 0.22) * 0.07 : 0;
        const targetSnowG = (snow * 0.30 + frostDrift) * (1 - drift1 * 0.4);

        // 4. Rain on wooden roof, window & snowpack (pluie ~ -25.2 dBFS, orage ~ -22.4 dBFS)
        const targetRainG = (rain > 0.01 ? (0.19 + 0.41 * (rain ** 0.95) + 0.03 * storm) : 0) * (1 + drift1 * 0.35);
        const targetRainF = 1480 + 1150 * rain + 280 * storm;

        if (immediate) {
          airG.gain.value = targetAirG;
          airLP.frequency.value = targetAirF;
          gustG.gain.value = targetGustG;
          gustLP.frequency.value = targetGustF;
          snowG.gain.value = targetSnowG;
          rainG.gain.value = targetRainG;
          rainLP.frequency.value = targetRainF;
        } else {
          K.glide(ctx, airG.gain, targetAirG, 1.2);
          K.glide(ctx, airLP.frequency, targetAirF, 1.4);
          K.glide(ctx, gustG.gain, targetGustG, 1.1);
          K.glide(ctx, gustLP.frequency, targetGustF, 1.3);
          K.glide(ctx, snowG.gain, targetSnowG, 1.2);
          K.glide(ctx, rainG.gain, targetRainG, 1.0);
          K.glide(ctx, rainLP.frequency, targetRainF, 1.2);
        }
      }

      applyState(st || {}, true);

      return {
        nodes: [sAir, sGust, sSnow, sRain],
        set(stNow) { applyState(stNow, false); },
        verbFar,
        verbNear,
      };
    },

    details: {
      // 1. Snow sliding off a pine branch or cabin roof eave, landing with a muffled "pouf"
      snowSlide: {
        when: () => true,
        rate: (st) => 1.3 + (st.s || 0) * 1.4 + (st.e > 0.3 ? 0.7 : 0) + (st.r || 0) * 0.85,
        gap: 13,
        gain: 0.62,
        pan: [-0.85, 0.85],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.01;
          const bus = K.gain(ctx, weatherBoost(st));
          bus.connect(out);
          if (X && X.verbNear) sendTo(bus, X.verbNear, 0.38);
          if (X && X.verbFar) sendTo(bus, X.verbFar, 0.30);

          const rustleDur = 0.12 + R() * 0.08;
          const s1 = ctx.createBufferSource();
          s1.buffer = K.noiseBuf(ctx, rustleDur, (t) => Math.sin((Math.PI * t) / rustleDur));
          const bp1 = K.filt(ctx, 'bandpass', 1150 + R() * 450, 1.3);
          const g1 = K.gain(ctx, 0.16 + R() * 0.05);
          K.run(ctx, bus, t0, t0 + rustleDur, s1, bp1, g1);

          const slideStart = t0 + 0.05 + R() * 0.05;
          const slideDur = 0.44 + R() * 0.28;
          const s2 = ctx.createBufferSource();
          s2.buffer = K.noiseBuf(ctx, slideDur, (t) => {
            const u = t / slideDur;
            return Math.sin(Math.PI * u) ** 1.25 * (0.78 + 0.22 * Math.sin(22 * t));
          });
          const bp2 = K.filt(ctx, 'bandpass', 880 + R() * 320, 0.85);
          bp2.frequency.setValueAtTime(880 + R() * 320, slideStart);
          bp2.frequency.exponentialRampToValueAtTime(240 + R() * 80, slideStart + slideDur);
          const g2 = K.gain(ctx, 0.28 + R() * 0.07);
          K.run(ctx, bus, slideStart, slideStart + slideDur, s2, bp2, g2);

          const thudStart = slideStart + slideDur * (0.65 + R() * 0.15);
          const thudDur = 0.30 + R() * 0.14;
          const s3 = ctx.createBufferSource();
          s3.buffer = K.noiseBuf(ctx, thudDur, (t) => {
            const u = t / thudDur;
            return (u < 0.14 ? Math.sin((u / 0.14) * Math.PI * 0.5) : Math.exp(-4.8 * (u - 0.14)));
          });
          const lp3 = K.filt(ctx, 'lowpass', 195 + R() * 70, 1.15);
          const g3 = K.gain(ctx, 0.54 + R() * 0.12);
          K.run(ctx, bus, thudStart, thudStart + thudDur, s3, lp3, g3);

          setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 2000);
        },
      },

      // 2. Cabin wood creak & tick (thermal contraction of the wooden window frame & rafters)
      cabinTick: {
        when: () => true,
        rate: (st) => 1.4 + (st.e < 0 ? 0.85 : 0) + (st.wind || 0) * 0.85,
        gap: 12,
        gain: 0.50,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.01;
          const bus = K.gain(ctx, weatherBoost(st));
          bus.connect(out);
          if (X && X.verbNear) sendTo(bus, X.verbNear, 0.44);

          const count = 2 + (R() < 0.45 ? 1 : 0);
          let t = t0;
          const baseF = 320 + R() * 240;

          for (let i = 0; i < count; i++) {
            const amp = (0.28 + R() * 0.08) * (i === 0 ? 0.85 : i === 1 ? 1.0 : 0.70);
            const f1 = baseF * (0.88 + R() * 0.28);
            const f2 = f1 * (2.05 + R() * 0.45);
            const len = 0.072 + R() * 0.035;
            const s = ctx.createBufferSource();
            s.buffer = K.noiseBuf(ctx, len, (x) => {
              return x < 0.003 ? (x / 0.003) : Math.exp(-x / (0.014 + R() * 0.008));
            });
            const bpA = K.filt(ctx, 'bandpass', f1, 3.5 + R() * 2.0);
            const bpB = K.filt(ctx, 'peaking', f2, 2.8);
            bpB.gain.value = 7.5;
            const lp = K.filt(ctx, 'lowpass', 2200, 0.7);
            const g = K.gain(ctx, amp);
            K.run(ctx, bus, t, t + len, s, bpA, bpB, lp, g);
            t += 0.035 + R() * 0.055;
          }
          setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 1000);
        },
      },

      // 3. Tree cracking with cold or sun-thaw expansion far off in the pine forest
      coldTreeCrack: {
        when: (st) => (st.r || 0) < 0.4,
        rate: (st) => 0.85 + (st.e < -0.1 ? 0.55 : 0) + (st.s || 0) * 0.35,
        gap: 23,
        gain: 0.60,
        pan: [-0.9, 0.9],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.01;
          const dist = 0.30 + R() * 0.45;
          const bus = K.gain(ctx, (1 - dist * 0.25) * weatherBoost(st));
          const distLP = K.filt(ctx, 'lowpass', 1600 - dist * 600, 0.85);
          K.chain(bus, distLP, out);
          if (X && X.verbFar) sendTo(distLP, X.verbFar, 0.68 + dist * 0.28);

          const fTrunk = 200 + R() * 120;
          const dur = 0.25 + R() * 0.09;
          const s1 = ctx.createBufferSource();
          s1.buffer = K.noiseBuf(ctx, dur, (t) => {
            return (t < 0.003 ? t / 0.003 : Math.exp(-t / 0.028)) + 0.32 * Math.exp(-t / 0.085);
          });
          const bp1 = K.filt(ctx, 'bandpass', fTrunk * 2.0, 2.0);
          const pk1 = K.filt(ctx, 'peaking', fTrunk, 4.0);
          pk1.gain.value = 10;
          const g1 = K.gain(ctx, 0.52);
          K.run(ctx, bus, t0, t0 + dur, s1, bp1, pk1, g1);

          const t2 = t0 + 0.04 + R() * 0.05;
          const s2 = ctx.createBufferSource();
          s2.buffer = K.noiseBuf(ctx, 0.16, (t) => (t < 0.0025 ? t / 0.0025 : Math.exp(-t / 0.022)));
          const bp2 = K.filt(ctx, 'bandpass', fTrunk * 1.55, 2.5);
          const g2 = K.gain(ctx, 0.34);
          K.run(ctx, bus, t2, t2 + 0.16, s2, bp2, g2);

          setTimeout(() => { try { bus.disconnect(); distLP.disconnect(); } catch (e) {} }, 2500);
        },
      },

      // 4. Raven calling across the snowy hillside by day ("kraa... kraa")
      raven: {
        when: (st) => st.e > -0.08 && (st.storm || 0) < 0.5 && (st.r || 0) < 0.6,
        rate: (st) => 1.15 + (st.e > 0.1 ? 0.6 : 0),
        gap: 19,
        gain: 0.60,
        pan: [-0.85, 0.85],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.02;
          const bus = K.gain(ctx, 1.05 * weatherBoost(st));
          const distLP = K.filt(ctx, 'lowpass', 1550 + R() * 350, 0.85);
          K.chain(bus, distLP, out);
          if (X && X.verbFar) sendTo(distLP, X.verbFar, 0.72);

          const calls = 2 + (R() < 0.35 ? 1 : 0);
          const f0 = 152 + R() * 34;
          const raspHz = 33 + R() * 10;
          let t = t0;

          for (let c = 0; c < calls; c++) {
            const dur = 0.21 + R() * 0.08;
            const sr = ctx.sampleRate, n = Math.ceil(sr * dur);
            const b = ctx.createBuffer(1, n, sr);
            const d = b.getChannelData(0);
            let ph = R() * TAU, rPh = R() * TAU;
            let bL1 = 0, bB1 = 0, bL2 = 0, bB2 = 0;
            const pitchDrop = 0.84 + R() * 0.08;

            for (let i = 0; i < n; i++) {
              const x = i / sr, u = x / dur;
              const env = u < 0.16
                ? Math.sin((u / 0.16) * Math.PI * 0.5) ** 1.4
                : Math.cos(((u - 0.16) / 0.84) * Math.PI * 0.5) ** 1.45;
              const f = f0 * (u < 0.28 ? 1 + 0.07 * (u / 0.28) : 1.07 * (1 - (1 - pitchDrop) * ((u - 0.28) / 0.72)));
              rPh += TAU * raspHz / sr;
              const rasp = 0.48 + 0.52 * Math.sin(rPh);
              ph += TAU * f * (1 + 0.03 * Math.sin(rPh)) / sr;

              const pulse = Math.tanh(2.5 * Math.sin(ph) + 1.3 * Math.sin(2 * ph)) * rasp;
              const excite = pulse * 0.72 + (Math.random() * 2 - 1) * (0.42 + 0.32 * rasp);

              const ff1 = (620 - 110 * u) * (1 + (c * -0.04));
              const ff2 = (1280 - 220 * u) * (1 + (c * -0.04));
              const sv1 = 2 * Math.sin(Math.PI * ff1 / sr);
              const sv2 = 2 * Math.sin(Math.PI * ff2 / sr);

              bL1 += sv1 * bB1;
              bB1 += sv1 * (excite - bL1 - 0.21 * bB1);
              bL2 += sv2 * bB2;
              bB2 += sv2 * (excite - bL2 - 0.23 * bB2);

              d[i] = (bB1 * 0.58 + bB2 * 0.42) * env * 0.52;
            }

            const src = ctx.createBufferSource();
            src.buffer = b;
            const g = K.gain(ctx, 0.95 * (1 - c * 0.13));
            K.run(ctx, bus, t, t + dur, src, g);
            t += dur + 0.13 + R() * 0.16;
          }

          setTimeout(() => { try { bus.disconnect(); distLP.disconnect(); } catch (e) {} }, 2500);
        },
      },

      // 5. Bullfinch / boreal tit (bouvreuil pivoine / mésange boréale) in the snow-laden firs by day
      winterTit: {
        when: (st) => st.e > 0.05 && (st.r || 0) < 0.45 && (st.storm || 0) < 0.3,
        rate: (st) => (st.h < 11 ? 1.45 : 1.0) * (1 - (st.s || 0) * 0.25),
        gap: 16,
        gain: 0.42,
        pan: [-0.85, 0.85],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.02;
          const bus = K.gain(ctx, 0.85 * weatherBoost(st));
          const lp = K.filt(ctx, 'lowpass', 2150, 0.85);
          const hp = K.filt(ctx, 'highpass', 900, 0.7);
          K.chain(bus, hp, lp, out);
          if (X && X.verbFar) sendTo(lp, X.verbFar, 0.72);

          // Soft, distant bullfinch piping notes (1380..1760 Hz) shaped through a warm vocal-tract filter
          const notes = 2 + (R() < 0.35 ? 1 : 0);
          const baseF = 1380 + R() * 360;
          let t = t0;

          for (let i = 0; i < notes; i++) {
            const dur = 0.16 + R() * 0.06;
            const sr = ctx.sampleRate, n = Math.ceil(sr * dur);
            const b = ctx.createBuffer(1, n, sr);
            const d = b.getChannelData(0);
            const fStart = baseF * (i === 0 ? 1.0 : i === 1 ? (0.89 + R() * 0.05) : 0.94);
            const fPeak = fStart * (1.03 + R() * 0.02);
            const fEnd = fStart * (0.92 + R() * 0.03);
            const svF = 2 * Math.sin(Math.PI * Math.min(0.32, fStart / sr));
            let ph = R() * TAU, bL = 0, bB = 0;

            for (let k = 0; k < n; k++) {
              const x = k / sr, u = k / n;
              const env = u < 0.24
                ? Math.sin((u / 0.24) * Math.PI * 0.5) ** 1.7
                : Math.cos(((u - 0.24) / 0.76) * Math.PI * 0.5) ** 1.6;
              const f = (u < 0.30
                ? fStart + (fPeak - fStart) * Math.sin((u / 0.30) * Math.PI * 0.5)
                : fPeak + (fEnd - fPeak) * ((u - 0.30) / 0.70) ** 1.25) * (1 + 0.008 * Math.sin(TAU * 14 * x));
              ph += TAU * f / sr;
              const w = Math.random() * 2 - 1;
              bL += svF * bB;
              const bH = w - bL - 0.16 * bB;
              bB += svF * bH;
              const syrinx = Math.sin(ph) * 0.46 + Math.sin(2 * ph + 0.5) * 0.11 + bB * 0.14;
              d[k] = syrinx * env * 0.34;
            }

            const src = ctx.createBufferSource();
            src.buffer = b;
            const g = K.gain(ctx, 0.90 - i * 0.14);
            K.run(ctx, bus, t, t + dur, src, g);
            t += dur + 0.12 + R() * 0.15;
          }

          setTimeout(() => { try { bus.disconnect(); hp.disconnect(); lp.disconnect(); } catch (e) {} }, 2000);
        },
      },

      // 6. Tawny owl at dusk and night in the fir trees
      tawnyOwl: {
        when: (st) => st.e < -0.01 && (st.storm || 0) < 0.45 && (st.r || 0) < 0.55,
        rate: (st) => st.e < -0.25 ? 1.45 : 0.95,
        gap: 22,
        gain: 0.42,
        pan: [-0.65, 0.85],
        play(ctx, out, R, st, X) {
          playTawnyOwl(ctx, out, R, st, X, false);
        },
      },

      // 7. Distant dog barking very far away near one of the valley chalets
      distantDog: {
        when: (st) => (st.r || 0) < 0.4 && (st.storm || 0) < 0.3 && st.e > -0.65 && st.e < 0.9,
        rate: () => 0.85,
        gap: 28,
        gain: 0.52,
        pan: [-0.65, 0.55],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.02;
          const bus = K.gain(ctx, 1.0);
          const distLP = K.filt(ctx, 'lowpass', 980 + R() * 160, 0.85);
          const distHP = K.filt(ctx, 'highpass', 240, 0.7);
          K.chain(bus, distHP, distLP, out);
          if (X && X.verbFar) sendTo(distLP, X.verbFar, 0.85);

          const barks = 2 + (R() < 0.35 ? 1 : 0);
          const fPitch = 310 + R() * 55;
          let t = t0;

          for (let b = 0; b < barks; b++) {
            const dur = 0.14 + R() * 0.04;
            const sr = ctx.sampleRate, n = Math.ceil(sr * dur);
            const buf = ctx.createBuffer(1, n, sr);
            const d = buf.getChannelData(0);
            let ph = R() * TAU, bL = 0, bB = 0;

            for (let i = 0; i < n; i++) {
              const u = i / n;
              const env = u < 0.18
                ? Math.sin((u / 0.18) * Math.PI * 0.5) ** 1.3
                : Math.cos(((u - 0.18) / 0.82) * Math.PI * 0.5) ** 1.6;
              const arch = u < 0.32 ? (u / 0.32) : 1 - 0.85 * ((u - 0.32) / 0.68);
              const f = fPitch * (0.88 + 0.32 * arch);
              ph += TAU * f / sr;
              const glottal = Math.tanh(2.1 * Math.sin(ph) + 1.1 * Math.sin(2 * ph)) * 0.65 + (Math.random() * 2 - 1) * 0.45;
              const svF = 2 * Math.sin(Math.PI * (640 + 180 * arch) / sr);
              bL += svF * bB;
              bB += svF * (glottal - bL - 0.24 * bB);
              d[i] = bB * env * 0.54;
            }

            const src = ctx.createBufferSource();
            src.buffer = buf;
            const g = K.gain(ctx, 0.94 * (1 - b * 0.14));
            K.run(ctx, bus, t, t + dur, src, g);
            t += dur + 0.16 + R() * 0.18;
          }

          setTimeout(() => { try { bus.disconnect(); distHP.disconnect(); distLP.disconnect(); } catch (e) {} }, 2500);
        },
      },

      // 8. Localized pine breeze & spindrift flurry brushing the close fir trees
      pineBreeze: {
        when: () => true,
        rate: (st) => 1.2 + (st.wind || 0) * 1.45 + (st.s || 0) * 0.8,
        gap: 14,
        gain: 0.56,
        pan: [-0.85, 0.85],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.02;
          const dur = 1.5 + R() * 1.0;
          const bus = K.gain(ctx, 1.0 * weatherBoost(st));
          bus.connect(out);
          if (X && X.verbFar) sendTo(bus, X.verbFar, 0.35);

          const s = ctx.createBufferSource();
          s.buffer = K.noiseBuf(ctx, dur, (t) => {
            const u = t / dur;
            return Math.sin(Math.PI * u) ** 1.7 * (0.82 + 0.18 * Math.sin(11 * t));
          });
          const fStart = 680 + R() * 320;
          const fPeak = fStart * (1.35 + R() * 0.35);
          const bp = K.filt(ctx, 'bandpass', fStart, 1.35);
          bp.frequency.setValueAtTime(fStart, t0);
          bp.frequency.exponentialRampToValueAtTime(fPeak, t0 + dur * 0.45);
          bp.frequency.exponentialRampToValueAtTime(fStart * 0.85, t0 + dur);
          const lp = K.filt(ctx, 'lowpass', 2100, 0.7);
          const g = K.gain(ctx, 0.30 + R() * 0.07);
          K.run(ctx, bus, t0, t0 + dur, s, bp, lp, g);

          setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, (dur + 0.5) * 1000);
        },
      },

      // 9. Cozy hearth / wood-stove ember settle inside the cabin
      hearthSettle: {
        when: (st) => st.e < 0.45 || (st.s || 0) > 0.2 || (st.r || 0) > 0.2,
        rate: (st) => 1.0 + (st.e < 0 ? 0.55 : 0),
        gap: 17,
        gain: 0.58,
        pan: [-0.55, 0.35],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.01;
          const bus = K.gain(ctx, 1.05 * weatherBoost(st));
          bus.connect(out);
          if (X && X.verbNear) sendTo(bus, X.verbNear, 0.40);

          const sighDur = 0.40 + R() * 0.18;
          const s1 = ctx.createBufferSource();
          s1.buffer = K.noiseBuf(ctx, sighDur, (t) => {
            const u = t / sighDur;
            return u < 0.15 ? Math.sin((u / 0.15) * Math.PI * 0.5) : Math.exp(-3.8 * (u - 0.15));
          });
          const lp1 = K.filt(ctx, 'lowpass', 320 + R() * 110, 1.15);
          const g1 = K.gain(ctx, 0.42);
          K.run(ctx, bus, t0, t0 + sighDur, s1, lp1, g1);

          const pops = 2 + (R() < 0.5 ? 1 : 0);
          for (let i = 0; i < pops; i++) {
            const tp = t0 + 0.03 + R() * 0.26;
            const pDur = 0.034 + R() * 0.018;
            const sp = ctx.createBufferSource();
            sp.buffer = K.noiseBuf(ctx, pDur, (t) => (t < 0.002 ? t / 0.002 : Math.exp(-t / 0.006)));
            const bp = K.filt(ctx, 'bandpass', 1100 + R() * 850, 2.2);
            const gp = K.gain(ctx, 0.20 + R() * 0.07);
            K.run(ctx, bus, tp, tp + pDur, sp, bp, gp);
          }

          setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 1200);
        },
      },

      // 10. Sleet grains brushing the window pane (in snow), eaves rain drops (in rain), or sunny icicle thaw drops (at midi)
      windowSleet: {
        when: (st) => (st.s || 0) > 0.15 || (st.r || 0) > 0.15 || (st.storm || 0) > 0.15 || st.e > 0.55,
        rate: (st) => 1.1 + (st.s || 0) * 1.5 + (st.r || 0) * 1.4 + (st.storm || 0) * 1.2 + (st.e > 0.55 ? 0.45 : 0),
        gap: 11,
        gain: 0.60,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.01;
          const bus = K.gain(ctx, 1.05 * weatherBoost(st));
          bus.connect(out);
          if (X && X.verbNear) sendTo(bus, X.verbNear, 0.36);

          const isSnowy = (st.s || 0) > 0.15 && (st.s || 0) >= (st.r || 0);
          if (isSnowy) {
            const grains = 5 + Math.floor(R() * 5);
            let t = t0;
            for (let i = 0; i < grains; i++) {
              const gDur = 0.028 + R() * 0.015;
              const s = ctx.createBufferSource();
              s.buffer = K.noiseBuf(ctx, gDur, (x) => (x < 0.002 ? x / 0.002 : Math.exp(-x / 0.005)));
              const bp = K.filt(ctx, 'bandpass', 1850 + R() * 1300, 2.8);
              const lp = K.filt(ctx, 'lowpass', 3600, 0.7);
              const g = K.gain(ctx, 0.22 + R() * 0.08);
              K.run(ctx, bus, t, t + gDur, s, bp, lp, g);
              t += 0.032 + R() * 0.075;
            }
          } else {
            const drops = 3 + Math.floor(R() * 3);
            let t = t0;
            for (let i = 0; i < drops; i++) {
              const dDur = 0.055 + R() * 0.025;
              const fDrop = 480 + R() * 340;
              const s = ctx.createBufferSource();
              s.buffer = K.noiseBuf(ctx, dDur, (x) => (x < 0.0025 ? x / 0.0025 : Math.exp(-x / 0.010)));
              const bp = K.filt(ctx, 'bandpass', fDrop, 3.6);
              bp.frequency.setValueAtTime(fDrop * 0.9, t);
              bp.frequency.exponentialRampToValueAtTime(fDrop * 1.25, t + 0.022);
              const lp = K.filt(ctx, 'lowpass', 1850, 0.7);
              const g = K.gain(ctx, 0.32 + R() * 0.08);
              K.run(ctx, bus, t, t + dDur, s, bp, lp, g);
              t += 0.08 + R() * 0.15;
            }
          }

          setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 1500);
        },
      },
    },

    // ---- Replacements for the sounds the scene's picture triggers itself ----
    sfx: {
      // Fairy-lights / cabin lamp switch: warm wooden/bakelite toggle, soft and short
      click(ctx, out, R, st, X) {
        const t0 = ctx.currentTime + 0.005;
        const bus = K.gain(ctx, 1.10);
        bus.connect(out);
        if (X && X.verbNear) sendTo(bus, X.verbNear, 0.26);

        const s1 = ctx.createBufferSource();
        s1.buffer = K.noiseBuf(ctx, 0.042, (t) => (t < 0.002 ? t / 0.002 : Math.exp(-t / 0.006)));
        const bp1 = K.filt(ctx, 'bandpass', 1300 + R() * 350, 2.2);
        const pk1 = K.filt(ctx, 'peaking', 260 + R() * 70, 3.0);
        pk1.gain.value = 8;
        const lp1 = K.filt(ctx, 'lowpass', 3200, 0.7);
        const g1 = K.gain(ctx, 0.30);
        K.run(ctx, bus, t0, t0 + 0.042, s1, bp1, pk1, lp1, g1);

        const t2 = t0 + 0.018 + R() * 0.01;
        const s2 = ctx.createBufferSource();
        s2.buffer = K.noiseBuf(ctx, 0.034, (t) => (t < 0.002 ? t / 0.002 : Math.exp(-t / 0.0065)));
        const bp2 = K.filt(ctx, 'bandpass', 920 + R() * 240, 2.4);
        const g2 = K.gain(ctx, 0.18);
        K.run(ctx, bus, t2, t2 + 0.034, s2, bp2, g2);

        setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 400);
      },

      // Match struck to light the window-sill candles
      match(ctx, out, R, st, X) {
        const t0 = ctx.currentTime + 0.005;
        const bus = K.gain(ctx, 1.12);
        bus.connect(out);
        if (X && X.verbNear) sendTo(bus, X.verbNear, 0.28);

        const strokeLen = 0.095 + R() * 0.045;
        const grainRate = 48 + R() * 28;
        const sStroke = ctx.createBufferSource();
        sStroke.buffer = K.noiseBuf(ctx, strokeLen, (t) => {
          const u = t / strokeLen;
          const env = Math.sin(Math.PI * u) ** 1.2;
          const grain = 0.42 + 0.58 * Math.abs(Math.sin(Math.PI * grainRate * t));
          return env * grain;
        });
        const bpStroke = K.filt(ctx, 'bandpass', 1950, 1.5);
        bpStroke.frequency.setValueAtTime(2100, t0);
        bpStroke.frequency.exponentialRampToValueAtTime(1250, t0 + strokeLen);
        const lpStroke = K.filt(ctx, 'lowpass', 3400, 0.7);
        const gStroke = K.gain(ctx, 0.32);
        K.run(ctx, bus, t0, t0 + strokeLen, sStroke, bpStroke, lpStroke, gStroke);

        const tFlare = t0 + strokeLen - 0.015;
        const flareLen = 0.48 + R() * 0.12;
        const sFlare = ctx.createBufferSource();
        sFlare.buffer = K.noiseBuf(ctx, flareLen, (t) => {
          return t < 0.045 ? Math.sin((t / 0.045) * Math.PI * 0.5) ** 1.4 : Math.exp(-(t - 0.045) / 0.12);
        });
        const hpFlare = K.filt(ctx, 'highpass', 160, 0.7);
        const lpFlare = K.filt(ctx, 'lowpass', 1850, 0.8);
        lpFlare.frequency.setValueAtTime(1850, tFlare);
        lpFlare.frequency.exponentialRampToValueAtTime(780, tFlare + flareLen * 0.85);
        const gFlare = K.gain(ctx, 0.26);
        K.run(ctx, bus, tFlare, tFlare + flareLen, sFlare, hpFlare, lpFlare, gFlare);

        const snaps = 3 + Math.floor(R() * 3);
        for (let i = 0; i < snaps; i++) {
          const ts = tFlare + 0.05 + R() * 0.32;
          const sSnap = ctx.createBufferSource();
          sSnap.buffer = K.noiseBuf(ctx, 0.02, (t) => (t < 0.0018 ? t / 0.0018 : Math.exp(-t / 0.0035)));
          const bpSnap = K.filt(ctx, 'bandpass', 1600 + R() * 1100, 2.4);
          const gSnap = K.gain(ctx, 0.10 + R() * 0.05);
          K.run(ctx, bus, ts, ts + 0.02, sSnap, bpSnap, gSnap);
        }

        setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 1200);
      },

      // Soft breath blowing out the window-sill candles
      puff(ctx, out, R, st, X) {
        const t0 = ctx.currentTime + 0.005;
        const dur = 0.38 + R() * 0.08;
        const bus = K.gain(ctx, 1.18);
        bus.connect(out);
        if (X && X.verbNear) sendTo(bus, X.verbNear, 0.24);

        const s = ctx.createBufferSource();
        s.buffer = K.noiseBuf(ctx, dur, (t) => {
          return t < 0.038 ? Math.sin((t / 0.038) * Math.PI * 0.5) ** 1.5 : Math.exp(-(t - 0.038) / 0.075);
        });
        const hp = K.filt(ctx, 'highpass', 140, 0.7);
        const lp = K.filt(ctx, 'lowpass', 920 + R() * 140, 0.9);
        lp.frequency.setValueAtTime(920 + R() * 140, t0);
        lp.frequency.exponentialRampToValueAtTime(340, t0 + dur * 0.85);
        const g = K.gain(ctx, 0.25);
        K.run(ctx, bus, t0, t0 + dur, s, hp, lp, g);

        setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 800);
      },

      // Night owl triggered by the owl perched on the right fir tree
      owl(ctx, out, R, st, X) {
        playTawnyOwl(ctx, out, R, st, X, true);
      },
    },
  };
})();
