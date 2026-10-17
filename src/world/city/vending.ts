import * as THREE from "three";
import { MeshBuilder, v3 } from "../builder";
import { VENDING } from "./layout";
import { SKILLS, type Skill } from "../../content/skills";
import { t } from "../../content/i18n";
import { JP_FONT } from "./signs";
import { vertexColorMaterial, patched } from "../materials";
import { shared } from "../atmosphere";
import { clamp, damp, easeOutCubic } from "../../core/math";

/**
 * Les distributeurs : quatre machines, une par façon de travailler. Façade
 * dessinée (rangées de boissons, prix, boutons lumineux), fronton bilingue,
 * bac de sortie. Un clic : la machine clignote, une canette tombe, sort du
 * bac et se présente ; la fiche s'ouvre.
 */

const W = 1.02;
const H = 1.83;
const D = 0.74;
const DISPLAY = { y0: 0.98, y1: 1.62, w: 0.84 };

type Machine = {
  skill: Skill;
  group: THREE.Group;
  display: THREE.Mesh;
  displayMat: THREE.MeshStandardMaterial;
  can: THREE.Mesh;
  hover: number;
  /** 0 → 1 : animation de canette en cours (temps). */
  drop: number;
  dropping: boolean;
  blink: number;
};

export class VendingRow {
  readonly group = new THREE.Group();
  readonly machines: Machine[] = [];
  hovered = -1;
  /** Machine dont la canette est présentée (fiche ouverte). */
  presented = -1;

  constructor() {
    this.group.name = "Distributeurs";
    const body = vertexColorMaterial(0.42, 1.2);
    SKILLS.forEach((skill, i) => {
      const g = new THREE.Group();
      g.name = `Distributeur — ${skill.id}`;
      const b = new MeshBuilder();
      this.buildBody(b, skill);
      const mesh = new THREE.Mesh(b.build(), body);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.machine = i;
      g.add(mesh);

      const canvas = this.paintDisplay(skill);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const displayMat = patched(
        new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: "#ffffff", emissiveIntensity: 0.7, roughness: 0.25, metalness: 0 }),
        "vending-display-v1",
      );
      const display = new THREE.Mesh(new THREE.PlaneGeometry(DISPLAY.w, DISPLAY.y1 - DISPLAY.y0), displayMat);
      display.position.set(0, (DISPLAY.y0 + DISPLAY.y1) / 2, D / 2 + 0.012);
      display.userData.machine = i;
      g.add(display);

      // Canette (cachée jusqu'au clic).
      const canTex = new THREE.CanvasTexture(this.paintCan(skill));
      canTex.colorSpace = THREE.SRGBColorSpace;
      canTex.anisotropy = 8;
      const canGeo = new THREE.CylinderGeometry(0.033, 0.033, 0.123, 24, 1, false);
      const can = new THREE.Mesh(
        canGeo,
        patched(new THREE.MeshStandardMaterial({ map: canTex, roughness: 0.28, metalness: 0.55, envMapIntensity: 1.2 }), "can-v1"),
      );
      can.visible = false;
      can.castShadow = true;
      g.add(can);

      // Placement le long du mur (machines face à la rue, vers +x).
      g.position.set(VENDING.x - D / 2 - 0.02, 0, VENDING.z + (i - (SKILLS.length - 1) / 2) * VENDING.spacing);
      g.rotation.y = Math.PI / 2;
      this.group.add(g);
      this.machines.push({ skill, group: g, display, displayMat, can, hover: 0, drop: 0, dropping: false, blink: 0 });
    });
    // Poubelles de tri à côté (bleu et blanc, trous ronds : le détail qui fait vrai).
    const bins = new MeshBuilder();
    for (const [k, color] of [
      [0, "#2f6fae"],
      [1, "#e9e6df"],
    ] as [number, string][]) {
      const z = VENDING.z + (SKILLS.length / 2) * VENDING.spacing + 0.35 + k * 0.5;
      bins.color(color).box(VENDING.x - 0.25, 0.42, z, 0.42, 0.84, 0.42);
      bins.color("#22252a").cylinder(VENDING.x - 0.04, 0.7, z, 0.07, 0.07, 0.02, 12, { top: true });
    }
    const binMesh = new THREE.Mesh(bins.build(), vertexColorMaterial(0.5, 0));
    binMesh.castShadow = true;
    this.group.add(binMesh);
  }

  private buildBody(b: MeshBuilder, s: Skill) {
    const body = new THREE.Color(s.body);
    const dark = body.clone().multiplyScalar(0.72);
    // Caisse.
    b.color(body).box(0, H / 2, 0, W, H, D);
    // Socle en retrait.
    b.color("#2a2b2e").box(0, 0.05, 0.02, W - 0.04, 0.1, D - 0.02);
    // Fronton lumineux (le nom).
    b.glow(1).color("#fbf8f2").box(0, H - 0.1, D / 2 + 0.01, W - 0.08, 0.12, 0.02).glow(0);
    // Encadrement de la vitrine.
    b.color(dark).box(0, DISPLAY.y1 + 0.03, D / 2 + 0.008, DISPLAY.w + 0.08, 0.05, 0.03);
    b.color(dark).box(0, DISPLAY.y0 - 0.03, D / 2 + 0.008, DISPLAY.w + 0.08, 0.05, 0.03);
    b.color(dark).box(-DISPLAY.w / 2 - 0.035, (DISPLAY.y0 + DISPLAY.y1) / 2, D / 2 + 0.008, 0.05, DISPLAY.y1 - DISPLAY.y0 + 0.1, 0.03);
    b.color(dark).box(DISPLAY.w / 2 + 0.035, (DISPLAY.y0 + DISPLAY.y1) / 2, D / 2 + 0.008, 0.05, DISPLAY.y1 - DISPLAY.y0 + 0.1, 0.03);
    // Panneau de commande : afficheur, fente à pièces, lecteur de carte.
    b.color("#26282c").box(0.3, 0.82, D / 2 + 0.015, 0.22, 0.2, 0.03);
    b.glow(1).color("#7dff9a").box(0.3, 0.86, D / 2 + 0.032, 0.14, 0.05, 0.005).glow(0);
    b.color("#a9adb3").box(0.3, 0.76, D / 2 + 0.032, 0.06, 0.02, 0.005);
    b.color("#3a3d42").box(-0.22, 0.8, D / 2 + 0.02, 0.3, 0.16, 0.03);
    // Bac de sortie (renfoncement sombre) et son volet.
    b.color("#141518").box(0, 0.28, D / 2 - 0.04, 0.7, 0.24, 0.1);
    b.color(dark).box(0, 0.42, D / 2 + 0.01, 0.78, 0.04, 0.04);
    b.color(dark).box(0, 0.14, D / 2 + 0.01, 0.78, 0.04, 0.04);
    // Bande colorée latérale.
    const accent = new THREE.Color(s.accent);
    b.color(accent).box(W / 2 + 0.003, H * 0.55, 0, 0.006, H * 0.7, D - 0.1);
    b.color(accent).box(-W / 2 - 0.003, H * 0.55, 0, 0.006, H * 0.7, D - 0.1);
    // Toit légèrement débordant.
    b.color(dark).box(0, H + 0.02, 0, W + 0.02, 0.04, D + 0.02);
  }

  private paintDisplay(s: Skill) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = Math.round((512 * (DISPLAY.y1 - DISPLAY.y0)) / DISPLAY.w);
    const g = c.getContext("2d")!;
    const w = c.width;
    const h = c.height;
    g.fillStyle = "#f7f3ea";
    g.fillRect(0, 0, w, h);
    // Fronton intégré (nom de la machine).
    g.fillStyle = s.body;
    g.fillRect(0, 0, w, 74);
    g.fillStyle = luminance(s.body) > 0.6 ? "#1d1a17" : "#ffffff";
    g.font = `900 46px ${JP_FONT}`;
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.fillText(s.jp, 18, 39);
    g.font = `700 22px "Instrument Sans Variable", sans-serif`;
    g.textAlign = "right";
    g.fillText(t(s.name).toUpperCase(), w - 18, 40);
    // Trois rangées de boissons (la première porte la canette de la compétence).
    const rows = 3;
    const cols = 5;
    const rowH = (h - 74) / rows;
    const palettes = [
      ["#2a5d9f", "#e8e3d6", "#b33b2e", "#2f6b4f", "#f2c14e"],
      ["#5a3a26", "#e4532a", "#1f6f8b", "#f2efe8", "#7a2d48"],
      ["#2e2e33", "#d6246a", "#9fb4dc", "#c9a96e", "#3f8f6a"],
    ];
    for (let r = 0; r < rows; r++) {
      const y0 = 74 + r * rowH;
      // Étagère.
      g.fillStyle = "#e4ded2";
      g.fillRect(0, y0 + rowH - 34, w, 34);
      for (let k = 0; k < cols; k++) {
        const cx = (w / cols) * (k + 0.5);
        const special = r === 0 && k === 2;
        const color = special ? s.accent : palettes[r][k];
        const bw = special ? 52 : 40;
        const bh = special ? rowH - 62 : rowH - 72;
        const top = y0 + rowH - 38 - bh;
        // Canette ou bouteille.
        g.fillStyle = color;
        if (r === 1 && k % 2 === 1) {
          g.fillRect(cx - bw / 2 + 6, top + 18, bw - 12, bh - 18);
          g.fillRect(cx - 6, top, 12, 20);
        } else {
          g.fillRect(cx - bw / 2, top, bw, bh);
          g.fillStyle = "rgba(255,255,255,0.35)";
          g.fillRect(cx - bw / 2 + 5, top + 4, 5, bh - 8);
        }
        if (special) {
          g.fillStyle = luminance(s.accent) > 0.6 ? s.body : "#ffffff";
          g.font = `900 22px ${JP_FONT}`;
          g.textAlign = "center";
          g.fillText(s.jp, cx, top + bh / 2);
        }
        // Prix et bouton.
        g.fillStyle = "#1d1a17";
        g.font = `600 17px "Instrument Sans Variable", sans-serif`;
        g.textAlign = "center";
        g.fillText(special ? s.price : ["¥110", "¥130", "¥150", "¥160", "¥140"][(k + r) % 5], cx, y0 + rowH - 21);
        g.fillStyle = special ? "#ff5a3c" : "#46c46e";
        g.beginPath();
        g.arc(cx + 30, y0 + rowH - 22, 6, 0, Math.PI * 2);
        g.fill();
      }
    }
    return c;
  }

  private paintCan(s: Skill) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = s.accent;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = s.body;
    g.fillRect(0, 170, 512, 86);
    g.fillStyle = luminance(s.accent) > 0.6 ? "#1d1a17" : "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 92px ${JP_FONT}`;
    g.fillText(s.jp, 128, 92);
    g.fillText(s.jp, 384, 92);
    g.fillStyle = luminance(s.body) > 0.6 ? "#1d1a17" : "#ffffff";
    g.font = `700 34px "Instrument Sans Variable", sans-serif`;
    g.fillText(t(s.name).toUpperCase(), 128, 212);
    g.fillText(t(s.name).toUpperCase(), 384, 212);
    return c;
  }

  /** Redessine façades et canettes (changement de langue). */
  relabel() {
    for (const m of this.machines) {
      const tex = m.displayMat.map as THREE.CanvasTexture;
      const fresh = this.paintDisplay(m.skill);
      const c = tex.image as HTMLCanvasElement;
      c.getContext("2d")!.drawImage(fresh, 0, 0);
      tex.needsUpdate = true;
      const canTex = (m.can.material as THREE.MeshStandardMaterial).map as THREE.CanvasTexture;
      (canTex.image as HTMLCanvasElement).getContext("2d")!.drawImage(this.paintCan(m.skill), 0, 0);
      canTex.needsUpdate = true;
    }
  }

  /** Déclenche la chute de canette. */
  dispense(i: number) {
    const m = this.machines[i];
    if (!m) return;
    m.dropping = true;
    m.drop = 0;
    m.blink = 1;
    this.presented = i;
  }

  release() {
    this.presented = -1;
  }

  pickables() {
    return this.machines.flatMap((m) => [m.display, m.group.children[0] as THREE.Mesh]);
  }

  update(dt: number, time: number, camera: THREE.Camera) {
    const lights = shared.uLights.value;
    this.machines.forEach((m, i) => {
      m.hover = damp(m.hover, this.hovered === i ? 1 : 0, 12, dt);
      m.blink = Math.max(0, m.blink - dt * 0.8);
      const pulse = m.blink > 0 ? 0.5 + 0.5 * Math.sin(time * 18) : 0;
      m.displayMat.emissiveIntensity = THREE.MathUtils.lerp(0.62, 1.15, lights) * (1 + 0.35 * m.hover + 0.4 * pulse * m.blink);
      // Canette : chute dans la machine (invisible), sortie du bac, présentation.
      if (m.dropping) m.drop = Math.min(1, m.drop + dt / 1.6);
      const presented = this.presented === i;
      if (!presented && m.drop > 0 && !m.dropping) m.drop = Math.max(0, m.drop - dt * 2);
      if (!presented && m.dropping && m.drop >= 1) m.dropping = false;
      const k = m.drop;
      m.can.visible = k > 0.28;
      if (m.can.visible) {
        const out = clamp((k - 0.28) / 0.25);
        const rise = easeOutCubic(clamp((k - 0.5) / 0.5));
        // Position locale : du bac vers l'avant, puis s'élève et se tourne vers la caméra.
        const tray = v3(0, 0.3, D / 2 - 0.02);
        const front = v3(0, 0.34, D / 2 + 0.18);
        const show = v3(0, 1.25, D / 2 + 0.55);
        const p = tray.clone().lerp(front, easeOutCubic(out)).lerp(show, rise);
        m.can.position.copy(p);
        // Bascule couchée → debout, puis rotation lente pour montrer l'étiquette.
        m.can.rotation.set(0, 0, (1 - rise) * Math.PI / 2);
        m.can.rotateY(time * 0.9);
        m.can.scale.setScalar(1 + rise * 0.9);
      }
      void camera;
    });
  }
}

function luminance(hex: string) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
