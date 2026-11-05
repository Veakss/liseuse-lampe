// Liseuse à la lampe — pack sonore de la scène « plage » (Round 5)
(function () {
  const K = window.SOUND_KIT;
  const TAU = Math.PI * 2;

  // Profil acoustique selon l'heure et la météo : mer plus calme la nuit (-31 dBFS), plus soutenue sous la pluie et l'orage.
  function stateProfile(st) {
    const e = st.e == null ? 0.5 : st.e;
    const r = st.r || 0;
    const s = st.s || 0;
    const storm = st.storm || 0;
    const wind = st.wind == null ? 0.15 : st.wind;
    const nightCalm = e < -0.15 ? Math.min(1, (-0.15 - e) / 0.55) : 0;

    const surfGain = (0.268 - 0.042 * nightCalm + 0.075 * wind + 0.065 * r + 0.11 * storm) * (1 - 0.11 * s);
    const washGain = (0.218 - 0.034 * nightCalm + 0.055 * wind + 0.05 * r + 0.085 * storm) * (1 - 0.13 * s);
    const windGain = 0.082 + 0.15 * wind + 0.095 * storm + 0.06 * s;
    const rainGain = 0.29 * Math.pow(r, 0.85) + 0.095 * storm + 0.07 * s;
    // Facteur d'échelle suivant l'énergie du lit pour que chaque détail ait +1.5 à +6.0 dB de saillance
    const bedNorm = Math.hypot(surfGain, washGain, windGain * 0.72, rainGain * 0.88) / 0.348;
    return { e, r, s, storm, wind, nightCalm, surfGain, washGain, windGain, rainGain, bedNorm };
  }

  window.SCENE_SOUNDS = window.SCENE_SOUNDS || {};

  window.SCENE_SOUNDS.plage = {
    bed(ctx, out, K, st0) {
      const R = K.rng(71923);

      // 1. Houle et vagues douces sur le sable (23.7 s, stéréo)
      // Relais naturel entre la montée du rouleau (grave-médium) et le retrait effervescent sur le sable (médium-aigu).
      const bufSurf = K.loopBuffer(ctx, 'plage:mer_large:v5', 23.7, (n, sr, ch) => {
        const d = new Float32Array(n);
        const Rch = K.rng(1013 + ch * 317);
        K.pinkInto(d, 1.0, Rch);
        const dur = n / sr;
        let hp = 0, lpLow = 0, lpMid = 0, hpHigh = 0;
        let gLow = 0.5, gMid = 0.35, gHigh = 0.15, cLow = 0.055;
        const phCh = ch * 0.45;
        for (let i = 0; i < n; i++) {
          if ((i & 63) === 0) {
            const t = i / sr;
            const w1 = Math.sin(TAU * (t / dur) * 2.0 + phCh);
            const w2 = Math.sin(TAU * (t / dur) * 3.0 - phCh * 0.8 + 1.1);
            const swell = 0.5 + 0.24 * w1 + 0.16 * w2;
            const backwash = 0.5 - 0.22 * Math.cos(TAU * (t / dur) * 2.0 + phCh) - 0.14 * Math.cos(TAU * (t / dur) * 3.0 - phCh * 0.8 + 1.1);
            gLow = 0.44 + 0.28 * swell;
            gMid = 0.30 + 0.22 * (0.5 * swell + 0.5 * backwash);
            gHigh = 0.10 + 0.22 * backwash;
            cLow = 0.045 + 0.040 * swell;
          }
          const p = d[i];
          const w = Rch() * 2 - 1;
          hp += 0.015 * (p - hp);
          const pc = p - hp;
          lpLow += cLow * (pc - lpLow);
          lpMid += 0.18 * (pc - lpMid);
          hpHigh = 0.86 * hpHigh + 0.14 * w;
          const fizz = w - hpHigh;
          d[i] = lpLow * gLow + (lpMid - lpLow * 0.55) * gMid + fizz * gHigh * 0.26;
        }
        return d;
      });

      // 2. Ressac continu et glissement d'eau sur le rivage (18.9 s, stéréo)
      const bufWash = K.loopBuffer(ctx, 'plage:ressac_sable:v5', 18.9, (n, sr, ch) => {
        const d = new Float32Array(n);
        const Rch = K.rng(2089 + ch * 503);
        K.pinkInto(d, 0.95, Rch);
        const dur = n / sr;
        let hp = 0, lp = 0, bp = 0, gLp = 0.55, gBp = 0.22, cut = 0.10;
        const ph0 = ch * 0.65;
        for (let i = 0; i < n; i++) {
          if ((i & 63) === 0) {
            const t = i / sr;
            const s1 = Math.sin(TAU * (t / dur) * 2.0 + ph0);
            const s2 = Math.cos(TAU * (t / dur) * 3.0 - ph0 * 0.7);
            const wave = 0.5 + 0.22 * s1 + 0.14 * s2;
            const foam = 0.5 - 0.20 * Math.cos(TAU * (t / dur) * 2.0 + ph0) + 0.12 * Math.sin(TAU * (t / dur) * 3.0 - ph0 * 0.7);
            gLp = 0.48 + 0.26 * wave;
            gBp = 0.16 + 0.22 * foam;
            cut = 0.078 + 0.058 * wave;
          }
          const x = d[i];
          hp += 0.018 * (x - hp);
          const xc = x - hp;
          lp += cut * (xc - lp);
          bp += 0.25 * (xc - lp - bp);
          d[i] = lp * gLp + bp * gBp;
        }
        return d;
      });

      // 3. Brise dans le pin parasol (à gauche) et sur la dune (16.7 s, stéréo)
      const bufWind = K.loopBuffer(ctx, 'plage:vent_pin:v5', 16.7, (n, sr, ch) => {
        const d = new Float32Array(n);
        const Rch = K.rng(3301 + ch * 709);
        K.pinkInto(d, 0.85, Rch);
        const dur = n / sr;
        let f1 = 0, f2 = 0;
        const c1 = ch === 0 ? 0.11 : 0.065;
        const c2 = ch === 0 ? 0.032 : 0.022;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const gust = 0.80 + 0.12 * Math.sin(TAU * (t / dur) * 2.0 + ch * 0.9) + 0.08 * Math.sin(TAU * (t / dur) * 3.0 + 1.4);
          f1 += c1 * (d[i] - f1);
          f2 += c2 * (f1 - f2);
          d[i] = (f1 - f2) * gust * (ch === 0 ? 1.14 : 0.86);
        }
        return d;
      });

      // 4. Pluie côtière sur la mer et le sable humide (15.7 s, stéréo)
      const bufRain = K.loopBuffer(ctx, 'plage:pluie_mer:v5', 15.7, (n, sr, ch) => {
        const d = new Float32Array(n);
        const Rch = K.rng(4517 + ch * 829);
        K.pinkInto(d, 0.8, Rch);
        let lp = 0, hp = 0;
        for (let i = 0; i < n; i++) {
          const x = d[i];
          lp += 0.26 * (x - lp);
          hp += 0.038 * (lp - hp);
          d[i] = (lp - hp) * 0.85;
        }
        let idx = Math.floor(sr * 0.02);
        while (idx < n - 240) {
          idx += Math.floor(sr * (0.005 + Rch() * 0.018));
          const amp = (0.04 + Rch() * 0.08) * (Rch() < 0.2 ? 1.35 : 0.8);
          const len = Math.min(180, n - idx);
          let s = 0;
          for (let k = 0; k < len; k++) {
            const env = Math.exp(-k / (len * 0.26));
            s = 0.62 * s + 0.38 * (Rch() * 2 - 1);
            d[idx + k] += s * amp * env;
          }
        }
        return d;
      });

      const p0 = stateProfile(st0);

      const sSurf = K.loop(ctx, bufSurf, 1, R() * 10);
      const fSurf = K.filt(ctx, 'lowpass', 1420 - 340 * p0.nightCalm + 340 * p0.storm, 0.55);
      const gSurf = K.gain(ctx, p0.surfGain);
      K.chain(sSurf, fSurf, gSurf, out);

      const sWash = K.loop(ctx, bufWash, 1, R() * 10);
      const fWash = K.filt(ctx, 'lowpass', 2150 - 460 * p0.nightCalm + 380 * p0.wind, 0.5);
      const gWash = K.gain(ctx, p0.washGain);
      K.chain(sWash, fWash, gWash, out);

      const sWind = K.loop(ctx, bufWind, 1, R() * 10);
      const fWind = K.filt(ctx, 'bandpass', 720 + 360 * p0.wind, 0.85);
      const gWind = K.gain(ctx, p0.windGain);
      K.chain(sWind, fWind, gWind, out);

      const sRain = K.loop(ctx, bufRain, 1, R() * 10);
      const fRain = K.filt(ctx, 'lowpass', 2400 - 700 * p0.s, 0.55);
      const gRain = K.gain(ctx, p0.rainGain);
      K.chain(sRain, fRain, gRain, out);

      // Réverbération côtière ouverte (2.3 s)
      const verb = K.reverb(ctx, out, 2.3, 2.9, 0.62, 0.35);

      return {
        nodes: [sSurf, sWash, sWind, sRain],
        verb,
        set(st) {
          const p = stateProfile(st);
          const now = ctx.currentTime;
          const drift = Math.sin(now * 0.19) * 0.02;
          K.glide(ctx, gSurf.gain, p.surfGain * (1 + drift), 1.4);
          K.glide(ctx, fSurf.frequency, 1420 - 340 * p.nightCalm + 340 * p.storm + Math.sin(now * 0.13) * 50, 1.4);
          K.glide(ctx, gWash.gain, p.washGain * (1 - drift * 0.8), 1.4);
          K.glide(ctx, fWash.frequency, 2150 - 460 * p.nightCalm + 380 * p.wind, 1.4);
          K.glide(ctx, gWind.gain, p.windGain, 1.4);
          K.glide(ctx, fWind.frequency, 720 + 360 * p.wind + Math.cos(now * 0.17) * 40, 1.4);
          K.glide(ctx, gRain.gain, p.rainGain, 1.4);
          K.glide(ctx, fRain.frequency, 2400 - 700 * p.s, 1.4);
        },
      };
    },

    details: {
      // 1. Vague douce qui déferle et retrait d'écume effervescente sur le sable
      vague_ecume: {
        when: () => true,
        rate: (st) => 5.2 + 2.2 * (st.wind || 0.15) + 1.8 * (st.storm || 0) - (st.e < -0.2 ? 1.2 : 0),
        gap: 7.2,
        gain: 0.90,
        pan: [-0.55, 0.55],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const scale = stateProfile(st).bedNorm;
          const dur = 2.4 + R() * 0.6;
          const bufRoll = K.buffer(ctx, null, dur, (n) => {
            const d = new Float32Array(n);
            K.pinkInto(d, 1.0, R);
            let hp = 0, lp = 0;
            for (let i = 0; i < n; i++) {
              const u = i / n;
              const env = u < 0.22 ? Math.sin((u / 0.22) * Math.PI * 0.5) : Math.exp(-2.3 * (u - 0.22));
              hp += 0.016 * (d[i] - hp);
              const clean = d[i] - hp;
              const cut = 0.075 + 0.16 * env;
              lp += cut * (clean - lp);
              d[i] = lp * env;
            }
            return d;
          });
          const sRoll = ctx.createBufferSource();
          sRoll.buffer = bufRoll;
          const fRoll = K.filt(ctx, 'lowpass', 1200 + R() * 350, 0.65);
          const gRoll = K.gain(ctx, 0.68 * scale);
          K.run(ctx, out, t0, t0 + dur, sRoll, fRoll, gRoll);

          // Chuintement d'écume et de bulles sur le sable mouillé
          const sFizz = ctx.createBufferSource();
          sFizz.buffer = K.noiseBuf(ctx, dur, (t) => {
            const u = t / dur;
            if (u < 0.07) return 0;
            const x = (u - 0.07) / 0.93;
            return Math.sin(Math.PI * Math.min(1, x * 1.45)) * Math.exp(-1.55 * x) * (0.78 + 0.22 * Math.sin(t * 34));
          });
          const hpFizz = K.filt(ctx, 'highpass', 820 + R() * 240, 0.7);
          const lpFizz = K.filt(ctx, 'lowpass', 3300 + R() * 700, 0.6);
          const gFizz = K.gain(ctx, 0.36 * scale);
          K.run(ctx, out, t0, t0 + dur, sFizz, hpFizz, lpFizz, gFizz);
          if (X && X.verb) {
            const send = K.gain(ctx, 0.10 * scale);
            gRoll.connect(send);
            send.connect(X.verb);
          }
        },
      },

      // 2. Clapotis liquide de l'eau contre les rochers du promontoire gauche
      clapotis_rochers: {
        when: () => true,
        rate: (st) => 3.5 + 1.5 * (st.wind || 0.15),
        gap: 9.0,
        gain: 0.90,
        pan: [-0.82, -0.35],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const scale = stateProfile(st).bedNorm;
          const sWash = ctx.createBufferSource();
          sWash.buffer = K.noiseBuf(ctx, 1.05, (x) => Math.sin(Math.PI * (x / 1.05)) ** 1.2);
          const bpWash = K.filt(ctx, 'bandpass', 420 + R() * 120, 1.2);
          const gWash = K.gain(ctx, 0.36 * scale);
          K.run(ctx, out, t0 + 0.02, t0 + 1.07, sWash, bpWash, gWash);

          const count = 3 + Math.floor(R() * 2);
          for (let i = 0; i < count; i++) {
            const t = t0 + 0.05 + i * (0.17 + R() * 0.11);
            const len = 0.16 + R() * 0.06;
            const f0 = 310 + R() * 170;
            const f1 = f0 * (1.32 + R() * 0.22);
            const s = ctx.createBufferSource();
            s.buffer = K.noiseBuf(ctx, len, (x) => Math.sin(Math.PI * Math.min(1, x / len)) * Math.exp(-x / (len * 0.5)));
            const bp = K.filt(ctx, 'bandpass', f0, 3.6 + R() * 1.8);
            bp.frequency.setValueAtTime(f0, t);
            bp.frequency.exponentialRampToValueAtTime(f1, t + len * 0.8);
            const lp = K.filt(ctx, 'lowpass', 1650, 0.7);
            const g = K.gain(ctx, (0.66 - i * 0.08) * scale);
            K.run(ctx, out, t, t + len, s, bp, lp, g);
            if (X && X.verb) {
              const vSend = K.gain(ctx, 0.20 * scale);
              g.connect(vSend);
              vSend.connect(X.verb);
            }
          }
        },
      },

      // 3. Petits galets et coquillages roulés par le retrait de l'eau
      coquillages_retrait: {
        when: () => true,
        rate: (st) => 3.2 + 1.8 * (st.storm || 0) + 1.0 * (st.wind || 0.15),
        gap: 9.5,
        gain: 0.90,
        pan: [-0.65, 0.48],
        play(ctx, out, R, st) {
          const t0 = ctx.currentTime;
          const scale = stateProfile(st).bedNorm;
          const dur = 1.1;
          const sWater = ctx.createBufferSource();
          sWater.buffer = K.noiseBuf(ctx, dur, (x) => Math.sin(Math.PI * (x / dur)) ** 1.25);
          const bpWater = K.filt(ctx, 'bandpass', 980 + R() * 240, 1.2);
          const gWater = K.gain(ctx, 0.34 * scale);
          K.run(ctx, out, t0 + 0.02, t0 + 0.02 + dur, sWater, bpWater, gWater);

          const nClicks = 10 + Math.floor(R() * 6);
          let t = t0 + 0.04;
          for (let i = 0; i < nClicks; i++) {
            const u = i / nClicks;
            t += 0.032 + R() * 0.052 + u * 0.022;
            const f = 1250 + R() * 1350;
            const cDur = 0.024 + R() * 0.015;
            const amp = (0.48 + R() * 0.22) * Math.sin(Math.PI * (0.15 + 0.75 * u)) * scale;
            const s = ctx.createBufferSource();
            s.buffer = K.noiseBuf(ctx, cDur, (x) => Math.exp(-x / 0.006));
            const bp = K.filt(ctx, 'bandpass', f, 4.8 + R() * 2.2);
            const lp = K.filt(ctx, 'lowpass', 3200, 0.7);
            const g = K.gain(ctx, amp);
            K.run(ctx, out, t, t + cDur, s, bp, lp, g);
          }
        },
      },

      // 4. Risée de brise dans les aiguilles du pin parasol à gauche
      souffle_pin: {
        when: () => true,
        rate: (st) => 2.8 + 3.5 * (st.wind || 0.15),
        gap: 8.5,
        gain: 0.90,
        pan: [-0.80, -0.25],
        play(ctx, out, R, st) {
          const t0 = ctx.currentTime;
          const scale = stateProfile(st).bedNorm;
          const dur = 1.55 + R() * 0.4;
          const s = ctx.createBufferSource();
          s.buffer = K.noiseBuf(ctx, dur, (t) => {
            const u = t / dur;
            return Math.sin(Math.PI * u) ** 1.25 * (0.78 + 0.22 * Math.sin(TAU * t * (1.9 + R() * 1.1)));
          });
          const bp = K.filt(ctx, 'bandpass', 760 + R() * 200, 1.15);
          bp.frequency.setValueAtTime(700, t0);
          bp.frequency.linearRampToValueAtTime(1040 + R() * 160, t0 + dur * 0.45);
          bp.frequency.linearRampToValueAtTime(660, t0 + dur);
          const lp = K.filt(ctx, 'lowpass', 2300, 0.6);
          const g = K.gain(ctx, 0.54 * scale);
          K.run(ctx, out, t0, t0 + dur, s, bp, lp, g);
        },
      },

      // 5. Souffle de sable fin glissant sur le drap de plage et le chapeau de paille
      sable_vole: {
        when: (st) => (st.r || 0) < 0.4,
        rate: (st) => 2.4 + 3.2 * (st.wind || 0.15),
        gap: 10.5,
        gain: 0.90,
        pan: [-0.35, 0.45],
        play(ctx, out, R, st) {
          const t0 = ctx.currentTime;
          const scale = stateProfile(st).bedNorm;
          const dur = 1.15 + R() * 0.3;
          const buf = K.buffer(ctx, null, dur, (n) => {
            const d = new Float32Array(n);
            for (let i = 0; i < n; i++) {
              const u = i / n;
              const env = Math.sin(Math.PI * u) ** 1.35;
              const grain = R() < 0.12 ? 2.2 + R() * 1.6 : 0.60;
              d[i] = (R() * 2 - 1) * env * grain;
            }
            return d;
          });
          const s = ctx.createBufferSource();
          s.buffer = buf;
          const bp = K.filt(ctx, 'bandpass', 1850 + R() * 550, 1.1);
          const lp = K.filt(ctx, 'lowpass', 3900, 0.7);
          const g = K.gain(ctx, 0.40 * scale);
          K.run(ctx, out, t0, t0 + dur, s, bp, lp, g);
        },
      },

      // 6. Goéland lointain au large (bruit sculpté par résonateurs vocaux + réverbération côtière)
      goeland_loin: {
        when: (st) => (st.e == null || st.e > -0.08) && (st.storm || 0) < 0.4 && (st.r || 0) < 0.45 && (st.s || 0) < 0.3,
        rate: (st) => (st.h < 11 ? 1.8 : st.e > 0.2 ? 1.4 : 1.0) * (1 - 0.6 * (st.r || 0)),
        gap: 22.0,
        gain: 0.90,
        pan: [-0.68, 0.75],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.03;
          const scale = stateProfile(st).bedNorm;
          // Ondulation d'eau grave très douce sous l'appel au large (pas de souffle aigu)
          const sWave = ctx.createBufferSource();
          sWave.buffer = K.noiseBuf(ctx, 1.0, (x) => Math.sin(Math.PI * x) ** 1.3);
          const lpWave = K.filt(ctx, 'lowpass', 420, 0.7);
          const gWave = K.gain(ctx, 0.32 * scale);
          K.run(ctx, out, t0, t0 + 1.0, sWave, lpWave, gWave);

          const calls = R() < 0.45 ? 2 : 1;
          for (let c = 0; c < calls; c++) {
            const tc = t0 + 0.05 + c * (0.46 + R() * 0.10);
            const dur = 0.42 + R() * 0.10;
            const fPeak = 1420 + R() * 170 - c * 65;
            const buf = K.buffer(ctx, null, dur, (n, sr) => {
              const d = new Float32Array(n);
              for (let i = 0; i < n; i++) {
                const u = i / n;
                const t = i / sr;
                const env = u < 0.18 ? Math.sin((u / 0.18) * Math.PI * 0.5) : Math.sin((1 - u) * Math.PI * 0.5) ** 1.35;
                const grain = 0.65 + 0.35 * Math.sin(TAU * (170 + 22 * u) * t);
                d[i] = (R() * 2 - 1) * env * grain;
              }
              return d;
            });
            const s = ctx.createBufferSource();
            s.buffer = buf;
            const bp1 = K.filt(ctx, 'bandpass', fPeak * 0.86, 13.0);
            const bp2 = K.filt(ctx, 'bandpass', fPeak * 0.86, 8.5);
            for (const bp of [bp1, bp2]) {
              bp.frequency.setValueAtTime(fPeak * 0.86, tc);
              bp.frequency.exponentialRampToValueAtTime(fPeak, tc + dur * 0.26);
              bp.frequency.exponentialRampToValueAtTime(fPeak * 0.72, tc + dur);
            }
            const lp = K.filt(ctx, 'lowpass', 1950, 0.7);
            const g = K.gain(ctx, (1.85 - c * 0.3) * scale);
            K.run(ctx, out, tc, tc + dur, s, bp1, bp2, lp, g);
            if (X && X.verb) {
              const vSend = K.gain(ctx, 2.4 * scale);
              lp.connect(vSend);
              vSend.connect(X.verb);
            }
          }
        },
      },

      // 7. Petit gravelot / bécasseau sur le rivage (bruit résonant soufflé + petits pas dans le sable mouillé)
      becasseau_rivage: {
        when: (st) => (st.e == null || st.e > -0.1) && (st.r || 0) < 0.5 && (st.s || 0) < 0.3,
        rate: (st) => (st.h < 10 ? 3.0 : st.e < 0.25 ? 2.2 : 1.5),
        gap: 12.5,
        gain: 0.90,
        pan: [-0.62, 0.62],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const scale = stateProfile(st).bedNorm;
          const sEdge = ctx.createBufferSource();
          sEdge.buffer = K.noiseBuf(ctx, 0.9, (x) => Math.sin(Math.PI * (x / 0.9)) ** 1.3);
          const lpEdge = K.filt(ctx, 'lowpass', 460, 0.7);
          const gEdge = K.gain(ctx, 0.32 * scale);
          K.run(ctx, out, t0 + 0.02, t0 + 0.92, sEdge, lpEdge, gEdge);

          for (let p = 0; p < 5; p++) {
            const tp = t0 + 0.03 + p * (0.055 + R() * 0.018);
            K.noiseHit(ctx, out, tp, 0.035, 0.28 * scale, 'bandpass', 1150 + R() * 450, 2.2, 0.009);
          }
          const f0 = 1920 + R() * 220;
          for (let n = 0; n < 2; n++) {
            const tn = t0 + 0.14 + n * (0.14 + R() * 0.03);
            const dur = 0.095 + n * 0.025;
            const fn = n === 0 ? f0 : f0 * (1.16 + R() * 0.05);
            const s = ctx.createBufferSource();
            s.buffer = K.noiseBuf(ctx, dur, (x) => Math.sin(Math.PI * (x / dur)) ** 1.35);
            const bp1 = K.filt(ctx, 'bandpass', fn * 0.94, 18.0);
            const bp2 = K.filt(ctx, 'bandpass', fn * 0.94, 12.0);
            for (const bp of [bp1, bp2]) {
              bp.frequency.setValueAtTime(fn * 0.94, tn);
              bp.frequency.exponentialRampToValueAtTime(fn * 1.05, tn + dur * 0.72);
            }
            const lp = K.filt(ctx, 'lowpass', 2500, 0.7);
            const g = K.gain(ctx, 2.2 * scale);
            K.run(ctx, out, tn, tn + dur, s, bp1, bp2, lp, g);
            if (X && X.verb) {
              const vSend = K.gain(ctx, 2.1 * scale);
              lp.connect(vSend);
              vSend.connect(X.verb);
            }
          }
        },
      },

      // 8. Grillons des dunes à la tombée du soir et la nuit (stridulation boisée naturelle vers 2.8 kHz, sans souffle parasite)
      grillon_dunes: {
        when: (st) => (st.e != null && st.e < 0.05) && (st.r || 0) < 0.35 && (st.s || 0) < 0.2,
        rate: (st) => (st.e < -0.2 ? 4.8 : 4.0),
        gap: 7.0,
        gain: 0.90,
        pan: [-0.82, -0.22],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const scale = stateProfile(st).bedNorm;
          // Très léger mouvement d'eau grave en fond pendant la stridulation (aucun chuintement aigu)
          const sLow = ctx.createBufferSource();
          sLow.buffer = K.noiseBuf(ctx, 0.95, (x) => Math.sin(Math.PI * (x / 0.95)) ** 1.3);
          const lpLow = K.filt(ctx, 'lowpass', 380, 0.7);
          const gLow = K.gain(ctx, 0.28 * scale);
          K.run(ctx, out, t0 + 0.02, t0 + 0.97, sLow, lpLow, gLow);

          const fCarrier = 2740 + R() * 220;
          const chirps = 4 + Math.floor(R() * 2);
          for (let c = 0; c < chirps; c++) {
            const tc = t0 + 0.04 + c * (0.19 + R() * 0.05);
            const dur = 0.070 + R() * 0.014;
            const buf = K.buffer(ctx, null, dur, (n, sr) => {
              const d = new Float32Array(n);
              let ph = 0;
              for (let i = 0; i < n; i++) {
                const u = i / n;
                // Enveloppe à 3 micro-syllabes d'élytres frottées
                const syl = Math.sin(Math.PI * 3 * u) ** 2;
                const env = Math.sin(Math.PI * u) * syl;
                // Légère dérive de hauteur à chaque dent d'élytre + grain de frottement
                ph += (fCarrier * (0.985 + 0.03 * syl)) / sr;
                const wing = Math.sin(TAU * ph) * 0.42 + (R() * 2 - 1) * 0.58;
                d[i] = wing * env;
              }
              return d;
            });
            const s = ctx.createBufferSource();
            s.buffer = buf;
            const bp = K.filt(ctx, 'bandpass', fCarrier, 14.0);
            const lp = K.filt(ctx, 'lowpass', 3150, 0.7);
            const g = K.gain(ctx, (0.48 - c * 0.035) * scale);
            K.run(ctx, out, tc, tc + dur, s, bp, lp, g);
            if (X && X.verb) {
              const vSend = K.gain(ctx, 0.28 * scale);
              lp.connect(vSend);
              vSend.connect(X.verb);
            }
          }
        },
      },

      // 9. Courlis nocturne au loin sur la baie calme (bruit soufflé dans double résonateur Q=32, aucun sinus)
      courlis_nuit: {
        when: (st) => (st.e != null && st.e < -0.02) && (st.storm || 0) < 0.4,
        rate: (st) => (st.e < -0.3 ? 2.0 : 1.5) * (1 - 0.5 * (st.r || 0)),
        gap: 16.5,
        gain: 0.90,
        pan: [-0.45, 0.70],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.03;
          const scale = stateProfile(st).bedNorm;
          const sWater = ctx.createBufferSource();
          sWater.buffer = K.noiseBuf(ctx, 0.95, (x) => Math.sin(Math.PI * (x / 0.95)) ** 1.3);
          const lpWater = K.filt(ctx, 'lowpass', 400, 0.7);
          const gWater = K.gain(ctx, 0.28 * scale);
          K.run(ctx, out, t0, t0 + 0.95, sWater, lpWater, gWater);

          const dur = 0.62 + R() * 0.14;
          const fStart = 780 + R() * 80;
          const buf = K.buffer(ctx, null, dur, (n, sr) => {
            const d = new Float32Array(n);
            for (let i = 0; i < n; i++) {
              const u = i / n;
              const t = i / sr;
              const env = Math.sin(Math.PI * u) ** 1.35;
              const flutter = u > 0.38 ? 0.72 + 0.28 * Math.sin(TAU * 15 * t) : 1.0;
              d[i] = (R() * 2 - 1) * env * flutter;
            }
            return d;
          });
          const s = ctx.createBufferSource();
          s.buffer = buf;
          const bp1 = K.filt(ctx, 'bandpass', fStart, 15.0);
          const bp2 = K.filt(ctx, 'bandpass', fStart, 10.0);
          for (const bp of [bp1, bp2]) {
            bp.frequency.setValueAtTime(fStart, t0 + 0.04);
            bp.frequency.exponentialRampToValueAtTime(fStart * 1.28, t0 + 0.04 + dur * 0.68);
            bp.frequency.exponentialRampToValueAtTime(fStart * 1.15, t0 + 0.04 + dur);
          }
          const lp = K.filt(ctx, 'lowpass', 1600, 0.7);
          const g = K.gain(ctx, 2.2 * scale);
          K.run(ctx, out, t0 + 0.04, t0 + 0.04 + dur, s, bp1, bp2, lp, g);
          if (X && X.verb) {
            const vSend = K.gain(ctx, 2.6 * scale);
            lp.connect(vSend);
            vSend.connect(X.verb);
          }
        },
      },

      // 10. Cloche de bouée marine en bronze au large vers le phare à droite (tintement métallique patiné)
      cloche_bouee: {
        when: () => true,
        rate: (st) => 1.4 + 1.1 * (st.storm || 0) + 0.5 * (st.wind || 0.15),
        gap: 20.0,
        gain: 0.90,
        pan: [0.45, 0.85],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime + 0.03;
          const scale = stateProfile(st).bedNorm;
          const f0 = 490 + R() * 45;
          const bus = K.filt(ctx, 'lowpass', 1950, 0.7);
          const gBus = K.gain(ctx, 0.62 * scale);
          bus.connect(gBus);
          gBus.connect(out);
          if (X && X.verb) {
            const vSend = K.gain(ctx, 0.65 * scale);
            bus.connect(vSend);
            vSend.connect(X.verb);
          }
          const partials = [
            [1.0, 0.20, 0.34],
            [1.21, 0.24, 0.26],
            [1.506, 0.18, 0.20],
            [2.0, 0.15, 0.14],
            [2.51, 0.09, 0.09],
            [3.02, 0.06, 0.06],
          ];
          for (const [m, amp, dec] of partials) {
            K.tone(ctx, bus, t0, f0 * m, amp, 0.003, dec, 'sine');
          }
          K.noiseHit(ctx, bus, t0, 0.045, 0.32, 'bandpass', 1180, 3.8, 0.011);
          if (R() < 0.6) {
            const t2 = t0 + 0.38 + R() * 0.16;
            for (const [m, amp, dec] of partials.slice(0, 4)) {
              K.tone(ctx, bus, t2, f0 * m, amp * 0.45, 0.004, dec * 0.8, 'sine');
            }
            K.noiseHit(ctx, bus, t2, 0.035, 0.16, 'bandpass', 1180, 3.8, 0.009);
          }
          setTimeout(() => {
            try { bus.disconnect(); gBus.disconnect(); } catch (e) {}
          }, 4000);
        },
      },

      // 11. Voilier au mouillage : léger grincement de bois et cliquetis sourd de drisse
      voilier_drisse: {
        when: (st) => (st.r || 0) < 0.65,
        rate: (st) => 1.7 + 1.3 * (st.wind || 0.15),
        gap: 17.5,
        gain: 0.90,
        pan: [0.12, 0.42],
        play(ctx, out, R, st, X) {
          const t0 = ctx.currentTime;
          const scale = stateProfile(st).bedNorm;
          const sLap = ctx.createBufferSource();
          sLap.buffer = K.noiseBuf(ctx, 0.95, (x) => Math.sin(Math.PI * (x / 0.95)) ** 1.25);
          const bpLap = K.filt(ctx, 'bandpass', 480 + R() * 120, 1.25);
          const gLap = K.gain(ctx, 0.34 * scale);
          K.run(ctx, out, t0 + 0.02, t0 + 0.97, sLap, bpLap, gLap);

          const fWood = 285 + R() * 70;
          for (let i = 0; i < 4; i++) {
            const ti = t0 + 0.04 + i * (0.07 + R() * 0.025);
            K.noiseHit(ctx, out, ti, 0.065, 0.42 * scale, 'bandpass', fWood * (1 + i * 0.05), 4.5, 0.022);
          }
          const td = t0 + 0.36 + R() * 0.14;
          const fMast = 980 + R() * 180;
          const bus = K.filt(ctx, 'lowpass', 1750, 0.7);
          bus.connect(out);
          if (X && X.verb) {
            const vSend = K.gain(ctx, 0.34 * scale);
            bus.connect(vSend);
            vSend.connect(X.verb);
          }
          K.noiseHit(ctx, bus, td, 0.05, 0.38 * scale, 'bandpass', fMast, 6.5, 0.016);
          K.noiseHit(ctx, bus, td + 0.07, 0.04, 0.22 * scale, 'bandpass', fMast * 1.38, 7.0, 0.012);
          setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 1500);
        },
      },

      // 12. Gouttes d'averse sur la lanterne en laiton, le chapeau de paille et les flaques du rivage
      averse_flaques: {
        when: (st) => (st.r || 0) > 0.15 || (st.storm || 0) > 0.15,
        rate: (st) => 5.5 + 5.0 * (st.r || 0) + 2.5 * (st.storm || 0),
        gap: 4.5,
        gain: 0.90,
        pan: [-0.48, 0.48],
        play(ctx, out, R, st) {
          const t0 = ctx.currentTime;
          const scale = stateProfile(st).bedNorm;
          const sShower = ctx.createBufferSource();
          sShower.buffer = K.noiseBuf(ctx, 1.05, (x) => Math.sin(Math.PI * (x / 1.05)) ** 1.25);
          const bpShower = K.filt(ctx, 'bandpass', 1420 + R() * 320, 1.15);
          const gShower = K.gain(ctx, 0.36 * scale);
          K.run(ctx, out, t0 + 0.02, t0 + 1.07, sShower, bpShower, gShower);

          const drops = 8 + Math.floor(R() * 6);
          for (let i = 0; i < drops; i++) {
            const t = t0 + 0.03 + R() * 0.92;
            const kind = R();
            if (kind < 0.5) {
              const f0 = 540 + R() * 360;
              const len = 0.05;
              const s = ctx.createBufferSource();
              s.buffer = K.noiseBuf(ctx, len, (x) => Math.exp(-x / 0.013));
              const bp = K.filt(ctx, 'bandpass', f0, 5.5);
              bp.frequency.setValueAtTime(f0, t);
              bp.frequency.exponentialRampToValueAtTime(f0 * 1.55, t + len);
              const lp = K.filt(ctx, 'lowpass', 2200, 0.7);
              const g = K.gain(ctx, 0.44 * scale);
              K.run(ctx, out, t, t + len, s, bp, lp, g);
            } else if (kind < 0.82) {
              K.noiseHit(ctx, out, t, 0.035, 0.34 * scale, 'bandpass', 520 + R() * 350, 2.0, 0.010);
            } else {
              const fBrass = 1650 + R() * 520;
              K.noiseHit(ctx, out, t, 0.04, 0.32 * scale, 'bandpass', fBrass, 6.0, 0.012);
            }
          }
        },
      },
    },

    sfx: {
      match(ctx, out, R) {
        const t0 = ctx.currentTime;
        const rnd = R || Math.random;
        const scratchLen = 0.075 + rnd() * 0.04;
        const sScratch = ctx.createBufferSource();
        sScratch.buffer = K.noiseBuf(ctx, scratchLen, (x) => 0.4 + 0.6 * Math.abs(Math.sin(Math.PI * 65 * x)));
        const bpScratch = K.filt(ctx, 'bandpass', 2100, 1.5);
        bpScratch.frequency.setValueAtTime(2200, t0);
        bpScratch.frequency.linearRampToValueAtTime(1350, t0 + scratchLen);
        const gScratch = K.gain(ctx, 0);
        gScratch.gain.setValueAtTime(0, t0);
        gScratch.gain.linearRampToValueAtTime(0.32, t0 + 0.006);
        gScratch.gain.linearRampToValueAtTime(0, t0 + scratchLen);
        K.run(ctx, out, t0, t0 + scratchLen, sScratch, bpScratch, gScratch);

        const tFlame = t0 + scratchLen - 0.01;
        const flameLen = 0.48;
        const sFlame = ctx.createBufferSource();
        sFlame.buffer = K.noiseBuf(ctx, flameLen, (x) => Math.exp(-x / 0.14));
        const hpFlame = K.filt(ctx, 'highpass', 220, 0.7);
        const lpFlame = K.filt(ctx, 'lowpass', 1750, 0.8);
        lpFlame.frequency.setValueAtTime(1800, tFlame);
        lpFlame.frequency.exponentialRampToValueAtTime(780, tFlame + flameLen);
        const gFlame = K.gain(ctx, 0);
        gFlame.gain.setValueAtTime(0, tFlame);
        gFlame.gain.linearRampToValueAtTime(0.22, tFlame + 0.035);
        gFlame.gain.setTargetAtTime(0, tFlame + 0.035, 0.085);
        K.run(ctx, out, tFlame, tFlame + flameLen, sFlame, hpFlame, lpFlame, gFlame);

        for (let i = 0; i < 4; i++) {
          K.snap(ctx, out, tFlame + 0.04 + rnd() * 0.28, 0.022 + rnd() * 0.02, 1400, 4200, 0.0014);
        }
      },

      puff(ctx, out, R) {
        const t0 = ctx.currentTime;
        const rnd = R || Math.random;
        const dur = 0.38;
        const s = ctx.createBufferSource();
        s.buffer = K.noiseBuf(ctx, dur, (x) => Math.sin(Math.PI * Math.min(1, x / dur)) * Math.exp(-x / 0.15));
        const hp = K.filt(ctx, 'highpass', 180, 0.7);
        const lp = K.filt(ctx, 'lowpass', 980 + rnd() * 160, 0.9);
        lp.frequency.setValueAtTime(980, t0);
        lp.frequency.exponentialRampToValueAtTime(380, t0 + dur * 0.85);
        const g = K.gain(ctx, 0);
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.36, t0 + 0.028);
        g.gain.setTargetAtTime(0, t0 + 0.028, 0.075);
        K.run(ctx, out, t0, t0 + dur, s, hp, lp, g);
      },

      click(ctx, out, R) {
        const t0 = ctx.currentTime;
        const rnd = R || Math.random;
        K.snap(ctx, out, t0, 0.14, 1400, 4800, 0.0012);
        K.noiseHit(ctx, out, t0 + 0.014, 0.03, 0.08, 'bandpass', 920 + rnd() * 200, 3.0, 0.005);
      },

      bell(ctx, out, R, st, X) {
        window.SCENE_SOUNDS.plage.details.cloche_bouee.play(ctx, out, R || Math.random, st || { e: 0.5 }, X);
      },
    },
  };
})();
