// Liseuse à la lampe — Sound pack for scene 'lake' (Lac) — Round 3
(function () {
  const TAU = Math.PI * 2;

  // Normalize a mono detail buffer to a predictable peak so resonant filters never clip or jump.
  function normPeak(d, peak = 0.5) {
    let m = 0;
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > m) m = a;
    }
    if (m > 1e-6) {
      const k = peak / m;
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
    return d;
  }

  // Send a detail's output node into the open-air lake reverb, scaled by the detail's gain.
  function sendVerb(ctx, K, srcNode, out, X, wet, dur) {
    if (!X || !X.verb) return;
    const baseG = out && out.gain ? out.gain.value : 0.4;
    const send = K.gain(ctx, wet * baseG);
    srcNode.connect(send);
    send.connect(X.verb);
    setTimeout(() => { try { send.disconnect(); } catch (e) {} }, (dur || 4) * 1000 + 300);
  }

  window.SCENE_SOUNDS = window.SCENE_SOUNDS || {};

  window.SCENE_SOUNDS.lake = {
    bed(ctx, out, K, st) {
      // 1. Open-air mountain lake reverb (1.75 s stereo IR: fast to build, wide and warm)
      const verb = K.reverb(ctx, out, 1.75, 3.1, 0.66, 0.28);

      // 2. Layer 1: Shoreline water lapping on pebbles & shallow reeds (17 s stereo loop)
      const waterBuf = K.loopBuffer(ctx, 'lake_water_v3', 17, (n, sr, ch) => {
        const R = K.rng(107 + ch * 49);
        const d = new Float32Array(n);
        const raw = new Float32Array(n);
        K.pinkInto(raw, 1.0, R);

        // Subtle continuous capillary ripple across shallow stones (band-limited 420..1550 Hz, no low-mid hum)
        let lp1 = 0, bp1 = 0, lp2 = 0, bp2 = 0;
        const f1 = TAU * 460 / sr, f2 = TAU * 1120 / sr;
        for (let i = 0; i < n; i++) {
          const x = raw[i];
          const hp1 = x - lp1 - 0.55 * bp1; bp1 += f1 * hp1; lp1 += f1 * bp1;
          const hp2 = x - lp2 - 0.58 * bp2; bp2 += f2 * hp2; lp2 += f2 * bp2;
          const u = i / n;
          const mod = 0.60
            + 0.24 * Math.sin(TAU * (2 * u + ch * 0.33))
            + 0.16 * Math.sin(TAU * (5 * u + 0.2 - ch * 0.41));
          d[i] = (bp1 * 0.45 + bp2 * 0.55) * mod * 0.16;
        }

        // 48 overlapping organic wavelet ripples washing over pebbles and receding
        let t0 = 0.08 + ch * 0.19;
        while (t0 < 16.6) {
          const dur = 0.55 + R() * 0.95;
          const s0 = (t0 * sr) | 0;
          const len = Math.min(n - s0, (dur * sr) | 0);
          const fStart = 310 + R() * 240;
          const fPeak = fStart + 280 + R() * 540;
          const amp = 0.45 + R() * 0.55;
          const qDamp = 0.20 + R() * 0.15;
          let zLp = 0, zBp = 0, wLp = 0, wBp = 0;
          const fWash = TAU * (1200 + R() * 620) / sr;
          for (let k = 0; k < len; k++) {
            const x = k / len;
            const arch = Math.sin(Math.PI * x);
            const env = arch * (1 - 0.42 * x) * amp;
            const fCur = fStart + (fPeak - fStart) * arch;
            const f = TAU * fCur / sr;
            const inp = raw[s0 + k];
            const hp = inp - zLp - qDamp * zBp;
            zBp += f * hp; zLp += f * zBp;
            const wHp = inp - wLp - 0.42 * wBp;
            wBp += fWash * wHp; wLp += fWash * wBp;
            d[s0 + k] += (zBp * 0.68 + wBp * 0.32 * arch) * env;
          }
          t0 += 0.26 + R() * 0.34;
        }
        return d;
      });

      // 3. Layer 2: Open mountain breeze across the lake & pine hills (19 s stereo loop)
      const breezeBuf = K.loopBuffer(ctx, 'lake_breeze_v3', 19, (n, sr, ch) => {
        const R = K.rng(223 + ch * 61);
        const d = new Float32Array(n);
        const pink = new Float32Array(n);
        K.pinkInto(pink, 1.0, R);
        K.brownInto(d, 0.45, 0.018, R);
        let lp = 0, bp = 0;
        const fAir = TAU * 740 / sr;
        for (let i = 0; i < n; i++) {
          const u = i / n;
          const swell = 0.62
            + 0.22 * Math.sin(TAU * (2 * u + ch * 0.27))
            + 0.16 * Math.sin(TAU * (5 * u + 0.37 - ch * 0.21));
          const hp = pink[i] - lp - 0.62 * bp;
          bp += fAir * hp; lp += fAir * bp;
          d[i] = (d[i] * 0.34 + bp * 0.66) * swell;
        }
        return d;
      });

      // 4. Layer 3: Rain on the lake surface — wide aquatic hiss + resonant drop plinks (15 s stereo loop)
      const rainBuf = K.loopBuffer(ctx, 'lake_rain_v3', 15, (n, sr, ch) => {
        const R = K.rng(409 + ch * 83);
        const d = new Float32Array(n);
        const pink = new Float32Array(n);
        K.pinkInto(pink, 1.0, R);
        let lp = 0, hpState = 0;
        for (let i = 0; i < n; i++) {
          const u = i / n;
          const wave = 0.84 + 0.10 * Math.sin(TAU * (2 * u + ch * 0.25)) + 0.06 * Math.sin(TAU * (5 * u - ch * 0.35));
          lp = 0.62 * lp + 0.38 * pink[i];
          hpState = 0.94 * hpState + 0.06 * lp;
          d[i] = (lp - hpState * 0.65) * wave;
        }
        // Purely resonant water-surface micro-plinks scattered across the 15 s loop
        let idx = (sr * 0.015) | 0;
        while (idx < n - (sr * 0.025)) {
          idx += (sr * (0.007 + R() * 0.020)) | 0;
          const dur = 0.007 + R() * 0.010;
          const len = Math.min(n - idx, (dur * sr) | 0);
          const f0 = 750 + R() * 1150;
          const f1 = f0 * (1.25 + R() * 0.25);
          const amp = (0.14 + R() * 0.24) * (R() < 0.25 ? 1.35 : 0.8);
          let zLp = 0, zBp = 0;
          for (let k = 0; k < len; k++) {
            const x = k / len;
            const env = Math.sin(Math.PI * x) * Math.exp(-2.8 * x) * amp;
            const f = TAU * (f0 + (f1 - f0) * x) / sr;
            const hp = pink[idx + k] * 0.16 - zLp - 0.16 * zBp;
            zBp += f * hp; zLp += f * zBp;
            d[idx + k] += zBp * env * 3.5;
          }
        }
        return d;
      });

      // Compute target gains & filter cutoffs for state st
      function targets(s) {
        const r = s.r || 0, sn = s.s || 0, storm = s.storm || 0;
        const wind = s.wind == null ? 0.15 : s.wind;
        const e = s.e == null ? 0.5 : s.e;

        // Dry scenarios target median ~ -28.8 to -27.8 dBFS; rain ~ -25.2 dBFS; storm ~ -22.6 dBFS (strictly <= -22 dBFS)
        const waterGain = (0.33 + 0.11 * wind + 0.04 * storm) * (1 - 0.32 * sn);
        const waterCut = 1380 + 480 * wind + 260 * storm - 340 * sn;

        const breezeGain = 0.15 + 0.20 * wind + 0.10 * storm + 0.04 * sn;
        const breezeCut = 660 + 580 * wind + 360 * storm - 110 * (e < 0 ? 1 : 0);

        const rainAmt = Math.min(1, r + storm * 0.25);
        const rainGain = 0.46 * Math.pow(rainAmt, 0.85);
        const rainCut = 2100 + 1000 * rainAmt + 350 * storm;

        return { waterGain, waterCut, breezeGain, breezeCut, rainGain, rainCut };
      }

      const t0 = targets(st);
      const now = ctx.currentTime;

      // Layer 1 nodes: shoreline water
      const sWater = K.loop(ctx, waterBuf, 1, 0);
      const fWaterHp = K.filt(ctx, 'highpass', 175, 0.7);
      const fWaterLp = K.filt(ctx, 'lowpass', t0.waterCut, 0.65);
      const gWater = K.gain(ctx, 0.0001);
      gWater.gain.setValueAtTime(0.0001, now);
      gWater.gain.linearRampToValueAtTime(t0.waterGain, now + 0.08);
      K.chain(sWater, fWaterHp, fWaterLp, gWater, out);

      // Layer 2 nodes: mountain lake breeze & pines
      const sBreeze = K.loop(ctx, breezeBuf, 1, 0);
      const fBreezeHp = K.filt(ctx, 'highpass', 165, 0.7);
      const fBreezeLp = K.filt(ctx, 'lowpass', t0.breezeCut, 0.6);
      const gBreeze = K.gain(ctx, 0.0001);
      gBreeze.gain.setValueAtTime(0.0001, now);
      gBreeze.gain.linearRampToValueAtTime(t0.breezeGain, now + 0.08);
      const lfoBreeze = ctx.createOscillator();
      const gLfoBreeze = K.gain(ctx, 90);
      lfoBreeze.frequency.value = 0.041;
      K.chain(lfoBreeze, gLfoBreeze, fBreezeLp.frequency);
      lfoBreeze.start();
      K.chain(sBreeze, fBreezeHp, fBreezeLp, gBreeze, out);

      // Layer 3 nodes: rain on lake surface
      const sRain = K.loop(ctx, rainBuf, 1, 0);
      const fRainHp = K.filt(ctx, 'highpass', 270, 0.65);
      const fRainLp = K.filt(ctx, 'lowpass', t0.rainCut, 0.55);
      const gRain = K.gain(ctx, 0.0001);
      gRain.gain.setValueAtTime(0.0001, now);
      gRain.gain.linearRampToValueAtTime(t0.rainGain, now + 0.08);
      K.chain(sRain, fRainHp, fRainLp, gRain, out);

      return {
        nodes: [sWater, sBreeze, lfoBreeze, sRain],
        verb,
        set(s2) {
          const tg = targets(s2);
          const tau = 1.35;
          K.glide(ctx, gWater.gain, tg.waterGain, tau);
          K.glide(ctx, fWaterLp.frequency, tg.waterCut, tau);
          K.glide(ctx, gBreeze.gain, tg.breezeGain, tau);
          K.glide(ctx, fBreezeLp.frequency, tg.breezeCut, tau);
          K.glide(ctx, gRain.gain, tg.rainGain, tau);
          K.glide(ctx, fRainLp.frequency, tg.rainCut, tau);
        },
      };
    },

    details: {
      // 1. Water lapping softly against the wooden jetty planks & pilings (right foreground)
      clapotis_ponton: {
        when: (st) => (st.s || 0) < 0.85,
        rate: (st) => (4.0 + 2.4 * (st.wind || 0.15)) * (1 - 0.4 * (st.s || 0)),
        gap: 8,
        gain: 0.46,
        pan: [0.18, 0.72],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, t0 = ctx.currentTime;
          const count = 2 + ((R() * 3) | 0);
          const dur = 1.45;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n), raw = new Float32Array(n);
            K.pinkInto(raw, 1.0, R);
            let off = 0.02;
            for (let c = 0; c < count; c++) {
              const wDur = 0.25 + R() * 0.22;
              const s0 = (off * sr) | 0, len = Math.min(n - s0, (wDur * sr) | 0);
              const f0 = 260 + R() * 130, f1 = f0 + 240 + R() * 280;
              const woodF = TAU * (185 + R() * 65) / sr;
              const amp = (0.65 + R() * 0.35) * (1 - c * 0.14);
              let lp = 0, bp = 0, wLp = 0, wBp = 0;
              for (let k = 0; k < len; k++) {
                const x = k / len;
                const arch = Math.sin(Math.PI * Math.pow(x, 0.65));
                const env = arch * Math.exp(-1.4 * x) * amp;
                const f = TAU * (f0 + (f1 - f0) * arch) / sr;
                const inp = raw[s0 + k];
                const hp = inp - lp - 0.22 * bp;
                bp += f * hp; lp += f * bp;
                const wHp = inp - wLp - 0.28 * wBp;
                wBp += woodF * wHp; wLp += woodF * wBp;
                d[s0 + k] += (bp * 0.74 + wBp * 0.32) * env;
              }
              off += 0.23 + R() * 0.19;
            }
            return normPeak(d, 0.58);
          });
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 1300, 0.7);
          K.run(ctx, out, t0, t0 + dur, src, lp);
          sendVerb(ctx, K, lp, out, X, 0.26, dur);
        },
      },

      // 2. Reeds and cattails rustling softly in the breeze (delicate papery leaf micro-patter, never sibilant)
      roseaux: {
        rate: (st) => 2.2 + 3.6 * (st.wind || 0.15) + 1.2 * (st.storm || 0),
        gap: 10.5,
        gain: 0.28,
        pan: [-0.85, 0.85],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, t0 = ctx.currentTime;
          const dur = 1.15 + R() * 0.45;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n), pink = new Float32Array(n);
            K.pinkInto(pink, 1.0, R);
            // Soft overarching breeze envelope + 14 delicate dry-stem micro-brushes
            const envBuf = new Float32Array(n);
            for (let i = 0; i < n; i++) {
              const x = i / n;
              envBuf[i] = Math.pow(Math.sin(Math.PI * x), 1.8) * 0.35;
            }
            const brushes = 12 + ((R() * 7) | 0);
            for (let b = 0; b < brushes; b++) {
              const u = 0.08 + R() * 0.82;
              const s0 = (u * n) | 0;
              const bLen = ((0.018 + R() * 0.032) * sr) | 0;
              const amp = (0.35 + R() * 0.45) * Math.sin(Math.PI * u);
              for (let k = 0; k < bLen && s0 + k < n; k++) {
                envBuf[s0 + k] += Math.sin(Math.PI * (k / bLen)) * amp;
              }
            }
            const f1 = TAU * (920 + R() * 320) / sr;
            const f2 = TAU * (1750 + R() * 420) / sr;
            let lp1 = 0, bp1 = 0, lp2 = 0, bp2 = 0;
            for (let i = 0; i < n; i++) {
              const inp = pink[i] * envBuf[i];
              const hp1 = inp - lp1 - 0.35 * bp1; bp1 += f1 * hp1; lp1 += f1 * bp1;
              const hp2 = inp - lp2 - 0.40 * bp2; bp2 += f2 * hp2; lp2 += f2 * bp2;
              d[i] = bp1 * 0.62 + bp2 * 0.38;
            }
            return normPeak(d, 0.42);
          });
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 2250 - 400 * (st.s || 0), 0.7);
          K.run(ctx, out, t0, t0 + dur, src, lp);
          sendVerb(ctx, K, lp, out, X, 0.18, dur);
        },
      },

      // 3. Subtle wooden jetty plank & mooring rope creak
      amarrage_bois: {
        when: (st) => (st.wind || 0.15) > 0.08,
        rate: (st) => 1.5 + 3.0 * (st.wind || 0.15) + 1.5 * (st.storm || 0),
        gap: 16,
        gain: 0.40,
        pan: [0.25, 0.70],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, t0 = ctx.currentTime;
          const dur = 0.50 + R() * 0.25;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n);
            const fWood1 = 235 + R() * 80;
            const fWood2 = fWood1 * (1.82 + R() * 0.22);
            let lp1 = 0, bp1 = 0, lp2 = 0, bp2 = 0;
            const grains = 7 + ((R() * 6) | 0);
            const trig = new Float32Array(n);
            for (let g = 0; g < grains; g++) {
              const u = (g + 0.2 + R() * 0.6) / grains;
              const idx = Math.min(n - 200, (u * dur * 0.78 * sr) | 0);
              const amp = Math.sin(Math.PI * u) * (0.55 + R() * 0.45);
              for (let k = 0; k < 95 && idx + k < n; k++) {
                trig[idx + k] += (R() * 2 - 1) * amp * Math.exp(-k / 24);
              }
            }
            for (let i = 0; i < n; i++) {
              const x = i / n;
              const bend = 1 - 0.11 * x;
              const c1 = TAU * (fWood1 * bend) / sr;
              const c2 = TAU * (fWood2 * bend) / sr;
              const hp1 = trig[i] - lp1 - 0.12 * bp1;
              bp1 += c1 * hp1; lp1 += c1 * bp1;
              const hp2 = trig[i] - lp2 - 0.15 * bp2;
              bp2 += c2 * hp2; lp2 += c2 * bp2;
              d[i] = bp1 * 0.68 + bp2 * 0.32;
            }
            return normPeak(d, 0.54);
          });
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 950, 0.7);
          K.run(ctx, out, t0, t0 + dur, src, lp);
          sendVerb(ctx, K, lp, out, X, 0.22, dur);
        },
      },

      // 4. Small fish rising at the surface (purely resonant liquid plop + expanding water rings, zero sine wave)
      gobage: {
        when: (st) => (st.storm || 0) < 0.35 && (st.s || 0) < 0.3,
        rate: (st) => {
          const calm = Math.max(0.2, 1 - (st.r || 0) * 0.8);
          const crep = Math.abs(st.e || 0) < 0.25 ? 2.8 : (st.e > 0 ? 1.7 : 1.1);
          return crep * calm;
        },
        gap: 12.5,
        gain: 0.48,
        pan: [-0.70, 0.45],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, t0 = ctx.currentTime;
          const dur = 0.65;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n), noise = new Float32Array(n);
            K.pinkInto(noise, 1.0, R);
            let lp = 0;
            const nTurn = (0.030 * sr) | 0;
            for (let i = 0; i < nTurn; i++) {
              const x = i / nTurn;
              lp = 0.86 * lp + 0.14 * noise[i];
              d[i] += lp * Math.sin(Math.PI * x) * 0.45;
            }
            const sPop = (0.032 * sr) | 0, lenPop = (0.026 * sr) | 0;
            const f0 = 420 + R() * 150, f1 = f0 * (1.95 + R() * 0.35);
            let lp1 = 0, bp1 = 0, lp2 = 0, bp2 = 0;
            for (let k = 0; k < lenPop; k++) {
              const x = k / lenPop;
              const env = Math.sin(Math.PI * Math.pow(x, 0.55)) * Math.exp(-2.4 * x);
              const f = TAU * (f0 + (f1 - f0) * Math.pow(x, 0.65)) / sr;
              const inp = noise[sPop + k];
              const hp1 = inp * 0.14 - lp1 - 0.14 * bp1; bp1 += f * hp1; lp1 += f * bp1;
              const hp2 = bp1 * 0.16 - lp2 - 0.16 * bp2; bp2 += f * hp2; lp2 += f * bp2;
              d[sPop + k] += (bp2 * 0.72 + bp1 * 0.28) * env * 1.4;
            }
            for (let r = 0; r < 2; r++) {
              const sR = ((0.082 + r * 0.085 + R() * 0.025) * sr) | 0;
              const lenR = ((0.095 + r * 0.04) * sr) | 0;
              const fc = 540 - r * 130 + R() * 120;
              const svf = TAU * fc / sr;
              let rLp = 0, rBp = 0;
              for (let k = 0; k < lenR && sR + k < n; k++) {
                const x = k / lenR;
                const env = Math.sin(Math.PI * x) * Math.exp(-2.0 * x) * (0.38 - r * 0.11);
                const hp = noise[sR + k] * 0.22 - rLp - 0.22 * rBp;
                rBp += svf * hp; rLp += svf * rBp;
                d[sR + k] += rBp * env * 1.3;
              }
            }
            return normPeak(d, 0.60);
          });
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 1550, 0.7);
          K.run(ctx, out, t0, t0 + dur, src, lp);
          sendVerb(ctx, K, lp, out, X, 0.38, dur);
        },
      },

      // 5. Distant waterbird (coot / dabbling duck) paddling or ruffling feathers on the water
      foulque_eau: {
        when: (st) => (st.e || 0) > -0.15 && (st.r || 0) < 0.5 && (st.s || 0) < 0.4,
        rate: (st) => (st.h < 10 ? 2.0 : 1.4) * (1 - (st.r || 0)),
        gap: 18,
        gain: 0.44,
        pan: [-0.65, 0.42],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, t0 = ctx.currentTime;
          const pats = 3 + ((R() * 3) | 0);
          const dur = 0.85;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n), noise = new Float32Array(n);
            K.pinkInto(noise, 1.0, R);
            let off = 0.03;
            for (let p = 0; p < pats; p++) {
              const pDur = 0.068 + R() * 0.035;
              const s0 = (off * sr) | 0, len = Math.min(n - s0, (pDur * sr) | 0);
              const fc = 460 + R() * 380;
              const svf = TAU * fc / sr;
              const amp = Math.sin(Math.PI * (p + 0.5) / pats) * (0.55 + R() * 0.25);
              let lp = 0, bp = 0;
              for (let k = 0; k < len; k++) {
                const x = k / len;
                const env = Math.sin(Math.PI * x) * Math.exp(-1.9 * x) * amp;
                const hp = noise[s0 + k] - lp - 0.26 * bp;
                bp += svf * hp; lp += svf * bp;
                d[s0 + k] += bp * env;
              }
              off += 0.095 + R() * 0.045;
            }
            return normPeak(d, 0.55);
          });
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 1650, 0.7);
          K.run(ctx, out, t0, t0 + dur, src, lp);
          sendVerb(ctx, K, lp, out, X, 0.44, dur);
        },
      },

      // 6. Distant shoreline songbird (mellow blackbird / reed-warbler flute across the water — daytime)
      bergeronnette: {
        when: (st) => (st.e || 0) > 0.0 && (st.r || 0) < 0.25 && (st.storm || 0) < 0.2,
        rate: (st) => {
          const dry = 1 - Math.min(1, (st.r || 0) * 3 + (st.s || 0) * 0.65);
          const tod = st.h < 10 ? 3.4 : st.e > 0.3 ? 1.9 : 1.2;
          return tod * dry;
        },
        gap: 11.5,
        gain: 0.28,
        pan: [-0.80, 0.75],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, t0 = ctx.currentTime;
          const notes = 2 + ((R() * 2) | 0);
          const dur = 0.95;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n), air = new Float32Array(n);
            K.pinkInto(air, 1.0, R);
            const fBase = 1480 + R() * 460;
            let off = 0.04;
            for (let k = 0; k < notes; k++) {
              const nDur = 0.12 + R() * 0.08;
              const s0 = (off * sr) | 0, len = Math.min(n - s0, (nDur * sr) | 0);
              const f0 = fBase * (0.92 + R() * 0.16);
              const f1 = f0 * (R() < 0.6 ? 1.10 + R() * 0.08 : 0.90 - R() * 0.05);
              const amp = (0.65 + R() * 0.25) * (0.8 + 0.2 * Math.sin(Math.PI * (k + 0.5) / notes));
              const q = 0.065;
              let lp1 = 0, bp1 = 0, lp2 = 0, bp2 = 0, lp3 = 0, bp3 = 0;
              for (let i = 0; i < len; i++) {
                const x = i / len;
                const env = Math.pow(Math.sin(Math.PI * x), 1.8) * Math.exp(-0.95 * x) * amp;
                const fCur = f0 + (f1 - f0) * (0.5 - 0.5 * Math.cos(Math.PI * x));
                const f = 2 * Math.sin(Math.PI * fCur / sr);
                const inp = air[s0 + i];
                const hp1 = inp * q - lp1 - q * bp1; bp1 += f * hp1; lp1 += f * bp1;
                const hp2 = bp1 * q - lp2 - q * bp2; bp2 += f * hp2; lp2 += f * bp2;
                const hp3 = bp2 * q - lp3 - q * bp3; bp3 += f * hp3; lp3 += f * bp3;
                d[s0 + i] += bp3 * env;
              }
              off += nDur + 0.08 + R() * 0.07;
            }
            return normPeak(d, 0.40);
          });
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 2150, 0.65);
          K.run(ctx, out, t0, t0 + dur, src, lp);
          sendVerb(ctx, K, lp, out, X, 0.68, dur);
        },
      },

      // 7. Grey heron on the left shore (wading step in the shallows + falling droplets)
      heron: {
        when: (st) => (st.e || 0) > -0.14 && (st.r || 0) < 0.35 && (st.s || 0) < 0.3,
        rate: () => 1.1,
        gap: 28,
        gain: 0.44,
        pan: [-0.65, -0.28],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, t0 = ctx.currentTime;
          const dur = 0.78;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n), noise = new Float32Array(n);
            K.pinkInto(noise, 1.0, R);
            const lenStep = (0.38 * sr) | 0;
            let lp = 0, bp = 0;
            for (let i = 0; i < lenStep; i++) {
              const x = i / lenStep;
              const env = Math.sin(Math.PI * x) * Math.exp(-1.3 * x) * 0.62;
              const f = TAU * (300 + 400 * Math.sin(Math.PI * x)) / sr;
              const hp = noise[i] - lp - 0.22 * bp;
              bp += f * hp; lp += f * bp;
              d[i] += bp * env;
            }
            for (let k = 0; k < 2; k++) {
              const sD = ((0.43 + k * 0.12 + R() * 0.03) * sr) | 0;
              const lenD = (0.020 * sr) | 0;
              const f0 = 680 + R() * 240;
              let dLp = 0, dBp = 0;
              for (let i = 0; i < lenD && sD + i < n; i++) {
                const x = i / lenD;
                const f = TAU * (f0 * (1 + 0.45 * x)) / sr;
                const hp = noise[sD + i] * 0.15 - dLp - 0.15 * dBp;
                dBp += f * hp; dLp += f * dBp;
                d[sD + i] += dBp * Math.sin(Math.PI * x) * Math.exp(-2.4 * x) * (1.2 - k * 0.3);
              }
            }
            return normPeak(d, 0.56);
          });
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 1550, 0.7);
          K.run(ctx, out, t0, t0 + dur, src, lp);
          sendVerb(ctx, K, lp, out, X, 0.38, dur);
        },
      },

      // 8. Marsh frog / tree frog soft croak in the reeds at dusk and night (damped impulse train + twin vocal-sac resonators)
      grenouille: {
        when: (st) => (st.e || 0) < 0.08 && (st.r || 0) < 0.55 && (st.s || 0) < 0.2,
        rate: (st) => (st.e < -0.25 ? 2.8 : 3.8) * (1 - (st.r || 0) * 0.6),
        gap: 11,
        gain: 0.42,
        pan: [-0.85, 0.85],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, t0 = ctx.currentTime;
          const croaks = 1 + ((R() * 2.2) | 0);
          const dur = 0.95;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n), noise = new Float32Array(n);
            K.pinkInto(noise, 1.0, R);
            const pulseHz = 58 + R() * 16;
            const fSac1 = 480 + R() * 110;
            const fSac2 = fSac1 * (2.12 + R() * 0.18);
            let off = 0.03;
            for (let c = 0; c < croaks; c++) {
              const cDur = 0.16 + R() * 0.07;
              const s0 = (off * sr) | 0, len = Math.min(n - s0, (cDur * sr) | 0);
              let ph = 0, lp1 = 0, bp1 = 0, lp2 = 0, bp2 = 0;
              for (let k = 0; k < len; k++) {
                const x = k / len;
                const env = Math.sin(Math.PI * Math.pow(x, 0.65)) * Math.exp(-1.1 * x) * 0.65;
                const pRate = pulseHz * (0.94 + 0.12 * Math.sin(Math.PI * x));
                ph += pRate / sr;
                const pFrac = ph - Math.floor(ph);
                const puff = noise[s0 + k] * Math.exp(-pFrac * 9.5);
                const swell = 1 + 0.14 * Math.sin(Math.PI * x);
                const c1 = TAU * (fSac1 * swell) / sr;
                const c2 = TAU * (fSac2 * swell) / sr;
                const hp1 = puff * 0.14 - lp1 - 0.14 * bp1; bp1 += c1 * hp1; lp1 += c1 * bp1;
                const hp2 = puff * 0.16 - lp2 - 0.16 * bp2; bp2 += c2 * hp2; lp2 += c2 * bp2;
                d[s0 + k] += (bp1 * 0.70 + bp2 * 0.30) * env;
              }
              off += cDur + 0.15 + R() * 0.12;
            }
            return normPeak(d, 0.54);
          });
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 1550, 0.7);
          K.run(ctx, out, t0, t0 + dur, src, lp);
          sendVerb(ctx, K, lp, out, X, 0.40, dur);
        },
      },

      // 9. Soft shoreline wood-cricket stridulation at dusk/night (cascaded resonant wing-file friction, zero sine wave)
      grillon_rive: {
        when: (st) => (st.e || 0) < 0.08 && (st.r || 0) < 0.25 && (st.s || 0) < 0.15,
        rate: (st) => (st.e < -0.25 ? 3.2 : 4.2),
        gap: 9.5,
        gain: 0.25,
        pan: [-0.82, 0.82],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, t0 = ctx.currentTime;
          const pulses = 3 + ((R() * 2) | 0);
          const dur = 0.55;
          const fc = 2620 + R() * 280;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n), noise = new Float32Array(n);
            K.pinkInto(noise, 1.0, R);
            let off = 0.02;
            for (let p = 0; p < pulses; p++) {
              const pDur = 0.025 + R() * 0.007;
              const s0 = (off * sr) | 0, len = Math.min(n - s0, (pDur * sr) | 0);
              const amp = Math.sin(Math.PI * (p + 0.5) / pulses);
              const f = 2 * Math.sin(Math.PI * fc / sr);
              const q = 0.08;
              let lp1 = 0, bp1 = 0, lp2 = 0, bp2 = 0;
              for (let k = 0; k < len; k++) {
                const x = k / len;
                const env = Math.pow(Math.sin(Math.PI * x), 1.6) * amp;
                const tooth = 0.55 + 0.45 * Math.sin(TAU * 195 * (k / sr));
                const inp = noise[s0 + k] * tooth;
                const hp1 = inp * q - lp1 - q * bp1; bp1 += f * hp1; lp1 += f * bp1;
                const hp2 = bp1 * q - lp2 - q * bp2; bp2 += f * hp2; lp2 += f * bp2;
                d[s0 + k] += bp2 * env;
              }
              off += 0.044 + R() * 0.012;
            }
            return normPeak(d, 0.38);
          });
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 2950, 0.7);
          K.run(ctx, out, t0, t0 + dur, src, lp);
          sendVerb(ctx, K, lp, out, X, 0.36, dur);
        },
      },

      // 10. Very distant loon / night waterbird call across the dark lake (3-stage breathy flute resonance, zero oscillator)
      plongeon_huard: {
        when: (st) => (st.e || 0) < 0.02 && (st.r || 0) < 0.35 && (st.s || 0) < 0.3,
        rate: () => 1.45,
        gap: 36,
        gain: 0.40,
        pan: [-0.75, 0.35],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, t0 = ctx.currentTime;
          const dur = 1.15;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n), air = new Float32Array(n);
            K.pinkInto(air, 1.0, R);
            const fStart = 640 + R() * 70;
            const fPeak = fStart * (1.22 + R() * 0.07);
            const fEnd = fStart * 1.08;
            const q = 0.065;
            let lp1 = 0, bp1 = 0, lp2 = 0, bp2 = 0, lp3 = 0, bp3 = 0;
            for (let i = 0; i < n; i++) {
              const x = i / n;
              const env = Math.pow(Math.sin(Math.PI * x), 1.5) * Math.exp(-1.1 * x);
              const curve = x < 0.36
                ? fStart + (fPeak - fStart) * (0.5 - 0.5 * Math.cos(Math.PI * (x / 0.36)))
                : fPeak - (fPeak - fEnd) * ((x - 0.36) / 0.64);
              const f = 2 * Math.sin(Math.PI * curve / sr);
              const inp = air[i];
              const hp1 = inp * q - lp1 - q * bp1; bp1 += f * hp1; lp1 += f * bp1;
              const hp2 = bp1 * q - lp2 - q * bp2; bp2 += f * hp2; lp2 += f * bp2;
              const hp3 = bp2 * q - lp3 - q * bp3; bp3 += f * hp3; lp3 += f * bp3;
              d[i] = bp3 * env;
            }
            return normPeak(d, 0.48);
          });
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 1200, 0.7);
          K.run(ctx, out, t0, t0 + dur, src, lp);
          sendVerb(ctx, K, lp, out, X, 0.75, dur);
        },
      },

      // 11. Distant tawny owl in the pine hills at deep night (breathy 3-stage resonant hoot across the water)
      chouette_sapins: {
        when: (st) => (st.e || 0) < -0.22 && (st.r || 0) < 0.25 && (st.s || 0) < 0.3,
        rate: () => 1.4,
        gap: 38,
        gain: 0.38,
        pan: [-0.80, 0.70],
        play(ctx, out, R, st, X) {
          window.SCENE_SOUNDS.lake.sfx.owl(ctx, out, R, st, X);
        },
      },

      // 12. Raindrop plinks on shallow water near the reeds & wet wooden jetty planks (purely resonant, zero sine wave)
      gouttes_ponton: {
        when: (st) => (st.r || 0) > 0.12 || (st.storm || 0) > 0.15,
        rate: (st) => 4.8 + 5.5 * Math.max(st.r || 0, st.storm || 0),
        gap: 5.5,
        gain: 0.44,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, t0 = ctx.currentTime;
          const drops = 4 + ((R() * 5) | 0);
          const dur = 0.85;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n), noise = new Float32Array(n);
            K.pinkInto(noise, 1.0, R);
            let off = 0.02;
            for (let k = 0; k < drops; k++) {
              const onWood = R() < 0.38;
              const dDur = onWood ? 0.015 : 0.020;
              const s0 = (off * sr) | 0, len = Math.min(n - s0, (dDur * sr) | 0);
              const f0 = onWood ? 310 + R() * 210 : 640 + R() * 580;
              const f1 = onWood ? f0 * 0.86 : f0 * (1.35 + R() * 0.25);
              const amp = 0.55 + R() * 0.45;
              const q = onWood ? 0.24 : 0.14;
              let lp1 = 0, bp1 = 0, lp2 = 0, bp2 = 0;
              for (let i = 0; i < len; i++) {
                const x = i / len;
                const env = Math.sin(Math.PI * Math.pow(x, 0.5)) * Math.exp(-2.6 * x) * amp;
                const f = TAU * (f0 + (f1 - f0) * x) / sr;
                const inp = noise[s0 + i];
                const hp1 = inp * q - lp1 - q * bp1; bp1 += f * hp1; lp1 += f * bp1;
                const hp2 = bp1 * q - lp2 - q * bp2; bp2 += f * hp2; lp2 += f * bp2;
                d[s0 + i] += (onWood ? bp1 * 0.85 : bp2 * 0.75 + bp1 * 0.25) * env;
              }
              off += 0.065 + R() * 0.11;
            }
            return normPeak(d, 0.56);
          });
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 2100, 0.7);
          K.run(ctx, out, t0, t0 + dur, src, lp);
          sendVerb(ctx, K, lp, out, X, 0.30, dur);
        },
      },

      // 13. Wind gust / snow flurry sweeping across the water & pines
      rissee_orage: {
        when: (st) => (st.wind || 0) > 0.22 || (st.storm || 0) > 0.2 || (st.s || 0) > 0.2,
        rate: (st) => 2.4 + 4.0 * Math.max(st.wind || 0, st.storm || 0, (st.s || 0) * 0.8),
        gap: 10.5,
        gain: 0.40,
        pan: [-0.70, 0.70],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, t0 = ctx.currentTime;
          const dur = 2.1 + R() * 1.0;
          const snowy = (st.s || 0) > 0.25;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n), raw = new Float32Array(n);
            K.pinkInto(raw, 0.9, R);
            K.brownInto(raw, 0.45, 0.02, R);
            let lp = 0, bp = 0;
            const fBase = snowy ? 560 + R() * 240 : 320 + R() * 160;
            for (let i = 0; i < n; i++) {
              const x = i / n;
              const swell = Math.pow(Math.sin(Math.PI * x), 1.6) * (0.75 + 0.25 * Math.sin(TAU * 2.5 * x));
              const f = TAU * (fBase * (1 + 0.55 * swell)) / sr;
              const hp = raw[i] - lp - 0.35 * bp;
              bp += f * hp; lp += f * bp;
              d[i] = (bp * 0.72 + lp * 0.28) * swell;
            }
            return normPeak(d, 0.50);
          });
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', snowy ? 1850 : 1250, 0.7);
          K.run(ctx, out, t0, t0 + dur, src, lp);
        },
      },

      // 14. Winter frazil ice & snow crystals settling on shore reeds and pontoon edge (snow scenario)
      frasil_glace: {
        when: (st) => (st.s || 0) > 0.2,
        rate: (st) => 3.8 * (st.s || 0),
        gap: 9,
        gain: 0.36,
        pan: [-0.75, 0.75],
        play(ctx, out, R, st, X) {
          const K = window.SOUND_KIT, t0 = ctx.currentTime;
          const dur = 0.85;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n), noise = new Float32Array(n);
            K.pinkInto(noise, 1.0, R);
            // Soft snow-crust settling brush + 3 tiny damped ice-edge clicks
            let lp = 0, bp = 0;
            const fBrush = TAU * (1150 + R() * 350) / sr;
            for (let i = 0; i < n; i++) {
              const x = i / n;
              const env = Math.pow(Math.sin(Math.PI * x), 1.6) * Math.exp(-1.2 * x) * 0.45;
              const hp = noise[i] - lp - 0.35 * bp;
              bp += fBrush * hp; lp += fBrush * bp;
              d[i] = bp * env;
            }
            const clicks = 2 + ((R() * 3) | 0);
            for (let c = 0; c < clicks; c++) {
              const s0 = ((0.12 + c * 0.18 + R() * 0.08) * sr) | 0;
              const len = (0.016 * sr) | 0;
              const fc = 820 + R() * 480;
              const f = TAU * fc / sr;
              let cLp = 0, cBp = 0;
              for (let k = 0; k < len && s0 + k < n; k++) {
                const x = k / len;
                const hp = noise[s0 + k] * 0.16 - cLp - 0.16 * cBp;
                cBp += f * hp; cLp += f * cBp;
                d[s0 + k] += cBp * Math.sin(Math.PI * x) * Math.exp(-2.8 * x) * 0.9;
              }
            }
            return normPeak(d, 0.48);
          });
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const lp = K.filt(ctx, 'lowpass', 2100, 0.7);
          K.run(ctx, out, t0, t0 + dur, src, lp);
          sendVerb(ctx, K, lp, out, X, 0.32, dur);
        },
      },
    },

    // Soft, organic overrides for lamp & app sfx
    sfx: {
      // Lighting the lantern on the wooden jetty: wooden match strike + warm soft flare
      match(ctx, out, R, st, X) {
        const K = window.SOUND_KIT, t0 = ctx.currentTime;
        const dur = 0.58;
        const buf = K.buffer(ctx, null, dur, (n, sr) => {
          const d = new Float32Array(n), noise = new Float32Array(n);
          K.pinkInto(noise, 1.0, R);
          const nScr = (0.075 * sr) | 0;
          let lp = 0, bp = 0;
          for (let i = 0; i < nScr; i++) {
            const x = i / nScr;
            const grain = 0.4 + 0.6 * Math.abs(Math.sin(Math.PI * 58 * (i / sr)));
            const f = TAU * (2100 - 650 * x) / sr;
            const hp = noise[i] - lp - 0.35 * bp;
            bp += f * hp; lp += f * bp;
            d[i] += bp * grain * Math.sin(Math.PI * x) * 0.48;
          }
          let fLp = 0;
          for (let i = (0.055 * sr) | 0; i < n; i++) {
            const x = (i - 0.055 * sr) / (n - 0.055 * sr);
            const env = Math.sin(Math.PI * Math.pow(x, 0.35)) * Math.exp(-3.2 * x) * 0.34;
            fLp = 0.78 * fLp + 0.22 * noise[i];
            d[i] += fLp * env;
          }
          return normPeak(d, 0.48);
        });
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const lp = K.filt(ctx, 'lowpass', 2600, 0.7);
        K.run(ctx, out, t0, t0 + dur, src, lp);
      },

      // Blowing out the lantern candle: gentle, warm breath
      puff(ctx, out, R) {
        const K = window.SOUND_KIT, t0 = ctx.currentTime, dur = 0.38;
        const buf = K.buffer(ctx, null, dur, (n, sr) => {
          const d = new Float32Array(n);
          K.pinkInto(d, 1.0, R);
          for (let i = 0; i < n; i++) {
            const x = i / n;
            d[i] *= Math.sin(Math.PI * Math.pow(x, 0.4)) * Math.exp(-2.8 * x);
          }
          return normPeak(d, 0.36);
        });
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hp = K.filt(ctx, 'highpass', 140, 0.7);
        const lp = K.filt(ctx, 'lowpass', 950, 0.7);
        lp.frequency.setValueAtTime(950, t0);
        lp.frequency.exponentialRampToValueAtTime(380, t0 + dur);
        K.run(ctx, out, t0, t0 + dur, src, hp, lp);
      },

      // Soft wooden/brass lantern latch click
      click(ctx, out, R) {
        const K = window.SOUND_KIT, t0 = ctx.currentTime;
        K.snap(ctx, out, t0, 0.11, 900, 3800, 0.0014);
        K.snap(ctx, out, t0 + 0.014 + R() * 0.01, 0.05, 650, 2600, 0.002);
      },

      // Distant bronze chapel/valley bell across the lake (warm, damped, reverberant)
      bell(ctx, out, R, st, X) {
        const K = window.SOUND_KIT, t0 = ctx.currentTime, dur = 3.2;
        const f0 = 168 + R() * 18;
        const partials = [[1, 0.55, 2.4], [1.004, 0.32, 2.3], [2.01, 0.28, 1.7], [2.98, 0.14, 1.1], [4.12, 0.06, 0.65]];
        const bus = K.gain(ctx, 0.22);
        const lp = K.filt(ctx, 'lowpass', 1350, 0.7);
        K.chain(bus, lp, out);
        for (const [m, amp, dec] of partials) {
          K.tone(ctx, bus, t0, f0 * m, amp, 0.018, dec * 0.38, 'sine');
        }
        K.noiseHit(ctx, bus, t0, 0.09, 0.06, 'bandpass', 420, 2.2, 0.025);
        sendVerb(ctx, K, lp, out, X, 0.65, dur);
        setTimeout(() => { try { bus.disconnect(); lp.disconnect(); } catch (e) {} }, dur * 1000 + 400);
      },

      // Soft wind-chime
      chime(ctx, out, R, st, X) {
        const K = window.SOUND_KIT, t0 = ctx.currentTime, dur = 1.6;
        const f0 = 1350 + R() * 350;
        const bus = K.gain(ctx, 0.16);
        const lp = K.filt(ctx, 'lowpass', 3100, 0.7);
        K.chain(bus, lp, out);
        for (const [m, amp, dec] of [[1, 0.45, 0.55], [2.28, 0.18, 0.32], [3.85, 0.07, 0.18]]) {
          K.tone(ctx, bus, t0, f0 * m, amp, 0.006, dec * 0.4, 'sine');
        }
        sendVerb(ctx, K, lp, out, X, 0.5, dur);
        setTimeout(() => { try { bus.disconnect(); lp.disconnect(); } catch (e) {} }, dur * 1000 + 300);
      },

      // Hollow wooden knock
      knock(ctx, out, R, st, X) {
        const K = window.SOUND_KIT, t0 = ctx.currentTime;
        const bus = K.gain(ctx, 0.24);
        bus.connect(out);
        K.noiseHit(ctx, bus, t0, 0.09, 0.42, 'bandpass', 480 + R() * 60, 4.5, 0.022);
        K.noiseHit(ctx, bus, t0, 0.06, 0.22, 'bandpass', 920 + R() * 80, 5.0, 0.014);
        sendVerb(ctx, K, bus, out, X, 0.35, 0.5);
        setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 600);
      },

      // Distant tawny owl in the pine hills across the lake (3-stage resonant breathy hoot, zero sine wave)
      owl(ctx, out, R, st, X) {
        const K = window.SOUND_KIT, t0 = ctx.currentTime, dur = 1.9;
        const buf = K.buffer(ctx, null, dur, (n, sr) => {
          const d = new Float32Array(n), air = new Float32Array(n);
          K.pinkInto(air, 1.0, R);
          const f0 = 365 + R() * 30;
          const q = 0.065;
          const notes = [[0.04, 0.46, f0, f0 * 0.93, 1.0], [0.88, 0.18, f0 * 1.02, f0 * 0.96, 0.72], [1.14, 0.56, f0 * 0.98, f0 * 0.89, 0.92]];
          for (const [stT, nDur, fA, fB, amp] of notes) {
            const s0 = (stT * sr) | 0, len = Math.min(n - s0, (nDur * sr) | 0);
            let lp1 = 0, bp1 = 0, lp2 = 0, bp2 = 0, lp3 = 0, bp3 = 0;
            for (let i = 0; i < len; i++) {
              const x = i / len;
              const env = Math.pow(Math.sin(Math.PI * x), 1.5) * Math.exp(-1.1 * x) * amp;
              const f = 2 * Math.sin(Math.PI * (fA + (fB - fA) * Math.pow(x, 0.7)) / sr);
              const inp = air[s0 + i];
              const hp1 = inp * q - lp1 - q * bp1; bp1 += f * hp1; lp1 += f * bp1;
              const hp2 = bp1 * q - lp2 - q * bp2; bp2 += f * hp2; lp2 += f * bp2;
              const hp3 = bp2 * q - lp3 - q * bp3; bp3 += f * hp3; lp3 += f * bp3;
              d[s0 + i] += bp3 * env;
            }
          }
          return normPeak(d, 0.46);
        });
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const lp = K.filt(ctx, 'lowpass', 950, 0.7);
        K.run(ctx, out, t0, t0 + dur, src, lp);
        sendVerb(ctx, K, lp, out, X, 0.68, dur);
      },
    },
  };
})();
