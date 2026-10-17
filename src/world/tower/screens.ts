import * as THREE from "three";
import { screenFrame } from "./decks";
import { FOG_FRAGMENT, FOG_PARS_FRAGMENT, shared } from "../atmosphere";
import { damp } from "../../core/math";
import type { Project } from "../../content/projects";
import { t, type Lang } from "../../content/i18n";

/**
 * Les façades-écrans du Main Deck. Chaque grande face porte un projet ;
 * l'écran « démarre » quand la caméra arrive devant lui (balayage de haut en
 * bas, ligne de lumière), reste en veille sinon. Texture dessinée au canvas
 * (une par face), shader dédié : grille de LED discrète, survol, brouillard.
 */

/** Face du deck → projet : on arrive par le nord (face 2) et on tourne. */
export const FACE_ORDER = [2, 3, 0, 1];

const VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vFogWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vFogWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap; uniform float uBoot; uniform float uIdle; uniform float uHover; uniform float uTime;
uniform float uNight; uniform vec2 uRes;
varying vec2 vUv;
${FOG_PARS_FRAGMENT}
float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  vec3 img = texture2D(uMap, vUv).rgb;
  // Démarrage : balayage du haut vers le bas avec une ligne lumineuse.
  float edge = uBoot * 1.15 - 0.075;
  float y = 1.0 - vUv.y;
  float shown = 1.0 - smoothstep(edge - 0.02, edge, y);
  float line = exp(-pow((y - edge) * 60.0, 2.0)) * step(0.001, uBoot) * (1.0 - step(0.999, uBoot));
  // Veille : image très sombre, un peu de bruit, rangées de pixels.
  float n = h21(floor(vUv * uRes / 4.0) + floor(uTime * 8.0));
  vec3 idle = img * 0.07 + vec3(0.012, 0.014, 0.018) + n * 0.006;
  vec3 col = mix(idle * uIdle + vec3(0.008, 0.01, 0.013) * (1.0 - uIdle), img, shown);
  col += vec3(0.9, 0.95, 1.0) * line * 0.8;
  // Grille de LED : visible de près, invisible de loin.
  vec2 cell = fract(vUv * uRes / 3.0);
  float grid = smoothstep(0.0, 0.18, cell.x) * smoothstep(0.0, 0.18, cell.y);
  col *= mix(0.86, 1.0, grid);
  float level = mix(1.15, 1.75, uNight) * (1.0 + 0.12 * uHover);
  gl_FragColor = vec4(col * level, 1.0);
  ${FOG_FRAGMENT}
}
`;

type Screen = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  project: Project;
  boot: number;
  hover: number;
};

const W = 2048;

export class DeckScreens {
  readonly group = new THREE.Group();
  readonly screens: Screen[] = [];
  private images = new Map<string, HTMLImageElement>();
  /** Projet survolé (index) ou -1. */
  hovered = -1;

  constructor(private projects: Project[]) {
    this.group.name = "Écrans du Main Deck";
    projects.forEach((project, i) => {
      const face = FACE_ORDER[i];
      const f = screenFrame(face);
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = Math.round((W * f.height) / f.width);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      const material = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uMap: { value: texture },
          uBoot: { value: 0 },
          uIdle: { value: 0 },
          uHover: { value: 0 },
          uTime: shared.uTime,
          uNight: shared.uNight,
          uRes: { value: new THREE.Vector2(canvas.width, canvas.height) },
          uFogColor: shared.uFogColor,
          uFogDensity: shared.uFogDensity,
          uFogHeight: shared.uFogHeight,
          uCamPos: shared.uCamPos,
        },
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(f.width, f.height), material);
      mesh.position.copy(f.center);
      mesh.rotation.order = "YXZ";
      mesh.rotation.y = f.angle;
      mesh.rotation.x = f.tilt;
      mesh.name = `Écran — ${project.title}`;
      mesh.userData.project = i;
      this.group.add(mesh);
      this.screens.push({ mesh, material, canvas, texture, project, boot: 0, hover: 0 });
    });
  }

  async load() {
    await document.fonts.load('600 120px "Instrument Sans Variable"').catch(() => undefined);
    await Promise.all(
      this.projects
        .filter((p) => p.image)
        .map(
          (p) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.decoding = "async";
              img.onload = () => {
                this.images.set(p.slug, img);
                resolve();
              };
              img.onerror = () => resolve();
              img.src = p.image!.src;
            }),
        ),
    );
  }

  draw(lang: Lang) {
    for (const s of this.screens) this.paint(s, lang);
  }

  private paint(s: Screen, lang: Lang) {
    const c = s.canvas.getContext("2d")!;
    const w = s.canvas.width;
    const h = s.canvas.height;
    const p = s.project;
    c.fillStyle = p.tint;
    c.fillRect(0, 0, w, h);
    const img = this.images.get(p.slug);
    const colW = Math.round(w * 0.36);
    const pad = Math.round(h * 0.09);
    // Image : recadrée en « couverture », alignée en haut (le haut d'une page d'accueil).
    if (img && p.image?.phone) {
      // Capture de téléphone : sur le fond de l'appli, cadrée comme un écran de poche.
      const probe = document.createElement("canvas").getContext("2d")!;
      probe.drawImage(img, 0, 0, 1, 1);
      const [r0, g0, b0] = probe.getImageData(0, 0, 1, 1).data;
      c.fillStyle = `rgb(${r0},${g0},${b0})`;
      c.fillRect(colW, 0, w - colW, h);
      const ph = h * 0.86;
      const pw = (ph * img.width) / img.height;
      const px = colW + (w - colW - pw) / 2;
      const py = (h - ph) / 2;
      c.save();
      c.fillStyle = "#2a1a21";
      roundRect(c, px - 14, py - 14, pw + 28, ph + 28, 46);
      c.fill();
      roundRect(c, px, py, pw, ph, 34);
      c.clip();
      c.drawImage(img, px, py, pw, ph);
      c.restore();
    } else if (img) {
      const x0 = colW;
      const bw = w - colW;
      const scale = Math.max(bw / img.width, h / img.height);
      const dw = img.width * scale;
      c.drawImage(img, x0 + (bw - dw) / 2, 0, dw, img.height * scale);
    } else {
      // Pas de capture disponible : affiche typographique, rien d'inventé.
      c.save();
      c.fillStyle = "rgba(255,255,255,0.06)";
      c.fillRect(colW, 0, w - colW, h);
      c.fillStyle = "#f3eee6";
      c.textBaseline = "middle";
      c.font = `600 ${Math.round(h * 0.34)}px "Instrument Sans Variable", sans-serif`;
      const word = p.slug === "taga" ? "TΛGΛ" : p.slug === "dolphins" ? "DE · EN · FR" : p.title;
      c.textAlign = "center";
      c.fillText(word, colW + (w - colW) / 2, h * 0.47, w - colW - pad * 2);
      c.restore();
    }
    // Colonne de texte.
    c.fillStyle = p.tint;
    c.fillRect(0, 0, colW, h);
    c.fillStyle = "#f6f1e8";
    c.textAlign = "left";
    c.textBaseline = "alphabetic";
    let titleSize = Math.round(h * 0.17);
    let lines: string[] = [];
    for (; titleSize > 40; titleSize -= 4) {
      c.font = `600 ${titleSize}px "Instrument Sans Variable", sans-serif`;
      lines = wrap(c, p.title, colW - pad * 2);
      if (lines.every((l) => c.measureText(l).width <= colW - pad * 2) && lines.length <= 3) break;
    }
    lines.forEach((ln, i) => c.fillText(ln, pad, pad + titleSize * 0.85 + i * titleSize * 0.98));
    c.font = `500 ${Math.round(h * 0.05)}px "Instrument Sans Variable", sans-serif`;
    c.fillStyle = "rgba(246,241,232,0.72)";
    const meta = [p.year, t(p.discipline)].join(" — ");
    const metaLines = wrap(c, meta, colW - pad * 2);
    metaLines.forEach((ln, i) => c.fillText(ln, pad, h - pad - (metaLines.length - 1 - i) * h * 0.065));
    // Liseré orange (la couleur de la tour) entre texte et image.
    c.fillStyle = "#e4532a";
    c.fillRect(colW - Math.round(h * 0.012), 0, Math.round(h * 0.012), h);
    void lang;
    s.texture.needsUpdate = true;
  }

  /**
   * @param cursor position continue sur les faces (0 → 3), -1 hors chapitre
   * @param presence 0 → 1 : allumage général à l'arrivée sur le deck
   */
  update(dt: number, cursor: number, presence: number) {
    this.screens.forEach((s, i) => {
      const active = presence > 0.5 && Math.abs(cursor - i) < 0.34;
      s.boot = damp(s.boot, active ? 1 : 0, active ? 2.6 : 5, dt);
      if (s.boot > 0.995) s.boot = 1;
      if (s.boot < 0.002) s.boot = 0;
      s.hover = damp(s.hover, this.hovered === i ? 1 : 0, 12, dt);
      s.material.uniforms.uBoot.value = s.boot;
      s.material.uniforms.uIdle.value = presence;
      s.material.uniforms.uHover.value = s.hover;
    });
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function wrap(c: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (c.measureText(test).width > max && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
