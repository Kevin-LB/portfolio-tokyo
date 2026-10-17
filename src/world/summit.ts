import * as THREE from "three";
import { MeshBuilder, v3 } from "./builder";
import { patched, vertexColorMaterial } from "./materials";
import { FOG_FRAGMENT, FOG_PARS_FRAGMENT, shared } from "./atmosphere";
import { t } from "../content/i18n";
import { SITE } from "../content/site";
import { TOWER } from "./tower/spec";
import { GlowPoints } from "./glow";

/**
 * Le sommet : une montgolfière aux couleurs de la tour flotte près de
 * l'antenne, sa banderole suspendue sous la nacelle ; l'antenne émet des
 * anneaux (le signal). La banderole est un tissu animé dans le shader ; les
 * anneaux sont des disques additifs. La nuit, le brûleur s'allume par
 * bouffées et l'enveloppe luit de l'intérieur.
 */


/** Enveloppe : profil tourné, fuseaux orange et blancs (non indexée : rayures nettes). */
function buildEnvelope() {
  const profile = [
    [1.5, 0],
    [2.6, 1.4],
    [4.6, 3.6],
    [6.4, 6.4],
    [7.3, 9.4],
    [7.4, 11.8],
    [6.8, 14.4],
    [5.3, 16.6],
    [3.0, 18.2],
    [0.0, 18.8],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  // Profil lissé (spline) : l'enveloppe est une goutte, pas un empilement de cônes.
  const smooth = new THREE.SplineCurve(profile).getPoints(36);
  smooth[smooth.length - 1].x = 0;
  const gores = 16;
  const lathe = new THREE.LatheGeometry(smooth, gores * 3);
  const g = lathe.toNonIndexed();
  const pos = g.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const orange = new THREE.Color("#e8542a");
  const cream = new THREE.Color("#f3eee6");
  const band = new THREE.Color("#c8441f");
  for (let i = 0; i < pos.count; i += 3) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += pos.getX(i + k) / 3;
      cy += pos.getY(i + k) / 3;
      cz += pos.getZ(i + k) / 3;
    }
    const a = (Math.atan2(cx, cz) / (Math.PI * 2) + 1) % 1;
    const gore = Math.floor(a * gores);
    let c = gore % 2 === 0 ? orange : cream;
    if (cy < 1.6) c = band; // jupe
    else if (cy > 9.4 && cy < 11.8) c = gore % 2 === 0 ? cream : orange; // ceinture inversée (une rangée entière)
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  // (Les normales lisses du tour sont conservées par la dé-indexation.)
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  lathe.dispose();
  return g;
}

/** Nacelle en osier, suspentes, cadre du brûleur. Origine : la bouche de l'enveloppe. */
function buildBasket() {
  const b = new MeshBuilder();
  const top = -3.6;
  b.color("#8a5a32").box(0, top - 0.55, 0, 1.5, 1.1, 1.5);
  b.color("#5a3a1e").box(0, top + 0.02, 0, 1.62, 0.12, 1.62);
  b.color("#6b4526").box(0, top - 1.12, 0, 1.4, 0.06, 1.4);
  // Suspentes : des coins de la nacelle au cercle de charge.
  b.color("#3a3631");
  for (const [x, z] of [
    [-0.75, -0.75],
    [0.75, -0.75],
    [0.75, 0.75],
    [-0.75, 0.75],
  ]) {
    b.beam(v3(x, top + 0.05, z), v3(x * 1.7, -0.1, z * 1.7), 0.03, 0.03);
    b.beam(v3(x, top + 0.05, z), v3(x * 0.25, top + 1.4, z * 0.25), 0.04, 0.04);
  }
  // Brûleur.
  b.color("#2b2b2b").box(0, top + 1.45, 0, 0.5, 0.28, 0.5);
  b.color("#9a9a9a").cylinder(0, top + 1.62, 0, 0.12, 0.16, 0.22, 10, { top: true });
  // Cordes de la banderole.
  b.color("#3a3631");
  b.beam(v3(-0.7, top - 1.1, 0), v3(-6.6, top - 4.4, 0), 0.025, 0.025);
  b.beam(v3(0.7, top - 1.1, 0), v3(6.6, top - 4.4, 0), 0.025, 0.025);
  return b.build();
}

const BANNER_VERT = /* glsl */ `
uniform float uTime; uniform float uLen;
varying vec2 vUv; varying vec3 vFogWorld;
void main() {
  vUv = uv;
  vec3 p = position;
  // Suspendue, elle ondule doucement au vent (plus aux bouts qu'au centre).
  float ends = abs(p.x) / (uLen * 0.5);
  p.z += sin(p.x * 0.45 + uTime * 1.7) * (0.12 + 0.28 * ends) + sin(p.x * 1.3 + uTime * 2.9) * 0.05;
  p.y += sin(p.x * 0.6 + uTime * 1.3) * 0.06;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vFogWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const BANNER_FRAG = /* glsl */ `
uniform sampler2D uMap; uniform float uLight;
varying vec2 vUv;
${FOG_PARS_FRAGMENT}
void main() {
  vec2 uv = vUv;
  if (!gl_FrontFacing) uv.x = 1.0 - uv.x;
  vec3 c = texture2D(uMap, uv).rgb;
  float fold = 0.88 + 0.12 * sin(vUv.x * 60.0);
  gl_FragColor = vec4(c * uLight * fold, 1.0);
  ${FOG_FRAGMENT}
}
`;

const RING_FRAG = /* glsl */ `
uniform float uAge; uniform vec3 uColor; uniform float uStrength;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float ring = exp(-pow((r - uAge) * 26.0, 2.0)) + exp(-pow((r - uAge * 0.82) * 40.0, 2.0)) * 0.35;
  float fade = pow(1.0 - uAge, 1.6);
  gl_FragColor = vec4(uColor * ring * fade * uStrength, 1.0);
}
`;

export class Summit {
  readonly group = new THREE.Group();
  /** La montgolfière (bouche de l'enveloppe à l'origine). */
  readonly balloon = new THREE.Group();
  private envelopeMat: THREE.MeshStandardMaterial;
  private flame: GlowPoints;
  private bannerMat: THREE.ShaderMaterial;
  private bannerCanvas = document.createElement("canvas");
  private bannerTex: THREE.CanvasTexture;
  private rings: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; age: number; strength: number }[] = [];
  private nextRing = 0;
  /** Où elle flotte (choisi depuis le plan final), et d'où on la regarde. */
  private home = new THREE.Vector3(60, 318, -20);
  private viewer = new THREE.Vector3(0, 337, 50);
  private burn = 0;
  private nextBurn = 1;
  /** 0 → 1 : présence du sommet (pilote l'émission). */
  presence = 0;

  constructor() {
    this.group.name = "Sommet";
    this.envelopeMat = patched(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0, emissive: "#ff9a3c", emissiveIntensity: 0 }),
      "balloon-v1",
    );
    const envelope = new THREE.Mesh(buildEnvelope(), this.envelopeMat);
    envelope.castShadow = true;
    this.balloon.add(envelope);
    const basket = new THREE.Mesh(buildBasket(), vertexColorMaterial(0.8, 0));
    basket.castShadow = true;
    this.balloon.add(basket);
    this.flame = new GlowPoints([{ p: new THREE.Vector3(0, -1.6, 0), color: "#ffb04a", size: 1.4 }], { minPx: 2, name: "Brûleur" });
    this.balloon.add(this.flame.mesh);
    // Banderole suspendue sous la nacelle.
    this.bannerCanvas.width = 2048;
    this.bannerCanvas.height = 380;
    this.bannerTex = new THREE.CanvasTexture(this.bannerCanvas);
    this.bannerTex.colorSpace = THREE.SRGBColorSpace;
    this.bannerTex.anisotropy = 8;
    const len = 13.6;
    this.bannerMat = new THREE.ShaderMaterial({
      vertexShader: BANNER_VERT,
      fragmentShader: BANNER_FRAG,
      uniforms: {
        uMap: { value: this.bannerTex },
        uTime: shared.uTime,
        uLen: { value: len },
        uLight: { value: 1 },
        uFogColor: shared.uFogColor,
        uFogDensity: shared.uFogDensity,
        uFogHeight: shared.uFogHeight,
        uCamPos: shared.uCamPos,
      },
      side: THREE.DoubleSide,
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.5, 40, 4), this.bannerMat);
    banner.position.set(0, -3.6 - 4.4 - 1.25, 0);
    this.balloon.add(banner);
    this.group.add(this.balloon);

    // Anneaux du signal.
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: RING_FRAG,
        uniforms: { uAge: { value: 1 }, uColor: { value: new THREE.Color("#ffd2a0") }, uStrength: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, TOWER.height - 1.5, 0);
      mesh.visible = false;
      mesh.renderOrder = 12;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, age: 1, strength: 1 });
    }
  }

  drawBanner() {
    const c = this.bannerCanvas.getContext("2d")!;
    const w = this.bannerCanvas.width;
    const h = this.bannerCanvas.height;
    c.fillStyle = "#f6f1e8";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#e4532a";
    c.fillRect(0, 0, w, 18);
    c.fillRect(0, h - 18, w, 18);
    c.fillStyle = "#1d1a17";
    c.font = `600 ${Math.round(h * 0.6)}px "Instrument Sans Variable", sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(t(SITE.banner), w / 2, h / 2 + 8, w - 120);
    this.bannerTex.needsUpdate = true;
  }

  onPulse: ((strength: number) => void) | null = null;

  /** Émet un anneau (ou une salve). */
  pulse(strength = 1) {
    this.onPulse?.(strength);
    const ring = this.rings.reduce((a, b) => (a.age > b.age ? a : b));
    ring.age = 0;
    ring.strength = strength;
    ring.mesh.visible = true;
  }

  burst() {
    this.pulse(2.2);
    setTimeout(() => this.pulse(1.6), 260);
    setTimeout(() => this.pulse(1.2), 560);
  }

  /**
   * Place la montgolfière à partir du plan final (le contact) : à droite de
   * l'antenne, à ~90 m, sous la ligne d'horizon du regard, la banderole
   * tournée vers le visiteur. Elle reste là (une montgolfière ne file pas),
   * avec une lente dérive.
   */
  setAnchor(cameraPos: THREE.Vector3, cameraTarget: THREE.Vector3) {
    const forward = cameraTarget.clone().sub(cameraPos).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const side = 12 * THREE.MathUtils.DEG2RAD;
    const dir = forward.multiplyScalar(Math.cos(side)).addScaledVector(right, Math.sin(side));
    this.home.copy(cameraPos).addScaledVector(dir, 90).setY(318);
    this.viewer.copy(cameraPos);
  }

  update(dt: number, time: number, presence: number, reduced: boolean) {
    this.presence = presence;
    const still = reduced ? 0 : 1;
    // Dérive du vent : quelques mètres, très lentement.
    this.balloon.position.set(
      this.home.x + Math.sin(time * 0.045) * 3.5 * still,
      this.home.y + Math.sin(time * 0.31) * 1.1 * still,
      this.home.z + Math.cos(time * 0.037) * 3.5 * still,
    );
    const v = this.viewer;
    const yaw = Math.atan2(v.x - this.balloon.position.x, v.z - this.balloon.position.z);
    this.balloon.rotation.set(Math.sin(time * 0.4) * 0.015 * still, yaw + Math.sin(time * 0.11) * 0.12 * still, Math.sin(time * 0.33) * 0.02 * still);
    // Brûleur : des bouffées de quelques secondes.
    this.nextBurn -= dt;
    if (this.nextBurn <= 0) {
      this.burn = 1;
      this.nextBurn = 5 + ((time * 7.13) % 4);
    }
    this.burn = Math.max(0, this.burn - dt / 1.6);
    const night = shared.uNight.value;
    const flicker = 0.85 + 0.15 * Math.sin(time * 37) * Math.sin(time * 23);
    this.flame.intensity = this.burn * flicker * (1.5 + 4 * night);
    this.envelopeMat.emissiveIntensity = this.burn * flicker * (0.05 + 0.55 * night) + 0.08 * night;
    this.bannerMat.uniforms.uLight.value = THREE.MathUtils.lerp(1.05, 0.5, night) + shared.uLights.value * 0.15;
    // Anneaux : une impulsion régulière quand on est au sommet.
    if (presence > 0.6 && !reduced) {
      this.nextRing -= dt;
      if (this.nextRing <= 0) {
        this.pulse(0.9);
        this.nextRing = 2.6;
      }
    }
    for (const r of this.rings) {
      if (r.age >= 1) {
        r.mesh.visible = false;
        continue;
      }
      r.age = Math.min(1, r.age + dt / 2.4);
      const radius = 4 + r.age * 70;
      r.mesh.scale.setScalar(radius);
      r.mat.uniforms.uAge.value = r.age;
      r.mat.uniforms.uStrength.value = r.strength * (0.6 + shared.uNight.value * 0.8);
    }
  }
}
