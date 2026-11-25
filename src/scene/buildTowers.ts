import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  getTowerFootprintPoints,
  TOWERS,
  TowerSpec,
  ZoneId,
} from './masterplanData';
import {
  createTowerBadgeSprite,
  createTowerFacadeTextures,
  FacadeTextureSet,
} from './textures';

export interface TowersBuildResult {
  group: THREE.Group;
  labelsGroup: THREE.Group;
  facadeMaterials: THREE.MeshStandardMaterial[];
  podiumGlassMaterials: THREE.MeshStandardMaterial[];
  dispose: () => void;
}

// Expand or shrink a 2D convex-ish polygon outward by `offset` meters along mitered vertex normals
function offsetPolygon(
  points: [number, number][],
  offset: number,
): [number, number][] {
  const n = points.length;
  // Determine winding signed area to ensure outward normals
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const sign = area >= 0 ? 1 : -1;

  const result: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const e1x = curr[0] - prev[0];
    const e1y = curr[1] - prev[1];
    const l1 = Math.hypot(e1x, e1y) || 1;
    const n1x = (e1y / l1) * sign;
    const n1y = (-e1x / l1) * sign;

    const e2x = next[0] - curr[0];
    const e2y = next[1] - curr[1];
    const l2 = Math.hypot(e2x, e2y) || 1;
    const n2x = (e2y / l2) * sign;
    const n2y = (-e2x / l2) * sign;

    let mx = n1x + n2x;
    let my = n1y + n2y;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;

    const dot = Math.max(0.45, mx * n1x + my * n1y);
    const dist = offset / dot;
    result.push([curr[0] + mx * dist, curr[1] + my * dist]);
  }
  return result;
}

function shapeFromPoints(points: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();
  return shape;
}

// Create horizontal architectural floor-ledge ring around the tower footprint
function createLedgeRingGeometry(
  outerPoints: [number, number][],
  innerPoints: [number, number][],
  thickness: number,
): THREE.BufferGeometry {
  const shape = shapeFromPoints(outerPoints);
  const hole = new THREE.Path();
  hole.moveTo(innerPoints[0][0], innerPoints[0][1]);
  for (let i = innerPoints.length - 1; i >= 0; i--) {
    hole.lineTo(innerPoints[i][0], innerPoints[i][1]);
  }
  hole.closePath();
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function buildTowers(anisotropy: number): TowersBuildResult {
  const root = new THREE.Group();
  root.name = 'MasteriTowers';

  const labelsGroup = new THREE.Group();
  labelsGroup.name = 'TowerLabels';

  const geometriesToDispose: THREE.BufferGeometry[] = [];
  const materialsToDispose: THREE.Material[] = [];
  const texturesToDispose: THREE.Texture[] = [];

  const facadeTexByZone: Record<ZoneId, FacadeTextureSet> = {
    S: createTowerFacadeTextures('S', anisotropy),
    C: createTowerFacadeTextures('C', anisotropy),
    N: createTowerFacadeTextures('N', anisotropy),
  };

  (['S', 'C', 'N'] as ZoneId[]).forEach((z) => {
    const t = facadeTexByZone[z];
    texturesToDispose.push(t.map, t.emissiveMap, t.roughnessMap, t.bumpMap);
  });

  const facadeMaterials: THREE.MeshStandardMaterial[] = [];
  const podiumGlassMaterials: THREE.MeshStandardMaterial[] = [];

  const zoneColors: Record<
    ZoneId,
    { trim: number; podium: number; roof: number; metalness: number }
  > = {
    S: { trim: 0x87624c, podium: 0x3b2d26, roof: 0x735c4e, metalness: 0.48 },
    C: { trim: 0xcab69b, podium: 0xb59c80, roof: 0xc2ae96, metalness: 0.12 },
    N: { trim: 0x87624c, podium: 0x3b2d26, roof: 0x735c4e, metalness: 0.48 },
  };

  // Shared materials per zone
  const facadeMatByZone = {} as Record<ZoneId, THREE.MeshStandardMaterial>;
  const trimMatByZone = {} as Record<ZoneId, THREE.MeshStandardMaterial>;
  const podiumMatByZone = {} as Record<ZoneId, THREE.MeshStandardMaterial>;
  const roofMatByZone = {} as Record<ZoneId, THREE.MeshStandardMaterial>;
  const podiumGlassByZone = {} as Record<ZoneId, THREE.MeshStandardMaterial>;

  (['S', 'C', 'N'] as ZoneId[]).forEach((zone) => {
    const tex = facadeTexByZone[zone];
    const zc = zoneColors[zone];

    const facadeMat = new THREE.MeshStandardMaterial({
      map: tex.map,
      roughnessMap: tex.roughnessMap,
      bumpMap: tex.bumpMap,
      bumpScale: 0.14,
      emissive: new THREE.Color(0xffd79e),
      emissiveMap: tex.emissiveMap,
      emissiveIntensity: 0.0,
      metalness: zc.metalness * 0.55,
      roughness: zone === 'C' ? 0.72 : 0.62,
      envMapIntensity: zone === 'C' ? 0.85 : 1.35,
    });
    facadeMaterials.push(facadeMat);
    facadeMatByZone[zone] = facadeMat;

    const trimMat = new THREE.MeshStandardMaterial({
      color: zc.trim,
      metalness: zc.metalness,
      roughness: zone === 'C' ? 0.56 : 0.38,
      envMapIntensity: zone === 'C' ? 0.65 : 1.1,
    });
    trimMatByZone[zone] = trimMat;

    const podiumMat = new THREE.MeshStandardMaterial({
      color: zc.podium,
      metalness: zone === 'C' ? 0.1 : 0.35,
      roughness: 0.56,
    });
    podiumMatByZone[zone] = podiumMat;

    const roofMat = new THREE.MeshStandardMaterial({
      color: zc.roof,
      roughness: 0.85,
      metalness: 0.05,
    });
    roofMatByZone[zone] = roofMat;

    const podiumGlass = new THREE.MeshStandardMaterial({
      color: zone === 'C' ? 0x9c8873 : 0x526b7d,
      emissive: new THREE.Color(0xffdfa8),
      emissiveIntensity: zone === 'C' ? 0.42 : 0.25,
      metalness: 0.15,
      roughness: 0.14,
      envMapIntensity: 1.2,
    });
    podiumGlassMaterials.push(podiumGlass);
    podiumGlassByZone[zone] = podiumGlass;

    materialsToDispose.push(facadeMat, trimMat, podiumMat, roofMat, podiumGlass);
  });

  const mechMat = new THREE.MeshStandardMaterial({
    color: 0x6e757d,
    roughness: 0.65,
    metalness: 0.35,
  });
  materialsToDispose.push(mechMat);

  TOWERS.forEach((spec: TowerSpec) => {
    const towerGroup = new THREE.Group();
    towerGroup.name = `Tower_${spec.id}`;
    towerGroup.position.set(spec.x, 0, spec.z);

    const basePoints = getTowerFootprintPoints(spec.footprint);
    const shaftFloors = spec.floors - 2; // 2 floors are podium
    const shaftHeight = shaftFloors * spec.floorHeight;
    const totalRoofY = spec.podiumHeight + shaftHeight;

    // 1. Stone Entrance Plinth
    const plinthPts = offsetPolygon(basePoints, 2.2);
    const plinthGeo = new THREE.ExtrudeGeometry(shapeFromPoints(plinthPts), {
      depth: 0.45,
      bevelEnabled: false,
    });
    plinthGeo.rotateX(-Math.PI / 2);
    geometriesToDispose.push(plinthGeo);
    const plinthMesh = new THREE.Mesh(plinthGeo, podiumMatByZone[spec.zone]);
    plinthMesh.receiveShadow = true;
    towerGroup.add(plinthMesh);

    // 2. 2-Story Commercial Podium + Glass Storefront Band
    const podiumPts = offsetPolygon(basePoints, 1.35);
    const podiumGeo = new THREE.ExtrudeGeometry(shapeFromPoints(podiumPts), {
      depth: spec.podiumHeight - 0.45,
      bevelEnabled: true,
      bevelThickness: 0.15,
      bevelSize: 0.15,
      bevelSegments: 1,
    });
    podiumGeo.rotateX(-Math.PI / 2);
    podiumGeo.translate(0, 0.45, 0);
    geometriesToDispose.push(podiumGeo);
    const podiumMesh = new THREE.Mesh(podiumGeo, podiumMatByZone[spec.zone]);
    podiumMesh.castShadow = true;
    podiumMesh.receiveShadow = true;
    towerGroup.add(podiumMesh);

    // Recessed glowing storefront glass ring around podium
    const glassBandPts = offsetPolygon(basePoints, 1.42);
    const glassBandGeo = new THREE.ExtrudeGeometry(
      shapeFromPoints(glassBandPts),
      {
        depth: spec.podiumHeight - 2.2,
        bevelEnabled: false,
      },
    );
    glassBandGeo.rotateX(-Math.PI / 2);
    glassBandGeo.translate(0, 0.75, 0);
    geometriesToDispose.push(glassBandGeo);
    const glassBandMesh = new THREE.Mesh(
      glassBandGeo,
      podiumGlassByZone[spec.zone],
    );
    towerGroup.add(glassBandMesh);

    // Podium cornice slab
    const podiumCorniceGeo = createLedgeRingGeometry(
      offsetPolygon(basePoints, 1.8),
      offsetPolygon(basePoints, 0.1),
      0.45,
    );
    podiumCorniceGeo.translate(0, spec.podiumHeight - 0.2, 0);
    geometriesToDispose.push(podiumCorniceGeo);
    const podiumCornice = new THREE.Mesh(
      podiumCorniceGeo,
      trimMatByZone[spec.zone],
    );
    podiumCornice.castShadow = true;
    podiumCornice.receiveShadow = true;
    towerGroup.add(podiumCornice);

    // 3. Main Residential Tower Shaft
    const shaftGeo = new THREE.ExtrudeGeometry(shapeFromPoints(basePoints), {
      depth: shaftHeight,
      bevelEnabled: true,
      bevelThickness: 0.18,
      bevelSize: 0.18,
      bevelSegments: 1,
      curveSegments: 1,
    });
    shaftGeo.rotateX(-Math.PI / 2);
    shaftGeo.translate(0, spec.podiumHeight, 0);
    geometriesToDispose.push(shaftGeo);

    // Group 0 = top/bottom caps, Group 1 = perimeter facade walls
    const shaftMesh = new THREE.Mesh(shaftGeo, [
      roofMatByZone[spec.zone],
      facadeMatByZone[spec.zone],
    ]);
    shaftMesh.castShadow = true;
    shaftMesh.receiveShadow = true;
    towerGroup.add(shaftMesh);

    // 4. Real 3D Horizontal Slab Bands + Vertical Corner Fins (merged into 1 geometry per tower!)
    const detailGeos: THREE.BufferGeometry[] = [];
    const ledgeOuter = offsetPolygon(basePoints, 0.55);
    const ledgeInner = offsetPolygon(basePoints, -0.35);
    const baseRing = createLedgeRingGeometry(ledgeOuter, ledgeInner, 0.28);

    // Add 3D floor slab bands every floor for rich close-up architectural relief
    for (let f = 1; f <= shaftFloors; f++) {
      const ring = baseRing.clone();
      ring.translate(0, spec.podiumHeight + f * spec.floorHeight - 0.14, 0);
      detailGeos.push(ring);
    }
    baseRing.dispose();

    // Add vertical architectural pilasters at corners and every ~6m along facade walls
    const finGeo = new THREE.BoxGeometry(0.65, shaftHeight, 0.65);
    const finPts = offsetPolygon(basePoints, 0.35);
    for (let i = 0; i < finPts.length; i++) {
      const [ax, ay] = finPts[i];
      const [bx, by] = finPts[(i + 1) % finPts.length];
      const edgeLen = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(1, Math.round(edgeLen / 6.2));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        const fin = finGeo.clone();
        fin.translate(px, spec.podiumHeight + shaftHeight * 0.5, -py);
        detailGeos.push(fin);
      }
    }
    finGeo.dispose();

    const mergedDetails = mergeGeometries(detailGeos, false);
    detailGeos.forEach((g) => g.dispose());
    if (mergedDetails) {
      geometriesToDispose.push(mergedDetails);
      const detailsMesh = new THREE.Mesh(
        mergedDetails,
        trimMatByZone[spec.zone],
      );
      detailsMesh.castShadow = true;
      detailsMesh.receiveShadow = true;
      towerGroup.add(detailsMesh);
    }

    // 5. Architectural Rooftop Crown, Open Frame Portal & Mechanical Penthouse
    const parapetGeo = createLedgeRingGeometry(
      offsetPolygon(basePoints, 0.65),
      offsetPolygon(basePoints, -0.6),
      1.85,
    );
    parapetGeo.translate(0, totalRoofY, 0);
    geometriesToDispose.push(parapetGeo);
    const parapetMesh = new THREE.Mesh(parapetGeo, trimMatByZone[spec.zone]);
    parapetMesh.castShadow = true;
    parapetMesh.receiveShadow = true;
    towerGroup.add(parapetMesh);

    // Elevated open architectural crown ring & corner piers (signature Masteri crown)
    const crownFrameGeos: THREE.BufferGeometry[] = [];
    const crownPostGeo = new THREE.BoxGeometry(0.9, spec.crownHeight, 0.9);
    const crownPts = offsetPolygon(basePoints, 0.25);
    for (const [cx, cy] of crownPts) {
      const post = crownPostGeo.clone();
      post.translate(cx, totalRoofY + spec.crownHeight * 0.5, -cy);
      crownFrameGeos.push(post);
    }
    crownPostGeo.dispose();

    const upperCrownRing = createLedgeRingGeometry(
      offsetPolygon(basePoints, 0.72),
      offsetPolygon(basePoints, -0.75),
      0.85,
    );
    upperCrownRing.translate(0, totalRoofY + spec.crownHeight - 0.4, 0);
    crownFrameGeos.push(upperCrownRing);

    const mergedCrown = mergeGeometries(crownFrameGeos, false);
    crownFrameGeos.forEach((g) => g.dispose());
    if (mergedCrown) {
      geometriesToDispose.push(mergedCrown);
      const crownMesh = new THREE.Mesh(mergedCrown, trimMatByZone[spec.zone]);
      crownMesh.castShadow = true;
      towerGroup.add(crownMesh);
    }

    // Recessed mechanical penthouse
    const pentPts = offsetPolygon(basePoints, -3.2);
    const pentGeo = new THREE.ExtrudeGeometry(shapeFromPoints(pentPts), {
      depth: spec.crownHeight * 0.78,
      bevelEnabled: false,
    });
    pentGeo.rotateX(-Math.PI / 2);
    pentGeo.translate(0, totalRoofY, 0);
    geometriesToDispose.push(pentGeo);
    const pentMesh = new THREE.Mesh(pentGeo, mechMat);
    pentMesh.castShadow = true;
    pentMesh.receiveShadow = true;
    towerGroup.add(pentMesh);

    // 6. Floating Tower Label Sprite
    const badge = createTowerBadgeSprite(spec.id, spec.zone);
    badge.position.set(spec.x, totalRoofY + spec.crownHeight + 11, spec.z);
    labelsGroup.add(badge);

    root.add(towerGroup);
  });

  return {
    group: root,
    labelsGroup,
    facadeMaterials,
    podiumGlassMaterials,
    dispose: () => {
      geometriesToDispose.forEach((g) => g.dispose());
      materialsToDispose.forEach((m) => m.dispose());
      texturesToDispose.forEach((t) => t.dispose());
      labelsGroup.children.forEach((child) => {
        const sprite = child as THREE.Sprite;
        sprite.material.map?.dispose();
        sprite.material.dispose();
      });
    },
  };
}
