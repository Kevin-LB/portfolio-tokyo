import * as THREE from "three";
import { MeshBuilder, v3 } from "../builder";
import { rng, type Rng } from "../../core/math";
import { PARK, PLOT, TEMPLE, TOWER_STREET, CROSS_STREETS } from "./layout";
import { vertexColorMaterial } from "../materials";

/**
 * Arbres : des masses sculptées, pas des sphères. Chaque modèle est une
 * grappe de volumes facettés irréguliers autour d'un tronc ramifié ; les
 * couleurs varient par sommet (ombre interne, lumière au sommet). Instanciés :
 * un draw call par essence.
 */

function canopy(b: MeshBuilder, r: Rng, center: THREE.Vector3, radius: number, lobes: number, light: THREE.Color, dark: THREE.Color, flatten = 0.75) {
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + r.range(-0.3, 0.3);
    const d = radius * r.range(0.25, 0.6);
    const c = center.clone().add(v3(Math.cos(a) * d, r.range(-0.15, 0.35) * radius, Math.sin(a) * d));
    const s = radius * r.range(0.5, 0.75);
    const geo = new THREE.IcosahedronGeometry(1, 1);
    // Déformation : bosses irrégulières, dessous aplati.
    const pos = geo.getAttribute("position");
    for (let k = 0; k < pos.count; k++) {
      const p = v3(pos.getX(k), pos.getY(k), pos.getZ(k));
      const n = 1 + 0.18 * Math.sin(p.x * 3.1 + i) * Math.cos(p.z * 2.7 + i * 1.7) + 0.08 * Math.sin(p.y * 5.0 + i);
      p.multiplyScalar(n);
      if (p.y < 0) p.y *= 0.55;
      pos.setXYZ(k, p.x, p.y * flatten, p.z);
    }
    geo.computeVertexNormals();
    // Couleur par sommet : sombre dessous et au cœur, clair au sommet.
    const m = new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.range(0, 6), 0)), v3(s, s, s));
    const tmp = new MeshBuilder();
    tmp.geometry(geo, m);
    for (let k = 0; k < tmp.col.length / 3; k++) {
      const y = tmp.pos[k * 3 + 1];
      const t = THREE.MathUtils.clamp((y - (center.y - radius * 0.6)) / (radius * 1.5), 0, 1);
      const col = dark.clone().lerp(light, t * t * (3 - 2 * t));
      tmp.col[k * 3] = col.r;
      tmp.col[k * 3 + 1] = col.g;
      tmp.col[k * 3 + 2] = col.b;
    }
    b.pos.push(...tmp.pos);
    b.nor.push(...tmp.nor);
    b.col.push(...tmp.col);
    b.glw.push(...tmp.glw);
    b.uv.push(...tmp.uv);
    geo.dispose();
  }
}

function trunk(b: MeshBuilder, r: Rng, height: number, color: string, branches: number) {
  b.color(color);
  b.cylinder(0, 0, 0, 0.22, 0.14, height, 7);
  for (let i = 0; i < branches; i++) {
    const a = (i / branches) * Math.PI * 2 + r.range(-0.4, 0.4);
    const y0 = height * r.range(0.55, 0.85);
    const len = r.range(1.0, 1.8);
    b.beam(v3(0, y0, 0), v3(Math.cos(a) * len, y0 + len * 0.8, Math.sin(a) * len), 0.12, 0.12);
  }
}

export function sakuraGeometry(seed: number) {
  const r = rng(seed);
  const b = new MeshBuilder();
  trunk(b, r, 3.2, "#4a3a33", 5);
  canopy(b, r, v3(0, 4.4, 0), 3.0, 7, new THREE.Color("#f7d3dc"), new THREE.Color("#d58ea2"), 0.7);
  return b.build();
}

export function zelkovaGeometry(seed: number) {
  const r = rng(seed);
  const b = new MeshBuilder();
  trunk(b, r, 4.2, "#5a4a3c", 4);
  canopy(b, r, v3(0, 6.6, 0), 3.4, 8, new THREE.Color("#9dbb72"), new THREE.Color("#4f7044"), 0.9);
  return b.build();
}

export function ginkgoGeometry(seed: number) {
  const r = rng(seed);
  const b = new MeshBuilder();
  trunk(b, r, 3.4, "#5b4b3d", 3);
  canopy(b, r, v3(0, 6.0, 0), 2.3, 6, new THREE.Color("#b8c66a"), new THREE.Color("#6e8a42"), 1.35);
  return b.build();
}

export function pineGeometry(seed: number) {
  const r = rng(seed);
  const b = new MeshBuilder();
  trunk(b, r, 5.0, "#5a4636", 3);
  // Pin taillé (jardins de temple) : plateaux horizontaux.
  for (let k = 0; k < 3; k++) canopy(b, r, v3(r.range(-0.8, 0.8), 3.6 + k * 1.6, r.range(-0.8, 0.8)), 1.8 - k * 0.3, 4, new THREE.Color("#5f7d4e"), new THREE.Color("#2f4a33"), 0.45);
  return b.build();
}

type Placement = { x: number; z: number; s: number; rot: number };

export function buildTrees(detail: number) {
  const r = rng(1958);
  const sakura: Placement[] = [];
  const zelkova: Placement[] = [];
  const ginkgo: Placement[] = [];
  const pine: Placement[] = [];
  const put = (list: Placement[], x: number, z: number, s = 1) => list.push({ x, z, s: s * r.range(0.85, 1.15), rot: r.range(0, Math.PI * 2) });

  // Parc Shiba : cerisiers en allée, zelkovas en masse, pins autour du temple.
  for (let i = 0; i < 260 * detail; i++) {
    const x = r.range(PARK.x0 + 6, PARK.x1 - 6);
    const z = r.range(PARK.z0 + 6, PARK.z1 - 6);
    if (Math.abs(x - TEMPLE.x) < TEMPLE.w / 2 + 12 && Math.abs(z - TEMPLE.z) < TEMPLE.d / 2 + 14) continue;
    if (Math.abs(z) < 9 || Math.abs(x - 155) < 8) continue;
    const near = Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 60;
    if (near && r.chance(0.4)) put(pine, x, z, 1);
    else if (r.chance(0.3)) put(sakura, x, z, 1.1);
    else put(zelkova, x, z, r.range(0.9, 1.3));
  }
  for (let x = PARK.x0 + 14; x < PARK.x1 - 10; x += 11) {
    put(sakura, x, -14, 1.05);
    put(sakura, x + 5, 14, 1.05);
  }
  // Terrain de la tour : rangées de cerisiers côté sud, ginkgos ailleurs.
  for (let x = -50; x <= 50; x += 10) {
    if (Math.abs(x) < 12) continue;
    put(sakura, x, 52, 0.95);
  }
  for (const z of [-50, -30, 30]) {
    put(ginkgo, -52, z, 1);
    put(ginkgo, 52, z, 1);
  }
  // Boulevard : ginkgos d'alignement (l'arbre de Tokyo).
  for (let x = -66; x <= 66; x += 9) {
    if (Math.abs(x) < 10) continue;
    put(ginkgo, x, 59.6, 0.9);
    put(ginkgo, x, -59.6, 0.9);
  }
  // Un cerisier qui déborde dans la rue d'ouverture (le premier plan du départ).
  put(sakura, TOWER_STREET.x0 - 2.5, 351, 1.25);
  put(sakura, TOWER_STREET.x1 + 3.2, 222, 1.1);
  for (const c of CROSS_STREETS) put(zelkova, TOWER_STREET.x1 + 9, c.z + c.w / 2 + 3, 0.9);
  // Plot de la tour : quelques arbres au pied.
  put(zelkova, PLOT.x0 + 8, PLOT.z0 + 8, 1);
  put(zelkova, PLOT.x1 - 8, PLOT.z0 + 8, 1);

  const mat = vertexColorMaterial(0.92, 0);
  const make = (geo: THREE.BufferGeometry, list: Placement[], name: string) => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.name = name;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    list.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
      m.compose(v3(p.x, 0, p.z), q, v3(p.s, p.s, p.s));
      mesh.setMatrixAt(i, m);
      const tint = new THREE.Color().setScalar(1).offsetHSL(0, 0, (r.next() - 0.5) * 0.08);
      mesh.setColorAt(i, tint);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  };
  const group = new THREE.Group();
  group.name = "Arbres";
  group.add(make(sakuraGeometry(3), sakura, "Cerisiers"));
  group.add(make(zelkovaGeometry(5), zelkova, "Zelkovas"));
  group.add(make(ginkgoGeometry(8), ginkgo, "Ginkgos"));
  group.add(make(pineGeometry(13), pine, "Pins"));
  return { group, sakuraSpots: sakura };
}
