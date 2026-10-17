import * as THREE from "three";

/**
 * Chaîne de rendu minimale, écrite pour cette scène :
 *  1. scène en HDR (demi-flottant), MSAA selon la qualité ;
 *  2. bloom à double filtre (une demi-douzaine de petites passes), coupé le jour ;
 *  3. une passe finale : exposition, tone mapping neutre, étalonnage chaud
 *     discret, voile de nuage (traversée), vignette, tramage anti-bandes ;
 *  4. dans cette même passe, le verre liquide des panneaux de l'interface :
 *     la scène floutée (une petite chaîne à part), déviée et dispersée sur le
 *     biseau, teintée juste assez pour que le texte reste lisible, avec ses
 *     reflets et son ombre. Le DOM ne porte que le texte (voir ui/glass.ts).
 */

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function fullscreenTriangle() {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  return g;
}

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uPrefilter;
varying vec2 vUv;
vec3 prefilter(vec3 c) {
  float l = max(c.r, max(c.g, c.b));
  float knee = uThreshold * 0.6;
  float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, l - uThreshold) / max(l, 1e-4);
  return c * w;
}
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb;
  c += texture2D(tSrc, vUv + vec2( o.x, -o.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x,  o.y)).rgb;
  c += texture2D(tSrc, vUv + vec2( o.x,  o.y)).rgb;
  c /= 8.0;
  if (uPrefilter > 0.5) c = prefilter(min(c, vec3(24.0)));
  gl_FragColor = vec4(c, 1.0);
}
`;

const UP_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = vec3(0.0);
  c += texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0, 1.0);
}
`;

/** Panneaux de verre au plus (assez pour la barre, l'altimètre, deux cartes, la visionneuse). */
export const MAX_GLASS = 8;

/** Ce que partagent la passe finale et le verre : de la lumière à la couleur affichée. */
const GRADE = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom;
uniform float uExposure; uniform float uBloom; uniform float uNight;
uniform float uVeil; uniform vec3 uVeilColor; uniform float uTime; uniform vec2 uRes;
uniform float uVignette; uniform float uFade; uniform vec3 uFadeColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Khronos PBR Neutral : garde les teintes (l'orange de la tour reste orange).
vec3 neutral(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// De la lumière de la scène à la couleur affichée (linéaire), en un point de l'écran.
vec3 grade(vec3 hdr, vec2 uv) {
  hdr *= uExposure;
  vec3 c = neutral(hdr);
  // Étalonnage : un soupçon de saturation, chaud le jour, profond la nuit.
  float l = dot(c, LUMA);
  c = mix(vec3(l), c, mix(1.08, 1.12, uNight));
  c *= mix(vec3(1.012, 1.0, 0.982), vec3(0.985, 0.995, 1.02), uNight);
  // Voile de nuage (traversée) : blanc doux, plus dense au centre, animé.
  if (uVeil > 0.001) {
    vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) * 3.0;
    float n = noise(p + vec2(uTime * 0.35, uTime * 0.12)) * 0.6 + noise(p * 2.3 - uTime * 0.2) * 0.4;
    float center = 1.0 - smoothstep(0.2, 1.1, length(uv - 0.5) * 1.6);
    float v = clamp(uVeil * (0.75 + 0.5 * n) + uVeil * center * 0.25, 0.0, 1.0);
    c = mix(c, uVeilColor, v);
  }
  // Vignette légère.
  vec2 q = uv - 0.5;
  c *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
  return clamp(c, 0.0, 1.0);
}

`;

const FINAL_FRAG = /* glsl */ `
${GRADE}
uniform float uDim; // la scène s'efface derrière la visionneuse
varying vec2 vUv;
void main() {
  vec3 hdr = texture2D(tScene, vUv).rgb;
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  hdr += bloom * uBloom;
  vec3 c = grade(hdr, vUv);
  c = mix(c, c * mix(vec3(0.62, 0.64, 0.7), vec3(0.5, 0.52, 0.6), uNight), uDim);
  c = toSRGB(c);
  // Fondu (entrée, mouvement réduit).
  c = mix(c, uFadeColor, uFade);
  // Tramage : supprime les bandes du ciel.
  c += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

/**
 * Le verre : un quadrilatère par panneau (son rectangle plus la marge de
 * l'ombre), dessiné par-dessus l'image finale. Seuls ces pixels paient.
 */
const GLASS_VERT = /* glsl */ `
uniform vec4 uRect; uniform vec2 uRes; uniform float uMargin;
void main() {
  vec2 px = uRect.xy + position.xy * (uRect.zw + uMargin);
  gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.0, 1.0);
}
`;

const GLASS_FRAG = /* glsl */ `
${GRADE}
// Scène floutée (deux niveaux) ; panneau en pixels du canvas (origine en bas à gauche).
uniform sampler2D tGlass; uniform sampler2D tGlassSoft;
uniform vec4 uRect;               // centre, demi-taille
uniform vec4 uShape;              // rayon, opacité, biseau, commande (0 panneau, 1 commande)
uniform float uGlassDark;         // 0 verre clair (texte sombre), 1 verre fumé (texte clair)
uniform vec3 uGlassLight; uniform vec3 uGlassShade;
uniform vec2 uLightDir;           // d'où vient la lumière, dans le plan de l'écran
uniform vec3 uPointer;            // position (px) et présence du pointeur sur le verre
uniform float uPx;                // pixels du canvas par pixel CSS
uniform float uOpaque;            // préférence « transparence réduite »
vec2 vUv;

// Rectangle arrondi : distance signée (négative dedans).
float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Un panneau de verre : ce qu'on voit à travers, au pixel fc (déjà dedans).
vec3 glass(vec2 fc, vec2 p, vec4 R, vec4 S, float d) {
  float radius = S.x;
  float bezel = S.z;
  float control = S.w;
  // Normale du bord (vers l'extérieur).
  vec2 q = abs(p) - R.zw + radius;
  vec2 n = (q.x > 0.0 && q.y > 0.0) ? normalize(q) : (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  n *= vec2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0);
  // Biseau convexe : plus on approche du bord, plus la lumière est déviée
  // vers l'intérieur (la scène s'y resserre, comme dans une goutte).
  float t = clamp(-d / bezel, 0.0, 1.0);
  float edge = 1.0 - t;
  float bend = edge * edge * edge;
  vec2 shift = -n * bend * bezel * mix(1.0, 1.3, control) / uRes;
  // Dispersion : le bleu dévie un peu plus que le rouge.
  vec2 sr = vUv + shift * 0.84, sg = vUv + shift, sb = vUv + shift * 1.18;
  vec3 frost = vec3(texture2D(tGlass, sr).r, texture2D(tGlass, sg).g, texture2D(tGlass, sb).b);
  vec3 soft = vec3(texture2D(tGlassSoft, sr).r, texture2D(tGlassSoft, sg).g, texture2D(tGlassSoft, sb).b);
  // Dépoli au centre (on y lit), plus clair pour les commandes ; net sur le
  // biseau, où l'on voit la scène se courber.
  vec3 hdr = mix(frost, soft, control * 0.5);
  float clear = edge * edge;
  if (clear > 0.02) {
    vec3 sharp = vec3(texture2D(tScene, sr).r, texture2D(tScene, sg).g, texture2D(tScene, sb).b);
    hdr = mix(hdr, sharp, clear * 0.9);
  }
  hdr += texture2D(tBloom, sg).rgb * uBloom;
  vec3 c = grade(hdr, sg);
  // Vibrance : à travers le verre, les couleurs de la ville ressortent.
  float l0 = dot(c, LUMA);
  c = max(mix(vec3(l0), c, 1.4), 0.0);
  // Teinte : un voile de base, renforcé là où le fond ferait perdre le texte
  // (le jour, le fond ne descend pas sous ~0,58 de luminance ; la nuit, il ne
  // dépasse pas ~0,05). Le contraste ne dépend plus de ce qui passe derrière.
  vec3 tint = mix(uGlassLight, uGlassShade, uGlassDark);
  float lum = dot(c, LUMA);
  float tl = dot(tint, LUMA);
  float needLight = (0.58 - lum) / max(tl - lum, 1e-3);
  float needDark = (lum - 0.05) / max(lum - tl, 1e-3);
  float need = mix(needLight, needDark, uGlassDark) * mix(1.0, 0.85, clear);
  float base = mix(0.34, 0.48, uGlassDark) * mix(1.0, 0.75, control);
  float m = clamp(max(base, need), 0.0, 0.95);
  c = mix(c, tint, max(m, uOpaque));
  // Volume : la lumière tombe d'en haut (le haut du panneau est plus clair),
  // le biseau s'allume côté lumière et s'assombrit de l'autre.
  float facing = dot(n, uLightDir);
  float top = clamp(p.y / max(R.w, 1.0) * 0.5 + 0.5, 0.0, 1.0);
  c += top * mix(0.045, 0.02, uGlassDark);
  c += bend * pow(max(facing, 0.0), 2.0) * mix(0.26, 0.12, uGlassDark);
  c -= bend * max(-facing, 0.0) * mix(0.07, 0.03, uGlassDark);
  // Reflets : un liseré net sur le bord (fort côté lumière, et en face, plus
  // faible, comme une lame de verre), un second, plus fin, à l'intérieur.
  float rim = 1.0 - smoothstep(0.0, 1.4 * uPx, -d);
  float inner = 1.0 - smoothstep(0.0, 0.8 * uPx, abs(-d - 2.4 * uPx));
  float spec = 0.3 + 0.9 * pow(max(facing, 0.0), 3.0) + 0.55 * pow(max(-facing, 0.0), 4.0);
  vec3 sheen = mix(vec3(1.0), vec3(0.86, 0.91, 1.0), uGlassDark);
  c += sheen * (rim * mix(0.6, 0.4, uGlassDark) + inner * mix(0.18, 0.1, uGlassDark)) * spec;
  // Lueur sous le pointeur : le verre répond à la main.
  vec2 dp = fc - uPointer.xy;
  float r = 120.0 * uPx;
  c += sheen * uPointer.z * exp(-dot(dp, dp) / (r * r)) * mix(0.08, 0.06, uGlassDark);
  return clamp(c, 0.0, 1.0);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vUv = fc / uRes;
  vec2 p = fc - uRect.xy;
  // Ombre portée, douce, décalée vers le bas.
  float ds = sdBox(p + vec2(0.0, 9.0 * uPx), uRect.zw, uShape.x);
  float shade = uShape.y * (1.0 - smoothstep(-8.0 * uPx, 34.0 * uPx, ds)) * mix(0.2, 0.32, uGlassDark);
  float d = sdBox(p, uRect.zw, uShape.x);
  float cover = (1.0 - smoothstep(-0.75 * uPx, 0.75 * uPx, d)) * uShape.y;
  vec3 col = vec3(0.0);
  if (cover > 0.0) {
    col = toSRGB(glass(fc, p, uRect, uShape, d));
    col = mix(col, uFadeColor, uFade);
    col += (hash(fc + fract(uTime)) - 0.5) / 255.0;
  }
  // Prémultiplié : le verre recouvre, l'ombre assombrit ce qui est dessous.
  float a = 1.0 - (1.0 - cover) * (1.0 - shade * (1.0 - uFade));
  gl_FragColor = vec4(col * cover, a);
}
`;

const DOWN8_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
// Pleine résolution → huitième, en seize lectures bilinéaires (un bloc 8×8).
void main() {
  vec3 c = vec3(0.0);
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      c += texture2D(tSrc, vUv + (vec2(float(x), float(y)) * 2.0 - 3.0) * uTexel).rgb;
    }
  }
  gl_FragColor = vec4(c / 16.0, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
// Flou large au huitième : 3×3 lectures bilinéaires, poids 1-2-1.
void main() {
  vec3 c = vec3(0.0);
  float w = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      float k = (2.0 - abs(float(x))) * (2.0 - abs(float(y)));
      c += texture2D(tSrc, vUv + vec2(float(x), float(y)) * 1.75 * uTexel).rgb * k;
      w += k;
    }
  }
  gl_FragColor = vec4(c / w, 1.0);
}
`;

export type PostOptions = { samples: number; bloom: boolean };

export class Post {
  readonly sceneRT: THREE.WebGLRenderTarget;
  private mips: THREE.WebGLRenderTarget[] = [];
  /** Flou du verre : la scène au huitième, puis floutée (deux passes en tout). */
  private glassSmall: THREE.WebGLRenderTarget;
  private glassBlur: THREE.WebGLRenderTarget;
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private down: THREE.ShaderMaterial;
  private down8: THREE.ShaderMaterial;
  private up: THREE.ShaderMaterial;
  private blur: THREE.ShaderMaterial;
  readonly final: THREE.ShaderMaterial;
  /** Le verre d'un panneau ; ses uniformes sont écrits par ui/glass.ts. */
  readonly glassMaterial: THREE.ShaderMaterial;
  private glassQuad: THREE.Mesh;
  /** Panneaux de l'image courante (pixels du canvas, origine en bas à gauche). */
  readonly glass = {
    count: 0,
    rects: Array.from({ length: MAX_GLASS }, () => new THREE.Vector4()),
    shapes: Array.from({ length: MAX_GLASS }, () => new THREE.Vector4()),
  };
  private bloomEnabled: boolean;
  private black: THREE.DataTexture;

  constructor(
    private renderer: THREE.WebGLRenderer,
    opts: PostOptions,
  ) {
    this.bloomEnabled = opts.bloom;
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      samples: opts.samples,
      depthBuffer: true,
    });
    this.sceneRT.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const blurRT = () => {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
      rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
      return rt;
    };
    for (let i = 0; i < 5; i++) this.mips.push(blurRT());
    this.glassSmall = blurRT();
    this.glassBlur = blurRT();
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    const fs = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, extra: Partial<THREE.ShaderMaterialParameters> = {}) =>
      new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, ...extra });
    this.down = fs(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.35 }, uPrefilter: { value: 0 } });
    this.down8 = fs(DOWN8_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = fs(UP_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, { blending: THREE.AdditiveBlending, transparent: true });
    this.blur = fs(BLUR_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    // Uniformes communs à la passe finale et au verre (mêmes objets : une
    // seule écriture suffit).
    const common = {
      tScene: { value: this.sceneRT.texture },
      tBloom: { value: this.mips[0].texture as THREE.Texture },
      uExposure: { value: 1 },
      uBloom: { value: 0.1 },
      uNight: { value: 0 },
      uVeil: { value: 0 },
      uVeilColor: { value: new THREE.Color("#f4f6f8") },
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uVignette: { value: 0.22 },
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color("#f3eee6") },
    };
    this.final = fs(FINAL_FRAG, { ...common, uDim: { value: 0 } });
    this.glassMaterial = new THREE.ShaderMaterial({
      vertexShader: GLASS_VERT,
      fragmentShader: GLASS_FRAG,
      uniforms: {
        ...common,
        tGlass: { value: this.black },
        tGlassSoft: { value: this.black },
        uRect: { value: new THREE.Vector4() },
        uShape: { value: new THREE.Vector4() },
        uMargin: { value: 48 },
        uGlassDark: { value: 0 },
        uGlassLight: { value: new THREE.Color("#faf8f3") },
        uGlassShade: { value: new THREE.Color("#0b1426") },
        uLightDir: { value: new THREE.Vector2(-0.55, 0.83) },
        uPointer: { value: new THREE.Vector3() },
        uPx: { value: 1 },
        uOpaque: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      // Couleur prémultipliée : le verre recouvre, l'ombre assombrit.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.quad = new THREE.Mesh(fullscreenTriangle(), this.final);
    this.quad.frustumCulled = false;
    this.glassQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.glassMaterial);
    this.glassQuad.frustumCulled = false;
  }

  setSize(w: number, h: number) {
    this.sceneRT.setSize(w, h);
    let mw = Math.max(1, Math.floor(w / 2));
    let mh = Math.max(1, Math.floor(h / 2));
    for (const rt of this.mips) {
      rt.setSize(mw, mh);
      mw = Math.max(1, Math.floor(mw / 2));
      mh = Math.max(1, Math.floor(mh / 2));
    }
    const gw = Math.max(1, Math.ceil(w / 8));
    const gh = Math.max(1, Math.ceil(h / 8));
    this.glassSmall.setSize(gw, gh);
    this.glassBlur.setSize(gw, gh);
    this.final.uniforms.uRes.value.set(w, h);
  }

  setBloom(on: boolean) {
    this.bloomEnabled = on;
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.camera);
  }

  /** Rend la chaîne complète vers l'écran. `drawScene` dessine dans `sceneRT`. */
  render(drawScene: (target: THREE.WebGLRenderTarget) => void) {
    const r = this.renderer;
    drawScene(this.sceneRT);
    const bloomOn = this.bloomEnabled && this.final.uniforms.uBloom.value > 0.01;
    if (bloomOn) {
      // Descente.
      let src: THREE.Texture = this.sceneRT.texture;
      let sw = this.sceneRT.width;
      let sh = this.sceneRT.height;
      for (let i = 0; i < this.mips.length; i++) {
        this.down.uniforms.tSrc.value = src;
        this.down.uniforms.uTexel.value.set(1 / sw, 1 / sh);
        this.down.uniforms.uPrefilter.value = i === 0 ? 1 : 0;
        this.pass(this.down, this.mips[i]);
        src = this.mips[i].texture;
        sw = this.mips[i].width;
        sh = this.mips[i].height;
      }
      // Remontée additive.
      const prevAuto = r.autoClear;
      r.autoClear = false;
      for (let i = this.mips.length - 1; i > 0; i--) {
        this.up.uniforms.tSrc.value = this.mips[i].texture;
        this.up.uniforms.uTexel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
        this.pass(this.up, this.mips[i - 1]);
      }
      r.autoClear = prevAuto;
      this.final.uniforms.tBloom.value = this.mips[0].texture;
    } else {
      this.final.uniforms.tBloom.value = this.black;
    }
    const panels = this.glass.count;
    if (panels > 0) this.blurForGlass();
    this.pass(this.final, null);
    if (panels > 0) {
      // Un quadrilatère par panneau, dans l'ordre du DOM (le dernier au-dessus).
      const prevAuto = r.autoClear;
      r.autoClear = false;
      const u = this.glassMaterial.uniforms;
      u.uMargin.value = 48 * u.uPx.value;
      for (let i = 0; i < panels; i++) {
        u.uRect.value.copy(this.glass.rects[i]);
        u.uShape.value.copy(this.glass.shapes[i]);
        r.render(this.glassQuad, this.camera);
      }
      r.autoClear = prevAuto;
    }
  }

  /**
   * La scène floutée vue à travers le verre : réduite au huitième en une
   * passe, puis floutée en une autre. Mesuré : chaque passe coûte surtout
   * par son existence (~0,15 ms), pas par sa taille ; deux suffisent.
   */
  private blurForGlass() {
    this.down8.uniforms.tSrc.value = this.sceneRT.texture;
    this.down8.uniforms.uTexel.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
    this.pass(this.down8, this.glassSmall);
    this.blur.uniforms.tSrc.value = this.glassSmall.texture;
    this.blur.uniforms.uTexel.value.set(1 / this.glassSmall.width, 1 / this.glassSmall.height);
    this.pass(this.blur, this.glassBlur);
    this.glassMaterial.uniforms.tGlass.value = this.glassBlur.texture;
    this.glassMaterial.uniforms.tGlassSoft.value = this.glassSmall.texture;
  }

  dispose() {
    this.sceneRT.dispose();
    for (const m of [...this.mips, this.glassSmall, this.glassBlur]) m.dispose();
    for (const m of [this.down, this.down8, this.up, this.blur, this.final, this.glassMaterial]) m.dispose();
    this.glassQuad.geometry.dispose();
  }
}
