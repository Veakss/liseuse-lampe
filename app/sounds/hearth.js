// Liseuse à la lampe — Sound pack for scene 'hearth' (Cheminée)
// Organic, intimate fireplace and reading room soundscape.
(function () {
  const K = window.SOUND_KIT;
  const TAU = Math.PI * 2;

  // Non-ringing, 1st-order band-limited noise burst into Float32Array d at sample offset idx.
  // Produces dry, organic wood-fiber snaps, charcoal ticks, and rain patter without tonal/watery ringing.
  function addDrySnap(d, sr, idx, tauSec, loHz, hiHz, amp, R, attSec = 0.0012) {
    const len = Math.min(d.length - idx, Math.max(8, Math.round(sr * (attSec + tauSec * 5.0))));
    if (len <= 0 || idx < 0) return;
    const aLp = 1 - Math.exp((-TAU * Math.min(sr * 0.45, hiHz)) / sr);
    const aHp = 1 - Math.exp((-TAU * Math.max(20, loHz)) / sr);
    const attSamples = Math.max(4, Math.round(sr * attSec));
    const invAtt = 1 / attSamples;
    const envDec = Math.exp(-1 / Math.max(3, sr * tauSec));
    let lp = 0, hp = 0, env = 1;
    for (let k = 0; k < len; k++) {
      let e;
      if (k < attSamples) {
        const x = (k + 1) * invAtt;
        e = x * (2 - x); // smooth parabolic attack without per-sample Math.sin
      } else {
        env *= envDec;
        e = env;
      }
      const w = (R() * 2 - 1) * e;
      lp += aLp * (w - lp);
      hp += aHp * (lp - hp);
      const val = (lp - hp) * amp;
      d[idx + k] += val / (1 + 0.22 * Math.abs(val));
    }
  }

  // Soft noise buffer with smooth envelope shaping and 1-pole smoothing.
  function shapedNoise(ctx, dur, envFn, R = Math.random) {
    const sr = ctx.sampleRate;
    const n = Math.max(1, Math.round(sr * dur));
    const b = ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const w = R() * 2 - 1;
      lp = 0.42 * lp + 0.58 * w;
      d[i] = lp * (envFn ? envFn(t, t / dur, R) : 1);
    }
    return b;
  }

  // Build a mono buffer containing multiple dry snaps (wood crackles, ember ticks, droplets).
  // Applies a gentle 1-pole smoothing pass so sample-to-sample jumps never exceed 0.25.
  function snapClusterBuf(ctx, dur, snaps, R = Math.random) {
    const sr = ctx.sampleRate;
    const n = Math.max(1, Math.round(sr * dur));
    const b = ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    for (const s of snaps) {
      const idx = Math.round((s.t || 0) * sr);
      addDrySnap(d, sr, idx, s.tau, s.lo, s.hi, s.amp, R, s.att || 0.0014);
    }
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const v = d[i] / (1 + 0.35 * Math.abs(d[i]));
      prev = 0.48 * prev + 0.52 * v;
      d[i] = prev;
    }
    return b;
  }

  // Weather boost so indoor details remain gently audible (+1.5..+5.5 dB) during rain and storm
  function weatherBoost(st) {
    if (!st) return 1;
    return 1 + (st.r || 0) * 0.42 + (st.storm || 0) * 0.50 + (st.s || 0) * 0.12;
  }

  // Compute target bed gains & filter frequencies from scene state st
  function bedTargets(st) {
    const nightBoost = st.e < 0 ? Math.min(1, -st.e * 1.1) : 0;
    const coldBoost = Math.min(1, (st.r || 0) * 0.4 + (st.s || 0) * 0.5 + (st.storm || 0) * 0.3);
    const liveliness = Math.min(1, 0.3 + nightBoost * 0.42 + coldBoost * 0.32);

    const rain = Math.max(0, Math.min(1, st.r || 0));
    const storm = Math.max(0, Math.min(1, st.storm || 0));
    const snow = Math.max(0, Math.min(1, st.s || 0));
    const wind = Math.max(0.08, Math.min(1, st.wind != null ? st.wind : 0.15));

    return {
      // Layer 1: Warm, low velvet hearth flame breath & soft ember glow
      airGain: 0.31 + liveliness * 0.08,
      airLp: 640 + liveliness * 240,
      // Layer 2: Gentle bed of glowing coals & spaced soft micro-crackles
      emberGain: 0.25 + liveliness * 0.07,
      emberLp: 2900 + liveliness * 500,
      // Layer 3: Chimney flue draught & outside wind moan
      flueGain: 0.05 + Math.pow(wind, 1.4) * 0.24 + snow * 0.06 + storm * 0.10,
      flueBp: 195 + wind * 85 + storm * 35,
      // Layer 4: Rain on roof slates & left windowpane
      rainGain: rain > 0.01 ? Math.pow(rain, 0.85) * (0.42 + storm * 0.16) : 0.0001,
      rainLp: 1100 + rain * 800 + storm * 380,
    };
  }

  window.SCENE_SOUNDS.hearth = {
    bed(ctx, out, K, st) {
      const T = bedTargets(st);

      // Two acoustic spaces:
      // 1) Intimate wood-and-rug living room reverb
      const roomVerb = K.reverb(ctx, out, 0.62, 4.4, 0.74, 0.20);
      // 2) Darker, muffled exterior/chimney reverb (behind window glass / down stone flue)
      const extVerb = K.reverb(ctx, out, 1.35, 3.1, 0.85, 0.32);

      // ---- Layer 1: Hearth flame breath & velvet ember glow (17.3 s stereo loop) ----
      const airBuf = K.loopBuffer(ctx, 'hearth:air:v5', 17.3, (n, sr, ch) => {
        const d = new Float32Array(n);
        const r = K.rng(1010 + ch * 97);
        K.brownInto(d, 0.74, 0.022, r);
        K.pinkInto(d, 0.24, r);

        // Gentle, irregular flame-tongue modulation
        const p1 = r() * TAU, p2 = r() * TAU, p3 = r() * TAU;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const swell =
            0.85 +
            0.09 * Math.sin(t * 1.25 + p1 + 0.5 * Math.sin(t * 0.41 + p2)) +
            0.06 * Math.sin(t * 2.7 + p3);
          d[i] *= swell;
        }

        // Soft, warm low-mid wood-gas puffs & charcoal shifts embedded in the flame bed
        let t0 = 0.18 + r() * 0.25;
        const maxT = n / sr - 0.3;
        while (t0 < maxT) {
          const idx = Math.round(t0 * sr);
          const lo = 160 + r() * 220;
          const hi = lo + 400 + r() * 550;
          const tau = 0.004 + r() * 0.006;
          const amp = 0.22 + r() * 0.28;
          addDrySnap(d, sr, idx, tau, lo, hi, amp, r, 0.002);
          t0 += 0.16 + r() * 0.35;
        }
        return d;
      });

      const airSrc = K.loop(ctx, airBuf, 1, 0.7);
      const airHp = K.filt(ctx, 'highpass', 65, 0.7);
      const airLp = K.filt(ctx, 'lowpass', T.airLp, 0.6);
      const airPan = K.pan(ctx, -0.28);
      const airGain = K.gain(ctx, T.airGain);
      K.chain(airSrc, airHp, airLp, airPan, airGain, out);

      // ---- Layer 2: Warm coal shimmer & spaced, delicate micro-crackles (21.7 s stereo loop) ----
      const emberBuf = K.loopBuffer(ctx, 'hearth:embers:v5', 21.7, (n, sr, ch) => {
        const d = new Float32Array(n);
        const r = K.rng(2020 + ch * 131);
        // Warm, papery glowing-ash floor
        K.pinkInto(d, 0.25, r);
        const p1 = r() * TAU;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          d[i] *= 0.84 + 0.16 * Math.sin(t * 0.58 + p1 + 0.6 * Math.sin(t * 0.21));
        }

        // Spaced, irregular clusters of soft wood/charcoal micro-crackles with breathing room between them
        let t0 = 0.12 + r() * 0.25;
        const maxT = n / sr - 0.4;
        while (t0 < maxT) {
          const cluster = 1 + Math.floor(r() * 3);
          for (let c = 0; c < cluster; c++) {
            const idx = Math.round((t0 + c * (0.015 + r() * 0.045)) * sr);
            const isCrisp = r() < 0.45;
            const lo = isCrisp ? 950 + r() * 650 : 400 + r() * 450;
            const hi = isCrisp ? 2800 + r() * 1100 : 1650 + r() * 950;
            const tau = isCrisp ? 0.0014 + r() * 0.0018 : 0.0025 + r() * 0.0030;
            const amp = (0.24 + r() * 0.30) / (1 + c * 0.35);
            addDrySnap(d, sr, idx, tau, lo, hi, amp, r, 0.0010);
          }
          t0 += 0.16 + Math.pow(r(), 1.4) * 0.52;
        }

        // Occasional soft mini-sizzles of sap/steam in the bed
        let ts = 1.1 + r() * 1.5;
        while (ts < maxT - 0.5) {
          const idx = Math.round(ts * sr);
          const dur = 0.12 + r() * 0.18;
          addDrySnap(d, sr, idx, dur * 0.3, 1100 + r() * 500, 2600 + r() * 800, 0.14 + r() * 0.14, r, 0.015);
          ts += 1.6 + r() * 2.4;
        }
        return d;
      });

      const emberSrc = K.loop(ctx, emberBuf, 1, 3.4);
      const emberHp = K.filt(ctx, 'highpass', 320, 0.7);
      const emberLp = K.filt(ctx, 'lowpass', T.emberLp, 0.65);
      const emberPan = K.pan(ctx, -0.32);
      const emberGain = K.gain(ctx, T.emberGain);
      K.chain(emberSrc, emberHp, emberLp, emberPan, emberGain, out);

      // ---- Layer 3: Chimney flue draught & muffled outside wind (19.1 s stereo loop) ----
      const flueBuf = K.loopBuffer(ctx, 'hearth:flue:v5', 19.1, (n, sr, ch) => {
        const d = new Float32Array(n);
        const r = K.rng(3030 + ch * 173);
        K.brownInto(d, 1.1, 0.025, r);
        K.pinkInto(d, 0.22, r);
        const p1 = r() * TAU, p2 = r() * TAU;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const gust =
            0.62 +
            0.24 * Math.sin(t * 0.68 + p1 + 0.7 * Math.sin(t * 0.21 + p2)) +
            0.14 * Math.cos(t * 1.12 - p2);
          d[i] *= Math.max(0.25, gust);
        }
        return d;
      });

      const flueSrc = K.loop(ctx, flueBuf, 1, 5.1);
      const flueBp = K.filt(ctx, 'bandpass', T.flueBp, 1.35);
      const flueLp = K.filt(ctx, 'lowpass', 480, 0.7);
      const fluePan = K.pan(ctx, -0.30);
      const flueGain = K.gain(ctx, T.flueGain);
      K.chain(flueSrc, flueBp, flueLp, fluePan, flueGain, out);

      // ---- Layer 4: Muffled rain on roof slates & soft drops on left window (23.4 s stereo loop) ----
      const rainBuf = K.loopBuffer(ctx, 'hearth:rain:v5', 23.4, (n, sr, ch) => {
        const d = new Float32Array(n);
        const r = K.rng(4040 + ch * 211);
        // Warm indoor roof-slate rain murmur
        K.brownInto(d, 0.60, 0.038, r);
        K.pinkInto(d, 0.36, r);
        const p1 = r() * TAU;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const wave = 0.85 + 0.15 * Math.sin(t * 0.45 + p1 + 0.5 * Math.sin(t * 0.17));
          d[i] *= wave;
        }
        // Soft individual droplets pattering on the small windowpane (stronger on left channel ch=0)
        const dropWeight = ch === 0 ? 1.0 : 0.45;
        let t0 = 0.04 + r() * 0.05;
        const maxT = n / sr - 0.1;
        while (t0 < maxT) {
          const idx = Math.round(t0 * sr);
          const lo = 500 + r() * 500;
          const hi = lo + 850 + r() * 800;
          const tau = 0.0018 + r() * 0.0020;
          const amp = (0.18 + r() * 0.26) * dropWeight;
          addDrySnap(d, sr, idx, tau, lo, hi, amp, r, 0.0010);
          t0 += 0.022 + r() * 0.048;
        }
        return d;
      });

      const rainSrc = K.loop(ctx, rainBuf, 1, 2.2);
      const rainHp = K.filt(ctx, 'highpass', 220, 0.7);
      const rainLp = K.filt(ctx, 'lowpass', T.rainLp, 0.65);
      const rainGain = K.gain(ctx, T.rainGain);
      K.chain(rainSrc, rainHp, rainLp, rainGain, out);

      return {
        nodes: [airSrc, emberSrc, flueSrc, rainSrc],
        roomVerb,
        extVerb,
        set(s2) {
          const next = bedTargets(s2);
          K.glide(ctx, airGain.gain, next.airGain, 1.4);
          K.glide(ctx, airLp.frequency, next.airLp, 1.4);
          K.glide(ctx, emberGain.gain, next.emberGain, 1.4);
          K.glide(ctx, emberLp.frequency, next.emberLp, 1.4);
          K.glide(ctx, flueGain.gain, next.flueGain, 1.6);
          K.glide(ctx, flueBp.frequency, next.flueBp, 1.6);
          K.glide(ctx, rainGain.gain, next.rainGain, 1.8);
          K.glide(ctx, rainLp.frequency, next.rainLp, 1.8);
        },
      };
    },

    details: {
      // 1. Crisp dry wood-fiber pop in the fireplace + 2..4 secondary ember snaps + warm flame-air puff
      firePop: {
        rate: (st) => 4.2 + (st.e < 0 ? 1.2 : 0) + ((st.r || 0) + (st.s || 0)) * 0.7,
        gap: 6,
        gain: 0.85,
        pan: [-0.52, -0.18],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.01;
          const wb = weatherBoost(st);
          const send = K.gain(ctx, 0.30);
          if (X && X.roomVerb) send.connect(X.roomVerb);

          // Primary dry wood-fiber snap + low-mid firebox thump + secondary sparks
          const snaps = [
            { t: 0.002, tau: 0.0075, lo: 750 + R() * 450, hi: 2900 + R() * 900, amp: 1.35 * wb, att: 0.0014 },
            { t: 0.002, tau: 0.018, lo: 165 + R() * 80, hi: 560 + R() * 180, amp: 1.15 * wb, att: 0.0024 },
          ];
          const sparks = 2 + Math.floor(R() * 3);
          let ts = 0.035 + R() * 0.04;
          for (let i = 0; i < sparks; i++) {
            snaps.push({
              t: ts,
              tau: 0.0040 + R() * 0.003,
              lo: 1050 + R() * 700,
              hi: 3200 + R() * 1100,
              amp: ((0.88 + R() * 0.35) / (1 + i * 0.3)) * wb,
              att: 0.0011,
            });
            ts += 0.038 + R() * 0.065;
          }
          const bSnap = snapClusterBuf(ctx, ts + 0.07, snaps, R);
          const sSnap = ctx.createBufferSource(); sSnap.buffer = bSnap;
          const gSnap = K.gain(ctx, 0.92);
          gSnap.connect(send);
          K.run(ctx, out, t0, t0 + ts + 0.07, sSnap, gSnap);

          // Warm flame-air puff following the pop (gives natural body over 280 ms so salience is +2..+4.5 dB)
          const puffDur = 0.28 + R() * 0.10;
          const bPuff = shapedNoise(ctx, puffDur, (t, x) => Math.sin(Math.PI * Math.pow(x, 0.6)) ** 1.4, R);
          const sp = ctx.createBufferSource(); sp.buffer = bPuff;
          const bpp = K.filt(ctx, 'bandpass', 290 + R() * 130, 0.85);
          const gp = K.gain(ctx, 0.86 * wb);
          gp.connect(send);
          K.run(ctx, out, t0 + 0.006, t0 + 0.006 + puffDur, sp, bpp, gp);
        },
      },

      // 2. Pocket of sap/resin steaming out of a log ("ffsshh-sss" fluctuating sizzle)
      resinHiss: {
        rate: (st) => 2.8 + (st.e < 0 ? 0.8 : 0) + (st.s || 0) * 0.6,
        gap: 14,
        gain: 0.76,
        pan: [-0.48, -0.22],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.01;
          const wb = weatherBoost(st);
          const dur = 0.78 + R() * 0.42;
          const flutterHz = 22 + R() * 16;
          const phase = R() * TAU;
          const b = shapedNoise(ctx, dur, (t, x) => {
            const env = Math.sin(Math.PI * Math.pow(x, 0.68)) ** 1.4;
            const bub = 0.70 + 0.30 * Math.sin(TAU * flutterHz * t + phase + 1.3 * Math.sin(t * 9.5));
            return env * bub;
          }, R);

          const fStart = 1550 + R() * 700;
          const fEnd = fStart * (0.70 + R() * 0.15);
          const s = ctx.createBufferSource(); s.buffer = b;
          const bp = K.filt(ctx, 'bandpass', fStart, 1.5);
          bp.frequency.setValueAtTime(fStart, t0);
          bp.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
          const lp = K.filt(ctx, 'lowpass', 3300, 0.7);
          const g = K.gain(ctx, 0.84 * wb);
          if (X && X.roomVerb) {
            const send = K.gain(ctx, 0.22);
            g.connect(send);
            send.connect(X.roomVerb);
          }
          K.run(ctx, out, t0, t0 + dur, s, bp, lp, g);

          // Warm low-mid steam breath accompanying the hiss
          const sLow = ctx.createBufferSource(); sLow.buffer = b;
          const bpLow = K.filt(ctx, 'bandpass', 480 + R() * 180, 0.9);
          const gLow = K.gain(ctx, 0.64 * wb);
          K.run(ctx, out, t0, t0 + dur, sLow, bpLow, gLow);
        },
      },

      // 3. Burned log settling onto the andirons & coals: dull wood crunch + warm flame breath + coal shower
      logSettle: {
        rate: (st) => 1.7 + (st.e < 0 ? 0.5 : 0),
        gap: 22,
        gain: 0.82,
        pan: [-0.45, -0.25],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.01;
          const wb = weatherBoost(st);
          const send = K.gain(ctx, 0.34);
          if (X && X.roomVerb) send.connect(X.roomVerb);

          // Low, non-tonal woody crunches + shower of 6..9 settling charcoal snaps
          const snaps = [
            { t: 0.005, tau: 0.020, lo: 110, hi: 440, amp: 1.15 * wb, att: 0.003 },
            { t: 0.055 + R() * 0.025, tau: 0.017, lo: 140, hi: 540, amp: 1.00 * wb, att: 0.0025 },
            { t: 0.115 + R() * 0.03, tau: 0.020, lo: 95, hi: 400, amp: 0.92 * wb, att: 0.003 },
          ];
          const count = 6 + Math.floor(R() * 4);
          let tc = 0.065;
          for (let k = 0; k < count; k++) {
            snaps.push({
              t: tc,
              tau: 0.0050 + R() * 0.0035,
              lo: 480 + R() * 550,
              hi: 2100 + R() * 1200,
              amp: (0.76 + R() * 0.30) * (1 - k / (count + 2)) * wb,
              att: 0.0014,
            });
            tc += 0.036 + R() * 0.045;
          }
          const b = snapClusterBuf(ctx, tc + 0.08, snaps, R);
          const sSettle = ctx.createBufferSource(); sSettle.buffer = b;
          const gSettle = K.gain(ctx, 0.90);
          gSettle.connect(send);
          K.run(ctx, out, t0, t0 + tc + 0.08, sSettle, gSettle);

          // Warm flame "whuff" as air rushes around the shifted log
          const wDur = 0.44 + R() * 0.14;
          const bWhuff = shapedNoise(ctx, wDur, (t, x) => Math.sin(Math.PI * Math.pow(x, 0.6)) ** 1.5, R);
          const sw = ctx.createBufferSource(); sw.buffer = bWhuff;
          const bpw = K.filt(ctx, 'bandpass', 230 + R() * 70, 0.9);
          const gw = K.gain(ctx, 0.82 * wb);
          gw.connect(send);
          K.run(ctx, out, t0 + 0.04, t0 + 0.04 + wDur, sw, bpw, gw);
        },
      },

      // 4. Delicate mineral/charcoal ticking of cooling or shifting embers (4..7 fine dry ticks + warm ash rustle)
      emberTick: {
        rate: (st) => 3.8 + (st.e > 0 ? 0.7 : 0.2),
        gap: 9,
        gain: 0.82,
        pan: [-0.50, -0.16],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.01;
          const wb = weatherBoost(st);
          const count = 4 + Math.floor(R() * 4);
          const snaps = [];
          let t = 0.012;
          for (let i = 0; i < count; i++) {
            const lo = 850 + R() * 700;
            snaps.push({
              t,
              tau: 0.0040 + R() * 0.0030,
              lo,
              hi: lo + 1500 + R() * 1100,
              amp: 1.02 * (0.78 + 0.22 * R()) * wb,
              att: 0.0011,
            });
            t += 0.036 + R() * 0.058;
          }
          const bTicks = snapClusterBuf(ctx, t + 0.06, snaps, R);
          const sTicks = ctx.createBufferSource(); sTicks.buffer = bTicks;
          const gTicks = K.gain(ctx, 0.90);
          if (X && X.roomVerb) {
            const send = K.gain(ctx, 0.26);
            gTicks.connect(send);
            send.connect(X.roomVerb);
          }
          K.run(ctx, out, t0, t0 + t + 0.06, sTicks, gTicks);

          // Warm ash-bed settle under the ticks
          const ashDur = Math.max(0.28, t + 0.04);
          const bAsh = shapedNoise(ctx, ashDur, (tm, x) => Math.sin(Math.PI * Math.pow(x, 0.65)) ** 1.4, R);
          const sAsh = ctx.createBufferSource(); sAsh.buffer = bAsh;
          const bpAsh = K.filt(ctx, 'bandpass', 420 + R() * 180, 0.85);
          const gAsh = K.gain(ctx, 0.76 * wb);
          K.run(ctx, out, t0, t0 + ashDur, sAsh, bpAsh, gAsh);
        },
      },

      // 5. Soft double breath of flame ("whoo-ffuh") drawn up into the chimney throat
      flameBreath: {
        rate: (st) => 2.5 + (st.wind || 0.15) * 1.6 + (st.e < 0 ? 0.6 : 0),
        gap: 13,
        gain: 0.80,
        pan: [-0.42, -0.20],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.01;
          const wb = weatherBoost(st);
          const pulses = R() < 0.7 ? 2 : 1;
          for (let p = 0; p < pulses; p++) {
            const tp = t0 + p * (0.22 + R() * 0.10);
            const dur = 0.36 + R() * 0.12;
            const b = shapedNoise(ctx, dur, (t, x) => Math.sin(Math.PI * Math.pow(x, 0.65)) ** 1.5, R);
            const s = ctx.createBufferSource(); s.buffer = b;
            const f0 = 195 + R() * 65;
            const bp = K.filt(ctx, 'bandpass', f0, 0.9);
            bp.frequency.setValueAtTime(f0, tp);
            bp.frequency.linearRampToValueAtTime(f0 * 1.4, tp + dur * 0.45);
            bp.frequency.linearRampToValueAtTime(f0 * 0.9, tp + dur);
            const lp = K.filt(ctx, 'lowpass', 780, 0.7);
            const g = K.gain(ctx, (0.90 - p * 0.16) * wb);
            if (X && X.roomVerb) {
              const send = K.gain(ctx, 0.28);
              g.connect(send);
              send.connect(X.roomVerb);
            }
            K.run(ctx, out, tp, tp + dur, s, bp, lp, g);
          }
        },
      },

      // 6. Soft wooden mantle clock ("tic-tac") on the mantelpiece above the hearth:
      // 4 to 5 gentle mechanical escapement beats fading in and out smoothly
      mantelClock: {
        when: (st) => (st.storm || 0) < 0.45,
        rate: (st) => 1.8 - (st.r || 0) * 0.4,
        gap: 26,
        gain: 0.84,
        pan: [-0.38, -0.30],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.02;
          const wb = weatherBoost(st);
          const beats = 4 + Math.floor(R() * 2);
          const step = 0.34 + (R() - 0.5) * 0.015;
          const snaps = [];
          for (let i = 0; i < beats; i++) {
            const tb = 0.02 + i * step;
            const win = Math.sin(((i + 0.7) / (beats + 0.4)) * Math.PI);
            const isTic = (i & 1) === 0;
            // Crisp mechanical escapement tick + warm wooden case body
            snaps.push({
              t: tb,
              tau: 0.0065,
              lo: isTic ? 820 : 680,
              hi: isTic ? 2100 : 1750,
              amp: 1.05 * win * wb,
              att: 0.0014,
            });
            snaps.push({
              t: tb + 0.002,
              tau: 0.016,
              lo: 220,
              hi: 600,
              amp: 0.92 * win * wb,
              att: 0.0022,
            });
          }
          const totDur = beats * step + 0.10;
          const bClock = snapClusterBuf(ctx, totDur, snaps, R);
          const sClock = ctx.createBufferSource(); sClock.buffer = bClock;
          const gClock = K.gain(ctx, 0.94);
          if (X && X.roomVerb) {
            const send = K.gain(ctx, 0.30);
            gClock.connect(send);
            send.connect(X.roomVerb);
          }
          K.run(ctx, out, t0, t0 + totDur, sClock, gClock);
        },
      },

      // 7. Thermal wood creak from the wainscot paneling, floorboards, or right-hand bookcase
      woodCreak: {
        rate: () => 2.1,
        gap: 20,
        gain: 0.84,
        pan: [0.15, 0.68],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.01;
          const wb = weatherBoost(st);
          const grainsCount = 4 + Math.floor(R() * 3);
          const fBase = 320 + R() * 160;
          const snaps = [];
          let t = 0.01;
          for (let i = 0; i < grainsCount; i++) {
            const x = (i + 0.5) / grainsCount;
            const env = Math.sin(Math.PI * x);
            snaps.push({
              t,
              tau: 0.015 + R() * 0.007,
              lo: fBase * 0.65,
              hi: fBase * 2.1,
              amp: 1.10 * (0.65 + 0.35 * env) * wb,
              att: 0.0024,
            });
            t += 0.035 + R() * 0.038;
          }
          const bCreak = snapClusterBuf(ctx, t + 0.08, snaps, R);
          const sCreak = ctx.createBufferSource(); sCreak.buffer = bCreak;
          const lpCreak = K.filt(ctx, 'lowpass', 1450, 0.7);
          const gCreak = K.gain(ctx, 0.92);
          if (X && X.roomVerb) {
            const send = K.gain(ctx, 0.36);
            gCreak.connect(send);
            send.connect(X.roomVerb);
          }
          K.run(ctx, out, t0, t0 + t + 0.08, sCreak, lpCreak, gCreak);
        },
      },

      // 8. Soft intimate sound from the green armchair on the right:
      // a book page turning softly OR the porcelain teacup settling on its saucer / cushion shift
      armchairPage: {
        rate: () => 1.8,
        gap: 24,
        gain: 0.80,
        pan: [0.35, 0.62],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.01;
          const wb = weatherBoost(st);
          const send = K.gain(ctx, 0.30);
          if (X && X.roomVerb) send.connect(X.roomVerb);

          if (R() < 0.6) {
            // Soft page turn: two-stage paper arch & settle
            const dur = 0.30 + R() * 0.08;
            const b = shapedNoise(ctx, dur, (t, x) => Math.sin(Math.PI * Math.pow(x, 0.62)) ** 1.5, R);
            const s = ctx.createBufferSource(); s.buffer = b;
            const bp = K.filt(ctx, 'bandpass', 1000, 0.95);
            bp.frequency.setValueAtTime(850, t0);
            bp.frequency.linearRampToValueAtTime(1680 + R() * 260, t0 + dur * 0.45);
            bp.frequency.linearRampToValueAtTime(1000, t0 + dur);
            const lp = K.filt(ctx, 'lowpass', 2600, 0.7);
            const g = K.gain(ctx, 0.94 * wb);
            g.connect(send);
            K.run(ctx, out, t0, t0 + dur, s, bp, lp, g);
          } else {
            // Cushion fabric rustle + muted wooden armrest / cup settle
            const dur = 0.28 + R() * 0.08;
            const bCloth = shapedNoise(ctx, dur, (t, x) => Math.sin(Math.PI * x) ** 1.4, R);
            const sc = ctx.createBufferSource(); sc.buffer = bCloth;
            const bpc = K.filt(ctx, 'bandpass', 440 + R() * 140, 0.9);
            const gc = K.gain(ctx, 0.84 * wb);
            gc.connect(send);
            K.run(ctx, out, t0, t0 + dur, sc, bpc, gc);

            const bCup = snapClusterBuf(ctx, 0.18, [
              { t: 0.055, tau: 0.0065, lo: 650, hi: 1850, amp: 0.90 * wb, att: 0.0016 },
              { t: 0.056, tau: 0.013, lo: 210, hi: 560, amp: 0.84 * wb, att: 0.0024 },
              { t: 0.095 + R() * 0.02, tau: 0.0048, lo: 800, hi: 2000, amp: 0.60 * wb, att: 0.0014 },
            ], R);
            const sCup = ctx.createBufferSource(); sCup.buffer = bCup;
            const gCup = K.gain(ctx, 0.88);
            gCup.connect(send);
            K.run(ctx, out, t0, t0 + 0.18, sCup, gCup);
          }
        },
      },

      // 9. Distant morning/daytime bird outside the closed 4-pane window above the mantelpiece:
      //Varied, natural robin/chaffinch-like phrase heard faintly through closed window glass & extVerb
      windowBird: {
        when: (st) => st.e > 0.05 && (st.r || 0) < 0.25 && (st.storm || 0) < 0.2,
        rate: (st) => (st.h < 10 ? 3.2 : 1.6) * (1 - (st.s || 0) * 0.4),
        gap: 16,
        gain: 0.76,
        pan: [-0.42, -0.22],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.02;
          const baseF = 1850 + R() * 450;

          // Window attenuation chain: closed window glass lowpass + exterior reverb send
          const winLp = K.filt(ctx, 'lowpass', 1680, 0.7);
          const winGain = K.gain(ctx, 0.48);
          winLp.connect(winGain);
          winGain.connect(out);
          if (X && X.extVerb) {
            const send = K.gain(ctx, 0.72);
            winLp.connect(send);
            send.connect(X.extVerb);
          }

          // Varied 3-4 note phrase (short grace note, longer warbled note, quick cadence)
          const pattern = [
            { dur: 0.042 + R() * 0.02, r1: 1.0, r2: 1.08, amp: 0.22, vib: 0 },
            { dur: 0.095 + R() * 0.035, r1: 1.18, r2: 1.05, amp: 0.30, vib: 26 },
            { dur: 0.050 + R() * 0.02, r1: 0.92, r2: 0.96, amp: 0.24, vib: 0 },
            { dur: 0.080 + R() * 0.03, r1: 1.10, r2: 0.94, amp: 0.26, vib: 22 },
          ];
          const count = 3 + Math.floor(R() * 2);
          let t = t0;
          for (let i = 0; i < count; i++) {
            const p = pattern[i];
            const dur = p.dur;
            const f1 = baseF * p.r1 * (0.97 + R() * 0.06);
            const f2 = baseF * p.r2 * (0.97 + R() * 0.06);

            const o = ctx.createOscillator();
            const g = K.gain(ctx, 0);
            o.type = 'sine';
            o.frequency.setValueAtTime(f1, t);
            o.frequency.exponentialRampToValueAtTime(f2, t + dur);
            if (p.vib) {
              const v = ctx.createOscillator();
              const vg = K.gain(ctx, 18);
              v.frequency.value = p.vib;
              v.connect(vg);
              vg.connect(o.frequency);
              v.start(t);
              v.stop(t + dur * 1.8);
              v.onended = () => { v.disconnect(); vg.disconnect(); };
            }
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(p.amp, t + dur * 0.25);
            g.gain.setTargetAtTime(0, t + dur * 0.65, dur * 0.18);
            o.connect(g);
            g.connect(winLp);
            o.start(t);
            o.stop(t + dur * 1.8);
            o.onended = () => { o.disconnect(); g.disconnect(); };

            t += dur + 0.045 + R() * 0.055;
          }

          // Subtle outdoor air cushion so the phrase sits in the exterior space
          const bExt = shapedNoise(ctx, t - t0 + 0.08, (tm, x) => Math.sin(Math.PI * x) ** 1.4, R);
          const sExt = ctx.createBufferSource(); sExt.buffer = bExt;
          const bpExt = K.filt(ctx, 'bandpass', 720, 1.0);
          const gExt = K.gain(ctx, 0.42);
          K.run(ctx, winLp, t0, t + 0.08, sExt, bpExt, gExt);
        },
      },

      // 10. Distant tawny owl in the pine trees at dusk & night, heard faintly through the window & chimney
      distantOwl: {
        when: (st) => st.e < 0 && (st.r || 0) < 0.45 && (st.storm || 0) < 0.3,
        rate: (st) => (st.e < -0.3 ? 2.4 : 1.6),
        gap: 25,
        gain: 0.74,
        pan: [-0.48, -0.18],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.02;
          const f0 = 385 + R() * 30;

          // Muffled window + chimney filtering
          const winLp = K.filt(ctx, 'lowpass', 720, 0.75);
          const dryG = K.gain(ctx, 0.42);
          winLp.connect(dryG);
          dryG.connect(out);
          if (X && X.extVerb) {
            const send = K.gain(ctx, 0.76);
            winLp.connect(send);
            send.connect(X.extVerb);
          }

          // Call 1: soft hollow "hooo" (0.0 .. 0.38s), Call 2: soft inflected "hu-luuu" (0.56 .. 1.08s)
          const calls = [
            { t: t0, dur: 0.38, fStart: f0 * 0.97, fPeak: f0 * 1.03, fEnd: f0 * 0.92, amp: 0.30, vibHz: 5.0, vibDepth: 1.5 },
            { t: t0 + 0.55 + R() * 0.06, dur: 0.52, fStart: f0 * 0.94, fPeak: f0 * 1.04, fEnd: f0 * 0.87, amp: 0.27, vibHz: 17.5, vibDepth: 2.0 },
          ];
          for (const c of calls) {
            const o = ctx.createOscillator();
            const vib = ctx.createOscillator();
            const vibG = K.gain(ctx, c.vibDepth);
            const g = K.gain(ctx, 0);
            o.type = 'sine';
            o.frequency.setValueAtTime(c.fStart, c.t);
            o.frequency.linearRampToValueAtTime(c.fPeak, c.t + c.dur * 0.22);
            o.frequency.exponentialRampToValueAtTime(c.fEnd, c.t + c.dur);
            vib.frequency.value = c.vibHz + R();
            vib.connect(vibG);
            vibG.connect(o.frequency);

            g.gain.setValueAtTime(0, c.t);
            g.gain.linearRampToValueAtTime(c.amp, c.t + 0.07);
            g.gain.setTargetAtTime(0, c.t + c.dur * 0.58, 0.095);
            o.connect(g);
            g.connect(winLp);
            o.start(c.t);
            vib.start(c.t);
            o.stop(c.t + c.dur + 0.40);
            vib.stop(c.t + c.dur + 0.40);
            o.onended = () => { o.disconnect(); vib.disconnect(); vibG.disconnect(); g.disconnect(); };

            // Hollow breath resonance around the fundamental
            const bBreath = shapedNoise(ctx, c.dur, (tm, x) => Math.sin(Math.PI * x) ** 1.4, R);
            const sB = ctx.createBufferSource(); sB.buffer = bBreath;
            const bpB = K.filt(ctx, 'bandpass', c.fPeak, 2.2);
            const gB = K.gain(ctx, c.amp * 1.4);
            K.run(ctx, winLp, c.t, c.t + c.dur, sB, bpB, gB);
          }
        },
      },

      // 11. Weather detail: hollow wind gust in the chimney flue + flurry of rain droplets or snow sleet on the windowpane
      chimneyGust: {
        when: (st) => (st.r || 0) > 0.1 || (st.s || 0) > 0.2 || (st.wind || 0) > 0.26,
        rate: (st) => 2.2 + (st.r || 0) * 2.2 + (st.storm || 0) * 1.6 + (st.s || 0) * 1.8,
        gap: 11,
        gain: 0.84,
        pan: [-0.45, -0.18],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.01;
          const wb = weatherBoost(st);
          const dur = 0.88 + R() * 0.38;

          // Hollow chimney flue sigh
          const bFlue = shapedNoise(ctx, dur, (t, x) => Math.sin(Math.PI * Math.pow(x, 0.65)) ** 1.4, R);
          const sFlue = ctx.createBufferSource(); sFlue.buffer = bFlue;
          const f0 = 205 + R() * 70;
          const bpFlue = K.filt(ctx, 'bandpass', f0, 1.15);
          bpFlue.frequency.setValueAtTime(f0, t0);
          bpFlue.frequency.linearRampToValueAtTime(f0 * 1.3, t0 + dur * 0.45);
          bpFlue.frequency.linearRampToValueAtTime(f0 * 0.92, t0 + dur);
          const lpFlue = K.filt(ctx, 'lowpass', 540, 0.7);
          const gFlue = K.gain(ctx, 0.84 * wb);
          if (X && X.extVerb) {
            const send = K.gain(ctx, 0.40);
            gFlue.connect(send);
            send.connect(X.extVerb);
          }
          K.run(ctx, out, t0, t0 + dur, sFlue, bpFlue, lpFlue, gFlue);

          // If raining or snowing, a soft flurry of non-ringing droplets / sleet tapping the window glass
          const precip = Math.max(st.r || 0, (st.s || 0) * 0.85);
          if (precip > 0.1) {
            const isSnow = (st.s || 0) > (st.r || 0);
            const drops = 7 + Math.floor(R() * 7);
            const snaps = [];
            for (let i = 0; i < drops; i++) {
              const lo = isSnow ? 950 + R() * 550 : 480 + R() * 420;
              snaps.push({
                t: 0.04 + R() * (dur * 0.75),
                tau: isSnow ? 0.0038 : 0.0065,
                lo,
                hi: lo + (isSnow ? 1300 : 1000),
                amp: (0.76 + R() * 0.32) * precip * wb,
                att: 0.0014,
              });
            }
            const bDrops = snapClusterBuf(ctx, dur, snaps, R);
            const sd = ctx.createBufferSource(); sd.buffer = bDrops;
            const gd = K.gain(ctx, 0.88);
            K.run(ctx, out, t0, t0 + dur, sd, gd);
          }
        },
      },
    },

    // ---- Replacements for picture-triggered one-shot SFX ----
    sfx: {
      // Lighting the mantelpiece candles: soft wooden match scratch + warm velvet flare + delicate head crackles
      match(ctx, out, R = Math.random, st, X) {
        const t0 = ctx.currentTime + 0.005;
        const send = K.gain(ctx, 0.28);
        if (X && X.roomVerb) send.connect(X.roomVerb);

        // 1) Textured wooden box friction scratch (75-95 ms)
        const sLen = 0.075 + R() * 0.02;
        const grainRate = 55 + R() * 25;
        const bScratch = shapedNoise(ctx, sLen, (t, x) => {
          const env = Math.sin(Math.PI * Math.pow(x, 0.7));
          const grain = 0.45 + 0.55 * Math.abs(Math.sin(Math.PI * grainRate * t));
          return env * grain;
        }, R);
        const s1 = ctx.createBufferSource(); s1.buffer = bScratch;
        const bp1 = K.filt(ctx, 'bandpass', 1400, 1.1);
        bp1.frequency.setValueAtTime(1700, t0);
        bp1.frequency.linearRampToValueAtTime(1100, t0 + sLen);
        const lp1 = K.filt(ctx, 'lowpass', 2600, 0.7);
        const g1 = K.gain(ctx, 0.82);
        g1.connect(send);
        K.run(ctx, out, t0, t0 + sLen, s1, bp1, lp1, g1);

        // 2) Warm velvet ignition flare ("ffouh")
        const ti = t0 + sLen - 0.012;
        const fDur = 0.38 + R() * 0.08;
        const bFlare = shapedNoise(ctx, fDur, (t, x) => Math.sin(Math.PI * Math.pow(x, 0.55)) ** 1.5 * Math.exp(-t * 1.8), R);
        const sf = ctx.createBufferSource(); sf.buffer = bFlare;
        const hpF = K.filt(ctx, 'highpass', 120, 0.7);
        const lpF = K.filt(ctx, 'lowpass', 1350, 0.7);
        lpF.frequency.setValueAtTime(1400, ti);
        lpF.frequency.exponentialRampToValueAtTime(560, ti + fDur);
        const gf = K.gain(ctx, 0.74);
        gf.connect(send);
        K.run(ctx, out, ti, ti + fDur, sf, hpF, lpF, gf);

        // 3) 4 tiny dry wood-splint micro-crackles
        const snaps = [];
        for (let i = 0; i < 4; i++) {
          snaps.push({
            t: 0.03 + i * (0.055 + R() * 0.035),
            tau: 0.0035,
            lo: 950 + R() * 600,
            hi: 2900 + R() * 900,
            amp: 0.78 * (1 - i * 0.16),
            att: 0.0012,
          });
        }
        const bTicks = snapClusterBuf(ctx, 0.34, snaps, R);
        const stNode = ctx.createBufferSource(); stNode.buffer = bTicks;
        const gt = K.gain(ctx, 0.82);
        K.run(ctx, out, ti, ti + 0.34, stNode, gt);
      },

      // Putting out a candle: soft, rounded warm breath whose spectrum drops gently
      puff(ctx, out, R = Math.random, st, X) {
        const t0 = ctx.currentTime + 0.005;
        const dur = 0.34 + R() * 0.06;
        const b = shapedNoise(ctx, dur, (t, x) => Math.sin(Math.PI * Math.pow(x, 0.58)) ** 1.6, R);
        const s = ctx.createBufferSource(); s.buffer = b;
        const hp = K.filt(ctx, 'highpass', 120, 0.7);
        const lp = K.filt(ctx, 'lowpass', 850, 0.75);
        lp.frequency.setValueAtTime(860 + R() * 90, t0);
        lp.frequency.exponentialRampToValueAtTime(310, t0 + dur);
        const g = K.gain(ctx, 0.84);
        if (X && X.roomVerb) {
          const send = K.gain(ctx, 0.28);
          g.connect(send);
          send.connect(X.roomVerb);
        }
        K.run(ctx, out, t0, t0 + dur, s, hp, lp, g);
      },

      // Soft vintage reading-lamp switch click
      click(ctx, out, R = Math.random, st, X) {
        const t0 = ctx.currentTime + 0.005;
        const bClick = snapClusterBuf(ctx, 0.08, [
          { t: 0.002, tau: 0.0045, lo: 900, hi: 2500, amp: 0.95, att: 0.0012 },
          { t: 0.002, tau: 0.011, lo: 180, hi: 520, amp: 0.85, att: 0.0020 },
          { t: 0.018 + R() * 0.01, tau: 0.0035, lo: 750, hi: 2000, amp: 0.62, att: 0.0012 },
        ], R);
        const s = ctx.createBufferSource(); s.buffer = bClick;
        const g = K.gain(ctx, 0.90);
        if (X && X.roomVerb) {
          const send = K.gain(ctx, 0.26);
          g.connect(send);
          send.connect(X.roomVerb);
        }
        K.run(ctx, out, t0, t0 + 0.08, s, g);
      },

      owl(ctx, out, R = Math.random, st, X) {
        window.SCENE_SOUNDS.hearth.details.distantOwl.play(ctx, out, R, st || { e: -0.7 }, X);
      },

      bell(ctx, out, R = Math.random, st, X) {
        const t0 = ctx.currentTime + 0.01;
        const f = 175 + R() * 20;
        const lp = K.filt(ctx, 'lowpass', 720, 0.7);
        const gOut = K.gain(ctx, 0.56);
        lp.connect(gOut);
        gOut.connect(out);
        if (X && X.extVerb) {
          const send = K.gain(ctx, 0.68);
          lp.connect(send);
          send.connect(X.extVerb);
        }
        for (const [m, k, d] of [[1, 1, 1.8], [1.99, 0.45, 1.3], [2.97, 0.22, 0.8]]) {
          K.tone(ctx, lp, t0, f * m, 0.14 * k, 0.018, d, 'sine');
        }
      },
    },
  };
})();
