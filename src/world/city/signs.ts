import * as THREE from "three";

/**
 * L'atlas des enseignes : une seule texture dessinée au chargement (canvas),
 * en japonais correct, partagée par toutes les enseignes de la ville.
 * Un seul matériau, un seul draw call pour toutes les enseignes.
 */

export const JP_FONT = '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", sans-serif';

type H = { jp: string; sub?: string; bg: string; fg: string; frame?: string };
type V = { jp: string; bg: string; fg: string };

/** Enseignes horizontales (au-dessus des vitrines). */
export const HORIZONTAL: H[] = [
  { jp: "ラーメン", sub: "RAMEN", bg: "#b8302a", fg: "#fff4e0" },
  { jp: "喫茶 しば", sub: "KISSA", bg: "#5a3a26", fg: "#f6e3c4" },
  { jp: "居酒屋", sub: "IZAKAYA", bg: "#1f2a33", fg: "#f2c879" },
  { jp: "書店", sub: "BOOKS", bg: "#efe8da", fg: "#1f3b5a", frame: "#1f3b5a" },
  { jp: "花屋", sub: "FLOWERS", bg: "#5f8a5a", fg: "#fbf6ec" },
  { jp: "薬局", sub: "PHARMACY", bg: "#f4f7f4", fg: "#2c7a52", frame: "#2c7a52" },
  { jp: "寿司", sub: "SUSHI", bg: "#f3ead8", fg: "#2b2420", frame: "#b8302a" },
  { jp: "コーヒー", sub: "COFFEE", bg: "#2f3b36", fg: "#e9dcc4" },
  { jp: "クリーニング", bg: "#2e6fae", fg: "#ffffff" },
  { jp: "不動産", sub: "REAL ESTATE", bg: "#f2efe8", fg: "#3a4a5c", frame: "#3a4a5c" },
  { jp: "和菓子", sub: "WAGASHI", bg: "#7b2d3a", fg: "#f7e7d6" },
  { jp: "パン", sub: "BAKERY", bg: "#e8c58c", fg: "#4a2e14" },
  { jp: "定食", sub: "TEISHOKU", bg: "#f1e6cf", fg: "#8a2b1f", frame: "#8a2b1f" },
  { jp: "焼鳥", sub: "YAKITORI", bg: "#23201d", fg: "#f0b04a" },
  { jp: "美容室", sub: "HAIR", bg: "#eef1f3", fg: "#2b2f36" },
  { jp: "自転車", sub: "CYCLES", bg: "#d8a53a", fg: "#2a2418" },
  { jp: "そば", sub: "SOBA", bg: "#30402d", fg: "#efe6cf" },
  { jp: "たばこ", bg: "#b33b2e", fg: "#ffffff" },
  { jp: "歯科", sub: "DENTAL", bg: "#ffffff", fg: "#2f6f9e", frame: "#2f6f9e" },
  { jp: "MART", sub: "24H", bg: "#f7f7f2", fg: "#2a6f5f", frame: "#2a6f5f" },
  { jp: "芝公園", sub: "SHIBA PARK", bg: "#2d5a8c", fg: "#ffffff" },
  { jp: "東京タワー", sub: "TOKYO TOWER", bg: "#2d5a8c", fg: "#ffffff" },
  { jp: "おでん", sub: "ODEN", bg: "#f2e2c2", fg: "#5a2d1a", frame: "#5a2d1a" },
  { jp: "古書", sub: "OLD BOOKS", bg: "#3c3129", fg: "#e7d8bd" },
];

/** Enseignes verticales (empilées sur les immeubles mixtes). */
export const VERTICAL: V[] = [
  { jp: "カラオケ", bg: "#d44a3a", fg: "#ffffff" },
  { jp: "スナック", bg: "#f3e7d3", fg: "#7a2e48" },
  { jp: "居酒屋", bg: "#262422", fg: "#f2c879" },
  { jp: "麻雀", bg: "#2e6b4f", fg: "#ffffff" },
  { jp: "整体", bg: "#ffffff", fg: "#2c5d8a" },
  { jp: "焼肉", bg: "#a8322a", fg: "#fff2dd" },
  { jp: "英会話", bg: "#2f5f9b", fg: "#ffffff" },
  { jp: "ビル", bg: "#e9e4da", fg: "#3a3a3a" },
  { jp: "珈琲", bg: "#4a3426", fg: "#f3e2c6" },
  { jp: "診療所", bg: "#ffffff", fg: "#2f7d5a" },
  { jp: "ホテル", bg: "#28324a", fg: "#e8d6a8" },
  { jp: "囲碁", bg: "#f0e6d0", fg: "#2a2622" },
];

const W = 2048;
const HW = 512;
const HH = 128;
const VW = 128;
const VH = 512;

export type UvRect = { u0: number; v0: number; u1: number; v1: number };
export type SignQuad = { corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3]; uv: UvRect; lit: number };

/** Géométrie texturée (atlas) à partir de quadrilatères. */
export function signGeometry(signs: SignQuad[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const n = new THREE.Vector3();
  const e = new THREE.Vector3();
  for (const s of signs) {
    const [a, b, c, d] = s.corners;
    n.subVectors(b, a).cross(e.subVectors(d, a)).normalize();
    const { u0, v0, u1, v1 } = s.uv;
    const P = [a, b, c, a, c, d];
    const U = [u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1];
    for (let i = 0; i < 6; i++) {
      pos.push(P[i].x, P[i].y, P[i].z);
      nor.push(n.x, n.y, n.z);
      uv.push(U[i * 2], U[i * 2 + 1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

export class SignAtlas {
  readonly texture: THREE.CanvasTexture;
  readonly horizontal: UvRect[] = [];
  readonly vertical: UvRect[] = [];
  /** Marquage au sol « 止まれ » (stop). */
  stop!: UvRect;
  /** Lettrage de FootTown. */
  footTown!: UvRect;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = W;
    this.ctx = canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.generateMipmaps = true;
  }

  static async fontsReady() {
    const all = [...HORIZONTAL.map((h) => h.jp), ...VERTICAL.map((v) => v.jp), "止まれ東京タワー"].join("");
    try {
      await Promise.all([document.fonts.load(`700 64px ${JP_FONT}`, all), document.fonts.load(`900 64px ${JP_FONT}`, all)]);
    } catch {
      // Police système en repli : les enseignes restent lisibles.
    }
  }

  private rectUv(x: number, y: number, w: number, h: number): UvRect {
    // flipY par défaut : v = 1 − y.
    return { u0: x / W, v0: 1 - (y + h) / W, u1: (x + w) / W, v1: 1 - y / W };
  }

  draw() {
    const c = this.ctx;
    c.fillStyle = "#888";
    c.fillRect(0, 0, W, W);
    // Enseignes horizontales : grille 4 × 8.
    HORIZONTAL.forEach((s, i) => {
      const x = (i % 4) * HW;
      const y = Math.floor(i / 4) * HH;
      c.fillStyle = s.bg;
      c.fillRect(x, y, HW, HH);
      if (s.frame) {
        c.strokeStyle = s.frame;
        c.lineWidth = 8;
        c.strokeRect(x + 10, y + 10, HW - 20, HH - 20);
      }
      c.fillStyle = s.fg;
      c.textBaseline = "middle";
      c.textAlign = "center";
      const big = s.jp.length > 4 ? 62 : 74;
      c.font = `900 ${big}px ${JP_FONT}`;
      const hasSub = !!s.sub;
      c.fillText(s.jp, x + HW / 2, y + HH / 2 - (hasSub ? 12 : 0), HW - 50);
      if (s.sub) {
        c.font = `700 20px ${JP_FONT}`;
        c.globalAlpha = 0.85;
        c.fillText(s.sub.split("").join(String.fromCharCode(8202)), x + HW / 2, y + HH - 26);
        c.globalAlpha = 1;
      }
      this.horizontal.push(this.rectUv(x + 2, y + 2, HW - 4, HH - 4));
    });
    // Enseignes verticales : une rangée de 16 à partir de y = 1024.
    VERTICAL.forEach((s, i) => {
      const x = i * VW;
      const y = 1024;
      c.fillStyle = s.bg;
      c.fillRect(x, y, VW, VH);
      c.fillStyle = s.fg;
      c.textAlign = "center";
      c.textBaseline = "middle";
      const chars = [...s.jp];
      const size = Math.min(96, (VH - 40) / chars.length);
      c.font = `900 ${size}px ${JP_FONT}`;
      chars.forEach((ch, k) => {
        const cy = y + 20 + size * (k + 0.5) + (VH - 40 - size * chars.length) / 2;
        // Petits kana et allongement : rotation pour l'écriture verticale.
        if (ch === "ー") {
          c.save();
          c.translate(x + VW / 2, cy);
          c.rotate(Math.PI / 2);
          c.fillText(ch, 0, 0);
          c.restore();
        } else c.fillText(ch, x + VW / 2, cy);
      });
      this.vertical.push(this.rectUv(x + 2, y + 2, VW - 4, VH - 4));
    });
    // « 止まれ » : blanc sur transparent-asphalte (le shader du sol l'utilise en masque).
    {
      const x = 0;
      const y = 1536;
      c.fillStyle = "#4f5258";
      c.fillRect(x, y, 512, 256);
      c.fillStyle = "#f4f2ec";
      c.font = `900 150px ${JP_FONT}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.save();
      c.translate(x + 256, y + 128);
      c.scale(1, 1.25);
      c.fillText("止まれ", 0, 0, 480);
      c.restore();
      this.stop = this.rectUv(x, y, 512, 256);
    }
    // Lettrage FootTown.
    {
      const x = 512;
      const y = 1536;
      c.fillStyle = "#3b3639";
      c.fillRect(x, y, 1024, 128);
      c.fillStyle = "#eae5dc";
      c.font = `700 78px ${JP_FONT}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("TOKYO TOWER", x + 512, y + 66, 980);
      this.footTown = this.rectUv(x, y, 1024, 128);
    }
    this.texture.needsUpdate = true;
  }
}
