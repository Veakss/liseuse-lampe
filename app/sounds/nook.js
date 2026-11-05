// Liseuse à la lampe — Sound pack for scene 'nook' (Coin lecture)
(function () {
  const K = window.SOUND_KIT;
  if (!K) return;
  const TAU = K.TAU;

  // Route a fraction of `out` (already scaled by detail gain) into a reverb bus.
  function sendTo(ctx, out, verb, amt) {
    if (verb && amt > 0) K.chain(out, K.gain(ctx, amt), verb);
  }

  // Create a mono buffer of `len` seconds with custom sample generator `fn(t, i, sr)`
  function shapedBuf(ctx, len, fn) {
    return K.buffer(ctx, null, len, (n, sr) => {
      const d = new Float32Array(n);
      for (let i = 0; i < n; i++) d[i] = fn(i / sr, i, sr);
      return d;
    });
  }

  // Filter-resonated physical impulse: excites parallel Biquad bandpass resonators with a shaped noise burst.
  // Produces 100% organic wood, glass, ceramic, or fabric textures with zero pure-sine beepiness.
  function resonantNoiseHit(ctx, out, t, dur, excFn, formants, postLp = 2800) {
    const src = ctx.createBufferSource();
    src.buffer = shapedBuf(ctx, dur, excFn);
    const mix = K.filt(ctx, 'lowpass', postLp, 0.7);
    mix.connect(out);
    const nodes = [mix];
    for (let i = 0; i < formants.length; i++) {
      const [f, q, gainVal, fEnd] = formants[i];
      const bp = K.filt(ctx, 'bandpass', f, q);
      if (fEnd) {
        bp.frequency.setValueAtTime(f, t);
        bp.frequency.exponentialRampToValueAtTime(fEnd, t + dur * 0.85);
      }
      const g = K.gain(ctx, gainVal);
      src.connect(bp);
      bp.connect(g);
      g.connect(mix);
      nodes.push(bp, g);
    }
    src.onended = () => {
      src.disconnect();
      for (const n of nodes) n.disconnect();
    };
    src.start(t);
    src.stop(t + dur);
  }

  // Computes target gains and filter frequencies for the 4 bed layers from state `st`
  function targets(st) {
    const r = Math.max(0, Math.min(1, st.r || 0));
    const s = Math.max(0, Math.min(1, st.s || 0));
    const storm = Math.max(0, Math.min(1, st.storm || 0));
    const wind = Math.max(0, Math.min(1, st.wind == null ? 0.15 : st.wind));
    const e = st.e == null ? 0.3 : st.e;
    const day = Math.max(0, Math.min(1, (e + 0.15) / 0.5)); // 0 at night, 1 in day

    // 1. Warm wooden room air: gentle indoor presence (~-29 dBFS in dry scenarios)
    const roomGain = 0.27 + 0.035 * (1 - day) + 0.02 * s;
    const roomCut = 800 + 180 * day - 90 * s;

    // 2. Pine breeze outside the closed window: scales with wind, muffled in snow, deeper in storm
    const breezeGain = (0.18 + 0.20 * wind + 0.06 * storm) * (1 - 0.15 * s);
    const breezeCut = (940 + 540 * wind + 140 * storm) * (1 - 0.22 * s);

    // 3. Rain on window glass & pines outside: 0 when dry, rises smoothly with r & storm
    // Kept low-passed by the closed window glass so storm rain feels warm & indoors, not harsh shower hiss.
    const rainGain = r > 0.005 ? Math.pow(r, 0.82) * (0.40 + 0.05 * storm) : 0.0001;
    const rainCut = 1450 + 550 * r + 180 * storm;

    // 4. Window eaves / outdoor canopy air: light open air in dry day, resonant wooden sill patter in rain
    const eavesGain = r > 0.01
      ? 0.16 + 0.22 * r + 0.06 * storm
      : (0.14 + 0.08 * day + 0.05 * s);
    const eavesCut = r > 0.01
      ? 920 + 480 * r + 160 * storm
      : 1080 + 420 * day - 200 * s;

    return { roomGain, roomCut, breezeGain, breezeCut, rainGain, rainCut, eavesGain, eavesCut };
  }

  window.SCENE_SOUNDS.nook = {
    bed(ctx, out, K, st) {
      const R = K.rng(847291);

      // Two acoustic spaces:
      // 1. Intimate wooden reading room (short, warm, dark timber reflections)
      const roomVerb = K.reverb(ctx, out, 1.1, 4.5, 0.68, 0.28);
      // 2. Exterior pine valley heard through the window (longer, diffused, muffled tail)
      const extRaw = K.reverb(ctx, out, 2.2, 2.7, 0.62, 0.36);
      const extLp = K.filt(ctx, 'lowpass', 1650, 0.6);
      extLp.connect(extRaw);
      const extVerb = extLp;

      // Layer 1: roomAir (19.3 s) — Soft, warm indoor room air & timber resonance (160–900 Hz)
      const roomBuf = K.loopBuffer(ctx, 'nook_room_v4', 19.3, (n, sr, ch) => {
        const d = new Float32Array(n);
        const rc = K.rng(1010 + ch * 97);
        let lp1 = 0, lp2 = 0, sub = 0;
        const ph1 = ch * 1.4, ph2 = ch * 2.7;
        const wStep = TAU / (19.3 * sr);
        for (let i = 0; i < n; i++) {
          const w = rc() * 2 - 1;
          lp1 += 0.095 * (w - lp1);
          lp2 += 0.045 * (lp1 - lp2);
          sub += 0.018 * (lp2 - sub); // ~140 Hz high-pass tracker
          const u = i * wStep;
          const swell = 0.85 + 0.15 * Math.sin(u * 2 + ph1) * Math.cos(u * 3 + ph2);
          d[i] = (lp2 - sub) * swell;
        }
        return d;
      });

      // Layer 2: pineBreeze (22.7 s) — Soft wind in the pine needles heard through the window (240–1500 Hz)
      const breezeBuf = K.loopBuffer(ctx, 'nook_breeze_v4', 22.7, (n, sr, ch) => {
        const d = new Float32Array(n);
        const rc = K.rng(2020 + ch * 131);
        const side = ch === 1 ? 1.18 : 0.82;
        let lp = 0, sub = 0;
        const wStep = TAU / (22.7 * sr);
        for (let i = 0; i < n; i++) {
          const w = rc() * 2 - 1;
          const u = i * wStep;
          const gust = 0.56
            + 0.24 * Math.sin(u * 2 + ch * 0.9 + 0.6 * Math.sin(u))
            + 0.13 * Math.sin(u * 5 - ch * 0.7)
            + 0.07 * Math.cos(u * 7 + 1.2);
          const a = 0.08 + 0.07 * gust;
          lp += a * (w - lp);
          sub += 0.026 * (lp - sub);
          d[i] = (lp - sub) * gust * side;
        }
        return d;
      });

      // Layer 3: windowRain (16.9 s) — Rain wash outside + soft micro-drops pattering on the 4 window panes
      const rainBuf = K.loopBuffer(ctx, 'nook_rain_v4', 16.9, (n, sr, ch) => {
        const d = new Float32Array(n);
        const rc = K.rng(3030 + ch * 173);
        const side = ch === 1 ? 1.22 : 0.78;
        let lp = 0, sub = 0;
        const wStep = TAU / (16.9 * sr);
        for (let i = 0; i < n; i++) {
          const w = rc() * 2 - 1;
          const u = i * wStep;
          const sheet = 0.76 + 0.16 * Math.sin(u * 3 + ch * 0.8) + 0.08 * Math.sin(u * 7 + 0.5);
          lp += 0.18 * (w - lp);
          sub += 0.036 * (lp - sub);
          d[i] = (lp - sub) * sheet * side * 0.55;
        }
        // Thousands of soft, glass-damped raindrop micro-impacts on the window panes
        let idx = Math.floor(sr * 0.01 * rc());
        while (idx < n - 300) {
          idx += Math.floor(sr * (0.002 + 0.009 * rc() * rc()));
          const u = idx * wStep;
          const density = 0.72 + 0.28 * Math.sin(u * 3 + 0.4);
          const amp = (0.08 + 0.22 * rc() * rc()) * density * (ch === 1 ? (0.75 + 0.5 * rc()) : (0.45 + 0.45 * rc()));
          const len = Math.floor(sr * (0.0025 + 0.0045 * rc()));
          const freq = 900 + 1450 * rc();
          const w0 = TAU * freq / sr;
          let bp = 0, prev = 0;
          for (let k = 0; k < len && idx + k < n; k++) {
            const env = Math.sin((k / len) * Math.PI) * Math.exp(-3.2 * k / len);
            const exc = (rc() * 2 - 1) * 0.65 + Math.sin(w0 * k) * 0.35;
            bp = 0.68 * bp + 0.32 * exc;
            const hp = bp - prev * 0.85;
            prev = bp;
            d[idx + k] += hp * amp * env;
          }
        }
        return d;
      });

      // Layer 4: eavesAndAir (21.1 s) — Gentle outdoor canopy air & wooden sill/eaves resonance (250–1400 Hz)
      const eavesBuf = K.loopBuffer(ctx, 'nook_eaves_v4', 21.1, (n, sr, ch) => {
        const d = new Float32Array(n);
        const rc = K.rng(4040 + ch * 211);
        const side = ch === 1 ? 1.15 : 0.85;
        let lp = 0, sub = 0;
        const wStep = TAU / (21.1 * sr);
        for (let i = 0; i < n; i++) {
          const w = rc() * 2 - 1;
          const u = i * wStep;
          const mod = 0.78 + 0.14 * Math.sin(u * 2 - ch * 1.1) + 0.08 * Math.cos(u * 5 + 0.7);
          lp += 0.14 * (w - lp);
          sub += 0.032 * (lp - sub);
          d[i] = (lp - sub) * mod * side * 0.65;
        }
        return d;
      });

      const tg = targets(st);

      const s1 = K.loop(ctx, roomBuf, 1, R() * 15);
      const f1 = K.filt(ctx, 'lowpass', tg.roomCut, 0.6);
      const g1 = K.gain(ctx, tg.roomGain);
      K.chain(s1, f1, g1, out);

      const s2 = K.loop(ctx, breezeBuf, 1, R() * 18);
      const f2 = K.filt(ctx, 'lowpass', tg.breezeCut, 0.65);
      const g2 = K.gain(ctx, tg.breezeGain);
      K.chain(s2, f2, g2, out);

      const s3 = K.loop(ctx, rainBuf, 1, R() * 12);
      const f3 = K.filt(ctx, 'lowpass', tg.rainCut, 0.6);
      const g3 = K.gain(ctx, tg.rainGain);
      K.chain(s3, f3, g3, out);

      const s4 = K.loop(ctx, eavesBuf, 1, R() * 16);
      const f4 = K.filt(ctx, 'lowpass', tg.eavesCut, 0.65);
      const g4 = K.gain(ctx, tg.eavesGain);
      K.chain(s4, f4, g4, out);

      return {
        nodes: [s1, s2, s3, s4],
        roomVerb,
        extVerb,
        set(st2) {
          const t2 = targets(st2);
          K.glide(ctx, g1.gain, t2.roomGain, 1.4);
          K.glide(ctx, f1.frequency, t2.roomCut, 1.4);
          K.glide(ctx, g2.gain, t2.breezeGain, 1.4);
          K.glide(ctx, f2.frequency, t2.breezeCut, 1.4);
          K.glide(ctx, g3.gain, t2.rainGain, 1.4);
          K.glide(ctx, f3.frequency, t2.rainCut, 1.4);
          K.glide(ctx, g4.gain, t2.eavesGain, 1.4);
          K.glide(ctx, f4.frequency, t2.eavesCut, 1.4);
        },
      };
    },

    details: {
      // 1. Old wooden bookcase / floorboards settling: tight stick-slip friction groan through wood formants
      woodCreak: {
        when: () => true,
        rate: (st) => 2.0 + (st.storm || 0) * 1.5 + (st.e < -0.1 ? 0.6 : 0),
        gap: 15,
        gain: 0.68,
        pan: [-0.85, 0.35],
        play(ctx, out, R, st, X) {
          sendTo(ctx, out, X.roomVerb, 0.40);
          const t0 = ctx.currentTime + 0.02;
          const dur = 0.26 + R() * 0.18;
          const fWood1 = 270 + R() * 110;
          const fWood2 = fWood1 * (2.15 + R() * 0.25);
          const rate0 = 58 + R() * 24;
          resonantNoiseHit(
            ctx, out, t0, dur,
            (x) => {
              const u = x / dur;
              const env = Math.sin(u * Math.PI) ** 1.25;
              const phase = x * rate0 * (1 - 0.42 * u);
              const slip = Math.max(0, Math.sin(TAU * phase)) ** 5;
              return ((Math.random() * 2 - 1) * 0.68 + Math.sin(TAU * fWood1 * x) * 0.32) * env * (0.2 + 0.8 * slip);
            },
            [
              [fWood1 * 0.55, 3.8, 2.0, fWood1 * 0.48],
              [fWood1, 5.5, 3.0, fWood1 * 0.88],
              [fWood2, 4.5, 1.6, fWood2 * 0.90],
            ],
            1450
          );
        },
      },

      // 2. Window sash & curtain fabric gentle breath/settle when breeze or rain pushes against the pane
      windowSash: {
        when: (st) => (st.wind || 0) >= 0.14 || (st.r || 0) > 0.2 || (st.s || 0) > 0.2,
        rate: (st) => 1.8 + (st.wind || 0) * 1.8 + (st.storm || 0) * 1.4,
        gap: 14,
        gain: 0.66,
        pan: [-0.05, 0.80],
        play(ctx, out, R, st, X) {
          sendTo(ctx, out, X.roomVerb, 0.36);
          const t0 = ctx.currentTime + 0.02;
          const dur = 0.55 + R() * 0.35;
          resonantNoiseHit(
            ctx, out, t0, dur,
            (x) => {
              const u = x / dur;
              return (Math.random() * 2 - 1) * Math.sin(u * Math.PI) ** 1.35 * (0.75 + 0.25 * Math.sin(x * 18));
            },
            [
              [380 + R() * 140, 2.0, 2.1, 520 + R() * 140],
              [1150 + R() * 350, 2.8, 1.1, 850 + R() * 200],
            ],
            1750
          );
          const tc = t0 + dur * (0.4 + 0.25 * R());
          resonantNoiseHit(
            ctx, out, tc, 0.075,
            (x) => (Math.random() * 2 - 1) * Math.exp(-x / 0.011),
            [
              [260 + R() * 70, 4.5, 3.0],
              [680 + R() * 160, 5.5, 2.0],
            ],
            1400
          );
        },
      },

      // 3. Warm ceramic tea mug / stoneware gentle dry settle on the wooden windowsill (ultra-short decay, no metallic ring!)
      cupSettle: {
        when: (st) => (st.storm || 0) < 0.75,
        rate: () => 1.7,
        gap: 22,
        gain: 0.74,
        pan: [0.25, 0.55],
        play(ctx, out, R, st, X) {
          sendTo(ctx, out, X.roomVerb, 0.34);
          const t0 = ctx.currentTime + 0.02;
          const fCer = 1350 + R() * 320;
          resonantNoiseHit(
            ctx, out, t0, 0.085,
            (x) => (Math.random() * 2 - 1) * Math.min(1, x / 0.001) * Math.exp(-x / 0.0085),
            [
              [270 + R() * 50, 3.8, 5.2],   // Wooden sill body
              [690 + R() * 110, 5.0, 3.5],  // Thick mug wall
              [fCer, 7.5, 2.2],             // Muted stoneware formant
            ],
            2200
          );
          if (R() < 0.65) {
            const t1 = t0 + 0.052 + R() * 0.04;
            resonantNoiseHit(
              ctx, out, t1, 0.075,
              (x) => (Math.random() * 2 - 1) * Math.min(1, x / 0.001) * Math.exp(-x / 0.0075),
              [
                [245 + R() * 40, 3.8, 4.0],
                [580 + R() * 90, 4.8, 2.5],
              ],
              1600
            );
          }
        },
      },

      // 4. Pillar candles on the books / warm lamp wick soft flame flutter & delicate wax tick
      candleWick: {
        when: (st) => st.e < 0.08 || (st.r || 0) > 0.35 || (st.s || 0) > 0.35,
        rate: (st) => (st.e < -0.05 ? 2.4 : 1.8),
        gap: 15,
        gain: 0.60,
        pan: [-0.55, 0.65],
        play(ctx, out, R, st, X) {
          sendTo(ctx, out, X.roomVerb, 0.28);
          const t0 = ctx.currentTime + 0.01;
          const dur = 0.40;
          // Warm low-mid flame breath flutter
          resonantNoiseHit(
            ctx, out, t0, dur,
            (x) => (Math.random() * 2 - 1) * Math.sin((x / dur) * Math.PI) * (0.6 + 0.4 * Math.sin(x * 38)),
            [
              [280 + R() * 90, 2.0, 3.0],
              [640 + R() * 150, 2.5, 1.8],
            ],
            1350
          );
          // 1 or 2 ultra-soft, warm wax micro-ticks (never sharp or snappy)
          const n = 1 + Math.floor(R() * 2);
          for (let i = 0; i < n; i++) {
            const ts = t0 + 0.06 + R() * 0.22;
            K.snap(ctx, out, ts, 0.11 + R() * 0.06, 850, 2400, 0.0022);
          }
        },
      },

      // 5. Soft moth wings brushing the fabric lampshade at dusk & night (purely papery/fabric rustle)
      mothShade: {
        when: (st) => st.e < 0.05 && (st.storm || 0) < 0.5,
        rate: (st) => (st.e < -0.2 ? 2.8 : 1.9),
        gap: 14,
        gain: 0.68,
        pan: [-0.62, -0.38],
        play(ctx, out, R, st, X) {
          sendTo(ctx, out, X.roomVerb, 0.34);
          const t0 = ctx.currentTime + 0.02;
          const flutters = 2 + Math.floor(R() * 2);
          let t = t0;
          for (let i = 0; i < flutters; i++) {
            const dur = 0.10 + R() * 0.045;
            const scale = (1 - i * 0.15) * (0.85 + 0.3 * R());
            resonantNoiseHit(
              ctx, out, t, dur,
              (x) => {
                const u = x / dur;
                const wing = 0.55 + 0.45 * Math.sin(x * TAU * (36 + R() * 12));
                return (Math.random() * 2 - 1) * Math.sin(u * Math.PI) ** 1.25 * wing * scale;
              },
              [
                [380 + R() * 90, 2.2, 3.1],   // Hollow parchment/fabric shade body
                [1380 + R() * 360, 2.0, 2.0], // Soft papery wing brush
              ],
              2300
            );
            t += dur + 0.045 + R() * 0.065;
          }
        },
      },

      // 6. Cluster of individual raindrops pattering on the 4 window panes
      glassDrops: {
        when: (st) => (st.r || 0) > 0.06,
        rate: (st) => 3.4 + (st.r || 0) * 5.0 + (st.storm || 0) * 2.0,
        gap: 5.0,
        gain: 0.74,
        pan: [0.0, 0.80],
        play(ctx, out, R, st, X) {
          sendTo(ctx, out, X.roomVerb, 0.30);
          const t0 = ctx.currentTime + 0.01;
          const count = 4 + Math.floor(R() * (4 + (st.r || 0) * 4));
          let t = t0;
          for (let i = 0; i < count; i++) {
            const fGlass = 980 + R() * 720;
            const fSash = 330 + R() * 110;
            const a = (0.85 + 0.35 * R()) * (0.75 + 0.25 * (st.r || 0.5));
            resonantNoiseHit(
              ctx, out, t, 0.065,
              (x) => (Math.random() * 2 - 1) * Math.min(1, x / 0.0012) * Math.exp(-x / 0.008) * a,
              [
                [fSash, 3.5, 3.0],
                [fGlass, 4.8, 3.4],
                [fGlass * 1.6, 4.2, 1.6],
              ],
              2800
            );
            t += 0.045 + R() * 0.12;
          }
        },
      },

      // 7. Water rivulet sliding down the window pane and ticking on the wooden muntin/sill
      windowRivulet: {
        when: (st) => (st.r || 0) > 0.22,
        rate: (st) => 2.0 + (st.r || 0) * 2.8,
        gap: 9.5,
        gain: 0.72,
        pan: [0.05, 0.75],
        play(ctx, out, R, st, X) {
          sendTo(ctx, out, X.roomVerb, 0.30);
          const t0 = ctx.currentTime + 0.02;
          const dur = 0.65 + R() * 0.40;
          const fStart = 700 + R() * 250;
          const fEnd = fStart * (1.35 + R() * 0.25);
          resonantNoiseHit(
            ctx, out, t0, dur,
            (x) => {
              const u = x / dur;
              const env = Math.sin(u * Math.PI) ** 1.25;
              const mod = 0.55 + 0.45 * Math.sin(x * 38 + Math.sin(x * 12) * 2.2);
              return (Math.random() * 2 - 1) * env * mod;
            },
            [
              [380 + R() * 90, 2.2, 2.0],
              [fStart, 3.2, 3.0, fEnd],
            ],
            2200
          );
          for (let i = 0; i < 3; i++) {
            const td = t0 + dur * (0.2 + 0.55 * R());
            resonantNoiseHit(
              ctx, out, td, 0.055,
              (x) => (Math.random() * 2 - 1) * Math.exp(-x / 0.007),
              [
                [420 + R() * 110, 3.8, 2.5],
                [1220 + R() * 380, 5.0, 2.6],
              ],
              2500
            );
          }
        },
      },

      // 8. Eaves / gutter drops falling onto the exterior wooden ledge, heard through the closed window
      gutterDrip: {
        when: (st) => (st.r || 0) > 0.12,
        rate: (st) => 2.4 + (st.r || 0) * 3.2,
        gap: 7.5,
        gain: 0.72,
        pan: [0.48, 0.88],
        play(ctx, out, R, st, X) {
          sendTo(ctx, out, X.extVerb, 0.50);
          const t0 = ctx.currentTime + 0.01;
          const drops = 2 + Math.floor(R() * 3);
          let t = t0;
          for (let i = 0; i < drops; i++) {
            const f0 = 460 + R() * 190;
            const scale = 0.85 + 0.3 * R();
            resonantNoiseHit(
              ctx, out, t, 0.08,
              (x) => (Math.random() * 2 - 1) * Math.min(1, x / 0.0015) * Math.exp(-x / 0.0095) * scale,
              [
                [260 + R() * 60, 3.5, 3.2],
                [f0 * 0.85, 5.5, 3.6, f0 * 1.32],
                [980 + R() * 220, 4.5, 1.8, 1280],
              ],
              1650
            );
            t += 0.14 + R() * 0.22;
          }
        },
      },

      // 9. Storm wind gust & spray of raindrops sweeping across the window
      stormGust: {
        when: (st) => (st.storm || 0) > 0.2 || ((st.r || 0) > 0.5 && (st.wind || 0) > 0.5),
        rate: (st) => 2.4 + (st.storm || 0) * 3.0,
        gap: 9.5,
        gain: 0.76,
        pan: [-0.05, 0.85],
        play(ctx, out, R, st, X) {
          sendTo(ctx, out, X.roomVerb, 0.30);
          sendTo(ctx, out, X.extVerb, 0.38);
          const t0 = ctx.currentTime + 0.02;
          const dur = 1.15 + R() * 0.45;
          resonantNoiseHit(
            ctx, out, t0, dur,
            (x) => {
              const u = x / dur;
              return (Math.random() * 2 - 1) * Math.sin(u * Math.PI) ** 1.35 * (0.75 + 0.25 * Math.sin(x * 12));
            },
            [
              [320 + R() * 90, 1.6, 2.8, 580 + R() * 140],
              [780 + R() * 180, 2.0, 1.8, 1180],
            ],
            1600
          );
          const sprayCount = 6 + Math.floor(R() * 5);
          for (let i = 0; i < sprayCount; i++) {
            const td = t0 + dur * (0.18 + 0.58 * R());
            resonantNoiseHit(
              ctx, out, td, 0.055,
              (x) => (Math.random() * 2 - 1) * Math.exp(-x / 0.0065),
              [
                [380 + R() * 100, 3.8, 2.4],
                [1280 + R() * 600, 5.0, 2.8],
              ],
              2700
            );
          }
        },
      },

      // 10. Morning / daytime bird in the pines outside, heard muffled through the closed window
      dawnBird: {
        when: (st) => (st.r || 0) < 0.25 && (st.s || 0) < 0.3 && st.e > -0.08,
        rate: (st) => (st.h < 10 ? 4.8 : st.e > 0.2 ? 2.8 : 1.8) * (1 - (st.r || 0) * 3),
        gap: 7.5,
        gain: 0.56,
        pan: [0.05, 0.82],
        play(ctx, out, R, st, X) {
          sendTo(ctx, out, X.extVerb, 0.52);
          const t0 = ctx.currentTime + 0.02;
          const winLp = K.filt(ctx, 'lowpass', 1850, 0.7);
          winLp.connect(out);

          if (R() < 0.48) {
            // Archetype A: Wood pigeon (pigeon ramier) cooing softly in the pines ("coo-roo... coo")
            const base = 460 + R() * 70;
            const pattern = [
              [0.0, 0.26, base * 0.94, base * 1.05, 0.42],
              [0.32, 0.38, base * 1.08, base * 0.92, 0.52],
              [0.78, 0.24, base * 0.96, base * 0.91, 0.34],
            ];
            for (const [dt, dur, f1, f2, amp] of pattern) {
              const t = t0 + dt + R() * 0.02;
              const nb = ctx.createBufferSource();
              nb.buffer = shapedBuf(ctx, dur, (x) => {
                const u = x / dur;
                const env = Math.sin(u * Math.PI) ** 1.3 * (0.72 + 0.28 * Math.sin(x * TAU * 30));
                const fInst = f1 + (f2 - f1) * u;
                const w = Math.random() * 2 - 1;
                return (Math.sin(TAU * fInst * x) * 0.52 + w * 0.48) * env;
              });
              const bp = K.filt(ctx, 'bandpass', (f1 + f2) * 0.5, 4.2);
              K.run(ctx, winLp, t, t + dur, nb, bp, K.gain(ctx, amp));
            }
          } else {
            // Archetype B: Forest songbird warble through glass — breath-textured syrinx notes
            const base = 1420 + R() * 420;
            const notes = 3 + Math.floor(R() * 2);
            let t = t0;
            for (let i = 0; i < notes; i++) {
              const dur = 0.085 + R() * 0.065;
              const fStart = base * (0.88 + R() * 0.26);
              const fEnd = fStart * (R() < 0.5 ? 1.15 : 0.86);
              const amp = (0.40 + 0.12 * R()) * (1 - i * 0.1);
              const nb = ctx.createBufferSource();
              nb.buffer = shapedBuf(ctx, dur, (x) => {
                const u = x / dur;
                const env = Math.sin(u * Math.PI) ** 1.4 * (0.78 + 0.22 * Math.sin(x * TAU * 38));
                const fInst = fStart + (fEnd - fStart) * u;
                const w = Math.random() * 2 - 1;
                return (Math.sin(TAU * fInst * x) * 0.48 + w * 0.52) * env;
              });
              const bp = K.filt(ctx, 'bandpass', (fStart + fEnd) * 0.5, 5.0);
              K.run(ctx, winLp, t, t + dur, nb, bp, K.gain(ctx, amp));
              t += dur + 0.045 + R() * 0.065;
            }
          }
          setTimeout(() => winLp.disconnect(), 2500);
        },
      },

      // 11. Dusk & night garden cricket stridulation outside (2-3 gentle phrases softened by the window)
      duskCricket: {
        when: (st) => (st.r || 0) < 0.2 && (st.s || 0) < 0.1 && st.e < 0.08 && (st.h > 18 || st.h < 5.5),
        rate: (st) => (st.e < -0.2 ? 3.5 : 3.8),
        gap: 8,
        gain: 0.58,
        pan: [0.05, 0.85],
        play(ctx, out, R, st, X) {
          sendTo(ctx, out, X.extVerb, 0.48);
          const t0 = ctx.currentTime + 0.02;
          const phrases = 2 + Math.floor(R() * 2);
          const f0 = 2350 + R() * 380;
          const pulseRate = 30 + R() * 8;
          let t = t0;
          for (let p = 0; p < phrases; p++) {
            const dur = 0.13 + R() * 0.05;
            const s = ctx.createBufferSource();
            s.buffer = shapedBuf(ctx, dur, (x) => {
              const env = Math.sin((x / dur) * Math.PI) ** 1.2;
              const pulse = Math.max(0, Math.sin(x * TAU * pulseRate)) ** 2;
              const w = Math.random() * 2 - 1;
              const carrier = Math.sin(x * TAU * f0) * 0.38 + Math.sin(x * TAU * f0 * 0.5) * 0.14 + w * 0.48;
              return carrier * env * pulse;
            });
            const bp = K.filt(ctx, 'bandpass', f0, 5.5);
            const winLp = K.filt(ctx, 'lowpass', 2250, 0.7);
            K.run(ctx, out, t, t + dur, s, bp, winLp, K.gain(ctx, 0.48 * (1 - p * 0.12)));
            t += dur + 0.14 + R() * 0.14;
          }
        },
      },

      // 12. Distant tawny owl in the pine forest at night, heard through the closed window
      nightOwl: {
        when: (st) => st.e < -0.25 && (st.r || 0) < 0.35,
        rate: () => 2.5,
        gap: 18,
        gain: 0.62,
        pan: [0.10, 0.78],
        play(ctx, out, R, st, X) {
          sendTo(ctx, out, X.extVerb, 0.60);
          window.SCENE_SOUNDS.nook.sfx.owl(ctx, out, R, st, X);
        },
      },

      // 13. Soft snow slip on the exterior wooden windowsill or pine bough in snowy weather
      snowSlip: {
        when: (st) => (st.s || 0) > 0.2,
        rate: (st) => 3.4 + (st.s || 0) * 2.0,
        gap: 8.5,
        gain: 0.68,
        pan: [0.05, 0.80],
        play(ctx, out, R, st, X) {
          sendTo(ctx, out, X.extVerb, 0.44);
          sendTo(ctx, out, X.roomVerb, 0.28);
          const t0 = ctx.currentTime + 0.02;
          const slideDur = 0.42 + R() * 0.24;
          resonantNoiseHit(
            ctx, out, t0, slideDur,
            (x) => {
              const u = x / slideDur;
              return (Math.random() * 2 - 1) * (u ** 0.65) * Math.sin(u * Math.PI);
            },
            [
              [480 + R() * 160, 1.6, 2.2, 720],
              [950 + R() * 220, 2.0, 1.5, 620],
            ],
            1350
          );
          const thumpT = t0 + slideDur * 0.68;
          resonantNoiseHit(
            ctx, out, thumpT, 0.15,
            (x) => (Math.random() * 2 - 1) * Math.min(1, x / 0.003) * Math.exp(-x / 0.020),
            [
              [155 + R() * 35, 2.5, 4.0, 125],
              [310 + R() * 60, 3.2, 2.6, 250],
            ],
            850
          );
        },
      },

      // 14. Distant valley life through the closed window (pine canopy swell or rare distant village bell)
      distantValley: {
        when: (st) => st.e > -0.2 && (st.storm || 0) < 0.4,
        rate: () => 1.6,
        gap: 26,
        gain: 0.56,
        pan: [0.10, 0.75],
        play(ctx, out, R, st, X) {
          sendTo(ctx, out, X.extVerb, 0.56);
          if (R() < 0.28) {
            window.SCENE_SOUNDS.nook.sfx.bell(ctx, out, R, st, X);
          } else {
            const t0 = ctx.currentTime + 0.02;
            const dur = 0.95 + R() * 0.45;
            resonantNoiseHit(
              ctx, out, t0, dur,
              (x) => {
                const u = x / dur;
                return (Math.random() * 2 - 1) * Math.sin(u * Math.PI) ** 1.4 * (0.75 + 0.25 * Math.sin(x * 14));
              },
              [
                [380 + R() * 120, 1.8, 2.4, 580 + R() * 120],
                [780 + R() * 180, 2.2, 1.6, 520 + R() * 100],
              ],
              1350
            );
          }
        },
      },
    },

    sfx: {
      // A wooden match struck to light the reading lamp or windowsill candles
      match(ctx, out, R, st, X) {
        if (X && X.roomVerb) sendTo(ctx, out, X.roomVerb, 0.25);
        const t0 = ctx.currentTime + 0.01;
        const strikeLen = 0.08 + R() * 0.035;
        const grainRate = 55 + R() * 35;
        resonantNoiseHit(
          ctx, out, t0, strikeLen,
          (x) => {
            const grain = 0.35 + 0.65 * Math.abs(Math.sin(Math.PI * grainRate * x));
            const env = Math.sin((x / strikeLen) * Math.PI);
            return (Math.random() * 2 - 1) * grain * env;
          },
          [
            [360 + R() * 60, 3.5, 1.8],
            [1850, 1.8, 2.4, 1180],
          ],
          3200
        );

        const tf = t0 + strikeLen * 0.8;
        const flareLen = 0.38;
        const fl = ctx.createBufferSource();
        fl.buffer = shapedBuf(ctx, flareLen, (x) => {
          const env = Math.min(1, x / 0.035) * Math.exp(-x / 0.11);
          return (Math.random() * 2 - 1) * env;
        });
        const fhp = K.filt(ctx, 'highpass', 190, 0.7);
        const flp = K.filt(ctx, 'lowpass', 1750, 0.7);
        flp.frequency.setValueAtTime(1850, tf);
        flp.frequency.exponentialRampToValueAtTime(820, tf + flareLen);
        K.run(ctx, out, tf, tf + flareLen, fl, fhp, flp, K.gain(ctx, 0.34));

        for (let i = 0; i < 4; i++) {
          const tc = tf + 0.05 + R() * 0.24;
          K.snap(ctx, out, tc, 0.07 + R() * 0.05, 1100, 3400, 0.0022);
        }
      },

      // A soft breath blowing out a candle or oil lamp
      puff(ctx, out, R, st, X) {
        if (X && X.roomVerb) sendTo(ctx, out, X.roomVerb, 0.24);
        const t0 = ctx.currentTime + 0.01;
        const dur = 0.34;
        const s = ctx.createBufferSource();
        s.buffer = shapedBuf(ctx, dur, (x) => {
          const env = Math.min(1, x / 0.028) * Math.exp(-x / 0.075);
          return (Math.random() * 2 - 1) * env;
        });
        const hp = K.filt(ctx, 'highpass', 140, 0.7);
        const bp = K.filt(ctx, 'bandpass', 740 + R() * 140, 1.1);
        bp.frequency.setValueAtTime(840, t0);
        bp.frequency.exponentialRampToValueAtTime(320, t0 + dur * 0.85);
        const lp = K.filt(ctx, 'lowpass', 1450, 0.7);
        K.run(ctx, out, t0, t0 + dur, s, hp, bp, lp, K.gain(ctx, 0.46));
        K.snap(ctx, out, t0 + 0.14 + R() * 0.05, 0.05, 1000, 2600, 0.002);
      },

      // Table lamp switch (warm mechanical toggle + wooden side table body)
      click(ctx, out, R, st, X) {
        if (X && X.roomVerb) sendTo(ctx, out, X.roomVerb, 0.24);
        const t0 = ctx.currentTime + 0.01;
        resonantNoiseHit(
          ctx, out, t0, 0.055,
          (x) => (Math.random() * 2 - 1) * Math.min(1, x / 0.0008) * Math.exp(-x / 0.005),
          [
            [210 + R() * 40, 3.2, 3.4],
            [620 + R() * 90, 4.5, 2.6],
            [1750 + R() * 300, 5.5, 1.8],
          ],
          3400
        );
        const t1 = t0 + 0.018 + R() * 0.008;
        resonantNoiseHit(
          ctx, out, t1, 0.045,
          (x) => (Math.random() * 2 - 1) * Math.min(1, x / 0.0008) * Math.exp(-x / 0.0045),
          [
            [230 + R() * 40, 3.2, 2.2],
            [1220 + R() * 220, 5.0, 1.5],
          ],
          2600
        );
      },

      // Distant valley church bell heard through the closed window (clean bronze partials + woody strike)
      bell(ctx, out, R, st, X) {
        if (X && X.extVerb) sendTo(ctx, out, X.extVerb, 0.58);
        const t0 = ctx.currentTime + 0.02;
        const f0 = 330 + R() * 55;
        const winLp = K.filt(ctx, 'lowpass', 1150, 0.7);
        winLp.connect(out);
        resonantNoiseHit(
          ctx, winLp, t0, 0.07,
          (x) => (Math.random() * 2 - 1) * Math.exp(-x / 0.008),
          [
            [f0, 8.0, 1.8],
            [f0 * 1.5, 10.0, 1.2],
          ],
          1200
        );
        const s = ctx.createBufferSource();
        const dur = 1.3;
        s.buffer = shapedBuf(ctx, dur, (x) => {
          const att = Math.min(1, x / 0.006);
          return att * (
            Math.sin(TAU * f0 * 0.5 * x) * 0.16 * Math.exp(-x / 0.42) +
            Math.sin(TAU * f0 * 1.0 * x) * 0.28 * Math.exp(-x / 0.34) +
            Math.sin(TAU * f0 * 1.188 * x) * 0.17 * Math.exp(-x / 0.25) +
            Math.sin(TAU * f0 * 1.504 * x) * 0.12 * Math.exp(-x / 0.18) +
            Math.sin(TAU * f0 * 2.002 * x) * 0.13 * Math.exp(-x / 0.14)
          );
        });
        K.run(ctx, winLp, t0, t0 + dur, s);
        setTimeout(() => winLp.disconnect(), 1800);
      },

      // Hollow wooden frame / shutter knock
      knock(ctx, out, R, st, X) {
        if (X && X.roomVerb) sendTo(ctx, out, X.roomVerb, 0.34);
        const t0 = ctx.currentTime + 0.01;
        const f0 = 260 + R() * 55;
        resonantNoiseHit(
          ctx, out, t0, 0.095,
          (x) => (Math.random() * 2 - 1) * Math.min(1, x / 0.0012) * Math.exp(-x / 0.010),
          [
            [f0 * 0.55, 3.5, 3.4],
            [f0, 5.5, 3.8],
            [f0 * 1.92, 4.5, 2.0],
          ],
          1800
        );
      },

      // Soft ceramic/brass wind-chime near the window
      chime(ctx, out, R, st, X) {
        if (X && X.roomVerb) sendTo(ctx, out, X.roomVerb, 0.36);
        const t0 = ctx.currentTime + 0.01;
        const f0 = 880 + R() * 220;
        const hits = 1 + Math.floor(R() * 2);
        for (let i = 0; i < hits; i++) {
          const t = t0 + i * (0.16 + R() * 0.14);
          const f = f0 * (i === 0 ? 1 : 1.18 + R() * 0.12);
          resonantNoiseHit(
            ctx, out, t, 0.28,
            (x) => (Math.random() * 2 - 1) * Math.min(1, x / 0.0015) * Math.exp(-x / 0.028),
            [
              [f, 16.0, 2.8],
              [f * 2.28, 18.0, 1.4],
            ],
            2600
          );
        }
      },

      // Distant tawny owl in the pines heard through the closed window ("hooo... hoo-hoo")
      owl(ctx, out, R, st, X) {
        if (X && X.extVerb) sendTo(ctx, out, X.extVerb, 0.58);
        const t0 = ctx.currentTime + 0.02;
        const f0 = 365 + R() * 45;
        const winLp = K.filt(ctx, 'lowpass', 860, 0.7);
        winLp.connect(out);
        const calls = [
          [0.0, 0.42, f0 * 1.02, f0 * 0.94, 0.38],
          [0.72 + R() * 0.12, 0.18, f0 * 1.04, f0 * 0.98, 0.26],
          [0.98 + R() * 0.14, 0.48, f0 * 0.99, f0 * 0.89, 0.36],
        ];
        for (const [dt, dur, fStart, fEnd, amp] of calls) {
          const t = t0 + dt;
          const nb = ctx.createBufferSource();
          nb.buffer = shapedBuf(ctx, dur, (x) => {
            const u = x / dur;
            const env = Math.sin(u * Math.PI) ** 1.35 * (0.82 + 0.18 * Math.sin(x * TAU * 15));
            const fInst = fStart + (fEnd - fStart) * u;
            const w = Math.random() * 2 - 1;
            return (Math.sin(TAU * fInst * x) * 0.52 + w * 0.48) * env;
          });
          const bp = K.filt(ctx, 'bandpass', (fStart + fEnd) * 0.5, 4.2);
          K.run(ctx, winLp, t, t + dur, nb, bp, K.gain(ctx, amp));
        }
        setTimeout(() => winLp.disconnect(), 2600);
      },
    },
  };
})();
