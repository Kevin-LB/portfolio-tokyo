import * as THREE from "three";

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _col = new THREE.Color();

/**
 * Accumulateur de géométrie fusionnée : tout ce qui partage un matériau finit
 * en un seul draw call. Chaque sommet porte une couleur (linéaire) et une
 * valeur `glow` : la part de sa couleur qui s'allume la nuit (vitrines,
 * enseignes, lanternes). Les ombres de contact sont peintes dans la couleur.
 */
export class MeshBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  glw: number[] = [];
  uv: number[] = [];
  private r = 1;
  private g = 1;
  private b = 1;
  private glowValue = 0;

  color(c: THREE.ColorRepresentation) {
    _col.set(c);
    this.r = _col.r;
    this.g = _col.g;
    this.b = _col.b;
    return this;
  }

  colorRGB(r: number, g: number, b: number) {
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }

  glow(v: number) {
    this.glowValue = v;
    return this;
  }

  get vertexCount() {
    return this.pos.length / 3;
  }

  private vert(p: THREE.Vector3, n: THREE.Vector3, u = 0, v = 0) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(this.r, this.g, this.b);
    this.glw.push(this.glowValue);
    this.uv.push(u, v);
  }

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, normal?: THREE.Vector3) {
    const n = normal ?? _n.subVectors(c, b).cross(_d.subVectors(a, b)).normalize();
    this.vert(a, n);
    this.vert(b, n);
    this.vert(c, n);
    return this;
  }

  /** Quadrilatère a-b-c-d (sens antihoraire vu de face). */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, withUv = false, uw = 1, vh = 1) {
    const n = _n.subVectors(b, a).cross(_d.subVectors(d, a)).normalize().clone();
    this.vert(a, n, 0, 0);
    this.vert(b, n, withUv ? uw : 0, 0);
    this.vert(c, n, withUv ? uw : 0, withUv ? vh : 0);
    this.vert(a, n, 0, 0);
    this.vert(c, n, withUv ? uw : 0, withUv ? vh : 0);
    this.vert(d, n, 0, withUv ? vh : 0);
    return this;
  }

  /**
   * Pavé orienté. `rotY` en radians autour de son centre.
   * `faces` permet d'omettre le dessous (posé au sol) ou le dessus.
   */
  box(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    rotY = 0,
    faces: { top?: boolean; bottom?: boolean } = {},
  ) {
    _m.makeRotationY(rotY).setPosition(cx, cy, cz);
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(_m);
    const p000 = P(-hx, -hy, -hz);
    const p100 = P(hx, -hy, -hz);
    const p110 = P(hx, hy, -hz);
    const p010 = P(-hx, hy, -hz);
    const p001 = P(-hx, -hy, hz);
    const p101 = P(hx, -hy, hz);
    const p111 = P(hx, hy, hz);
    const p011 = P(-hx, hy, hz);
    this.quad(p001, p101, p111, p011); // +z
    this.quad(p100, p000, p010, p110); // -z
    this.quad(p101, p100, p110, p111); // +x
    this.quad(p000, p001, p011, p010); // -x
    if (faces.top !== false) this.quad(p011, p111, p110, p010);
    if (faces.bottom) this.quad(p000, p100, p101, p001);
    return this;
  }

  /** Poutre de section rectangulaire entre deux points (sans bouchons). */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h = w, up?: THREE.Vector3, caps = false) {
    const dir = _a.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-6) return this;
    dir.divideScalar(len);
    const ref = up ?? (Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
    const side = _b.crossVectors(dir, ref).normalize().multiplyScalar(w / 2).clone();
    const upv = _c.crossVectors(side, dir).normalize().multiplyScalar(h / 2).clone();
    const c0 = [
      a.clone().add(side).add(upv),
      a.clone().sub(side).add(upv),
      a.clone().sub(side).sub(upv),
      a.clone().add(side).sub(upv),
    ];
    const c1 = c0.map((p) => p.clone().addScaledVector(dir, len));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.quad(c0[j], c0[i], c1[i], c1[j]);
    }
    if (caps) {
      this.quad(c0[0], c0[1], c0[2], c0[3]);
      this.quad(c1[3], c1[2], c1[1], c1[0]);
    }
    return this;
  }

  /** Cylindre (ou tronc de cône) vertical. */
  cylinder(
    x: number,
    y: number,
    z: number,
    rBottom: number,
    rTop: number,
    height: number,
    segments = 12,
    caps: { top?: boolean; bottom?: boolean } = { top: true },
    phase = 0,
  ) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, height, segments, 1, !(caps.top || caps.bottom));
    g.rotateY(phase);
    g.translate(x, y + height / 2, z);
    this.geometry(g);
    g.dispose();
    return this;
  }

  /** Fusionne une géométrie three.js (indexée ou non) avec la couleur courante. */
  geometry(g: THREE.BufferGeometry, matrix?: THREE.Matrix4) {
    const src = g.index ? g.toNonIndexed() : g;
    const p = src.getAttribute("position");
    let nAttr = src.getAttribute("normal");
    if (!nAttr) {
      src.computeVertexNormals();
      nAttr = src.getAttribute("normal");
    }
    const uvAttr = src.getAttribute("uv");
    if (matrix) _nm.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      _a.fromBufferAttribute(p, i);
      _b.fromBufferAttribute(nAttr, i);
      if (matrix) {
        _a.applyMatrix4(matrix);
        _b.applyMatrix3(_nm).normalize();
      }
      this.vert(_a, _b, uvAttr ? uvAttr.getX(i) : 0, uvAttr ? uvAttr.getY(i) : 0);
    }
    if (src !== g) src.dispose();
    return this;
  }

  build(withUv = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("glow", new THREE.Float32BufferAttribute(this.glw, 1));
    if (withUv) g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
