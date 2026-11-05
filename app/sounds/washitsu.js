// Liseuse à la lampe — Sound pack: washitsu (Chambre japonaise) — Round 4
(function () {
  const TAU = Math.PI * 2;

  // Weather presence multiplier so details remain clearly articulate (+1.5 to +5.5 dB salience)
  // even when rain (st.r) or storm (st.storm) raises the bed level, while keeping peaks well below -6 dBFS.
  function weatherBoost(st, maxBoost = 1.65) {
    if (!st) return 1.0;
    return Math.min(maxBoost, 1.0 + 0.36 * (st.r || 0) + 0.44 * (st.storm || 0));
  }

  // Helper: hollow bamboo clapper (shishi-odoshi) tipping water and striking the wet garden stone ("kako! ... ko").
  // Uses noise-excited modal bandpass resonators + woody shell transient + water spill + secondary bounce.
  function playShishiOdoshi(ctx, out, K, R, st, X, withWaterSpill = true) {
    const t0 = ctx.currentTime;
    const wb = weatherBoost(st, 1.45);
    const send = X && X.gardenVerb;
    const bus = K.gain(ctx, wb);
    bus.connect(out);
    if (send) {
      const sg = K.gain(ctx, 0.42);
      bus.connect(sg);
      sg.connect(send);
    }

    let tStrike = t0 + 0.01;
    if (withWaterSpill) {
      // 1. Water tipping out of the cut bamboo tube onto the stone basin (tsukubai)
      const spillDur = 0.32 + R() * 0.08;
      tStrike = t0 + spillDur * 0.84;
      const sSpill = ctx.createBufferSource();
      sSpill.buffer = K.buffer(ctx, null, spillDur + 0.12, (n, sr) => {
        const d = new Float32Array(n);
        K.pinkInto(d, 1.0, R);
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const x = Math.min(1, t / spillDur);
          const env = Math.sin(Math.PI * x) ** 1.2 * Math.exp(-0.9 * x);
          const splashMod = 0.70 + 0.30 * Math.sin(TAU * 22 * t + Math.sin(TAU * 5 * t));
          d[i] *= env * splashMod;
        }
        return d;
      });
      const bpSpill = K.filt(ctx, 'bandpass', 940 + R() * 220, 1.15);
      const lpSpill = K.filt(ctx, 'lowpass', 2400, 0.7);
      const gSpill = K.gain(ctx, 0.56);
      bpSpill.frequency.setValueAtTime(720, t0);
      bpSpill.frequency.exponentialRampToValueAtTime(1420, t0 + spillDur * 0.75);
      K.run(ctx, bus, t0, t0 + spillDur + 0.12, sSpill, bpSpill, lpSpill, gSpill);

      // 2-3 liquid splashes/drops during the spill
      const nDrops = 2 + ((R() * 2) | 0);
      for (let i = 0; i < nDrops; i++) {
        const td = t0 + 0.04 + i * (0.065 + R() * 0.045);
        playWaterPlip(ctx, bus, K, R, td, 740 + R() * 600, 0.16 * (0.8 + 0.2 * R()));
      }
    }

    // 2. Main hollow bamboo strike back onto the wet stone rest ("kako!")
    const f0 = 388 + R() * 46; // Hollow bamboo tube cavity resonance (~388-434 Hz)
    triggerBambooHit(ctx, bus, K, R, tStrike, f0, 1.28);

    // 3. Secondary bounce/settle on the stone block (82% of the time, 88-130 ms later)
    if (R() < 0.82) {
      const dt = 0.088 + R() * 0.042;
      triggerBambooHit(ctx, bus, K, R, tStrike + dt, f0 * (1.025 + R() * 0.015), 0.38 + R() * 0.12);
    }
  }

  function triggerBambooHit(ctx, dest, K, R, t, f0, scale) {
    // A. Crisp woody-on-stone contact transient (shaped noise through dual wooden formants)
    const sWood = ctx.createBufferSource();
    sWood.buffer = K.noiseBuf(ctx, 0.10, (x) => Math.exp(-x * 38));
    const bpWood = K.filt(ctx, 'bandpass', f0 * 2.1, 2.4);
    const pkWood = K.filt(ctx, 'peaking', f0 * 3.4, 2.2);
    pkWood.gain.value = 7.5;
    const lpWood = K.filt(ctx, 'lowpass', 3200, 0.7);
    const gWood = K.gain(ctx, 0);
    gWood.gain.setValueAtTime(0, t);
    gWood.gain.linearRampToValueAtTime(0.72 * scale, t + 0.0025);
    gWood.gain.setTargetAtTime(0, t + 0.0028, 0.018);
    K.run(ctx, dest, t, t + 0.10, sWood, bpWood, pkWood, lpWood, gWood);

    // B. Wet stone block thud (low-mid stone mass impulse)
    const sStone = ctx.createBufferSource();
    sStone.buffer = K.noiseBuf(ctx, 0.08, (x) => Math.exp(-x * 48));
    const bpStone = K.filt(ctx, 'bandpass', 215 + R() * 30, 1.9);
    const gStone = K.gain(ctx, 0.50 * scale);
    K.run(ctx, dest, t, t + 0.08, sStone, bpStone, gStone);

    // C. Noise-excited high-Q modal resonators for the hollow bamboo cylinder ("ka-ko" woody tube ring)
    const modalRatios = [
      [1.0, 13, 0.74, 0.056],
      [1.58 + (R() - 0.5) * 0.03, 15, 0.56, 0.042],
      [2.41 + (R() - 0.5) * 0.04, 13, 0.36, 0.028],
    ];
    for (const [ratio, q, amp, tau] of modalRatios) {
      const fm = f0 * ratio;
      const sm = ctx.createBufferSource();
      sm.buffer = K.noiseBuf(ctx, 0.17, (x) => Math.exp(-x / tau));
      const bpm = K.filt(ctx, 'bandpass', fm, q);
      const gm = K.gain(ctx, amp * scale);
      K.run(ctx, dest, t, t + 0.17, sm, bpm, gm);
    }

    // D. Coupled woody cavity air-column modes (short decay, slight downward pitch settle on impact)
    const bodyModes = [
      [1.0, 0.34, 0.046, 0.94],
      [1.58, 0.20, 0.032, 0.97],
      [2.41, 0.11, 0.019, 0.99],
    ];
    for (const [mult, amp, dec, bend] of bodyModes) {
      const fm = f0 * mult;
      K.tone(ctx, dest, t, fm, amp * scale, 0.0025, dec, 'sine', fm * bend);
    }
  }

  // Minnaert bubble water droplet resonance: noise-impulse + short upward-inflecting cavity filter
  function playWaterPlip(ctx, dest, K, R, t, f, amp) {
    // 1. Liquid surface impact (bandpass noise burst with upward pitch inflection)
    const s = ctx.createBufferSource();
    s.buffer = K.noiseBuf(ctx, 0.052, (x) => Math.exp(-x * 78));
    const bp = K.filt(ctx, 'bandpass', f, 6.5);
    bp.frequency.setValueAtTime(f * 0.85, t);
    bp.frequency.exponentialRampToValueAtTime(f * 1.30, t + 0.030);
    const g = K.gain(ctx, amp * 2.9);
    K.run(ctx, dest, t, t + 0.052, s, bp, g);

    // 2. Soft bubble cavity pinch
    const o = ctx.createOscillator();
    const go = K.gain(ctx, 0);
    const lpo = K.filt(ctx, 'lowpass', 2400, 0.7);
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 0.90, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.26, t + 0.024);
    go.gain.setValueAtTime(0, t);
    go.gain.linearRampToValueAtTime(amp * 1.0, t + 0.0025);
    go.gain.setTargetAtTime(0, t + 0.003, 0.008);
    K.run(ctx, dest, t, t + 0.058, o, lpo, go);
  }

  // Edo-furin (hand-blown glass wind bell hanging under the wooden eaves)
  // Combines paper tanzaku rustle, wooden clapper click, high-Q modal glass air, and short shimmering doublets.
  function playFurin(ctx, out, K, R, st, X) {
    const t0 = ctx.currentTime;
    const wb = weatherBoost(st, 1.35);
    const bus = K.gain(ctx, wb * 1.22);
    const lpWarm = K.filt(ctx, 'lowpass', 4300, 0.6);
    K.chain(bus, lpWarm, out);
    if (X && X.roomVerb) {
      const sr = K.gain(ctx, 0.32);
      lpWarm.connect(sr);
      sr.connect(X.roomVerb);
    }
    if (X && X.gardenVerb) {
      const sg = K.gain(ctx, 0.30);
      lpWarm.connect(sg);
      sg.connect(X.gardenVerb);
    }

    // 1. Paper strip (tanzaku) catching the breeze before the clapper touches the glass
    const sPaper = ctx.createBufferSource();
    const pDur = 0.19 + R() * 0.13;
    sPaper.buffer = K.noiseBuf(ctx, pDur, (x) => Math.sin(Math.PI * Math.min(1, x / pDur)) ** 1.4);
    const bpPaper = K.filt(ctx, 'bandpass', 1750 + R() * 520, 1.4);
    const gPaper = K.gain(ctx, 0.18);
    K.run(ctx, bus, t0, t0 + pDur, sPaper, bpPaper, gPaper);

    // 2. 1 to 3 gentle strikes of the wooden bead against the blown-glass rim
    const baseF = 1980 + R() * 380; // Crystalline blown-glass register (1980-2360 Hz)
    const nStrikes = 1 + ((R() * 2.2) | 0);
    let t = t0 + 0.038 + R() * 0.035;
    for (let i = 0; i < nStrikes; i++) {
      const vel = (i === 0 ? 0.90 + 0.10 * R() : 0.48 + 0.35 * R()) / (1 + i * 0.35);

      // A. Bead-on-glass wooden/terracotta contact transient
      const sClick = ctx.createBufferSource();
      sClick.buffer = K.noiseBuf(ctx, 0.034, (x) => Math.exp(-x * 115));
      const bpClick = K.filt(ctx, 'bandpass', baseF * 1.28, 2.8);
      const gClick = K.gain(ctx, 0.34 * vel);
      K.run(ctx, bus, t, t + 0.034, sClick, bpClick, gClick);

      // B. Modal glass resonance (noise-excited high-Q bandpass pair for authentic blown-glass texture)
      const sAir = ctx.createBufferSource();
      sAir.buffer = K.noiseBuf(ctx, 0.28, (x) => Math.exp(-x * 12));
      const bpAir = K.filt(ctx, 'bandpass', baseF, 26);
      const pkAir = K.filt(ctx, 'peaking', baseF * 2.34, 18);
      pkAir.gain.value = 9;
      const gAir = K.gain(ctx, 0.32 * vel);
      K.run(ctx, bus, t, t + 0.28, sAir, bpAir, pkAir, gAir);

      // C. Short, delicate inharmonic glass partials with doublet beating (shorter decay so never pure-sine)
      const partials = [
        [1.0, 1.0052, 0.088, 0.17],
        [2.34, 2.352, 0.038, 0.09],
        [3.91, 3.928, 0.015, 0.045],
      ];
      for (const [m1, m2, amp, dec] of partials) {
        const det = 1 + (R() - 0.5) * 0.005;
        const f1 = baseF * m1 * det;
        const f2 = baseF * m2 * det;
        K.tone(ctx, bus, t, f1, amp * vel, 0.0025, dec, 'sine', f1 * 0.997);
        K.tone(ctx, bus, t, f2, amp * 0.68 * vel, 0.003, dec * 0.85, 'sine', f2 * 0.997);
      }

      // Occasional soft secondary rim graze 35-50 ms after first strike
      if (R() < 0.45 && i === 0) {
        const tg = t + 0.038 + R() * 0.016;
        K.tone(ctx, bus, tg, baseF * 1.003, 0.032 * vel, 0.002, 0.10, 'sine');
      }

      t += 0.18 + R() * 0.24;
    }
  }

  window.SCENE_SOUNDS.washitsu = {
    bed(ctx, out, K, st) {
      const nodes = [];
      const roomVerb = K.reverb(ctx, out, 1.15, 4.2, 0.68, 0.25);
      const gardenVerb = K.reverb(ctx, out, 1.90, 3.1, 0.54, 0.30);

      // ---- 1. WATER TRICKLE (kakehi bamboo spout into tsukubai stone basin, 17.3 s loop, right side) ----
      const waterBuf = K.loopBuffer(ctx, 'washitsu:water:v4', 17.3, (n, sr, ch) => {
        const R = K.rng(1041 + ch * 97);
        const d = new Float32Array(n);
        const pink = new Float32Array(n);
        K.pinkInto(pink, 0.75, R);
        K.brownInto(d, 0.45, 0.032, R);

        let lp1 = 0, lp2 = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const flow =
            0.74 +
            0.15 * Math.sin((TAU * t) / 5.77 + ch * 0.8) +
            0.11 * Math.sin((TAU * t) / 3.46 + 1.2);
          const ripple = 0.86 + 0.14 * Math.sin((TAU * t) / 0.29 + Math.sin(t * 2.3) * 1.8);
          const x = pink[i] * flow * ripple;
          lp1 = 0.78 * lp1 + 0.22 * x;
          lp2 = 0.93 * lp2 + 0.07 * lp1;
          const streamBand = lp1 - lp2;
          d[i] = d[i] * 0.38 + streamBand * 1.45;
        }

        // Sparse, soft noise-filtered water-drop splashes woven lightly into the stream
        let tDrop = 0.25 + ch * 0.15;
        while (tDrop < n / sr - 0.25) {
          const i0 = (tDrop * sr) | 0;
          const dur = 0.010 + R() * 0.012;
          const len = (dur * sr) | 0;
          const amp = (0.032 + R() * 0.058) * (ch === 1 ? 1.15 : 0.65);
          let bp = 0, lp = 0;
          const a = 0.18 + R() * 0.22;
          for (let k = 0; k < len && i0 + k < n; k++) {
            const u = k / len;
            const w = R() * 2 - 1;
            lp = (1 - a) * lp + a * w;
            bp = 0.85 * bp + 0.15 * (w - lp);
            const env = Math.sin(Math.PI * u) * Math.exp(-2.8 * u);
            d[i0 + k] += bp * amp * env * 2.0;
          }
          tDrop += 0.14 + R() * 0.26;
        }
        return d;
      });
      const sWater = K.loop(ctx, waterBuf, 1, 0);
      const hpWater = K.filt(ctx, 'highpass', 250, 0.7);
      const lpWater = K.filt(ctx, 'lowpass', 1950, 0.6);
      const pWater = K.pan(ctx, 0.62);
      const gWater = K.gain(ctx, 0.30);
      K.chain(sWater, hpWater, lpWater, gWater, pWater, out);
      nodes.push(sWater);

      // ---- 2. ROOM AIR & GARDEN BREEZE IN BAMBOO/MAPLE LEAVES (21.7 s loop, wide stereo) ----
      const breezeBuf = K.loopBuffer(ctx, 'washitsu:breeze:v4', 21.7, (n, sr, ch) => {
        const R = K.rng(2083 + ch * 131);
        const d = new Float32Array(n);
        const pink = new Float32Array(n);
        K.brownInto(d, ch === 0 ? 1.15 : 0.80, 0.024, R);
        K.pinkInto(pink, ch === 1 ? 1.0 : 0.60, R);

        let lp = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const swell =
            0.60 +
            0.23 * Math.sin((TAU * t) / 10.85 + ch * 1.1) +
            0.17 * Math.sin((TAU * t) / 7.23 + 2.4 - ch * 0.7);
          const flutter = 0.88 + 0.12 * Math.sin((TAU * t) / 0.43 + Math.sin(t * 1.7) * 2.0);
          lp = 0.87 * lp + 0.13 * pink[i];
          const leafHiss = (pink[i] - lp) * swell * flutter;
          d[i] = d[i] * (0.72 + 0.28 * swell) + leafHiss * (ch === 1 ? 0.95 : 0.45);
        }
        return d;
      });
      const sBreeze = K.loop(ctx, breezeBuf, 1, 3.1);
      const bpBreeze = K.filt(ctx, 'bandpass', 480, 0.6);
      const lpBreeze = K.filt(ctx, 'lowpass', 1550, 0.5);
      const gBreeze = K.gain(ctx, 0.28);
      K.chain(sBreeze, bpBreeze, lpBreeze, gBreeze, out);
      nodes.push(sBreeze);

      // ---- 3. GARDEN ATMOSPHERE (distant midday summer canopy / evening garden air, 19.1 s loop) ----
      const gardenBuf = K.loopBuffer(ctx, 'washitsu:garden:v4', 19.1, (n, sr, ch) => {
        const R = K.rng(3067 + ch * 193);
        const d = new Float32Array(n);
        K.pinkInto(d, 0.95, R);
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const wave =
            0.58 +
            0.26 * Math.sin((TAU * t) / 9.55 + ch * 0.9) +
            0.16 * Math.sin((TAU * t) / 6.36 + 1.7);
          const micro = 0.84 + 0.16 * Math.sin(TAU * 132 * t + Math.sin(TAU * 3.1 * t) * 1.5);
          d[i] *= wave * micro;
        }
        return d;
      });
      const sGarden = K.loop(ctx, gardenBuf, 1, 5.4);
      const bpGarden = K.filt(ctx, 'bandpass', 1750, 1.3);
      const lpGarden = K.filt(ctx, 'lowpass', 3000, 0.7);
      const pGarden = K.pan(ctx, 0.26);
      const gGarden = K.gain(ctx, 0.08);
      K.chain(sGarden, bpGarden, lpGarden, gGarden, pGarden, out);
      nodes.push(sGarden);

      // ---- 4. RAIN ON WOODEN EAVES & GARDEN STONES (23.4 s loop) ----
      const rainBuf = K.loopBuffer(ctx, 'washitsu:rain:v4', 23.4, (n, sr, ch) => {
        const R = K.rng(4099 + ch * 251);
        const d = new Float32Array(n);
        const pink = new Float32Array(n);
        K.brownInto(d, 0.85, 0.03, R);
        K.pinkInto(pink, 1.05, R);

        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const sheet = 0.78 + 0.14 * Math.sin((TAU * t) / 11.7 + ch * 0.8) + 0.08 * Math.sin((TAU * t) / 5.85 + 1.9);
          d[i] = (d[i] * 0.55 + pink[i] * 0.75) * sheet;
        }

        // Soft pattering drops on wooden eaves (left/center) and garden stones/gravel (right)
        let i = 0;
        while (i < n - 400) {
          i += (sr * (0.005 + R() * 0.022)) | 0;
          const isWood = ch === 0 ? R() < 0.7 : R() < 0.3;
          const dur = isWood ? 0.004 + R() * 0.005 : 0.0025 + R() * 0.0035;
          const len = (dur * sr) | 0;
          const amp = (0.06 + R() * 0.16) * (isWood ? 0.9 : 0.75);
          let lp = 0;
          const a = isWood ? 0.16 : 0.36;
          for (let k = 0; k < len && i + k < n; k++) {
            const u = k / len;
            const w = R() * 2 - 1;
            lp = (1 - a) * lp + a * w;
            const env = Math.sin(Math.PI * u) * Math.exp(-3.2 * u);
            d[i + k] += lp * amp * env * 1.8;
          }
        }
        return d;
      });
      const sRain = K.loop(ctx, rainBuf, 1, 2.0);
      const hpRain = K.filt(ctx, 'highpass', 210, 0.7);
      const lpRain = K.filt(ctx, 'lowpass', 2150, 0.5);
      const gRain = K.gain(ctx, 0.0001);
      K.chain(sRain, hpRain, lpRain, gRain, out);
      nodes.push(sRain);

      function applyState(s, immediate) {
        const r = s.r || 0;
        const snow = s.s || 0;
        const storm = s.storm || 0;
        const wind = s.wind != null ? s.wind : 0.15;
        const e = s.e != null ? s.e : 0.5;
        const dry = Math.max(0, 1 - r * 0.85 - snow * 0.65);
        const tau = immediate ? 0.01 : 1.2;

        // Calibrated so dry scenarios sit around -30.2 to -29.4 dBFS median, pluie around -26.8 dBFS, orage around -24.2 dBFS
        const wGain = (0.31 - 0.05 * snow + 0.03 * r * (1 - storm * 0.4)) * (e < -0.3 ? 0.94 : 1.0);
        const wFreq = snow > 0.3 ? 1620 : 1920 + 240 * Math.max(0, e);

        const bGain = 0.25 + 0.19 * wind + 0.11 * storm - 0.01 * snow;
        const bCenter = 410 + 310 * wind + 160 * storm;
        const bLowpass = 1320 + 980 * wind + 550 * storm;

        const isHotMidday = e > 0.45 && r < 0.2 && snow < 0.1;
        const gGain = dry * (isHotMidday ? 0.105 : e < 0.05 ? 0.088 : 0.072);
        const gCenter = isHotMidday ? 2650 : e < 0.05 ? 1080 : 1550;

        const rGain = r > 0.01 ? (0.18 + 0.37 * r + 0.14 * storm) : snow > 0.05 ? 0.125 * snow : 0.0001;
        const rLowpass = r > 0.01 ? (1650 + 920 * r + 600 * storm) : 1020;

        if (immediate) {
          gWater.gain.value = wGain;
          lpWater.frequency.value = wFreq;
          gBreeze.gain.value = bGain;
          bpBreeze.frequency.value = bCenter;
          lpBreeze.frequency.value = bLowpass;
          gGarden.gain.value = gGain;
          bpGarden.frequency.value = gCenter;
          gRain.gain.value = rGain;
          lpRain.frequency.value = rLowpass;
        } else {
          K.glide(ctx, gWater.gain, wGain, tau);
          K.glide(ctx, lpWater.frequency, wFreq, tau);
          K.glide(ctx, gBreeze.gain, bGain, tau);
          K.glide(ctx, bpBreeze.frequency, bCenter, tau);
          K.glide(ctx, lpBreeze.frequency, bLowpass, tau);
          K.glide(ctx, gGarden.gain, gGain, tau);
          K.glide(ctx, bpGarden.frequency, gCenter, tau);
          K.glide(ctx, gRain.gain, rGain, tau);
          K.glide(ctx, lpRain.frequency, rLowpass, tau);
        }
      }

      applyState(st || {}, true);

      return {
        nodes,
        roomVerb,
        gardenVerb,
        set(s2) {
          applyState(s2 || {}, false);
        },
      };
    },

    details: {
      // 1. Shishi-odoshi (bamboo water clapper in the right garden)
      shishiOdoshi: {
        when: () => true,
        rate: (st) => {
          if (st.s > 0.4) return 1.3;
          if (st.r > 0.3) return 2.5;
          if (st.e < -0.3) return 1.6;
          return 2.0;
        },
        gap: 18,
        gain: 0.68,
        pan: [0.68, 0.88],
        play(ctx, out, R, st, X) {
          playShishiOdoshi(ctx, out, window.SOUND_KIT, R, st, X, true);
        },
      },

      // 2. Furin (Edo glass wind chime under the eaves)
      furin: {
        when: (st) => (st.wind || 0) > 0.06,
        rate: (st) => {
          const w = st.wind || 0.15;
          if (st.storm > 0.5) return 1.6;
          if (st.r > 0.3) return 1.8;
          if (st.e < -0.3) return 1.1;
          return 1.3 + w * 2.6;
        },
        gap: 15,
        gain: 0.62,
        pan: [0.44, 0.62],
        play(ctx, out, R, st, X) {
          playFurin(ctx, out, window.SOUND_KIT, R, st, X);
        },
      },

      // 3. Water droplets & gentle ripple in the stone tsukubai basin
      waterDrop: {
        when: () => true,
        rate: (st) => (st.storm > 0.5 ? 2.2 : st.s > 0.4 ? 3.0 : 4.0),
        gap: 6,
        gain: 0.64,
        pan: [0.55, 0.85],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime;
          const wb = weatherBoost(st, 1.5);
          const bus = K.gain(ctx, wb);
          bus.connect(out);
          if (X && X.gardenVerb) {
            const sg = K.gain(ctx, 0.42);
            bus.connect(sg);
            sg.connect(X.gardenVerb);
          }

          // Gentle water-basin surface ripple under the droplets
          const rDur = 0.34 + R() * 0.14;
          const sRip = ctx.createBufferSource();
          sRip.buffer = K.noiseBuf(ctx, rDur, (x) => Math.sin(Math.PI * Math.min(1, x / rDur)) ** 1.4);
          const bpRip = K.filt(ctx, 'bandpass', 720 + R() * 280, 1.8);
          const lpRip = K.filt(ctx, 'lowpass', 1800, 0.7);
          const gRip = K.gain(ctx, 0.24);
          K.run(ctx, bus, t0, t0 + rDur, sRip, bpRip, lpRip, gRip);

          const count = 2 + ((R() * 2) | 0);
          let t = t0 + 0.015;
          for (let i = 0; i < count; i++) {
            const f = 760 + R() * 820;
            const amp = (0.18 + R() * 0.06) / (1 + i * 0.20);
            playWaterPlip(ctx, bus, K, R, t, f, amp);
            t += 0.085 + R() * 0.16;
          }
        },
      },

      // 4. Breeze rustling bamboo culms/leaves and red maple leaves (momiji)
      bambooLeaves: {
        when: () => true,
        rate: (st) => 2.2 + (st.wind || 0.15) * 4.2,
        gap: 7,
        gain: 0.62,
        pan: [0.22, 0.90],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime;
          const wb = weatherBoost(st, 1.55);
          const dur = 1.35 + R() * 1.1;
          const crest = 0.35 + R() * 0.3;
          const fFlutter = 12 + R() * 9;

          const s = ctx.createBufferSource();
          s.buffer = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n);
            K.pinkInto(d, 1.0, R);
            for (let i = 0; i < n; i++) {
              const x = i / n;
              const env =
                Math.sin(Math.PI * x) ** 1.5 *
                (0.7 + 0.3 * Math.exp(-((x - crest) ** 2) / 0.04)) *
                (0.82 + 0.18 * Math.sin(TAU * fFlutter * (i / sr)));
              d[i] *= env;
            }
            return d;
          });

          const bp1 = K.filt(ctx, 'bandpass', 820 + R() * 320, 1.15);
          const pk2 = K.filt(ctx, 'peaking', 2050 + R() * 650, 1.5);
          pk2.gain.value = 6.5;
          const lp = K.filt(ctx, 'lowpass', 3100, 0.7);
          const g = K.gain(ctx, (0.42 + 0.14 * Math.min(1, st.wind || 0.2)) * wb);

          bp1.frequency.setValueAtTime(720 + R() * 200, t0);
          bp1.frequency.linearRampToValueAtTime(1180 + R() * 350, t0 + dur * 0.55);
          bp1.frequency.linearRampToValueAtTime(680 + R() * 200, t0 + dur);

          // Occasional soft hollow bamboo culm rub in stronger breeze
          if ((st.wind || 0) > 0.20 && R() < 0.55) {
            const tc = t0 + dur * (0.28 + R() * 0.32);
            const fc = 315 + R() * 85;
            K.noiseHit(ctx, out, tc, 0.10, 0.18 * wb, 'bandpass', fc, 4.6, 0.028);
          }

          K.run(ctx, out, t0, t0 + dur, s, bp1, pk2, lp, g);
        },
      },

      // 5. Morning garden birds (Kijibato oriental turtle dove & bamboo-grove songbird — 100% breath/formant, zero raw sine!)
      uguisu: {
        when: (st) => st.e > -0.05 && st.h >= 5 && st.h <= 14.5 && (st.r || 0) < 0.3 && (st.s || 0) < 0.4,
        rate: (st) => (st.h < 10 ? 3.5 : 1.3),
        gap: 11,
        gain: 0.62,
        pan: [0.08, 0.76],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime;
          const bus = K.gain(ctx, 1);
          const lpDist = K.filt(ctx, 'lowpass', 2100, 0.7);
          K.chain(bus, lpDist, out);
          if (X && X.gardenVerb) {
            const sg = K.gain(ctx, 0.58);
            lpDist.connect(sg);
            sg.connect(X.gardenVerb);
          }

          if (R() < 0.58) {
            // Variation A: Kijibato (Oriental turtle dove, "de-de-po-po-ro")
            // Synthesized via throat-purr modulated pink/glottal source through dual woody vocal formants (~470 Hz)
            const fBase = 455 + R() * 36;
            const notes = [
              [0.0, 0.16, 0.96, 1.02, 0.74],
              [0.24, 0.14, 0.98, 1.0, 0.64],
              [0.50, 0.34, 1.05, 0.92, 1.0],
              [0.92, 0.30, 1.03, 0.90, 0.92],
              [1.28, 0.21, 0.95, 0.86, 0.58],
            ];
            for (const [dt, dur, p0, p1, a] of notes) {
              const tn = t0 + dt + (R() - 0.5) * 0.015;
              const fn = fBase * p0;
              const fEnd = fBase * p1;
              const sn = ctx.createBufferSource();
              sn.buffer = K.buffer(ctx, null, dur + 0.05, (n, sr) => {
                const d = new Float32Array(n);
                let ph = R() * TAU;
                for (let i = 0; i < n; i++) {
                  const time = i / sr;
                  const u = Math.min(1, time / dur);
                  const env = Math.sin(Math.PI * u) ** 1.3;
                  const fInst = fn + (fEnd - fn) * u;
                  ph += (TAU * fInst) / sr;
                  // Rolled throat flutter (~29 Hz) + soft breathy syrinx excitation
                  const purr = 0.72 + 0.28 * Math.sin(TAU * 29 * time);
                  const voice = Math.sin(ph) * 0.45 + (R() * 2 - 1) * 0.55;
                  d[i] = voice * purr * env;
                }
                return d;
              });
              const bpn = K.filt(ctx, 'bandpass', fn, 6.5);
              bpn.frequency.setValueAtTime(fn, tn);
              bpn.frequency.exponentialRampToValueAtTime(fEnd, tn + dur);
              const gn = K.gain(ctx, 0.34 * a);
              K.run(ctx, bus, tn, tn + dur + 0.05, sn, bpn, gn);
            }
          } else {
            // Variation B: Distant bamboo-grove songbird (Shijukara / morning warbler: breath-driven syrinx trill + wing/leaf rustle)
            // 1. Soft twig/leaf rustle in the bamboo bush as the bird shifts
            const sTwig = ctx.createBufferSource();
            sTwig.buffer = K.noiseBuf(ctx, 0.18, (x) => Math.sin(Math.PI * Math.min(1, x / 0.18)) ** 1.5);
            const bpTwig = K.filt(ctx, 'bandpass', 1450 + R() * 400, 1.8);
            const gTwig = K.gain(ctx, 0.22);
            K.run(ctx, bus, t0, t0 + 0.18, sTwig, bpTwig, gTwig);

            // 2. 3 to 4 quick, airy syrinx-formant notes (purely noise-and-trill excited high-Q bandpass, no raw sine!)
            const nNotes = 3 + ((R() * 2) | 0);
            let t = t0 + 0.08;
            const fCenter = 1480 + R() * 340;
            for (let i = 0; i < nNotes; i++) {
              const dur = 0.075 + R() * 0.045;
              const f0 = fCenter * (i % 2 === 0 ? 1.08 : 0.91) * (0.96 + 0.08 * R());
              const f1 = f0 * (i % 2 === 0 ? 0.92 : 1.10);
              const sb = ctx.createBufferSource();
              sb.buffer = K.buffer(ctx, null, dur + 0.03, (n, sr) => {
                const d = new Float32Array(n);
                for (let k = 0; k < n; k++) {
                  const u = k / n;
                  const time = k / sr;
                  const env = Math.sin(Math.PI * u) ** 1.35;
                  const trill = 0.45 + 0.55 * Math.max(0, Math.sin(TAU * 64 * time)) ** 2;
                  d[k] = (R() * 2 - 1) * env * trill;
                }
                return d;
              });
              const bpb = K.filt(ctx, 'bandpass', f0, 14.0);
              const pkb = K.filt(ctx, 'peaking', f0 * 1.48, 8.0);
              pkb.gain.value = 7;
              bpb.frequency.setValueAtTime(f0, t);
              bpb.frequency.exponentialRampToValueAtTime(f1, t + dur);
              const gb = K.gain(ctx, 0.38);
              K.run(ctx, bus, t, t + dur + 0.03, sb, bpb, pkb, gb);
              t += dur + 0.055 + R() * 0.065;
            }
          }
        },
      },

      // 6. Distant midday summer cicada wave (semiDistant: noise-driven tymbal stridulation, far in the pines)
      semiDistant: {
        when: (st) => st.e > 0.3 && (st.r || 0) < 0.2 && (st.s || 0) < 0.1,
        rate: (st) => (st.e > 0.65 ? 2.8 : 1.1),
        gap: 13,
        gain: 0.58,
        pan: [0.05, 0.82],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime;
          const dur = 1.9 + R() * 1.1;
          const pulseRate = 122 + R() * 36;
          const waveRate = 4.0 + R() * 2.2;

          const s = ctx.createBufferSource();
          s.buffer = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n);
            K.pinkInto(d, 1.0, R);
            for (let i = 0; i < n; i++) {
              const t = i / sr;
              const u = i / n;
              const env = Math.sin(Math.PI * u) ** 1.7;
              const tymbal = 0.42 + 0.58 * Math.max(0, Math.sin(TAU * pulseRate * t));
              const undul = 0.65 + 0.35 * Math.sin(TAU * waveRate * t);
              d[i] *= env * tymbal * undul;
            }
            return d;
          });

          const bp1 = K.filt(ctx, 'bandpass', 2400 + R() * 320, 2.2);
          const pk2 = K.filt(ctx, 'peaking', 3350 + R() * 320, 2.0);
          pk2.gain.value = 6;
          const lp = K.filt(ctx, 'lowpass', 3550, 0.7);
          const g = K.gain(ctx, 0.38);

          bp1.frequency.setValueAtTime(2250, t0);
          bp1.frequency.linearRampToValueAtTime(2700, t0 + dur * 0.55);
          bp1.frequency.linearRampToValueAtTime(2150, t0 + dur);

          const bus = K.gain(ctx, 1);
          bus.connect(out);
          if (X && X.gardenVerb) {
            const sg = K.gain(ctx, 0.48);
            bus.connect(sg);
            sg.connect(X.gardenVerb);
          }
          K.run(ctx, bus, t0, t0 + dur, s, bp1, pk2, lp, g);
        },
      },

      // 7. Japanese garden frog (ama-gaeru / pond frog croak at dusk, night, or light rain)
      amagaeru: {
        when: (st) => ((st.e < 0.15 && st.e > -0.75) || (st.r > 0.1 && st.r < 0.8)) && (st.s || 0) < 0.2,
        rate: (st) => {
          if (st.e < 0.08 && st.e > -0.25) return 3.0;
          if (st.r > 0.2 && st.storm < 0.5) return 2.4;
          return 1.3;
        },
        gap: 11,
        gain: 0.66,
        pan: [0.35, 0.82],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime;
          const wb = weatherBoost(st, 1.5);
          const bus = K.gain(ctx, wb);
          bus.connect(out);
          if (X && X.gardenVerb) {
            const sg = K.gain(ctx, 0.44);
            bus.connect(sg);
            sg.connect(X.gardenVerb);
          }

          // 2 to 3 guttural vocal-sac croaks (glottal impulse train filtered through sweeping vocal formants)
          const nCalls = 2 + ((R() * 2) | 0);
          let t = t0 + 0.01;
          const fGlottal = 88 + R() * 22;
          const fFormant1 = 620 + R() * 110;
          for (let c = 0; c < nCalls; c++) {
            const dur = 0.115 + R() * 0.035;
            const s = ctx.createBufferSource();
            s.buffer = K.buffer(ctx, null, dur, (n, sr) => {
              const d = new Float32Array(n);
              for (let i = 0; i < n; i++) {
                const u = i / n;
                const time = i / sr;
                const env = Math.sin(Math.PI * u) ** 1.2;
                const ph = TAU * fGlottal * (1 + 0.16 * u) * time;
                const pulse = Math.max(0, Math.sin(ph)) ** 3.2;
                d[i] = (pulse * 0.76 + (R() * 2 - 1) * 0.24) * env;
              }
              return d;
            });
            const bp1 = K.filt(ctx, 'bandpass', fFormant1, 3.5);
            const pk2 = K.filt(ctx, 'peaking', fFormant1 * 2.12, 2.6);
            pk2.gain.value = 8.5;
            const lp = K.filt(ctx, 'lowpass', 2200, 0.7);
            const g = K.gain(ctx, 0.54 * (0.85 + 0.15 * R()));

            bp1.frequency.setValueAtTime(fFormant1 * 0.85, t);
            bp1.frequency.exponentialRampToValueAtTime(fFormant1 * 1.22, t + dur * 0.82);

            K.run(ctx, bus, t, t + dur, s, bp1, pk2, lp, g);
            t += dur + 0.13 + R() * 0.10;
          }
        },
      },

      // 8. Evening & night garden cricket (korogi: noise-excited chitinous wing resonator, zero sine beep!)
      suzumushi: {
        when: (st) => st.e < 0.08 && (st.r || 0) < 0.45 && (st.s || 0) < 0.2,
        rate: (st) => (st.e < -0.3 ? 4.8 : 3.6),
        gap: 5,
        gain: 0.62,
        pan: [-0.12, 0.85],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime;
          const bus = K.gain(ctx, 1);
          const lpSoft = K.filt(ctx, 'lowpass', 3200, 0.7);
          K.chain(bus, lpSoft, out);
          if (X && X.gardenVerb) {
            const sg = K.gain(ctx, 0.40);
            lpSoft.connect(sg);
            sg.connect(X.gardenVerb);
          }

          // Purely noise-excited high-Q bandpass stridulation (warm 2280-2800 Hz register, 4-6 wing-strokes per phrase)
          const fRes = 2280 + R() * 480;
          const toothRate = 56 + R() * 14;
          const strokes = 4 + ((R() * 3) | 0);
          let t = t0 + 0.01;
          for (let p = 0; p < strokes; p++) {
            const dur = 0.036 + R() * 0.012;
            const phraseEnv = Math.sin(Math.PI * ((p + 0.5) / strokes)) ** 0.7;
            const s = ctx.createBufferSource();
            s.buffer = K.buffer(ctx, null, dur, (n, sr) => {
              const d = new Float32Array(n);
              for (let i = 0; i < n; i++) {
                const u = i / n;
                const time = i / sr;
                const env = Math.sin(Math.PI * u) ** 1.3;
                const tooth = 0.35 + 0.65 * Math.max(0, Math.sin(TAU * toothRate * time)) ** 2;
                d[i] = (R() * 2 - 1) * tooth * env;
              }
              return d;
            });
            const bp1 = K.filt(ctx, 'bandpass', fRes, 15);
            const pk2 = K.filt(ctx, 'peaking', fRes * 1.06, 12);
            pk2.gain.value = 9.5;
            const g = K.gain(ctx, 0.48 * phraseEnv * (0.85 + 0.15 * R()));
            K.run(ctx, bus, t, t + dur, s, bp1, pk2, g);
            t += dur + 0.018 + R() * 0.012;
          }
        },
      },

      // 9. Indoor washitsu micro-details (shoji paper whisper, cedar wood settle, cast-iron tetsubin kettle)
      tatamiWood: {
        when: () => true,
        rate: (st) => (st.e < -0.2 || st.r > 0.3 || st.s > 0.3 ? 2.6 : 1.8),
        gap: 10,
        gain: 0.60,
        pan: [-0.72, 0.55],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime;
          const wb = weatherBoost(st, 1.45);
          const bus = K.gain(ctx, wb);
          bus.connect(out);
          if (X && X.roomVerb) {
            const sr = K.gain(ctx, 0.34);
            bus.connect(sr);
            sr.connect(X.roomVerb);
          }

          const pick = R();
          if (pick < 0.38) {
            // A. Shoji washi paper screen & cedar frame gentle draft whisper
            const dur = 0.32 + R() * 0.18;
            const s = ctx.createBufferSource();
            s.buffer = K.noiseBuf(ctx, dur, (x) => Math.sin(Math.PI * Math.min(1, x / dur)) ** 1.4);
            const bp = K.filt(ctx, 'bandpass', 520 + R() * 220, 1.6);
            const lp = K.filt(ctx, 'lowpass', 1500, 0.7);
            const g = K.gain(ctx, 0.36);
            K.run(ctx, bus, t0, t0 + dur, s, bp, lp, g);
            K.noiseHit(ctx, bus, t0 + dur * 0.35, 0.06, 0.20, 'bandpass', 240 + R() * 70, 3.8, 0.015);
          } else if (pick < 0.72) {
            // B. Warm cedar pillar / engawa floorboard micro-settle
            const fWood = 190 + R() * 90;
            K.noiseHit(ctx, bus, t0, 0.07, 0.26, 'bandpass', fWood, 4.2, 0.018);
            K.tone(ctx, bus, t0, fWood * 1.02, 0.08, 0.0025, 0.022, 'sine', fWood * 0.86);
            if (R() < 0.6) {
              const t2 = t0 + 0.055 + R() * 0.06;
              K.noiseHit(ctx, bus, t2, 0.055, 0.16, 'bandpass', fWood * 1.35, 4.2, 0.014);
            }
          } else {
            // C. Tetsubin (cast-iron teapot on the low table): soft warm water sigh & tiny bubble
            const dur = 0.46 + R() * 0.24;
            const s = ctx.createBufferSource();
            s.buffer = K.noiseBuf(ctx, dur, (x) => Math.sin(Math.PI * Math.min(1, x / dur)) ** 1.5);
            const bp = K.filt(ctx, 'bandpass', 640 + R() * 240, 1.5);
            const lp = K.filt(ctx, 'lowpass', 1750, 0.7);
            const g = K.gain(ctx, 0.30);
            K.run(ctx, bus, t0, t0 + dur, s, bp, lp, g);
            playWaterPlip(ctx, bus, K, R, t0 + dur * 0.4, 540 + R() * 220, 0.095);
          }
        },
      },

      // 10. Eaves raindrops (amadare) in rain/storm OR powder snow sliding off bamboo (sasa-yuki) in snow
      eavesDrip: {
        when: (st) => (st.r || 0) > 0.15 || (st.s || 0) > 0.15,
        rate: (st) => {
          if (st.storm > 0.5) return 6.8;
          if (st.r > 0.15) return 5.0;
          return 3.6;
        },
        gap: 4.5,
        gain: 0.68,
        pan: [-0.45, 0.85],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT;
          const t0 = ctx.currentTime;
          const wb = weatherBoost(st, 1.55);
          const bus = K.gain(ctx, wb);
          bus.connect(out);
          if (X && X.gardenVerb) {
            const sg = K.gain(ctx, 0.38);
            bus.connect(sg);
            sg.connect(X.gardenVerb);
          }

          if ((st.s || 0) > 0.15 && (st.r || 0) < 0.2) {
            // Snow scenario: soft clump of snow sliding off a bowed bamboo stalk and landing on garden moss
            const dur = 0.36 + R() * 0.18;
            const sSlide = ctx.createBufferSource();
            sSlide.buffer = K.noiseBuf(ctx, dur, (x) => Math.sin(Math.PI * Math.min(1, x / dur)) ** 1.4);
            const bpSlide = K.filt(ctx, 'bandpass', 410 + R() * 180, 1.2);
            const lpSlide = K.filt(ctx, 'lowpass', 1080, 0.7);
            const gSlide = K.gain(ctx, 0.38);
            K.run(ctx, bus, t0, t0 + dur, sSlide, bpSlide, lpSlide, gSlide);

            // Soft muffled snow thump + bamboo stalk springing back
            const tLand = t0 + dur * 0.75;
            K.noiseHit(ctx, bus, tLand, 0.13, 0.30, 'lowpass', 340 + R() * 110, 0.9, 0.038);
            K.noiseHit(ctx, bus, tLand + 0.032, 0.09, 0.18, 'bandpass', 270 + R() * 80, 3.6, 0.026);
          } else {
            // Rain / Storm scenario: heavy eaves drops (amadare) pattering on flat garden stepping stones + puddle wash
            const wDur = 0.36 + R() * 0.16;
            const sWash = ctx.createBufferSource();
            sWash.buffer = K.noiseBuf(ctx, wDur, (x) => Math.sin(Math.PI * Math.min(1, x / wDur)) ** 1.4);
            const bpWash = K.filt(ctx, 'bandpass', 850 + R() * 350, 1.5);
            const lpWash = K.filt(ctx, 'lowpass', 2200, 0.7);
            const gWash = K.gain(ctx, 0.28);
            K.run(ctx, bus, t0, t0 + wDur, sWash, bpWash, lpWash, gWash);

            const nDrops = 3 + ((R() * (st.storm > 0.5 ? 3 : 2)) | 0);
            let t = t0 + 0.01;
            for (let i = 0; i < nDrops; i++) {
              const fStone = 620 + R() * 680;
              K.noiseHit(ctx, bus, t, 0.048, 0.26, 'bandpass', fStone, 2.6, 0.011);
              playWaterPlip(ctx, bus, K, R, t + 0.004, 780 + R() * 680, 0.14);
              t += 0.065 + R() * 0.12;
            }
            // In storm: wooden shoji / rain-shutter (amado) rattle in the wind gust
            if ((st.storm || 0) > 0.4 && R() < 0.65) {
              const tr = t0 + 0.08;
              K.noiseHit(ctx, bus, tr, 0.085, 0.28, 'bandpass', 200 + R() * 65, 3.6, 0.022);
              K.noiseHit(ctx, bus, tr + 0.045, 0.075, 0.22, 'bandpass', 235 + R() * 60, 3.8, 0.018);
            }
          }
        },
      },
    },

    sfx: {
      // Triggered by the scene's animated shishi-odoshi tipping
      knock(ctx, out, R, st, X) {
        playShishiOdoshi(ctx, out, window.SOUND_KIT, R || Math.random, st || {}, X, true);
      },

      // Triggered by the scene's animated furin swaying in the wind
      chime(ctx, out, R, st, X) {
        playFurin(ctx, out, window.SOUND_KIT, R || Math.random, st || {}, X);
      },

      // Lighting the andon paper lantern or stone toro
      match(ctx, out, R, st, X) {
        const K = window.SOUND_KIT;
        R = R || Math.random;
        const t = ctx.currentTime;
        const k = 1.15 * (0.85 + R() * 0.25);
        const L = 0.075 + R() * 0.055;
        const rate = 52 + R() * 36;

        const s = ctx.createBufferSource();
        s.buffer = K.noiseBuf(ctx, L, (x) => 0.35 + 0.65 * Math.abs(Math.sin(Math.PI * rate * x)));
        const bp = K.filt(ctx, 'bandpass', 2200, 1.3);
        const lp = K.filt(ctx, 'lowpass', 3600, 0.7);
        const g = K.gain(ctx, 0);
        bp.frequency.setValueAtTime(2200, t);
        bp.frequency.linearRampToValueAtTime(1400, t + L);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.42 * k, t + 0.004);
        g.gain.setValueAtTime(0.42 * k, t + L - 0.018);
        g.gain.linearRampToValueAtTime(0, t + L);
        K.run(ctx, out, t, t + L, s, bp, lp, g);

        const ti = t + L - 0.01;
        const f = ctx.createBufferSource();
        f.buffer = K.noiseBuf(ctx, 0.55);
        const hp = K.filt(ctx, 'highpass', 180, 0.7);
        const flp = K.filt(ctx, 'lowpass', 1950, 0.7);
        const fg = K.gain(ctx, 0);
        flp.frequency.setValueAtTime(1950, ti);
        flp.frequency.exponentialRampToValueAtTime(920, ti + 0.45);
        fg.gain.setValueAtTime(0, ti);
        fg.gain.linearRampToValueAtTime(0.22 * k, ti + 0.04);
        fg.gain.setTargetAtTime(0, ti + 0.04, 0.085);
        K.run(ctx, out, ti, ti + 0.55, f, hp, flp, fg);

        for (let i = 0, n = 4 + ((R() * 4) | 0); i < n; i++) {
          const tc = ti + 0.05 + R() * 0.38;
          K.noiseHit(ctx, out, tc, 0.018, 0.038 + R() * 0.032, 'bandpass', 1800 + R() * 1400, 2.2, 0.0028);
        }
      },

      // Blowing out the paper lantern
      puff(ctx, out, R, st, X) {
        const K = window.SOUND_KIT;
        R = R || Math.random;
        const t = ctx.currentTime;
        const k = 1.2 * (0.85 + R() * 0.25);
        const f0 = 980 * (0.9 + R() * 0.2);
        const s = ctx.createBufferSource();
        s.buffer = K.noiseBuf(ctx, 0.42);
        const hp = K.filt(ctx, 'highpass', 140, 0.7);
        const lp = K.filt(ctx, 'lowpass', f0, 0.8);
        const g = K.gain(ctx, 0);
        lp.frequency.setValueAtTime(f0, t);
        lp.frequency.exponentialRampToValueAtTime(380, t + 0.28);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.18 * k, t + 0.028);
        g.gain.setTargetAtTime(0, t + 0.028, 0.058);
        K.run(ctx, out, t, t + 0.42, s, hp, lp, g);
      },

      // Wooden pull-cord / lamp switch click
      click(ctx, out, R, st, X) {
        const K = window.SOUND_KIT;
        R = R || Math.random;
        const t = ctx.currentTime;
        const k = 1.2 * (0.85 + R() * 0.25);
        K.noiseHit(ctx, out, t, 0.028, 0.18 * k, 'bandpass', 2100 + R() * 400, 2.2, 0.0025);
        K.noiseHit(ctx, out, t + 0.014 + R() * 0.015, 0.028, 0.08 * k, 'bandpass', 1450 + R() * 300, 2.0, 0.003);
        K.tone(ctx, out, t, 185 + R() * 65, 0.06 * k, 0.002, 0.010, 'sine', 125);
      },

      bell(ctx, out, R, st, X) {
        const K = window.SOUND_KIT;
        R = R || Math.random;
        const t = ctx.currentTime;
        const f = 104 + R() * 10;
        const bus = K.gain(ctx, 1);
        const lp = K.filt(ctx, 'lowpass', 1400, 0.7);
        K.chain(bus, lp, out);
        for (const [m, k, d] of [[1, 0.8, 3.0], [1.005, 0.5, 2.9], [2.01, 0.45, 2.1], [2.98, 0.22, 1.4]]) {
          K.tone(ctx, bus, t, f * m, 0.095 * k, 0.018, d, 'sine');
        }
        K.noiseHit(ctx, bus, t, 0.10, 0.05, 'lowpass', 480, 0.8, 0.035);
      },

      owl(ctx, out, R, st, X) {
        const K = window.SOUND_KIT;
        R = R || Math.random;
        const t = ctx.currentTime;
        const f = 370 + R() * 35;
        const bus = K.gain(ctx, 1);
        const lp = K.filt(ctx, 'lowpass', 1100, 0.7);
        K.chain(bus, lp, out);
        K.tone(ctx, bus, t, f, 0.065, 0.055, 0.16, 'sine', f * 0.93);
        K.tone(ctx, bus, t + 0.82, f * 1.02, 0.055, 0.045, 0.11, 'sine', f * 0.95);
        K.tone(ctx, bus, t + 1.08, f, 0.06, 0.05, 0.22, 'sine', f * 0.90);
      },
    },
  };
})();
