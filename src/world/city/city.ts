import * as THREE from "three";
import { buildLots, buildRoads, type Lot } from "./layout";
import { SignAtlas, signGeometry } from "./signs";
import { buildNearBuildings } from "./buildings";
import { buildStreets } from "./street";
import { buildTrees } from "./trees";
import { buildTemple } from "./temple";
import { buildBay, buildDistant, buildInfrastructure } from "./distant";
import { facadeMaterial, glassMaterial, patched, plainMaterial, shopfrontMaterial, vertexColorMaterial } from "../materials";
import { GlowPoints, lightPools } from "../glow";
import { FOOTTOWN } from "../tower/decks";
import { shared } from "../atmosphere";

/**
 * Le mini-Tokyo assemblé. Juste assez de ville pour dire « Tokyo » :
 * détaillée là où la caméra passe, instanciée ailleurs, silhouettes au loin.
 */
export class City {
  readonly group = new THREE.Group();
  readonly lots: Lot[];
  readonly atlas = new SignAtlas();
  private glows: GlowPoints[] = [];
  private pools: THREE.Mesh;
  private signMat: THREE.MeshStandardMaterial;
  readonly sakura: { x: number; z: number; s: number }[];

  constructor(detail: number) {
    this.group.name = "Ville";
    this.atlas.draw();
    const roads = buildRoads();
    this.lots = buildLots();

    // Sol de base (au-delà des rues) : béton clair, reçoit les ombres.
    const base = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), plainMaterial("#bdb7ab"));
    base.rotation.x = -Math.PI / 2;
    base.receiveShadow = true;
    base.name = "Sol";
    this.group.add(base);

    const body = facadeMaterial();
    const near = buildNearBuildings(this.lots.filter((l) => l.near), this.atlas, detail);
    const nb = new THREE.Mesh(near.body, body);
    nb.castShadow = nb.receiveShadow = true;
    nb.name = "Bâtiments proches";
    this.group.add(nb);
    const glassMat = vertexColorMaterial(0.18, 1.6);
    glassMat.envMapIntensity = 1.2;
    const ng = new THREE.Mesh(near.glass, glassMat);
    ng.receiveShadow = true;
    ng.name = "Vitrages";
    this.group.add(ng);
    const shops = new THREE.Mesh(near.shop, shopfrontMaterial());
    shops.name = "Vitrines";
    this.group.add(shops);

    // Enseignes (atlas), éclairées un peu le jour, pleinement la nuit.
    this.signMat = patched(
      new THREE.MeshStandardMaterial({ map: this.atlas.texture, emissiveMap: this.atlas.texture, emissive: "#ffffff", emissiveIntensity: 0.25, roughness: 0.6 }),
      "signs-v1",
    );
    const signs = new THREE.Mesh(near.signs, this.signMat);
    signs.name = "Enseignes";
    this.group.add(signs);
    // Lettrage de FootTown (façade sud, face à la rue d'ouverture).
    const ftZ = FOOTTOWN.d / 2 + 0.08;
    const ft = new THREE.Mesh(
      signGeometry([
        {
          corners: [new THREE.Vector3(-9, 15.4, ftZ), new THREE.Vector3(9, 15.4, ftZ), new THREE.Vector3(9, 17.65, ftZ), new THREE.Vector3(-9, 17.65, ftZ)],
          uv: this.atlas.footTown,
          lit: 1,
        },
      ]),
      this.signMat,
    );
    ft.name = "Lettrage FootTown";
    this.group.add(ft);

    const st = buildStreets(roads, this.atlas, detail);
    const ground = new THREE.Mesh(st.ground, vertexColorMaterial(0.95, 0));
    ground.receiveShadow = true;
    ground.name = "Chaussées";
    this.group.add(ground);
    const props = new THREE.Mesh(st.props, vertexColorMaterial(0.8, 1.6));
    props.castShadow = props.receiveShadow = true;
    props.name = "Mobilier";
    this.group.add(props);
    const wires = new THREE.Mesh(st.wires, vertexColorMaterial(0.7, 0));
    wires.name = "Câbles";
    this.group.add(wires);
    const marks = new THREE.Mesh(
      signGeometry(st.signs),
      patched(new THREE.MeshStandardMaterial({ map: this.atlas.texture, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }), "marks-v1"),
    );
    marks.receiveShadow = true;
    marks.name = "Marquages";
    this.group.add(marks);

    const trees = buildTrees(detail);
    this.group.add(trees.group);
    this.sakura = trees.sakuraSpots;

    const temple = new THREE.Mesh(buildTemple(), vertexColorMaterial(0.78, 1.2));
    temple.castShadow = temple.receiveShadow = true;
    temple.name = "Zōjō-ji";
    this.group.add(temple);

    const distant = buildDistant(this.lots, detail);
    this.group.add(distant.group);

    const infra = buildInfrastructure();
    const im = new THREE.Mesh(infra.geometry, vertexColorMaterial(0.85, 0));
    im.castShadow = im.receiveShadow = true;
    im.name = "Voie express et viaduc";
    this.group.add(im);

    this.group.add(buildBay());

    // Lumières de la ville (la nuit).
    const lamps = new GlowPoints(
      st.lamps.map((p) => ({ p, color: "#ffd8a0", size: 0.55 })),
      { minPx: 1.2, name: "Réverbères" },
    );
    const sodium = new GlowPoints(
      infra.lamps.map((p) => ({ p, color: "#ffad4a", size: 1.1 })),
      { minPx: 1.6, name: "Lampadaires sodium" },
    );
    const obstacle = new GlowPoints(
      distant.obstacleLights.map((p, i) => ({ p, color: "#ff2a18", size: 1.6, phase: (i % 5) * 0.4 })),
      { blink: true, minPx: 2.2, name: "Feux d'obstacle" },
    );
    this.glows.push(lamps, sodium, obstacle);
    for (const g of this.glows) this.group.add(g.mesh);
    this.pools = lightPools(st.lamps, 6.5);
    this.group.add(this.pools);
  }

  update() {
    const lights = shared.uLights.value;
    const night = shared.uNight.value;
    this.glows[0].intensity = lights * 3.2;
    this.glows[1].intensity = lights * 4.0;
    this.glows[2].intensity = THREE.MathUtils.lerp(0.6, 5, night);
    (this.pools.material as THREE.ShaderMaterial).uniforms.uIntensity.value = lights * 0.55;
    this.signMat.emissiveIntensity = THREE.MathUtils.lerp(0.22, 1.35, lights);
  }

  static async prepare() {
    await SignAtlas.fontsReady();
  }
}

export { glassMaterial };
