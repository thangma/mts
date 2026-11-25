import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createAsphaltTexture,
  createBasketballCourtTexture,
  createGrassTexture,
  createPoolTileTexture,
  createStonePavingTexture,
  createTennisCourtTexture,
  createWoodDeckTexture,
} from './textures';

export interface AnimatedCar {
  group: THREE.Group;
  axis: 'x' | 'z';
  lanePos: number;
  minLimit: number;
  maxLimit: number;
  speed: number;
  dir: 1 | -1;
}

export interface LandscapeBuildResult {
  group: THREE.Group;
  waterUniforms: { uTime: { value: number } };
  lampEmissiveMat: THREE.MeshStandardMaterial;
  carHeadlightMat: THREE.MeshStandardMaterial;
  update: (delta: number, elapsed: number) => void;
  dispose: () => void;
}

function makeOrganicShape(points: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  const vecs = points.map(([x, y]) => new THREE.Vector2(x, y));
  const curve = new THREE.SplineCurve([...vecs, vecs[0]]);
  const sampled = curve.getPoints(48);
  shape.moveTo(sampled[0].x, sampled[0].y);
  for (let i = 1; i < sampled.length; i++) {
    shape.lineTo(sampled[i].x, sampled[i].y);
  }
  shape.closePath();
  return shape;
}

export function buildLandscape(
  anisotropy: number,
  isSoftwareGl: boolean,
): LandscapeBuildResult {
  const root = new THREE.Group();
  root.name = 'MasteriLandscape';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };

  // --- Textures ---
  const grassTex = trackTex(createGrassTexture(anisotropy));
  const stoneTex = trackTex(createStonePavingTexture(anisotropy));
  const woodTex = trackTex(createWoodDeckTexture(anisotropy));
  const asphaltTex = trackTex(createAsphaltTexture(anisotropy));
  const tennisTex = trackTex(createTennisCourtTexture(anisotropy));
  const bballSTex = trackTex(createBasketballCourtTexture('S', anisotropy));
  const bballCTex = trackTex(createBasketballCourtTexture('C', anisotropy));
  const poolTileTex = trackTex(createPoolTileTexture(anisotropy));

  // --- Shared Materials ---
  const outerGroundMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x627356,
      roughness: 0.95,
      metalness: 0.0,
    }),
  );
  const lawnMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: grassTex,
      roughness: 0.88,
      metalness: 0.0,
    }),
  );
  const stoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: stoneTex,
      roughness: 0.78,
      metalness: 0.04,
    }),
  );
  const curbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xbcb8ae,
      roughness: 0.72,
      metalness: 0.05,
    }),
  );
  const woodMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.68,
      metalness: 0.05,
    }),
  );
  const asphaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.85,
      metalness: 0.05,
    }),
  );
  const roadLineMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe8eaed,
      roughness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const sandBeachMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe6dcc8,
      roughness: 0.82,
      metalness: 0.02,
    }),
  );
  const poolTileMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: poolTileTex,
      roughness: 0.4,
      metalness: 0.05,
    }),
  );

  // Animated water material via onBeforeCompile
  const waterUniforms = { uTime: { value: 0 } };
  const waterMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x2cb7d4,
      roughness: 0.08,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: 0.78,
      envMapIntensity: 1.45,
    }),
  );
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.vertexShader =
      `uniform float uTime;\nvarying vec3 vWorldPos;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 wp = modelMatrix * vec4(transformed, 1.0);
         vWorldPos = wp.xyz;
         transformed.y += sin(wp.x * 0.45 + uTime * 1.8) * 0.035 + cos(wp.z * 0.52 + uTime * 1.4) * 0.035;`,
      );
    shader.fragmentShader =
      `uniform float uTime;\nvarying vec3 vWorldPos;\n` +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float ripple = sin(vWorldPos.x * 0.7 + uTime * 2.1) * cos(vWorldPos.z * 0.7 - uTime * 1.7);
         diffuseColor.rgb += vec3(0.05, 0.11, 0.13) * max(0.0, ripple);`,
      );
  };

  // --- 1. Continuous Horizon Ground & Road Grid ---
  const horizonGround = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(1800, 1800)),
    outerGroundMat,
  );
  horizonGround.rotation.x = -Math.PI / 2;
  horizonGround.position.y = -0.05;
  horizonGround.receiveShadow = true;
  root.add(horizonGround);

  // Site Asphalt Base Slab (under all roads & blocks)
  const siteAsphalt = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(444, 0.1, 184)),
    asphaltMat,
  );
  siteAsphalt.position.set(0, 0.0, -2);
  siteAsphalt.receiveShadow = true;
  root.add(siteAsphalt);

  // Distant subtle neighborhood context blocks so horizon feels urban & grounded
  const contextMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7b857e,
      roughness: 0.9,
    }),
  );
  const contextPositions: [number, number, number, number, number][] = [
    [-290, -40, 48, 12, 60],
    [-295, 50, 52, 16, 48],
    [290, -35, 48, 14, 58],
    [295, 45, 54, 18, 46],
    [-140, -145, 95, 14, 34],
    [0, -148, 110, 18, 36],
    [140, -145, 95, 14, 34],
    [-140, 145, 90, 12, 32],
    [0, 148, 100, 12, 32],
    [140, 145, 90, 12, 32],
  ];
  contextPositions.forEach(([cx, cz, cw, ch, cd]) => {
    const m = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(cw, ch, cd)),
      contextMat,
    );
    m.position.set(cx, ch * 0.5, cz);
    root.add(m);
  });

  // --- Road Lane Markings & Planted Median ---
  const addRoadStripe = (x: number, z: number, w: number, d: number) => {
    const m = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(w, d)),
      roadLineMat,
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.06, z);
    root.add(m);
  };

  // North Boulevard dashed center markings (top carriageways z=-84 & z=-74)
  for (let x = -205; x <= 205; x += 12) {
    addRoadStripe(x, -83.5, 5.2, 0.25);
    addRoadStripe(x, -74.5, 5.2, 0.25);
  }
  // North Boulevard center median island
  const median = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(412, 0.22, 3.2)),
    lawnMat,
  );
  median.position.set(0, 0.11, -79);
  median.receiveShadow = true;
  root.add(median);

  // Vertical avenue center markings
  const avenueXs = [-205, -67, 67, 205];
  avenueXs.forEach((ax) => {
    for (let z = -66; z <= 76; z += 10) {
      addRoadStripe(ax, z, 0.25, 4.8);
    }
    // Crosswalks at North Boulevard & internal road
    for (let dx = -4.5; dx <= 4.5; dx += 1.5) {
      addRoadStripe(ax + dx, -69.5, 0.7, 2.8);
      addRoadStripe(ax + dx, 12, 0.7, 2.4);
    }
  });

  // --- 2. Raised Masterplan Blocks (Zones S, C, N — Upper & Lower) ---
  const blockDefs = [
    // Upper residential courtyard podiums
    { x: -136, z: -30.5, w: 122, d: 77 }, // Zone S upper
    { x: 0, z: -30.5, w: 118, d: 77 },    // Zone C upper
    { x: 136, z: -30.5, w: 122, d: 77 },  // Zone N upper
    // Lower parks & sports blocks
    { x: -136, z: 45.5, w: 122, d: 59 },  // Zone S lower
    { x: 0, z: 45.5, w: 118, d: 59 },     // Zone C lower
    { x: 136, z: 45.5, w: 122, d: 59 },   // Zone N lower
  ];

  blockDefs.forEach((b) => {
    // Stone perimeter curb/sidewalk apron
    const curb = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(b.w + 3.2, 0.16, b.d + 3.2)),
      curbMat,
    );
    curb.position.set(b.x, 0.08, b.z);
    curb.receiveShadow = true;
    root.add(curb);

    // Inner manicured turf lawn
    const turf = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(b.w - 1.2, 0.18, b.d - 1.2)),
      lawnMat,
    );
    turf.position.set(b.x, 0.1, b.z);
    turf.receiveShadow = true;
    root.add(turf);
  });

  // Helper to add a flat paved plaza/walkway slightly raised above grass
  const addPlaza = (
    x: number,
    z: number,
    w: number,
    d: number,
    mat: THREE.Material = stoneMat,
    y = 0.21,
    rotY = 0,
  ) => {
    const m = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 0.06, d)), mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };

  // Helper to add a winding spline walkway ribbon
  const addCurvedPath = (
    pts: [number, number][],
    width = 3.2,
    mat: THREE.Material = stoneMat,
    y = 0.21,
  ) => {
    const curve = new THREE.CatmullRomCurve3(
      pts.map(([px, pz]) => new THREE.Vector3(px, 0, pz)),
    );
    const steps = 40;
    const sampled = curve.getPoints(steps);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < sampled.length; i++) {
      const p = sampled[i];
      const t = curve.getTangent(i / steps);
      const nx = -t.z * (width * 0.5);
      const nz = t.x * (width * 0.5);

      positions.push(p.x + nx, y, p.z + nz);
      positions.push(p.x - nx, y, p.z - nz);
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(i * 0.4, 0, i * 0.4, 1);

      if (i < sampled.length - 1) {
        const idx = i * 2;
        indices.push(idx, idx + 1, idx + 2, idx + 1, idx + 3, idx + 2);
      }
    }
    const geo = trackGeo(new THREE.BufferGeometry());
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    root.add(mesh);
  };

  // Helper for rectangular swimming pool with coping + tiled basin + animated water
  const addRectPool = (x: number, z: number, w: number, d: number) => {
    addPlaza(x, z, w + 2.4, d + 2.4, stoneMat, 0.24);
    addPlaza(x, z, w, d, poolTileMat, 0.26);
    const water = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(w - 0.3, d - 0.3, 18, 12)),
      waterMat,
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, 0.32, z);
    root.add(water);
  };

  // Helper for organic curved lagoon pool
  const addOrganicLagoon = (
    cx: number,
    cz: number,
    points: [number, number][],
    hasBeachRim = false,
  ) => {
    const shape = makeOrganicShape(points);

    if (hasBeachRim) {
      const rimGeo = trackGeo(new THREE.ShapeGeometry(shape, 36));
      rimGeo.rotateX(-Math.PI / 2);
      const rim = new THREE.Mesh(rimGeo, sandBeachMat);
      rim.scale.set(1.14, 1, 1.14);
      rim.position.set(cx, 0.23, cz);
      rim.receiveShadow = true;
      root.add(rim);
    }

    const basinGeo = trackGeo(new THREE.ShapeGeometry(shape, 36));
    basinGeo.rotateX(-Math.PI / 2);
    const basin = new THREE.Mesh(basinGeo, poolTileMat);
    basin.position.set(cx, 0.25, cz);
    root.add(basin);

    const waterGeo = trackGeo(new THREE.ShapeGeometry(shape, 36));
    waterGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.scale.set(0.97, 1, 0.97);
    water.position.set(cx, 0.31, cz);
    root.add(water);
  };

  // Helper for 3D Basketball Court with Hoops
  const addBasketballCourt = (
    x: number,
    z: number,
    w: number,
    d: number,
    variant: 'S' | 'C',
  ) => {
    const courtMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: variant === 'S' ? bballSTex : bballCTex,
        roughness: 0.72,
      }),
    );
    const court = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w, 0.08, d)),
      courtMat,
    );
    court.position.set(x, 0.23, z);
    court.receiveShadow = true;
    root.add(court);

    // 2 Basketball hoops
    const poleMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.6, roughness: 0.35 }),
    );
    const boardMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.2, metalness: 0.1 }),
    );
    const rimMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xea580c, metalness: 0.5, roughness: 0.3 }),
    );

    [-1, 1].forEach((side) => {
      const hoopGroup = new THREE.Group();
      hoopGroup.position.set(x + side * (w * 0.5 - 0.8), 0.27, z);

      const post = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.09, 0.11, 3.3, 8)),
        poleMat,
      );
      post.position.y = 1.65;
      post.castShadow = true;
      hoopGroup.add(post);

      const arm = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.9, 0.1, 0.1)),
        poleMat,
      );
      arm.position.set(-side * 0.45, 3.05, 0);
      hoopGroup.add(arm);

      const board = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.08, 1.05, 1.65)),
        boardMat,
      );
      board.position.set(-side * 0.9, 3.25, 0);
      board.castShadow = true;
      hoopGroup.add(board);

      const rim = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.24, 0.025, 8, 16)),
        rimMat,
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(-side * 1.18, 2.95, 0);
      hoopGroup.add(rim);

      root.add(hoopGroup);
    });
  };

  // Helper for Tennis/Pickleball Court with 3D Net
  const addTennisCourt = (x: number, z: number, w: number, d: number) => {
    const mat = trackMat(
      new THREE.MeshStandardMaterial({
        map: tennisTex,
        roughness: 0.72,
      }),
    );
    const court = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w, 0.08, d)),
      mat,
    );
    court.position.set(x, 0.23, z);
    court.receiveShadow = true;
    root.add(court);

    // 3D Net + Posts
    const netMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe5e7eb,
        roughness: 0.6,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      }),
    );
    const netMesh = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(w * 0.76, 0.95)),
      netMat,
    );
    netMesh.position.set(x, 0.74, z);
    root.add(netMesh);

    const tape = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w * 0.76, 0.08, 0.06)),
      roadLineMat,
    );
    tape.position.set(x, 1.22, z);
    root.add(tape);
  };

  // Helper for Gazebo / Garden Pavilion (composite 3-part: floor + columns + roof)
  const addPavilion = (
    x: number,
    z: number,
    radius = 3.4,
    roofColor = 0x3b332d,
    isOval = false,
  ) => {
    const pGroup = new THREE.Group();
    pGroup.position.set(x, 0.22, z);

    const floorGeo = trackGeo(new THREE.CylinderGeometry(radius, radius * 1.05, 0.2, 20));
    const floor = new THREE.Mesh(floorGeo, stoneMat);
    floor.position.y = 0.1;
    floor.receiveShadow = true;
    pGroup.add(floor);

    const colMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: isOval ? 0xf1efe9 : 0x5c4738,
        roughness: 0.6,
      }),
    );
    const cols = 6;
    for (let i = 0; i < cols; i++) {
      const ang = (i / cols) * Math.PI * 2;
      const col = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.14, 0.16, 3.2, 8)),
        colMat,
      );
      col.position.set(
        Math.cos(ang) * (radius * 0.78),
        1.7,
        Math.sin(ang) * (radius * 0.78),
      );
      col.castShadow = true;
      pGroup.add(col);
    }

    const roofMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: roofColor,
        roughness: 0.75,
        metalness: 0.1,
      }),
    );
    const roof = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(radius * 1.22, 1.6, isOval ? 24 : 6)),
      roofMat,
    );
    roof.position.y = 4.0;
    roof.castShadow = true;
    if (isOval) roof.scale.set(1.5, 0.75, 0.95);
    pGroup.add(roof);

    if (isOval) {
      floor.scale.set(1.5, 1, 0.95);
    }
    root.add(pGroup);
  };

  // Helper for colorful playground pad
  const addPlaygroundZone = (
    x: number,
    z: number,
    r: number,
    colorHex: number,
  ) => {
    const padMat = trackMat(
      new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8 }),
    );
    const pad = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(r, r, 0.08, 24)),
      padMat,
    );
    pad.position.set(x, 0.22, z);
    pad.receiveShadow = true;
    root.add(pad);

    // Colorful climbing mound & slide sculpture
    const moundMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 }),
    );
    const mound = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(r * 0.28, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)),
      moundMat,
    );
    mound.position.set(x - r * 0.2, 0.25, z);
    mound.castShadow = true;
    root.add(mound);
  };

  // =========================================================================
  // 3. ZONE S LANDSCAPE (x ∈ [-198, -74])
  // =========================================================================
  // Courtyard walkways & tower plazas
  addPlaza(-136, -34, 72, 16, stoneMat, 0.2);
  addCurvedPath(
    [
      [-174, -22],
      [-156, -32],
      [-136, -38],
      [-110, -28],
      [-98, -14],
    ],
    3.6,
  );
  // Zone S Basketball Court & 2 Mini Courts
  addBasketballCourt(-142, -25, 22, 12, 'S');
  addTennisCourt(-115, -24, 9, 13);
  // Zone S Resort Swimming Pool + Wood Deck + Splash Lagoon
  addPlaza(-138, -2, 56, 20, woodMat, 0.22);
  addRectPool(-132, -2, 34, 10);
  addOrganicLagoon(-158, -1, [
    [-11, -5],
    [0, -7],
    [10, -3],
    [8, 6],
    [-4, 7],
    [-12, 3],
  ]);
  // Pocket playgrounds NW & NE of Zone S
  addPlaygroundZone(-181, -58, 7.5, 0xc97b59);
  addPlaza(-95, -56, 18, 13, sandBeachMat, 0.21);

  // Zone S Lower: Huge Manicured Event Lawn + Curved Amphitheater Bleachers
  const eventLawnMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x62963e, roughness: 0.9 }),
  );
  addPlaza(-133, 34, 100, 32, eventLawnMat, 0.21);
  // 4-tier stepped curved stone amphitheater along west edge of Event Lawn
  for (let tier = 0; tier < 4; tier++) {
    const step = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.4, 0.42 * (4 - tier), 28 - tier * 1.5)),
      stoneMat,
    );
    step.position.set(-188 + tier * 1.4, 0.2 + 0.21 * (4 - tier), 34);
    step.castShadow = true;
    step.receiveShadow = true;
    root.add(step);
  }
  // Zone S Lower Lagoon Pool + Winding Playground Walkways
  addOrganicLagoon(
    -168,
    63,
    [
      [-18, -5],
      [-4, -8],
      [14, -5],
      [18, 3],
      [4, 8],
      [-14, 6],
    ],
    true,
  );
  addCurvedPath(
    [
      [-145, 64],
      [-128, 57],
      [-110, 66],
      [-90, 58],
    ],
    3.2,
  );
  addPlaygroundZone(-124, 63, 7, 0xd48ca3);
  addPlaygroundZone(-102, 62, 6, 0x56a3a6);

  // =========================================================================
  // 4. ZONE C LANDSCAPE (x ∈ [-60, +60])
  // =========================================================================
  // C Courtyard: Pickleball courts + circular plaza + Navy Basketball Court
  addTennisCourt(-45, -31, 8.5, 13);
  addTennisCourt(-35, -31, 8.5, 13);
  addPlaza(-22, -26, 10, 10, stoneMat, 0.22);
  addBasketballCourt(-35, -8, 22, 12, 'C');

  // C Signature Stepped Linear Infinity Pool + Timber Bridges
  addPlaza(16, -28, 52, 18, woodMat, 0.22);
  addRectPool(14, -27, 42, 9.5);
  // 2 Timber pedestrian bridges crossing the C Infinity Pool
  addPlaza(6, -27, 2.8, 11.5, woodMat, 0.36);
  addPlaza(22, -27, 2.8, 11.5, woodMat, 0.36);
  addPavilion(38, -28, 3.2, 0x4b5563);

  // East colorful kids playground beside C2
  addPlaygroundZone(38, 1, 8.5, 0xd4a45a);
  addCurvedPath(
    [
      [-46, -44],
      [-12, -38],
      [16, -40],
      [44, -44],
    ],
    3.2,
  );

  // Zone C Lower: CENTRAL TRINITY PARK
  // Hero organic resort lagoon with sandy beach entry & crossing bridge
  addOrganicLagoon(
    -3,
    40,
    [
      [-23, -4],
      [-10, -13],
      [6, -9],
      [22, -11],
      [25, 2],
      [10, 11],
      [-8, 9],
      [-22, 8],
    ],
    true,
  );
  // Arched wood bridge over lagoon
  addPlaza(-1, 40, 2.6, 18, woodMat, 0.42, 0.25);
  // Iconic white oval architectural pavilion beside Central Lagoon
  addPavilion(11, 53, 3.8, 0xf3f4f6, true);
  // Dual circular colorful splash/play pads on east side of Central Park
  addPlaygroundZone(33, 42, 7.2, 0xdfc15a);
  addPlaygroundZone(47, 45, 5.5, 0x4eb8c7);
  // Garden gazebos along south border
  addPavilion(-25, 65, 2.8, 0x3b332d);
  addPavilion(25, 65, 2.8, 0x3b332d);
  addPavilion(40, 65, 2.8, 0x3b332d);
  // Winding Central Park stone promenade
  addCurvedPath(
    [
      [-52, 24],
      [-30, 34],
      [-18, 56],
      [12, 62],
      [48, 54],
      [52, 28],
    ],
    3.4,
  );

  // =========================================================================
  // 5. ZONE N LANDSCAPE (x ∈ [+74, +198])
  // =========================================================================
  // NW circular fountain plaza
  addPlaza(92, -57, 13, 13, stoneMat, 0.21);
  addRectPool(92, -57, 6, 6);

  // N Courtyard Multi-Level Tropical Resort Pool & Lazy River
  addPlaza(134, -22, 46, 18, woodMat, 0.22);
  addRectPool(132, -23, 34, 9);
  addOrganicLagoon(
    148,
    -3,
    [
      [-18, -6],
      [0, -9],
      [16, -4],
      [14, 8],
      [-2, 10],
      [-16, 5],
    ],
    false,
  );
  // Bridge across N pool
  addPlaza(148, -4, 16, 2.4, woodMat, 0.36, -0.2);
  addPlaygroundZone(112, -1, 7.5, 0x62a8ac);
  addCurvedPath(
    [
      [98, -32],
      [118, -38],
      [144, -36],
      [172, -26],
    ],
    3.2,
  );

  // Zone N Lower: 9 TENNIS / PICKLEBALL COURTS (4 pairs + 1 single on East!)
  const courtCols = [88, 112, 136, 160];
  courtCols.forEach((cx) => {
    addTennisCourt(cx, 25.5, 19, 11.5);
    addTennisCourt(cx, 39.5, 19, 11.5);
  });
  // 9th single court on East side
  addTennisCourt(184, 32.5, 18, 12);

  // Zone N Lower: Zen Waterfront Lagoon Park + Gazebos
  addOrganicLagoon(
    148,
    63,
    [
      [-24, -4],
      [-8, -7],
      [12, -5],
      [24, -2],
      [20, 6],
      [2, 7],
      [-18, 5],
    ],
    true,
  );
  addPavilion(136, 56, 2.8, 0x3b332d);
  addPavilion(156, 56, 2.8, 0x3b332d);
  addCurvedPath(
    [
      [82, 62],
      [104, 56],
      [124, 65],
      [176, 62],
    ],
    3.0,
  );
  addPlaygroundZone(95, 63, 6.5, 0xc78bb2);

  // =========================================================================
  // 6. INSTANCED COMPOSITE TREES, PALMS, PARASOLS & STREETLAMPS
  // =========================================================================
  // A) Broadleaf Shade Trees (3-part composite geometry: trunk + 2 canopy spheres merged?
  // Wait: trunk is brown and canopy is green, so 2 InstancedMeshes sharing transforms!)
  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 7));
  trunkGeo.translate(0, 1.2, 0);
  const trunkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x5c4332, roughness: 0.9 }),
  );

  const lobe1 = new THREE.IcosahedronGeometry(1.75, 1);
  lobe1.translate(0, 3.6, 0);
  const lobe2 = new THREE.IcosahedronGeometry(1.25, 1);
  lobe2.translate(0.95, 3.1, 0.45);
  const lobe3 = new THREE.IcosahedronGeometry(1.15, 1);
  lobe3.translate(-0.85, 3.25, -0.5);
  const canopyGeo = trackGeo(
    mergeGeometries([lobe1, lobe2, lobe3], false)!,
  );
  lobe1.dispose();
  lobe2.dispose();
  lobe3.dispose();

  const canopyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff, // tinted per-instance via setColorAt
      roughness: 0.82,
      metalness: 0.0,
    }),
  );

  const treeCoords: [number, number, number][] = [];
  // Boulevard & avenue street trees
  for (let x = -200; x <= 200; x += 13) {
    if (Math.abs(x - -67) > 8 && Math.abs(x - 67) > 8) {
      treeCoords.push([x, -79, 1.0]); // North median
      treeCoords.push([x, -68.5, 0.95]);
      treeCoords.push([x, 77.5, 0.9]);
    }
  }
  avenueXs.forEach((ax) => {
    for (let z = -64; z <= 72; z += 14) {
      if (Math.abs(z - 12) > 5) {
        treeCoords.push([ax - 7.8, z, 0.9]);
        treeCoords.push([ax + 7.8, z, 0.9]);
      }
    }
  });
  // Courtyard & Park tree clusters
  const parkClusterSeeds: [number, number][] = [
    // Zone S
    [-190, -64], [-172, -62], [-164, -44], [-112, -56], [-100, -64],
    [-186, -42], [-86, -42], [-172, 6], [-118, 6], [-84, 6],
    [-190, 22], [-190, 48], [-82, 22], [-82, 48], [-146, 56], [-116, 70], [-92, 68],
    // Zone C
    [-54, -64], [-52, -42], [-8, -56], [8, -56], [52, -64], [52, -42],
    [-54, 4], [-22, 6], [28, -14], [50, -14], [52, 6],
    [-52, 22], [-44, 38], [-48, 56], [-34, 68], [-12, 68], [16, 68], [46, 68],
    [52, 24], [24, 24], [-28, 22],
    // Zone N
    [82, -64], [104, -64], [168, -64], [190, -64], [104, -40], [168, -40],
    [82, 5], [126, 6], [166, 6], [190, 5],
    [82, 54], [110, 54], [124, 70], [168, 70], [190, 56], [190, 70],
  ];
  parkClusterSeeds.forEach(([tx, tz], idx) => {
    const jitterX = ((idx * 37) % 7) - 3;
    const jitterZ = ((idx * 53) % 7) - 3;
    treeCoords.push([tx + jitterX, tz + jitterZ, 1.05]);
    treeCoords.push([tx - jitterZ * 0.8 + 3.5, tz + jitterX * 0.8 + 2.5, 0.82]);
  });

  const trunkInst = new THREE.InstancedMesh(
    trunkGeo,
    trunkMat,
    treeCoords.length,
  );
  const canopyInst = new THREE.InstancedMesh(
    canopyGeo,
    canopyMat,
    treeCoords.length,
  );
  trunkInst.castShadow = !isSoftwareGl;
  canopyInst.castShadow = !isSoftwareGl;
  canopyInst.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const greenPalette = [0x4c7c34, 0x578c3d, 0x649946, 0x3f6e2d, 0x6da14f];

  treeCoords.forEach(([x, z, baseScale], i) => {
    const s = baseScale * (0.86 + ((i * 19) % 10) * 0.032);
    dummy.position.set(x, 0.18, z);
    dummy.rotation.set(0, (i * 1.37) % (Math.PI * 2), 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);
    canopyInst.setMatrixAt(i, dummy.matrix);

    color.setHex(greenPalette[i % greenPalette.length]);
    canopyInst.setColorAt(i, color);
  });
  trunkInst.instanceMatrix.needsUpdate = true;
  canopyInst.instanceMatrix.needsUpdate = true;
  if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  canopyInst.computeBoundingSphere();
  root.add(trunkInst, canopyInst);

  // B) Poolside Tropical Palms
  const palmPositions: [number, number][] = [
    [-162, -10], [-152, -10], [-126, -10], [-116, -10],
    [-162, 6], [-120, 6], [-178, 56], [-156, 56],
    [0, -37], [14, -37], [28, -37], [2, -19], [26, -19],
    [-18, 28], [-2, 26], [16, 28], [-16, 52], [4, 54],
    [120, -31], [144, -31], [158, -14], [134, 8], [160, 8],
    [130, 56], [166, 58],
  ];
  const palmTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.12, 0.22, 4.6, 6));
  palmTrunkGeo.translate(0, 2.3, 0);
  const frondGeos: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 6; f++) {
    const frond = new THREE.ConeGeometry(0.55, 2.6, 4);
    frond.rotateZ(Math.PI * 0.62);
    frond.translate(1.1, 4.7, 0);
    frond.rotateY((f / 6) * Math.PI * 2);
    frondGeos.push(frond);
  }
  const palmCrownGeo = trackGeo(mergeGeometries(frondGeos, false)!);
  frondGeos.forEach((g) => g.dispose());
  const palmCrownMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x5c963e, roughness: 0.75 }),
  );

  const palmTrunkInst = new THREE.InstancedMesh(
    palmTrunkGeo,
    trunkMat,
    palmPositions.length,
  );
  const palmCrownInst = new THREE.InstancedMesh(
    palmCrownGeo,
    palmCrownMat,
    palmPositions.length,
  );
  palmPositions.forEach(([px, pz], i) => {
    const s = 0.88 + (i % 4) * 0.1;
    dummy.position.set(px, 0.2, pz);
    dummy.rotation.set(0.05, i * 0.9, 0.04);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    palmTrunkInst.setMatrixAt(i, dummy.matrix);
    palmCrownInst.setMatrixAt(i, dummy.matrix);
  });
  palmTrunkInst.computeBoundingSphere();
  palmCrownInst.computeBoundingSphere();
  root.add(palmTrunkInst, palmCrownInst);

  // C) Poolside White Umbrellas / Parasols
  const parasolPositions: [number, number][] = [
    [-152, -7], [-142, -7], [-130, -7], [-120, -7],
    [-176, 68], [-168, 69], [-160, 68],
    [4, -34], [14, -34], [24, -34],
    [-18, 49], [-10, 50], [4, 48], [16, 46],
    [126, -29], [136, -29], [146, -11], [154, -10],
  ];
  const poleGeo = trackGeo(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6));
  poleGeo.translate(0, 1.15, 0);
  const canopyParaGeo = trackGeo(new THREE.ConeGeometry(1.45, 0.55, 8));
  canopyParaGeo.translate(0, 2.3, 0);
  const paraPoleMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.5, roughness: 0.4 }),
  );
  const paraTopMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf8f6f0, roughness: 0.7 }),
  );
  const paraPoleInst = new THREE.InstancedMesh(
    poleGeo,
    paraPoleMat,
    parasolPositions.length,
  );
  const paraTopInst = new THREE.InstancedMesh(
    canopyParaGeo,
    paraTopMat,
    parasolPositions.length,
  );
  parasolPositions.forEach(([ux, uz], i) => {
    dummy.position.set(ux, 0.24, uz);
    dummy.rotation.set(0, i * 0.5, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    paraPoleInst.setMatrixAt(i, dummy.matrix);
    paraTopInst.setMatrixAt(i, dummy.matrix);
  });
  paraPoleInst.computeBoundingSphere();
  paraTopInst.computeBoundingSphere();
  root.add(paraPoleInst, paraTopInst);

  // D) Streetlamps (emissive glow controlled by TimeOfDay)
  const lampCoords: [number, number][] = [];
  for (let x = -195; x <= 195; x += 26) {
    lampCoords.push([x, -79]);
    lampCoords.push([x, 12]);
  }
  avenueXs.forEach((ax) => {
    for (let z = -56; z <= 64; z += 30) {
      lampCoords.push([ax + 7.2, z]);
    }
  });
  const lampPostGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.12, 4.8, 6));
  lampPostGeo.translate(0, 2.4, 0);
  const lampBulbGeo = trackGeo(new THREE.SphereGeometry(0.24, 8, 8));
  lampBulbGeo.translate(0, 4.9, 0);

  const lampPostMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x2a2f36, metalness: 0.6, roughness: 0.4 }),
  );
  const lampEmissiveMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff3d6,
      emissive: new THREE.Color(0xffc978),
      emissiveIntensity: 0.15,
      roughness: 0.3,
    }),
  );

  const lampPostInst = new THREE.InstancedMesh(
    lampPostGeo,
    lampPostMat,
    lampCoords.length,
  );
  const lampBulbInst = new THREE.InstancedMesh(
    lampBulbGeo,
    lampEmissiveMat,
    lampCoords.length,
  );
  lampCoords.forEach(([lx, lz], i) => {
    dummy.position.set(lx, 0.15, lz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lampPostInst.setMatrixAt(i, dummy.matrix);
    lampBulbInst.setMatrixAt(i, dummy.matrix);
  });
  lampPostInst.computeBoundingSphere();
  lampBulbInst.computeBoundingSphere();
  root.add(lampPostInst, lampBulbInst);

  // =========================================================================
  // 7. ANIMATED COMPOSITE VEHICLES ON BOULEVARD & AVENUES
  // =========================================================================
  const cars: AnimatedCar[] = [];
  const carColors = [0xe2e8f0, 0x334155, 0x991b1b, 0x1e3a5f, 0xb45309, 0xf8fafc];
  const carBodyGeo = trackGeo(new THREE.BoxGeometry(3.9, 0.72, 1.75));
  const carCabinGeo = trackGeo(new THREE.BoxGeometry(2.1, 0.58, 1.5));
  const carWheelGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10));
  carWheelGeo.rotateX(Math.PI / 2);

  const carDarkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 }),
  );
  const carHeadlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0xfff5cc),
      emissiveIntensity: 0.4,
    }),
  );
  const carHeadlightGeo = trackGeo(new THREE.BoxGeometry(0.1, 0.2, 0.35));

  const spawnCar = (
    axis: 'x' | 'z',
    lanePos: number,
    startPos: number,
    minLimit: number,
    maxLimit: number,
    speed: number,
    dir: 1 | -1,
    colorIdx: number,
  ) => {
    const cg = new THREE.Group();
    const paintMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: carColors[colorIdx % carColors.length],
        metalness: 0.45,
        roughness: 0.3,
      }),
    );

    const body = new THREE.Mesh(carBodyGeo, paintMat);
    body.position.y = 0.56;
    cg.add(body);

    const cabin = new THREE.Mesh(carCabinGeo, carDarkMat);
    cabin.position.set(-0.2, 1.15, 0);
    cg.add(cabin);

    // 4 wheels
    [
      [1.2, 0.32, 0.85],
      [1.2, 0.32, -0.85],
      [-1.2, 0.32, 0.85],
      [-1.2, 0.32, -0.85],
    ].forEach(([wx, wy, wz]) => {
      const w = new THREE.Mesh(carWheelGeo, carDarkMat);
      w.position.set(wx, wy, wz);
      cg.add(w);
    });

    // Headlights
    [-0.55, 0.55].forEach((lz) => {
      const hl = new THREE.Mesh(carHeadlightGeo, carHeadlightMat);
      hl.position.set(1.96, 0.6, lz);
      cg.add(hl);
    });

    if (axis === 'x') {
      cg.position.set(startPos, 0.05, lanePos);
      cg.rotation.y = dir === 1 ? 0 : Math.PI;
    } else {
      cg.position.set(lanePos, 0.05, startPos);
      cg.rotation.y = dir === 1 ? -Math.PI / 2 : Math.PI / 2;
    }
    root.add(cg);

    cars.push({ group: cg, axis, lanePos, minLimit, maxLimit, speed, dir });
  };

  // Boulevard cars (Eastbound z=-74.5, Westbound z=-83.5)
  for (let i = 0; i < 8; i++) {
    spawnCar('x', -73.5, -180 + i * 50, -215, 215, 11 + (i % 3) * 2.5, 1, i);
    spawnCar('x', -84.5, -160 + i * 50, -215, 215, 12 + (i % 2) * 3, -1, i + 2);
  }
  // Avenue cars on vertical cross streets
  [-67, 67].forEach((ax, idx) => {
    spawnCar('z', ax - 2.4, -40 + idx * 30, -68, 82, 8.5, 1, idx + 1);
    spawnCar('z', ax + 2.4, 40 - idx * 25, -68, 82, 9.5, -1, idx + 4);
  });

  return {
    group: root,
    waterUniforms,
    lampEmissiveMat,
    carHeadlightMat,
    update: (delta: number, elapsed: number) => {
      waterUniforms.uTime.value = elapsed;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (c.axis === 'x') {
          c.group.position.x += c.speed * c.dir * delta;
          if (c.dir === 1 && c.group.position.x > c.maxLimit) {
            c.group.position.x = c.minLimit;
          } else if (c.dir === -1 && c.group.position.x < c.minLimit) {
            c.group.position.x = c.maxLimit;
          }
        } else {
          c.group.position.z += c.speed * c.dir * delta;
          if (c.dir === 1 && c.group.position.z > c.maxLimit) {
            c.group.position.z = c.minLimit;
          } else if (c.dir === -1 && c.group.position.z < c.minLimit) {
            c.group.position.z = c.maxLimit;
          }
        }
      }
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
