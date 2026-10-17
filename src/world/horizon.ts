import * as THREE from "three";
import { shared } from "./atmosphere";

/**
 * L'horizon lointain (scène de fond, caméra à plans lointains) : le Fuji à
 * l'ouest-sud-ouest et la Skytree au nord-est. Silhouettes noyées dans la
 * brume — on les devine en bas, on les voit en haut.
 *
 * Le Fuji est rapproché (60 km au lieu de ~95) et réduit d'autant : même
 * taille apparente, sans exploser la profondeur.
 */

const VERT = /* glsl */ `
varying vec3 vWorld; varying float vH; varying vec3 vN;
uniform float uTop;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vH = position.y / uTop;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const FRAG = /* glsl */ `
uniform vec3 uBase; uniform vec3 uSnow; uniform vec3 uHaze; uniform vec3 uSunDir;
uniform float uHazeAmount; uniform float uSnowLine; uniform float uNight; uniform vec3 uCamPos;
varying vec3 vWorld; varying float vH; varying vec3 vN;
void main() {
  float lit = clamp(dot(normalize(vN), uSunDir) * 0.5 + 0.55, 0.0, 1.0);
  float snow = smoothstep(uSnowLine, uSnowLine + 0.08, vH + 0.03 * sin(vWorld.x * 0.004) + 0.03 * sin(vWorld.z * 0.006));
  vec3 c = mix(uBase, uSnow, snow) * mix(0.75, 1.1, lit);
  // Plus on monte, plus l'air se dégage.
  float clear = smoothstep(20.0, 330.0, uCamPos.y);
  float haze = uHazeAmount * mix(1.0, 0.62, clear);
  haze = mix(haze, 1.0, (1.0 - smoothstep(0.0, 0.25, vH)) * 0.35);
  c = mix(c, uHaze, haze);
  gl_FragColor = vec4(c, 1.0);
}
`;

function silhouetteMaterial(base: string, snowLine: number, haze: number, top: number) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uBase: { value: new THREE.Color(base) },
      uSnow: { value: new THREE.Color("#f4f6f8") },
      uHaze: { value: new THREE.Color("#dfe7ee") },
      uSunDir: shared.uSunDir,
      uHazeAmount: { value: haze },
      uSnowLine: { value: snowLine },
      uNight: shared.uNight,
      uCamPos: shared.uCamPos,
      uTop: { value: top },
    },
  });
}

export class Horizon {
  readonly group = new THREE.Group();
  private mats: THREE.ShaderMaterial[] = [];

  constructor() {
    this.group.name = "Horizon";
    // Fuji : profil concave, cratère aplati.
    const H = 2380;
    const R = 9800;
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const r = R * (0.055 + 0.945 * Math.pow(1 - t, 1.9));
      prof.push(new THREE.Vector2(r, t * H));
    }
    prof.push(new THREE.Vector2(0, H * 0.985));
    const fujiGeo = new THREE.LatheGeometry(prof, 48);
    const fujiMat = silhouetteMaterial("#6f7f93", 0.62, 0.55, H);
    this.mats.push(fujiMat);
    const fuji = new THREE.Mesh(fujiGeo, fujiMat);
    const dir = new THREE.Vector2(-0.94, 0.34).normalize();
    fuji.position.set(dir.x * 60000, -60, dir.y * 60000);
    fuji.name = "Fuji";
    this.group.add(fuji);

    // Skytree : tripode qui devient cylindre, deux observatoires, mât.
    const sky = new THREE.Group();
    const skyMat = silhouetteMaterial("#c9d2d9", 2, 0.42, 634);
    this.mats.push(skyMat);
    const tProf: THREE.Vector2[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      tProf.push(new THREE.Vector2(34 * Math.pow(1 - t, 1.6) + 7, t * 495));
    }
    sky.add(new THREE.Mesh(new THREE.LatheGeometry(tProf, 12), skyMat));
    const deck1 = new THREE.Mesh(new THREE.CylinderGeometry(19, 17, 18, 16), skyMat);
    deck1.position.y = 350;
    const deck2 = new THREE.Mesh(new THREE.CylinderGeometry(13, 12, 10, 16), skyMat);
    deck2.position.y = 450;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 5, 140, 8), skyMat);
    mast.position.y = 565;
    sky.add(deck1, deck2, mast);
    sky.position.set(5850, 0, -5800);
    sky.name = "Skytree";
    this.group.add(sky);
  }

  setHaze(color: THREE.Color, night: number) {
    for (const m of this.mats) {
      m.uniforms.uHaze.value.copy(color);
      m.uniforms.uBase.value.set(m === this.mats[0] ? "#6f7f93" : "#c9d2d9").multiplyScalar(THREE.MathUtils.lerp(1, 0.18, night));
      m.uniforms.uSnow.value.set("#f4f6f8").multiplyScalar(THREE.MathUtils.lerp(1, 0.28, night));
    }
  }
}
