import * as THREE from "three";
import { Post } from "./post";
import { dprFor, FrameGovernor, samplesFor, type Quality } from "./quality";
import { Sky } from "../world/sky";
import { lightLevels, moonDirection, palette, shared, sunDirection } from "../world/atmosphere";

/**
 * Le plateau : renderer, deux scènes (fond lointain + scène principale),
 * lumières, environnement, ombres statiques, post-traitement.
 *
 * Le fond (ciel, horizon, Fuji, Skytree) a sa propre caméra aux plans de
 * coupe lointains : la scène principale garde une bonne précision de
 * profondeur près du sol.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly backdrop = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly backCamera: THREE.PerspectiveCamera;
  readonly sky = new Sky();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly post: Post;
  readonly governor = new FrameGovernor();
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envRT: THREE.WebGLRenderTarget | null = null;
  private lastEnvNight = -1;
  private lastShadowNight = -1;
  private width = 1;
  private height = 1;
  /** Le fond lointain est rendu à part (demi-résolution), puis sert d'arrière-plan. */
  private backRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly quality: Quality,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 9000);
    this.backCamera = new THREE.PerspectiveCamera(50, 1, 200, 80000);

    this.backdrop.add(this.sky.mesh);

    this.sun = new THREE.DirectionalLight("#fff1dc", 2.6);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(quality.shadowSize, quality.shadowSize);
    const cam = s.camera as THREE.OrthographicCamera;
    cam.left = -470;
    cam.right = 470;
    cam.top = 470;
    cam.bottom = -470;
    cam.near = 50;
    cam.far = 3200;
    cam.updateProjectionMatrix();
    s.bias = -0.0002;
    s.normalBias = 0.12;
    s.radius = 1.6;
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight("#cfe3f5", "#b7a68f", 0.7);
    this.scene.add(this.hemi);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const envSky = new Sky();
    envSky.mesh.scale.setScalar(100);
    envSky.material.uniforms.uSunDisk.value = 0.15;
    this.envSky = envSky;
    this.envScene.add(envSky.mesh);

    this.post = new Post(this.renderer, { samples: quality.msaa, bloom: quality.bloom });
    this.resize();
  }

  private envSky: Sky;

  resize() {
    this.width = innerWidth;
    this.height = innerHeight;
    const dpr = dprFor(this.quality, this.width, this.height, this.governor.scale);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height, false);
    const w = Math.round(this.width * dpr);
    const h = Math.round(this.height * dpr);
    const samples = samplesFor(this.quality, dpr);
    if (this.post.sceneRT.samples !== samples) {
      this.post.sceneRT.samples = samples;
      this.post.sceneRT.dispose();
    }
    this.post.setSize(w, h);
    this.backRT.setSize(Math.max(1, Math.round(w * 0.5)), Math.max(1, Math.round(h * 0.5)));
    this.backRT.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.scene.background = this.backRT.texture;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.backCamera.aspect = this.camera.aspect;
    this.backCamera.updateProjectionMatrix();
  }

  get aspect() {
    return this.width / this.height;
  }

  /** Applique l'état jour/nuit à tout ce que le plateau possède. */
  /** Appelé à chaque changement d'heure (pour les objets qui ont leurs propres couleurs). */
  onAtmosphere: ((night: number) => void) | null = null;

  applyAtmosphere(night: number) {
    shared.uNight.value = night;
    const L = lightLevels(night);
    sunDirection(night, shared.uSunDir.value);
    const sunDir = shared.uSunDir.value;
    const useMoon = sunDir.y < 0.05;
    const dir = useMoon ? moonDirection() : sunDir;
    this.sun.position.copy(dir).multiplyScalar(1400);
    this.sun.target.position.set(0, 0, 0);
    palette("sun", night, this.sun.color);
    this.sun.intensity = useMoon ? L.moon : L.sun;
    palette("hemiSky", night, this.hemi.color);
    palette("hemiGround", night, this.hemi.groundColor);
    this.hemi.intensity = L.hemi;
    const u = this.sky.material.uniforms;
    palette("zenith", night, u.uZenith.value);
    palette("horizon", night, u.uHorizon.value);
    palette("sun", night, u.uSunColor.value);
    const eu = this.envSky.material.uniforms;
    eu.uZenith.value.copy(u.uZenith.value);
    eu.uHorizon.value.copy(u.uHorizon.value);
    eu.uSunColor.value.copy(u.uSunColor.value);
    palette("fog", night, shared.uFogColor.value);
    shared.uLights.value = L.lights;
    shared.uTowerGlow.value = L.towerGlow;
    this.scene.environmentIntensity = L.env;
    this.post.final.uniforms.uNight.value = night;
    this.post.final.uniforms.uFadeColor.value.set(night > 0.5 ? "#0d1830" : "#f3eee6");
    this.post.final.uniforms.uBloom.value = L.bloom;
    this.post.final.uniforms.uExposure.value = L.exposure;

    this.onAtmosphere?.(night);
    // Environnement et ombres : recalculés seulement quand l'heure bouge assez.
    if (Math.abs(night - this.lastEnvNight) > 0.04 || (night !== this.lastEnvNight && (night === 0 || night === 1))) {
      this.lastEnvNight = night;
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
      this.envRT?.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
    }
    if (Math.abs(night - this.lastShadowNight) > 0.02 || (night !== this.lastShadowNight && (night === 0 || night === 1))) {
      this.lastShadowNight = night;
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  render() {
    const r = this.renderer;
    shared.uCamPos.value.copy(this.camera.position);
    this.backCamera.position.copy(this.camera.position);
    this.backCamera.quaternion.copy(this.camera.quaternion);
    this.backCamera.fov = this.camera.fov;
    this.backCamera.updateProjectionMatrix();
    r.setRenderTarget(this.backRT);
    r.render(this.backdrop, this.backCamera);
    this.post.render((target) => {
      r.setRenderTarget(target);
      r.render(this.scene, this.camera);
    });
  }
}
