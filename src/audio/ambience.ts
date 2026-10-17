import { clamp, smoothstep } from "../core/math";

/**
 * Ambiance sonore procédurale (Web Audio, aucun fichier) :
 *  - au sol : rumeur de ville filtrée, circulation qui ondule, et de temps
 *    en temps la cloche lointaine d'un passage à niveau ;
 *  - en montant : la ville s'éteint, le vent prend le relais ;
 *  - l'ascenseur ronronne quand il bouge ; la canette tombe ; l'antenne émet.
 * Coupé par défaut. Ne démarre qu'après un geste (règles des navigateurs).
 */
export class Ambience {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private city!: GainNode;
  private wind!: GainNode;
  private windFilter!: BiquadFilterNode;
  private hum!: GainNode;
  private bellTimer = 0;
  enabled = false;

  private noiseBuffer(ctx: AudioContext, kind: "white" | "pink") {
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "white") d[i] = w * 0.5;
      else {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    return buf;
  }

  private loop(buf: AudioBuffer) {
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start(0, Math.random() * 3);
    return src;
  }

  private init() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    const pink = this.noiseBuffer(ctx, "pink");
    const white = this.noiseBuffer(ctx, "white");

    // Ville : rumeur grave + circulation (bande passante qui ondule).
    this.city = ctx.createGain();
    this.city.connect(this.master);
    const rumble = this.loop(pink);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    rumble.connect(lp).connect(this.city);
    const traffic = this.loop(pink);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    const tg = ctx.createGain();
    tg.gain.value = 0.25;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain).connect(tg.gain);
    lfo.start();
    traffic.connect(bp).connect(tg).connect(this.city);

    // Vent : bruit blanc dans un filtre qui respire.
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    this.wind.connect(this.master);
    const air = this.loop(white);
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.9;
    const wl = ctx.createOscillator();
    wl.frequency.value = 0.11;
    const wlg = ctx.createGain();
    wlg.gain.value = 260;
    wl.connect(wlg).connect(this.windFilter.frequency);
    wl.start();
    air.connect(this.windFilter).connect(this.wind);

    // Ascenseur : bourdon grave.
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    this.hum.connect(this.master);
    for (const [f, g] of [
      [62, 0.5],
      [124, 0.22],
      [186, 0.08],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.hum);
      o.start();
    }
  }

  async toggle() {
    if (!this.ctx) this.init();
    const ctx = this.ctx!;
    this.enabled = !this.enabled;
    if (this.enabled && ctx.state !== "running") await ctx.resume();
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(this.enabled ? 0.55 : 0, ctx.currentTime, 0.4);
    return this.enabled;
  }

  /** Mixage selon l'altitude et la vitesse de montée. */
  update(dt: number, altitude: number, speed: number, ground: boolean) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const cityLevel = (1 - smoothstep(25, 230, altitude)) * 0.9;
    const windLevel = smoothstep(90, 330, altitude) * 0.55 + 0.04;
    this.city.gain.setTargetAtTime(cityLevel, t, 0.3);
    this.wind.gain.setTargetAtTime(windLevel, t, 0.5);
    this.hum.gain.setTargetAtTime(clamp(Math.abs(speed) * 6, 0, 1) * 0.18, t, 0.25);
    // Cloche de passage à niveau, lointaine, de temps en temps.
    if (ground) {
      this.bellTimer -= dt;
      if (this.bellTimer <= 0) {
        this.crossingBell();
        this.bellTimer = 26 + Math.random() * 18;
      }
    }
  }

  private crossingBell() {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2400;
    g.connect(filter).connect(this.city);
    const t0 = ctx.currentTime;
    for (let i = 0; i < 10; i++) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = i % 2 ? 690 : 760;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t0 + i * 0.42);
      og.gain.linearRampToValueAtTime(0.05, t0 + i * 0.42 + 0.01);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.42 + 0.4);
      o.connect(og).connect(g);
      o.start(t0 + i * 0.42);
      o.stop(t0 + i * 0.42 + 0.42);
    }
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.5, t0 + 1.5);
    g.gain.linearRampToValueAtTime(0, t0 + 4.4);
  }

  /** La canette tombe : choc sourd, petit tintement. */
  can() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.35;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t0);
    o.frequency.exponentialRampToValueAtTime(48, t0 + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.32);
    const tink = ctx.createOscillator();
    tink.type = "triangle";
    tink.frequency.value = 2300;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.06, t0 + 0.05);
    tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    tink.connect(tg).connect(this.master);
    tink.start(t0 + 0.05);
    tink.stop(t0 + 0.52);
  }

  /** L'antenne émet. */
  ping(strength = 1) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(880, t0);
    o.frequency.exponentialRampToValueAtTime(1320, t0 + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.035 * strength, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 1.5);
  }
}
