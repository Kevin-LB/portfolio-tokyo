import * as THREE from "three";
import { buildAntennaSolids, buildLattice, beaconPositions, radomePositions } from "./lattice";
import { aboutFacet, buildCores, buildElevatorCabin, buildFootTown, buildMainDeck, buildTopDeck, CORES } from "./decks";
import { glassMaterial, towerPaintMaterial, vertexColorMaterial } from "../materials";
import { shared } from "../atmosphere";

/**
 * Assemble la tour : treillis peint, plateformes, cages, cabines, balises.
 */
export class Tower {
  readonly group = new THREE.Group();
  readonly cabin1: THREE.Group;
  readonly cabin2: THREE.Group;
  readonly beacons: THREE.InstancedMesh;
  private beaconMat: THREE.MeshBasicMaterial;
  readonly mainDeckGlass: THREE.Mesh;
  readonly paint: THREE.MeshStandardMaterial;

  constructor(detail: number) {
    this.group.name = "Tour de Tokyo";
    this.paint = towerPaintMaterial();
    const structure = vertexColorMaterial(0.7, 1.4);

    const lattice = new THREE.Mesh(buildLattice(detail), this.paint);
    lattice.name = "Treillis";
    lattice.castShadow = true;
    lattice.receiveShadow = true;
    this.group.add(lattice);

    const antenna = new THREE.Mesh(buildAntennaSolids(), this.paint);
    antenna.castShadow = true;
    this.group.add(antenna);

    const main = buildMainDeck();
    const mainS = new THREE.Mesh(main.structure, structure);
    mainS.castShadow = mainS.receiveShadow = true;
    this.group.add(mainS);
    const deckGlass = vertexColorMaterial(0.12, 1.2);
    deckGlass.envMapIntensity = 1.4;
    this.mainDeckGlass = new THREE.Mesh(main.glass, deckGlass);
    this.group.add(this.mainDeckGlass);

    const top = buildTopDeck();
    const topS = new THREE.Mesh(top.structure, structure);
    topS.castShadow = topS.receiveShadow = true;
    this.group.add(topS);
    const topG = new THREE.Mesh(top.glass, glassMaterial("#ffd59c", 0.2, 0.62));
    topG.renderOrder = 2;
    this.group.add(topG);

    // Film sombre sur la vitre « à propos » : le texte s'y projette, lisible de jour comme de nuit.
    {
      const f = aboutFacet(4);
      const film = new THREE.Mesh(
        new THREE.PlaneGeometry(f.width * 0.96, f.height * 0.96),
        new THREE.MeshStandardMaterial({ color: "#1b2633", roughness: 0.14, metalness: 0.55, envMapIntensity: 0.8 }),
      );
      film.position.copy(f.center).addScaledVector(f.normal, -0.05);
      film.rotation.y = f.angle;
      film.name = "Film de projection";
      this.group.add(film);
    }
    const cores = buildCores();
    const coreS = new THREE.Mesh(cores.structure, structure);
    coreS.castShadow = true;
    this.group.add(coreS);
    const coreG = new THREE.Mesh(cores.glass, glassMaterial("#ffd8a8", 0.2, 0.22));
    coreG.renderOrder = 3;
    this.group.add(coreG);

    const ft = new THREE.Mesh(buildFootTown(), vertexColorMaterial(0.8, 1.2));
    ft.castShadow = ft.receiveShadow = true;
    ft.name = "FootTown";
    this.group.add(ft);

    // Cabines d'ascenseur.
    const cab = buildElevatorCabin();
    const cabinGlass = glassMaterial("#ffe1b3", 0.15, 0.28);
    const makeCabin = (scale: number) => {
      const g = new THREE.Group();
      const frame = new THREE.Mesh(cab.frame, structure);
      const glass = new THREE.Mesh(cab.glass, cabinGlass);
      glass.renderOrder = 4;
      g.add(frame, glass);
      // Petite lumière intérieure : lisible de loin, chaleureuse.
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(2.3, 2.6, 2.3),
        new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd2a0").multiplyScalar(1.6), transparent: true, opacity: 0.55, depthWrite: false }),
      );
      lamp.position.y = 1.45;
      g.add(lamp);
      g.scale.setScalar(scale);
      return g;
    };
    this.cabin1 = makeCabin(1);
    this.cabin2 = makeCabin(0.82);
    this.cabin1.position.set(1.3, CORES[0].y0, 0.4);
    this.cabin2.position.set(0.7, CORES[1].y0, -0.3);
    this.group.add(this.cabin1, this.cabin2);

    // Radômes blancs.
    const rad = radomePositions();
    const radMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), structure, rad.length);
    const m = new THREE.Matrix4();
    rad.forEach((r, i) => {
      m.makeScale(r.r, r.r, r.r).setPosition(r.p);
      radMesh.setMatrixAt(i, m);
    });
    radMesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Array(radMesh.geometry.attributes.position.count * 3).fill(0.92), 3));
    radMesh.geometry.setAttribute("glow", new THREE.Float32BufferAttribute(new Array(radMesh.geometry.attributes.position.count).fill(0), 1));
    radMesh.castShadow = true;
    this.group.add(radMesh);

    // Feux d'obstacle (rouges, clignotants la nuit).
    const bp = beaconPositions();
    this.beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff2a14"), toneMapped: false });
    this.beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 10, 8), this.beaconMat, bp.length);
    bp.forEach((p, i) => {
      m.makeTranslation(p.x, p.y, p.z);
      this.beacons.setMatrixAt(i, m);
    });
    this.group.add(this.beacons);
  }

  update(time: number) {
    const night = shared.uNight.value;
    const blink = 0.5 + 0.5 * Math.sin(time * 2.6);
    const k = THREE.MathUtils.lerp(0.6, 6 * (0.25 + 0.75 * blink), night);
    this.beaconMat.color.setRGB(1.0 * k, 0.16 * k, 0.08 * k);
  }
}
