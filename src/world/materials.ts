import * as THREE from "three";
import { patchFog, shared } from "./atmosphere";
import { BANDS } from "./tower/spec";

/**
 * Les matériaux partagés. Peu nombreux, tous patchés pour le brouillard
 * maison et la nuit. Chaque patch a sa clé de cache de programme.
 */

type Patch = (shader: THREE.WebGLProgramParametersWithUniforms) => void;

function patched<T extends THREE.Material>(mat: T, key: string, ...patches: Patch[]): T {
  mat.onBeforeCompile = (shader) => {
    patchFog(shader);
    for (const p of patches) p(shader);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/**
 * Sommets marqués `glow` :
 *  ≥ 1      enseigne / vitrine : un peu de lumière le jour, pleine la nuit ;
 *  (0, .5]  fenêtre chaude, s'allume quand uLights dépasse 2·glow ;
 *  (.5, 1)  fenêtre froide (bureaux), seuil 2·(glow − .5).
 * La ville s'allume ainsi fenêtre après fenêtre.
 */
const glowPatch =
  (strength: number): Patch =>
  (shader) => {
    shader.uniforms.uLights = shared.uLights;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float glow;\nvarying float vGlow;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = glow;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vGlow;\nuniform float uLights;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float isSign = step(0.999, vGlow);
        float cool = step(0.5, vGlow) * (1.0 - isSign);
        float thr = (1.0 - isSign) * (cool > 0.5 ? (vGlow - 0.5) * 2.0 : vGlow * 2.0);
        float win = (1.0 - isSign) * step(0.001, vGlow) * smoothstep(thr, thr + 0.06, uLights);
        vec3 warmC = vec3(1.0, 0.72, 0.42);
        vec3 coolC = vec3(0.78, 0.86, 1.0);
        // Chaque fenêtre a sa propre intensité (rideaux, pièces éclairées ou non).
        vec3 cellW = floor(vFogWorld / vec3(1.6, 3.0, 1.6));
        float var = fract(sin(dot(cellW, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        vec3 winC = mix(warmC, coolC, cool) * win * mix(0.28, 1.0, var * var);
        float signLit = isSign * mix(0.22, 0.62, uLights);
        totalEmissiveRadiance += diffuseColor.rgb * signLit * ${strength.toFixed(2)} + winC;
        // Fenêtre allumée : on éteint le reflet du ciel (l'intérieur domine).
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.4, win);`,
      );
  };

/** Le métal peint de la tour : bandes orange/blanc selon la hauteur, Landmark Light la nuit. */
export function towerPaintMaterial() {
  const orange = new THREE.Color("#e4532a");
  const white = new THREE.Color("#f2ede5");
  const bandsGlsl = BANDS.map(([top, o], i) => `${i === 0 ? "" : "else "}if (y < ${top.toFixed(1)}) c = ${o ? "uOrange" : "uWhite"};`).join("\n");
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.48, metalness: 0.18, envMapIntensity: 0.8 });
  return patched(mat, "tower-paint-v3", (shader) => {
    shader.uniforms.uOrange = { value: orange };
    shader.uniforms.uWhite = { value: white };
    shader.uniforms.uTowerGlow = shared.uTowerGlow;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTowerN;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvTowerN = normalize(mat3(modelMatrix) * objectNormal);");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 uOrange; uniform vec3 uWhite; uniform float uTowerGlow;
        varying vec3 vTowerN;
        vec3 bandColor(float y) { vec3 c = uOrange; ${bandsGlsl} return c; }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float bandY = vFogWorld.y;
        // Liseré net d'une bande à l'autre : léger anti-crénelage par dérivée.
        diffuseColor.rgb *= bandColor(bandY);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        // Landmark Light : projecteurs sodium au pied, la structure brille de l'intérieur.
        float up = clamp(-vTowerN.y * 0.6 + 0.55, 0.0, 1.0);
        float hFade = mix(1.0, 0.72, smoothstep(40.0, 330.0, vFogWorld.y));
        vec3 gold = mix(vec3(1.0, 0.56, 0.2), vec3(1.0, 0.8, 0.48), step(0.5, diffuseColor.b));
        totalEmissiveRadiance += gold * uTowerGlow * (0.35 + 0.9 * up) * hFade * 1.15;`,
      );
  });
}

/** Matière commune de la ville et des structures : couleurs par sommet. */
export function vertexColorMaterial(roughness = 0.86, glowStrength = 1.6) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0.0, envMapIntensity: 0.55 });
  return patched(mat, `vcol-${roughness}-${glowStrength}-v2`, glowPatch(glowStrength));
}

/** Verre : reflète le ciel ; la nuit, l'intérieur s'éclaire chaudement. */
export function glassMaterial(interior = "#ffcf8f", interiorStrength = 0.9, opacity = 0.5) {
  const mat = new THREE.MeshStandardMaterial({
    color: "#22303c",
    roughness: 0.06,
    metalness: 0.1,
    envMapIntensity: 1.35,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const tint = new THREE.Color(interior);
  return patched(mat, `glass-${interior}-${interiorStrength}-${opacity}`, (shader) => {
    shader.uniforms.uLights = shared.uLights;
    shader.uniforms.uInterior = { value: tint };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uLights; uniform vec3 uInterior;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uInterior * uLights * ${interiorStrength.toFixed(2)};`,
      );
  });
}

/** Matériau simple, uni, brouillé (sols, eau lointaine…). */
export function plainMaterial(color: THREE.ColorRepresentation, roughness = 0.95) {
  return patched(new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }), `plain-${roughness}`);
}

export { patched };

/**
 * Vitrines : verre qui reflète la rue, et derrière, un intérieur dessiné
 * dans le shader (mur du fond, étagères, produits, rampe lumineuse). Le jour
 * on le devine, la nuit il éclaire le trottoir. `glow` porte une graine par
 * boutique.
 */
export function shopfrontMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.0, envMapIntensity: 1.0 });
  return patched(mat, "shopfront-v1", (shader) => {
    shader.uniforms.uLights = shared.uLights;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float glow;\nvarying float vSeed;\nvarying vec2 vShopUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSeed = glow;\nvShopUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vSeed; varying vec2 vShopUv; uniform float uLights;
        float sh(vec2 p) { return fract(sin(dot(p, vec2(41.7, 289.3)) + vSeed * 91.0) * 43758.5453); }
        vec3 gInterior;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          vec2 u = vShopUv;
          vec3 tint = diffuseColor.rgb;
          vec3 back = tint * 0.55;
          // Étagères (trois niveaux) et produits colorés posés dessus.
          float shelf = 0.0; vec3 prod = vec3(0.0); float onProd = 0.0;
          for (int i = 0; i < 3; i++) {
            float y0 = 0.35 + float(i) * 0.62;
            shelf += smoothstep(0.03, 0.0, abs(u.y - y0));
            vec2 cell = vec2(floor(u.x / 0.16), float(i));
            float rnd = sh(cell);
            float hgt = 0.14 + 0.32 * sh(cell + 7.0);
            float inBox = step(y0, u.y) * step(u.y, y0 + hgt) * step(0.15, fract(u.x / 0.16)) * step(fract(u.x / 0.16), 0.85);
            vec3 c = mix(0.6 + 0.4 * cos(6.2831 * (rnd + vec3(0.0, 0.33, 0.67))), tint, 0.45) * 0.8;
            prod += c * inBox * step(0.25, rnd);
            onProd += inBox * step(0.25, rnd);
          }
          // Comptoir bas, rampe lumineuse en haut.
          float counter = step(u.y, 0.28);
          float strip = smoothstep(0.2, 0.0, abs(u.y - (vShopUv.y > 0.0 ? 2.45 : 2.45)));
          vec3 interior = back;
          interior = mix(interior, tint * 0.25, shelf * 0.8);
          interior = mix(interior, prod * 0.85, clamp(onProd, 0.0, 1.0));
          interior = mix(interior, tint * 0.35, counter);
          interior += tint * strip * 0.9;
          // Une boutique sur six reste sombre (fermée, rideau).
          float closed = step(0.84, sh(vec2(3.0, 9.0)));
          interior = mix(interior, vec3(0.12, 0.12, 0.13) + 0.03 * step(0.5, fract(u.y * 6.0)), closed);
          gInterior = interior * (1.0 - closed * 0.6);
          // Le jour : le verre reflète, on devine l'intérieur.
          diffuseColor.rgb = mix(vec3(0.16, 0.18, 0.2), interior, 0.55);
        }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += gInterior * mix(0.22, 0.85, uLights);`,
      );
  });
}

/**
 * Façades proches : même matière que la ville, avec des joints discrets
 * (dalles de carrelage, nez de plancher) dessinés en coordonnées monde sur
 * les faces verticales claires. De près, ça fait « construit » ; de loin, ça
 * disparaît.
 */
export function facadeMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0, envMapIntensity: 0.55 });
  return patched(mat, "facade-v1", glowPatch(1.4), (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFacN;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvFacN = normalize(mat3(modelMatrix) * objectNormal);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFacN;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          float vertical = 1.0 - step(0.4, abs(vFacN.y));
          float light = step(0.55, dot(diffuseColor.rgb, vec3(0.333)));
          float along = abs(vFacN.x) > 0.5 ? vFogWorld.z : vFogWorld.x;
          vec2 g = vec2(along / 0.6, vFogWorld.y / 0.3);
          vec2 f = abs(fract(g) - 0.5);
          float aa = fwidth(g.x) + fwidth(g.y);
          float joint = (1.0 - smoothstep(0.0, 0.06 + aa, 0.5 - max(f.x, f.y) * 1.0)) * (1.0 - smoothstep(0.3, 0.8, aa));
          float slab = 1.0 - smoothstep(0.0, 0.05 + fwidth(vFogWorld.y), abs(fract(vFogWorld.y / 3.05) - 0.06));
          diffuseColor.rgb *= 1.0 - vertical * light * (joint * 0.045 + slab * 0.07);
        }`,
      );
  });
}
