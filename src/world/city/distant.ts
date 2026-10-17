import * as THREE from "three";
import { MeshBuilder, v3 } from "../builder";
import { rng } from "../../core/math";
import { EXPRESSWAY_X, LANDMARKS, type Lot } from "./layout";
import { patched } from "../materials";
import { shared } from "../atmosphere";

/**
 * La ville au loin : un seul InstancedMesh de volumes dont les fenêtres sont
 * dessinées dans le shader (et s'allument une à une la nuit), les tours
 * remarquables, la voie express surélevée, la voie ferrée, la baie.
 */

const BUILDING_CHUNK = /* glsl */ `
float bHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
`;

export function cityBlockMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.82, metalness: 0.02, envMapIntensity: 0.6 });
  return patched(mat, "city-blocks-v5", (shader) => {
    shader.uniforms.uLights = shared.uLights;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec4 aParams; // seed, hauteur d'étage, largeur de travée, style
        varying vec3 vLocal; varying vec3 vObjN; varying vec4 vParams; varying vec3 vScale;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vScale = sc;
        vLocal = position * sc;
        vObjN = normal;
        vParams = aParams;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        ${BUILDING_CHUNK}
        varying vec3 vLocal; varying vec3 vObjN; varying vec4 vParams; varying vec3 vScale;
        uniform float uLights;
        float gWin; float gOn; vec3 gWinC;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          float side = 1.0 - step(0.5, abs(vObjN.y));
          float faceId = vObjN.x * 3.0 + vObjN.z * 7.0;
          float u = abs(vObjN.x) > 0.5 ? vLocal.z : vLocal.x;
          float h = vLocal.y;
          float floorH = vParams.y;
          float bayW = vParams.z;
          float style = vParams.w; // 0 fenêtres, 1 bandeaux, 2 mur-rideau, 3 balcons
          float ground = 4.0;
          vec2 cell = vec2(fract(u / bayW), fract((h - ground) / floorH));
          vec2 id = vec2(floor(u / bayW), floor((h - ground) / floorH));
          float s1 = step(0.5, style) * (1.0 - step(1.5, style));
          float s2 = step(1.5, style) * (1.0 - step(2.5, style));
          float s3 = step(2.5, style);
          float s0 = 1.0 - s1 - s2 - s3;
          float wx = s0 * step(0.2, cell.x) * step(cell.x, 0.8)
                   + s1 * step(0.03, cell.x) * step(cell.x, 0.97)
                   + s2 * step(0.06, cell.x) * step(cell.x, 0.94)
                   + s3 * step(0.12, cell.x) * step(cell.x, 0.88);
          float wy = s0 * step(0.3, cell.y) * step(cell.y, 0.84)
                   + s1 * step(0.24, cell.y) * step(cell.y, 0.82)
                   + s2 * step(0.08, cell.y) * step(cell.y, 0.96)
                   + s3 * step(0.36, cell.y) * step(cell.y, 0.9);
          float fw = fwidth(u / bayW) + fwidth((h - ground) / floorH);
          float soft = 1.0 - smoothstep(0.25, 0.6, fw);
          float inRange = side * step(ground, h) * step(h, vScale.y - 0.9);
          gWin = wx * wy * inRange * soft;
          // Balcons : dalle claire à chaque étage, garde-corps.
          float slab = s3 * inRange * (step(cell.y, 0.07) + step(0.07, cell.y) * step(cell.y, 0.32) * 0.55);
          float rnd = bHash(vec3(id, vParams.x + faceId));
          float rnd2 = bHash(vec3(id.yx + 3.1, vParams.x * 1.7 + faceId));
          float thr = rnd * 0.92 + 0.04;
          float litRatio = 0.55 + 0.15 * s1 + 0.2 * s2;
          gOn = gWin * step(rnd2, litRatio) * smoothstep(thr, thr + 0.05, uLights);
          float office = max(s1, s2);
          gWinC = mix(vec3(1.0, 0.7, 0.42), vec3(0.8, 0.88, 1.0), step(0.55, bHash(vec3(id.x, vParams.x, 2.0))) * office);
          vec3 glassC = mix(vec3(0.24, 0.29, 0.34), vec3(0.36, 0.44, 0.52), s2);
          glassC = mix(glassC, vec3(0.3, 0.36, 0.42), s1);
          diffuseColor.rgb = mix(diffuseColor.rgb, glassC, gWin * 0.88);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.92, 0.9), slab * (1.0 - gWin));
          // Rez-de-chaussée plus sombre.
          diffuseColor.rgb *= mix(1.0, 0.8, side * (1.0 - step(ground, h)));
          // Toits : palette propre (gris béton, sombre, gravier, parfois toit végétal).
          float roof = step(0.5, vObjN.y);
          float rh = bHash(vec3(vParams.x, 7.0, 1.0));
          vec3 roofC = rh < 0.35 ? vec3(0.62, 0.61, 0.58) : rh < 0.6 ? vec3(0.47, 0.47, 0.46) : rh < 0.8 ? vec3(0.72, 0.69, 0.64) : rh < 0.92 ? vec3(0.36, 0.37, 0.38) : vec3(0.46, 0.56, 0.4);
          // Petites taches (équipements) sur les toits.
          vec2 rc = floor(vLocal.xz / 2.5);
          float spot = step(0.86, bHash(vec3(rc, vParams.x)));
          roofC *= 1.0 - spot * 0.18;
          diffuseColor.rgb = mix(diffuseColor.rgb, roofC, roof);
          // Ombre de contact peinte au pied.
          diffuseColor.rgb *= mix(0.7, 1.0, smoothstep(0.0, 3.0, h));
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.25, gWin);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += gWinC * gOn * 1.25;`,
      );
  });
}

export function buildDistant(lots: Lot[], detail: number) {
  const group = new THREE.Group();
  group.name = "Ville lointaine";
  const r = rng(4242);
  const far = lots.filter((l) => !l.near && !LANDMARKS.some((m) => Math.abs((l.x0 + l.x1) / 2 - m.x) < m.w && Math.abs((l.z0 + l.z1) / 2 - m.z) < m.w));
  const keep = far.filter((l) => {
    const d = Math.hypot((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2);
    return d < 900 || r.chance(detail > 0.6 ? 1 : 0.65);
  });

  // Volumes : un étage principal + parfois un retrait (gradins).
  const items: { x: number; z: number; sx: number; sy: number; sz: number; color: THREE.Color; params: [number, number, number, number] }[] = [];
  const palette = [
    "#e8e3da", "#ddd6ca", "#efebe4", "#cfcbc4", "#d9d2c4", "#c4c7c8", "#b8b3aa", "#e2d7c6",
    "#c9b49b", "#a98f78", "#8e7766", "#d4cfc8", "#9fa6ab", "#7f8589", "#e9e1d0", "#d8cdbb",
  ];
  for (const l of keep) {
    const sx = l.x1 - l.x0;
    const sz = l.z1 - l.z0;
    const office = l.style === "office";
    const floorH = office ? 3.8 : 3.0;
    const h = 4 + l.floors * floorH;
    const color = new THREE.Color(r.pick(palette)).multiplyScalar(r.range(0.94, 1.03));
    const style = office ? (l.floors > 14 && r.chance(0.55) ? 2 : r.chance(0.7) ? 1 : 0) : l.style === "mansion" ? (r.chance(0.6) ? 3 : 0) : r.chance(0.2) ? 1 : 0;
    const params: [number, number, number, number] = [r.range(0, 100), floorH, style === 2 ? r.range(1.4, 2.0) : office ? r.range(2.6, 3.4) : r.range(2.6, 3.6), style];
    items.push({ x: (l.x0 + l.x1) / 2, z: (l.z0 + l.z1) / 2, sx, sy: h, sz, color, params });
    if (l.floors > 10 && r.chance(0.45)) {
      const k = r.range(0.55, 0.8);
      items.push({ x: (l.x0 + l.x1) / 2, z: (l.z0 + l.z1) / 2, sx: sx * k, sy: h + r.range(8, 24), sz: sz * k, color: color.clone().multiplyScalar(0.97), params: [params[0] + 9, floorH, params[2], params[3]] });
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(box, cityBlockMaterial(), items.length);
  const aParams = new Float32Array(items.length * 4);
  const m = new THREE.Matrix4();
  items.forEach((it, i) => {
    m.makeScale(it.sx, it.sy, it.sz).setPosition(it.x, 0, it.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, it.color);
    aParams.set(it.params, i * 4);
  });
  mesh.geometry.setAttribute("aParams", new THREE.InstancedBufferAttribute(aParams, 4));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  mesh.name = "Îlots";
  group.add(mesh);

  // Toits : réservoirs et groupes techniques sur une partie des volumes proches.
  const roofItems = items.filter((it) => Math.hypot(it.x, it.z) < 1100 && it.sx > 10);
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  roofGeo.translate(0, 0.5, 0);
  const roofMesh = new THREE.InstancedMesh(roofGeo, cityBlockMaterial(), roofItems.length * 2);
  const roofParams = new Float32Array(roofItems.length * 2 * 4);
  let n = 0;
  for (const it of roofItems) {
    for (let k = 0; k < 2; k++) {
      const w = r.range(2, Math.min(7, it.sx * 0.4));
      const d = r.range(2, Math.min(6, it.sz * 0.4));
      m.makeScale(w, r.range(1.2, 3.4), d).setPosition(it.x + r.range(-0.3, 0.3) * it.sx, it.sy, it.z + r.range(-0.3, 0.3) * it.sz);
      roofMesh.setMatrixAt(n, m);
      roofMesh.setColorAt(n, new THREE.Color(r.pick(["#d4d0c8", "#bfbab1", "#e2ded6", "#a9b3b6"])));
      roofParams.set([0, 100, 100, 0], n * 4);
      n++;
    }
  }
  roofMesh.count = n;
  roofMesh.geometry.setAttribute("aParams", new THREE.InstancedBufferAttribute(roofParams, 4));
  roofMesh.castShadow = true;
  roofMesh.computeBoundingSphere();
  group.add(roofMesh);

  // Tours remarquables.
  const lm = landmarks();
  group.add(lm);

  // Feux d'obstacle rouges au sommet des tours (le scintillement de Tokyo la nuit).
  const tops: THREE.Vector3[] = [];
  for (const it of items) if (it.sy > 70) tops.push(v3(it.x + it.sx * 0.4, it.sy + 1, it.z + it.sz * 0.4), v3(it.x - it.sx * 0.4, it.sy + 1, it.z - it.sz * 0.4));
  for (const L of LANDMARKS) tops.push(v3(L.x, L.h + 2, L.z));
  return { group, blocks: mesh, obstacleLights: tops, items };
}

function landmarks() {
  const g = new THREE.Group();
  const mat = cityBlockMaterial();
  for (const L of LANDMARKS) {
    let geo: THREE.BufferGeometry;
    if (L.kind === "azabudai") {
      // Tour élancée aux angles arrondis, légèrement effilée, couronne évasée.
      const shape = roundedRect(L.w, L.w * 0.86, L.w * 0.32);
      geo = new THREE.ExtrudeGeometry(shape, { depth: L.h, bevelEnabled: false, curveSegments: 6 });
      geo.rotateX(-Math.PI / 2);
      const pos = geo.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = Math.min(1, Math.max(0, y / L.h));
        const k = 1 - 0.18 * Math.pow(t, 1.4) + 0.08 * Math.pow(Math.max(0, t - 0.94) / 0.06, 2);
        pos.setXYZ(i, pos.getX(i) * k, y, pos.getZ(i) * k);
      }
      geo.computeVertexNormals();
    } else if (L.kind === "roppongi") {
      const shape = roundedRect(L.w, L.w * 0.9, L.w * 0.18);
      geo = new THREE.ExtrudeGeometry(shape, { depth: L.h, bevelEnabled: false, curveSegments: 3 });
      geo.rotateX(-Math.PI / 2);
    } else {
      geo = new THREE.BoxGeometry(L.w, L.h, L.w * 0.62);
      geo.translate(0, L.h / 2, 0);
    }
    const count = 1;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(L.x, 0, L.z));
    mesh.setColorAt(0, new THREE.Color(L.kind === "azabudai" ? "#c3ccd2" : L.kind === "roppongi" ? "#9aa3a8" : "#c9d0d4"));
    const style = L.kind === "azabudai" ? 2 : L.kind === "roppongi" ? 1 : 2;
    mesh.geometry.setAttribute("aParams", new THREE.InstancedBufferAttribute(new Float32Array([Math.abs(L.x % 97), 4.2, style === 2 ? 1.7 : 3.0, style]), 4));
    mesh.castShadow = true;
    mesh.name = L.name;
    g.add(mesh);
  }
  return g;
}

function roundedRect(w: number, d: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Voie express surélevée (Shuto), avec ses lampadaires sodium. */
export function expresswayX(z: number) {
  return EXPRESSWAY_X + 46 * Math.sin(z / 520) - 20;
}

export function buildInfrastructure() {
  const b = new MeshBuilder();
  const lamps: THREE.Vector3[] = [];
  const deckY = 14;
  const half = 9;
  const z0 = -1800;
  const z1 = 1800;
  const step = 20;
  for (let z = z0; z < z1; z += step) {
    const xa = expresswayX(z);
    const xb = expresswayX(z + step);
    // Tablier (dessous + dessus), parapets.
    b.color("#6b6e72");
    b.quad(v3(xa - half, deckY, z), v3(xa + half, deckY, z), v3(xb + half, deckY, z + step), v3(xb - half, deckY, z + step));
    b.quad(v3(xb - half, deckY, z + step), v3(xb + half, deckY, z + step), v3(xa + half, deckY, z), v3(xa - half, deckY, z));
    for (const s of [-1, 1]) {
      const pa = v3(xa + s * half, deckY, z);
      const pb = v3(xb + s * half, deckY, z + step);
      b.color("#d9d6cf");
      b.quad(pa, pb, pb.clone().setY(deckY + 1.1), pa.clone().setY(deckY + 1.1));
      b.quad(pb, pa, pa.clone().setY(deckY + 1.1), pb.clone().setY(deckY + 1.1));
      b.color("#8d9094");
      b.quad(pa.clone().setY(deckY - 1.6), pb.clone().setY(deckY - 1.6), pb, pa);
      b.quad(pb.clone().setY(deckY - 1.6), pa.clone().setY(deckY - 1.6), pa, pb);
    }
    // Ligne centrale.
    b.color("#e8a23a").quad(v3(xa - 0.12, deckY + 0.03, z), v3(xa + 0.12, deckY + 0.03, z), v3(xb + 0.12, deckY + 0.03, z + step), v3(xb - 0.12, deckY + 0.03, z + step));
    // Piles en T tous les 40 m.
    if (Math.round((z - z0) / step) % 2 === 0) {
      b.color("#a7a6a1");
      b.box(xa, (deckY - 1.6) / 2, z, 2.4, deckY - 1.6, 2.4);
      b.box(xa, deckY - 2.2, z, 2 * half - 2, 1.2, 2.6);
      lamps.push(v3(xa - half + 0.4, deckY + 9, z), v3(xa + half - 0.4, deckY + 9, z));
      b.color("#7a7d80");
      b.beam(v3(xa - half + 0.4, deckY, z), v3(xa - half + 0.4, deckY + 9, z), 0.15, 0.15);
      b.beam(v3(xa + half - 0.4, deckY, z), v3(xa + half - 0.4, deckY + 9, z), 0.15, 0.15);
    }
  }
  // Viaduc ferroviaire (ligne Yamanote / Keihin-Tōhoku, à l'est).
  const railX = 880;
  for (let z = -1800; z < 1800; z += 30) {
    b.color("#8d8a84").box(railX, 4, z, 2, 8, 2);
    b.color("#a8a59f").box(railX, 8.4, z + 15, 14, 0.8, 30.2);
    b.color("#c9c5bd").box(railX - 6.8, 9.1, z + 15, 0.3, 0.6, 30.2);
    b.color("#c9c5bd").box(railX + 6.8, 9.1, z + 15, 0.3, 0.6, 30.2);
  }
  // Pont de l'Arc-en-ciel (Rainbow Bridge), silhouette dans la baie.
  const bx = 3300;
  const bz = 1900;
  b.color("#f1efe9");
  for (const dz of [-280, 280]) {
    b.box(bx - 8, 63, bz + dz, 6, 126, 6);
    b.box(bx + 8, 63, bz + dz, 6, 126, 6);
    b.box(bx, 110, bz + dz, 22, 5, 6);
  }
  b.color("#d9d6d0").box(bx, 50, bz, 26, 6, 1400);
  b.color("#ebe8e2");
  for (const sx of [-10, 10]) {
    let prev = v3(bx + sx, 126, bz - 700);
    for (let i = 1; i <= 28; i++) {
      const t = i / 28;
      const z = bz - 700 + 1400 * t;
      const span = Math.abs(z - bz) < 280 ? 1 - Math.pow((z - bz) / 280, 2) : 0;
      const y = Math.abs(z - bz) < 280 ? 126 - 70 * span : 126 - 76 * (1 - (Math.abs(z - bz) - 280) / 420);
      const p = v3(bx + sx, Math.max(56, y), z);
      b.beam(prev, p, 1.2, 1.2);
      prev = p;
    }
  }
  return { geometry: b.build(), lamps };
}

/** La baie : un plan d'eau qui reflète le ciel (environnement), bord découpé. */
export function buildBay() {
  const shape = new THREE.Shape();
  shape.moveTo(1250, 200);
  shape.lineTo(1500, -200);
  shape.lineTo(2600, -900);
  shape.lineTo(9000, -2000);
  shape.lineTo(9000, 9000);
  shape.lineTo(900, 9000);
  shape.lineTo(1300, 1400);
  shape.lineTo(1150, 700);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape, 4);
  geo.rotateX(Math.PI / 2);
  // ShapeGeometry tourne vers −y après rotation : on remet la normale vers le haut.
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) pos.setY(i, 0.3);
  geo.computeVertexNormals();
  const nor = geo.getAttribute("normal");
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0);
  const index = geo.getIndex();
  if (index) {
    const arr = index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
  }
  const mat = patched(new THREE.MeshStandardMaterial({ color: "#3d5566", roughness: 0.12, metalness: 0.0, envMapIntensity: 1.1 }), "bay-v1");
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "Baie de Tokyo";
  mesh.receiveShadow = true;
  return mesh;
}
