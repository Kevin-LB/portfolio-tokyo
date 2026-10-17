import * as THREE from "three";
import { Stage } from "./core/stage";
import { detectQuality, type Quality } from "./core/quality";
import { CameraRig } from "./story/camera-rig";
import { ScrollController } from "./story/scroll";
import { Timeline } from "./story/timeline";
import { chapterPresence, lift1Y, lift2Y, projectCursor, reducedProgress } from "./story/chapters";
import { DeckScreens } from "./world/tower/screens";
import { FEATURED } from "./content/projects";
import { VendingRow } from "./world/city/vending";
import { Clouds } from "./world/clouds";
import { Summit } from "./world/summit";
import { Traffic } from "./world/city/traffic";
import { Horizon } from "./world/horizon";
import { Ambience } from "./audio/ambience";
import { altitudeAt } from "./story/chapters";
import { palette } from "./world/atmosphere";
import { Tower } from "./world/tower/tower";
import { City } from "./world/city/city";
import { shared } from "./world/atmosphere";
import { damp, DEG, smoothstep } from "./core/math";
import { getLang, initialLang, setLang, t, type Lang } from "./content/i18n";
import { loadRuntimeContent } from "./content/store";
import { SITE } from "./content/site";
import { altimeter, main, topBar } from "./ui/markup";
import { UI } from "./content/ui";
import { Hud } from "./ui/hud";
import { Loader } from "./ui/loader";
import { startLecture } from "./ui/lecture";

/**
 * L'expérience : un plateau, un monde, une caméra, un scroll. Tout l'état du
 * monde découle de la progression `p` ; seule la vie ambiante dépend du temps.
 */
export class Experience {
  readonly stage: Stage;
  readonly tower: Tower;
  readonly city: City;
  readonly rig = new CameraRig();
  /** Du scroll au récit : vitesse perçue régulière (voir story/timeline.ts). */
  readonly timeline = new Timeline(this.rig);
  readonly scroll: ScrollController;
  readonly screens = new DeckScreens(FEATURED);
  readonly vending = new VendingRow();
  readonly clouds: Clouds;
  readonly summit = new Summit();
  readonly traffic: Traffic;
  readonly horizon = new Horizon();
  /** Voile de nuage courant (0 → 1). */
  veil = 0;
  hud: Hud | null = null;
  readonly audio = new Ambience();
  p = 0;
  night = 0;
  nightTarget = 0;
  time = 0;
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  private up = new THREE.Vector3();
  private look = new THREE.Vector3();

  constructor(
    canvas: HTMLCanvasElement,
    readonly quality: Quality,
    readonly reduced: boolean,
  ) {
    this.stage = new Stage(canvas, quality);
    this.tower = new Tower(quality.detail);
    this.stage.scene.add(this.tower.group);
    this.city = new City(quality.detail);
    this.stage.scene.add(this.city.group);
    this.stage.scene.add(this.screens.group);
    this.stage.scene.add(this.vending.group);
    this.clouds = new Clouds(quality.detail);
    this.stage.scene.add(this.clouds.group);
    this.stage.scene.add(this.summit.group);
    this.summit.onPulse = (k) => this.audio.ping(k);
    // La montgolfière est placée pour le plan final (le contact).
    const end = this.rig.evaluate(1);
    this.summit.setAnchor(end.position.clone(), end.target.clone());
    this.traffic = new Traffic(quality.detail);
    this.stage.scene.add(this.traffic.group);
    this.stage.backdrop.add(this.horizon.group);
    this.stage.onAtmosphere = (n) => {
      this.horizon.setHaze(palette("horizon", n), n);
      const sun = palette("sun", n).lerp(new THREE.Color("#ffffff"), 0.35 * (1 - n));
      const sky = palette("hemiSky", n).lerp(new THREE.Color("#ffffff"), 0.5 * (1 - n));
      const shadow = palette("zenith", n).lerp(palette("horizon", n), 0.4).multiplyScalar(0.9);
      this.clouds.setColors(sun, sky, shadow);
    };
    this.scroll = new ScrollController(document.querySelector("#track")!, quality.touch, reduced);
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      this.pointer.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    });
    addEventListener("resize", () => this.stage.resize());
  }

  setNight(n: number, instant = false) {
    this.nightTarget = n;
    document.documentElement.dataset.time = n > 0.5 ? "night" : "day";
    if (instant) {
      this.night = n;
      this.stage.applyAtmosphere(n);
    }
  }

  /** Va à un point du récit (étage, façade) : le scroll correspondant. */
  goTo(story: number) {
    this.scroll.goTo(this.timeline.scroll(story));
  }

  /** Place le monde à la progression p du récit (pur, hors vie ambiante). */
  pose(p: number) {
    const cam = this.stage.camera;
    this.rig.evaluate(p);
    cam.position.copy(this.rig.position);
    this.look.copy(this.rig.target);
    // Respiration et parallaxe souris : très légères, coupées en mouvement réduit.
    if (!this.reduced) {
      const breathe = Math.sin(this.time * 0.5) * 0.12 + Math.sin(this.time * 0.31) * 0.06;
      const street = 1 - smoothstep(0.15, 0.22, p);
      cam.position.y += breathe * (0.35 + 0.65 * (1 - street)) * 0.6;
      const dist = cam.position.distanceTo(this.look);
      const k = dist * Math.tan(1.1 * DEG);
      const right = new THREE.Vector3().subVectors(this.look, cam.position).cross(THREE.Object3D.DEFAULT_UP).normalize();
      this.look.addScaledVector(right, this.pointerSmooth.x * k);
      this.look.y -= this.pointerSmooth.y * k * 0.6;
    }
    // Portrait (téléphone) : on élargit le champ pour garder ~70 % du cadrage
    // horizontal prévu en 16:10, on recule devant les écrans, et on remonte le
    // sujet dans la moitié haute (l'interface occupe le bas).
    let fov = this.rig.fov;
    const aspect = this.stage.aspect;
    if (aspect < 1.2) {
      const h169 = 2 * Math.atan(Math.tan((fov * DEG) / 2) * 1.6);
      const want = 2 * Math.atan(Math.tan((h169 * 0.72) / 2) / aspect) / DEG;
      fov = Math.min(78, Math.max(fov, want));
      const decks = chapterPresence(p, 0.39, 0.6, 0.02) + chapterPresence(p, 0.72, 0.86, 0.02);
      if (decks > 0) {
        const back = new THREE.Vector3().subVectors(cam.position, this.look);
        back.y = 0;
        // (Recul modéré : l'interface du deck tient dans une barre en bas.)
        cam.position.addScaledVector(back, decks * THREE.MathUtils.clamp(1.2 / aspect - 1.2, 0, 0.5));
      }
      const dist = cam.position.distanceTo(this.look);
      this.look.y -= dist * Math.tan(fov * DEG * 0.16) * THREE.MathUtils.clamp((1.2 - aspect) / 0.7, 0, 1);
    }
    this.up.set(Math.sin(this.rig.roll), Math.cos(this.rig.roll), 0);
    cam.up.copy(this.up);
    cam.lookAt(this.look);
    cam.fov = fov;
    cam.near = THREE.MathUtils.clamp(cam.position.y * 0.012, 0.25, 3);
    cam.updateProjectionMatrix();
    const y1 = lift1Y(p);
    const y2 = lift2Y(p);
    this.tower.cabin1.position.y = y1;
    this.tower.cabin2.position.y = y2;
    // Les cabines disparaissent dans les plateformes (on ne les voit pas à travers les vitres).
    this.tower.cabin1.visible = y1 < 138;
    this.tower.cabin2.visible = y2 > 158.5 && y2 < 243;
  }

  /** Ce qui dépend de p et du temps (écrans, vie). */
  animate(p: number, dt: number) {
    const presence = chapterPresence(p, 0.386, 0.6, 0.012);
    this.screens.update(dt, presence > 0 ? projectCursor(p) : -1, presence);
    this.vending.update(dt, this.time, this.stage.camera);
    this.traffic.update(dt, this.stage.camera.position.y, this.reduced);
    this.audio.update(dt, altitudeAt(p, this.stage.camera.position.y), this.scroll.velocity, p < 0.2);
    this.summit.update(dt, this.time, chapterPresence(p, 0.9, 1.2, 0.04), this.reduced);
    // Traversée des nuages : voile plein écran selon la densité autour de la caméra.
    const inside = this.clouds.insideness(this.stage.camera.position);
    this.veil = inside;
    const post = this.stage.post.final.uniforms;
    post.uVeil.value = inside * 0.96;
    post.uVeilColor.value.copy(palette("horizon", this.night)).lerp(new THREE.Color("#ffffff"), 0.55 * (1 - this.night));
  }

  async load() {
    await this.screens.load();
    this.screens.draw("fr");
    this.summit.drawBanner();
  }

  update(dt: number) {
    this.time += dt;
    shared.uTime.value = this.time;
    this.pointerSmooth.x = damp(this.pointerSmooth.x, this.pointer.x, 3, dt);
    this.pointerSmooth.y = damp(this.pointerSmooth.y, this.pointer.y, 3, dt);
    if (this.night !== this.nightTarget) {
      const dir = Math.sign(this.nightTarget - this.night);
      this.night = THREE.MathUtils.clamp(this.night + (dir * dt) / 3.4, 0, 1);
      if ((dir > 0 && this.night > this.nightTarget) || (dir < 0 && this.night < this.nightTarget)) this.night = this.nightTarget;
      this.stage.applyAtmosphere(this.night);
    }
    const raw = this.timeline.story(this.scroll.update(dt));
    // Mouvement réduit : plans fixes et fondus, pas de trajet de caméra.
    let p = raw;
    if (this.reduced) {
      const r = reducedProgress(raw);
      p = r.p;
      this.stage.post.final.uniforms.uFade.value = r.fade;
    }
    this.p = p;
    this.pose(p);
    this.animate(p, dt);
    this.tower.update(this.time);
    this.city.update();
    return raw;
  }

  render() {
    this.stage.render();
  }

  /** Redessine les textes peints dans la scène (écrans, banderole, distributeurs). */
  relabel(lang: Lang) {
    this.screens.draw(lang);
    this.summit.drawBanner();
    this.vending.relabel();
  }
}

/** Nuit à Tokyo ? (le site s'ouvre à l'heure réelle de la tour). */
function tokyoIsNight() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", hour12: false }).format(new Date()));
  return h < 6 || h >= 18;
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export async function boot() {
  const params = new URLSearchParams(location.search);
  // Le contenu (édité depuis l'administration) avant tout le reste.
  const source = await loadRuntimeContent();
  setLang(initialLang());
  // Le HTML servi est en français, avec le contenu du serveur : on le
  // réécrit si la langue ou le contenu diffèrent.
  if (getLang() !== "fr" || source === "api") {
    const l = getLang();
    document.querySelector(".topbar")!.innerHTML = topBar(l);
    document.querySelector(".altimeter")!.innerHTML = altimeter(l);
    document.querySelector("main")!.innerHTML = main(l);
    document.title = `${SITE.name} — ${t(SITE.role).replace(/\.$/, "")}`;
  }
  const probe = document.createElement("canvas").getContext("webgl2");
  if (params.has("lecture") || !probe) {
    startLecture(probe ? undefined : "nowebgl");
    return;
  }
  document.documentElement.dataset.mode = "tower";
  const loader = new Loader();
  try {
    const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
    const quality = detectQuality(probe);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    loader.progress(0.08);
    await City.prepare();
    loader.progress(0.22);
    await frame();
    const xp = new Experience(canvas, quality, reduced);
    loader.progress(0.62);
    await frame();
    await xp.load();
    xp.relabel(getLang());
    loader.progress(0.78);
    const forced = params.get("nuit");
    const night = forced !== null ? Number(forced) : tokyoIsNight() ? 1 : 0;
    xp.setNight(night, true);
    document.documentElement.dataset.time = night > 0.5 ? "night" : "day";
    const hud = new Hud(xp);
    xp.hud = hud;
    hud.updateNightButton(night > 0.5);
    // Compilation des shaders avant d'ouvrir le rideau (pas d'à-coup au premier scroll).
    xp.update(0);
    await xp.stage.renderer.compileAsync(xp.stage.scene, xp.stage.camera).catch(() => undefined);
    xp.render();
    loader.progress(0.96);

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!document.hidden) {
        const p = xp.update(dt);
        // Le verre lit la mise en page avant que l'interface ne l'écrive.
        hud.glass.update(dt);
        hud.update(p);
        xp.render();
        if (xp.stage.governor.push(dt * 1000)) xp.stage.resize();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await loader.done(t(UI.loaded));

    if (import.meta.env.DEV) {
      const { installDevTools } = await import("./dev");
      installDevTools(xp);
    }
  } catch (error) {
    console.error(error);
    startLecture("nowebgl");
    document.querySelector("#loader")?.classList.add("is-done");
  }
}
