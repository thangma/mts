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
      color: 0xe4d4b7,
      roughness: 0.82,
      metalness: 0.02,
    }),
  );
  const hedgeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3f6b32,
      roughness: 0.9,
      metalness: 0.0,
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
    trackGeo(new THREE.PlaneGeometry(2200, 2200)),
    outerGroundMat,
  );
  horizonGround.rotation.x = -Math.PI / 2;
  horizonGround.position.y = -0.05;
  horizonGround.receiveShadow = true;
  root.add(horizonGround);

  // Site Asphalt Base Slab (576m x 202m, covering X in [-288, +288], Z in [-103, +99])
  const siteAsphalt = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(576, 0.1, 202)),
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
    [-360, -40, 56, 14, 68],
    [-365, 50, 58, 16, 54],
    [360, -35, 56, 14, 66],
    [365, 45, 58, 18, 52],
    [-190, -160, 115, 14, 36],
    [0, -162, 130, 18, 36],
    [190, -160, 115, 14, 36],
    [-190, 160, 110, 12, 34],
    [0, 162, 125, 12, 34],
    [190, 160, 110, 12, 34],
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

  // North Boulevard dashed center markings (top carriageways z=-87 & z=-76)
  for (let x = -270; x <= 270; x += 13) {
    addRoadStripe(x, -87, 5.4, 0.25);
    addRoadStripe(x, -76, 5.4, 0.25);
  }
  // North Boulevard center median island
  const median = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(556, 0.22, 3.2)),
    lawnMat,
  );
  median.position.set(0, 0.11, -81.5);
  median.receiveShadow = true;
  root.add(median);

  // Internal East-West street center markings (z = 21)
  for (let x = -260; x <= 260; x += 12) {
    if (
      Math.abs(x - -87.5) > 7 &&
      Math.abs(x - 87.5) > 7 &&
      Math.abs(x - -268) > 7 &&
      Math.abs(x - 268) > 7
    ) {
      addRoadStripe(x, 21, 4.6, 0.22);
    }
  }

  // Vertical avenue center markings
  const avenueXs = [-268, -87.5, 87.5, 268];
  avenueXs.forEach((ax) => {
    for (let z = -66; z <= 88; z += 10) {
      if (Math.abs(z - 21) > 4.5) {
        addRoadStripe(ax, z, 0.25, 4.8);
      }
    }
    // Crosswalks at North Boulevard & internal road
    for (let dx = -4.5; dx <= 4.5; dx += 1.5) {
      addRoadStripe(ax + dx, -70, 0.7, 2.6);
      addRoadStripe(ax + dx, 21, 0.7, 2.4);
    }
  });

  // --- 2. Raised Masterplan Blocks (Zones S, C, N — Upper & Lower) ---
  // Exact 1:1 proportions from masterplanData.ts:
  // S: x in [-261, -93] (w 168), C: x in [-82, +82] (w 164), N: x in [+93, +261] (w 168)
  // Upper: z in [-69, +17.5] (d 86.5), Lower: z in [+24.5, +88] (d 63.5)
  const blockDefs = [
    { x: -177, z: -25.75, w: 168, d: 86.5 }, // Zone S upper
    { x: 0, z: -25.75, w: 164, d: 86.5 },    // Zone C upper
    { x: 177, z: -25.75, w: 168, d: 86.5 },  // Zone N upper
    { x: -177, z: 56.25, w: 168, d: 63.5 },  // Zone S lower
    { x: 0, z: 56.25, w: 164, d: 63.5 },     // Zone C lower
    { x: 177, z: 56.25, w: 168, d: 63.5 },   // Zone N lower
  ];

  blockDefs.forEach((b) => {
    // Stone perimeter curb/sidewalk apron
    const curb = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(b.w + 2.6, 0.16, b.d + 2.6)),
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

  // Helper to add low trimmed hedge borders
  const addHedge = (x: number, z: number, w: number, d: number, h = 0.65) => {
    const m = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w, h, d)),
      hedgeMat,
    );
    m.position.set(x, 0.2 + h * 0.5, z);
    m.castShadow = !isSoftwareGl;
    m.receiveShadow = true;
    root.add(m);
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
    const steps = 44;
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
      rim.scale.set(1.15, 1, 1.15);
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
  const addTennisCourt = (
    x: number,
    z: number,
    w: number,
    d: number,
    rotY = 0,
  ) => {
    const cGroup = new THREE.Group();
    cGroup.position.set(x, 0.23, z);
    cGroup.rotation.y = rotY;

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
    court.receiveShadow = true;
    cGroup.add(court);

    // 3D Net + Tape
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
      trackGeo(new THREE.PlaneGeometry(0.95, d * 0.76)),
      netMat,
    );
    netMesh.rotation.y = Math.PI / 2;
    netMesh.rotation.z = Math.PI / 2;
    netMesh.position.y = 0.51;
    cGroup.add(netMesh);

    const tape = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.06, 0.08, d * 0.76)),
      roadLineMat,
    );
    tape.position.y = 0.99;
    cGroup.add(tape);

    root.add(cGroup);
  };

  // Helper for Gazebo / Garden Pavilion (composite 3-part: floor + columns + roof)
  const addPavilion = (
    x: number,
    z: number,
    radius = 3.2,
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
        trackGeo(new THREE.CylinderGeometry(0.13, 0.15, 3.0, 8)),
        colMat,
      );
      col.position.set(
        Math.cos(ang) * (radius * 0.78),
        1.6,
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
      trackGeo(new THREE.ConeGeometry(radius * 1.22, 1.5, isOval ? 24 : 6)),
      roofMat,
    );
    roof.position.y = 3.8;
    roof.castShadow = true;
    if (isOval) roof.scale.set(1.5, 0.75, 0.95);
    pGroup.add(roof);

    if (isOval) {
      floor.scale.set(1.5, 1, 0.95);
    }
    root.add(pGroup);
  };

  // Helper for rectangular shaded cabana (wood base + 4 posts + flat/hipped canopy)
  const addCabana = (x: number, z: number, w = 3.2, d = 3.6, roofColor = 0x3b332d) => {
    const cg = new THREE.Group();
    cg.position.set(x, 0.25, z);
    const base = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 0.18, d)), woodMat);
    base.position.y = 0.09;
    cg.add(base);

    const postMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x4b382d, roughness: 0.6 }));
    [
      [-w * 0.42, -d * 0.42],
      [w * 0.42, -d * 0.42],
      [-w * 0.42, d * 0.42],
      [w * 0.42, d * 0.42],
    ].forEach(([px, pz]) => {
      const p = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 2.6, 0.14)), postMat);
      p.position.set(px, 1.4, pz);
      cg.add(p);
    });

    const roofMat = trackMat(new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.7 }));
    const roof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.5, 0.28, d + 0.5)), roofMat);
    roof.position.y = 2.8;
    roof.castShadow = true;
    cg.add(roof);
    root.add(cg);
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
  // 3. ZONE S LANDSCAPE (x ∈ [-261, -93], center -177)
  // =========================================================================
  // Internal drop-off drive & roundabout around S2 & S3 (NW entrance + under S3)
  addCurvedPath(
    [
      [-218, -69],
      [-218, -50],
      [-224, -43],
      [-202, -41.5],
      [-150, -41.5],
      [-142, -52],
      [-142, -69],
    ],
    5.0,
    asphaltMat,
    0.19,
  );
  addCurvedPath(
    [
      [-224, -43],
      [-216, -34],
      [-216, -24],
    ],
    4.2,
    asphaltMat,
    0.19,
  );

  // NW Adventure Playground (x = -242, z = -56)
  addPlaygroundZone(-245, -56, 6.2, 0xc96f55);
  addPlaygroundZone(-236, -54, 4.4, 0x4ca3a8);
  addCurvedPath(
    [
      [-254, -52],
      [-245, -60],
      [-234, -55],
      [-226, -58],
    ],
    2.4,
    sandBeachMat,
    0.22,
  );

  // NE Sandy Garden Plaza (x = -119, z = -55)
  const neSandShape = makeOrganicShape([
    [-13, -6],
    [0, -8],
    [13, -4],
    [10, 7],
    [-4, 8],
    [-12, 3],
  ]);
  const neSandGeo = trackGeo(new THREE.ShapeGeometry(neSandShape, 32));
  neSandGeo.rotateX(-Math.PI / 2);
  const neSandMesh = new THREE.Mesh(neSandGeo, sandBeachMat);
  neSandMesh.position.set(-119, 0.22, -55);
  neSandMesh.receiveShadow = true;
  root.add(neSandMesh);

  // Courtyard paths & plaza under S3
  addPlaza(-181.5, -43, 56, 6.5, stoneMat, 0.21);
  addCurvedPath(
    [
      [-216, -24],
      [-194, -22],
      [-168, -28],
      [-148, -22],
      [-136, -15],
    ],
    3.0,
  );

  // Zone S Terracotta Basketball Court (x = -194, z = -31)
  addBasketballCourt(-194, -31, 20, 11, 'S');
  addHedge(-194, -24.5, 20, 1.0);

  // 2 Mini Pickleball/Multi Courts (x = -142, z = -34)
  addTennisCourt(-146, -34, 7.2, 10.5);
  addTennisCourt(-137, -34, 7.2, 10.5);

  // Tan/Sand Multi-Use Plaza west of S1 (x = -135, z = -5, clear of S1 slanted wing)
  addPlaza(-135, -5, 18, 12, sandBeachMat, 0.22);

  // 3 Dark-Roofed Garden Cabanas overlooking the pool (z = -15)
  addCabana(-195, -15, 3.4, 3.6);
  addCabana(-180, -15, 3.4, 3.6);
  addCabana(-165, -15, 3.4, 3.6);

  // Zone S Resort Swimming Pool Complex (z = +5)
  addPlaza(-180, 2, 54, 18, woodMat, 0.22);
  addRectPool(-180, 6, 44, 10);
  // Organic West Lounge Lagoon
  addOrganicLagoon(-210, 4, [
    [-14, -5],
    [-2, -7],
    [10, -4],
    [12, 5],
    [-2, 7],
    [-13, 4],
  ]);
  // East Pool Extension + Colorful Kids Splash Pad
  addOrganicLagoon(-150, 5, [
    [-9, -4],
    [2, -6],
    [10, -2],
    [8, 6],
    [-4, 6],
  ]);
  addPlaygroundZone(-130, 10, 5.4, 0xd45b48);
  addPlaygroundZone(-124, 9, 3.6, 0x4ca8b0);

  // Zone S Lower: Large Event Lawn + 4-tier Curved Amphitheater + South Lagoon
  const eventLawnMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x62963e, roughness: 0.9 }),
  );
  addPlaza(-172, 43, 134, 32, eventLawnMat, 0.21);
  // 4-tier stepped amphitheater along west edge of Event Lawn
  for (let tier = 0; tier < 4; tier++) {
    const step = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.5, 0.42 * (4 - tier), 28 - tier * 1.5)),
      stoneMat,
    );
    step.position.set(-246 + tier * 1.5, 0.2 + 0.21 * (4 - tier), 43);
    step.castShadow = true;
    step.receiveShadow = true;
    root.add(step);
  }
  addPlaza(-253, 44, 7, 12, stoneMat, 0.22);

  // South Lagoon Pool with sandy beach rim (x = -222, z = 74)
  addOrganicLagoon(
    -222,
    74,
    [
      [-20, -5],
      [-5, -8],
      [15, -5],
      [20, 3],
      [5, 8],
      [-15, 6],
    ],
    true,
  );
  addCurvedPath(
    [
      [-192, 74],
      [-172, 67],
      [-148, 76],
      [-122, 68],
      [-102, 74],
    ],
    3.2,
  );
  addPlaygroundZone(-168, 73, 7.2, 0xd48ca3);
  addPlaygroundZone(-136, 73, 6.5, 0x56a3a6);
  addPlaygroundZone(-112, 72, 5.5, 0xdfc15a);

  // =========================================================================
  // 4. ZONE C LANDSCAPE (x ∈ [-82, +82], center 0)
  // =========================================================================
  // Internal drop-off drive connecting West Avenue (-82) into courtyard below C3 & above BBall
  addCurvedPath(
    [
      [-82, -16],
      [-52, -16],
      [-22, -16],
      [-18, -28],
      [-18, -42],
    ],
    4.6,
    asphaltMat,
    0.19,
  );
  // Open Central North Promenade between C3 and C1 (x in [-23, +25])
  addCurvedPath(
    [
      [-20, -64],
      [0, -56],
      [20, -64],
    ],
    3.4,
  );
  addPlaza(1, -55, 20, 9, stoneMat, 0.21);

  // West Side: 2 Red/Teal Pickleball Courts + Circular Sandy/Wood Pavilion
  addTennisCourt(-68, -31, 7.5, 11.5);
  addTennisCourt(-59, -31, 7.5, 11.5);
  addPlaza(-41, -29, 13, 13, sandBeachMat, 0.21);
  addPavilion(-41, -29, 3.8, 0x6b4f3b);

  // Dark Navy/Orange Basketball Court (x = -56, z = +1) framed by hedges
  addBasketballCourt(-56, 1, 24, 13, 'C');
  addHedge(-56, -6.5, 24, 1.0);
  addHedge(-56, 8.5, 24, 1.0);

  // Center-East Side: Signature Stepped Linear Infinity Pool + Timber Sky-Bridge + 5 Cabanas
  addPlaza(16, -28, 56, 16, woodMat, 0.22);
  addRectPool(-2, -35, 18, 14);
  addRectPool(18, -27, 46, 9);
  // Straight elevated sky-bridge walkway connecting pool deck south straight to C2
  addPlaza(2, -16, 3.2, 16, stoneMat, 0.36);
  // Row of 5 Poolside Cabanas along south edge of infinity pool
  [6, 12.5, 19, 25.5, 32].forEach((cx) => {
    addCabana(cx, -19, 2.4, 2.8, 0x4b5563);
  });

  // East Side: Rectangular manicured lawn & sandy court + East Kids Adventure Playground
  addPlaza(58, -28, 18, 11, sandBeachMat, 0.21);
  addCurvedPath(
    [
      [44, -44],
      [62, -38],
      [68, -14],
      [54, -4],
    ],
    2.8,
  );
  addPlaygroundZone(46, 3, 7.2, 0xd4a45a);
  addPlaygroundZone(58, 5, 5.8, 0x4ca8b0);
  addPlaygroundZone(66, 0, 4.5, 0xd47b59);

  // Zone C Lower: CENTRAL TRINITY PARK (x ∈ [-82, +82], z ∈ [24.5, 88])
  // Hero organic resort lagoon (~54m x 24m) with sandy beach rim & arched bridge
  addOrganicLagoon(
    -4,
    51,
    [
      [-27, -4],
      [-12, -13],
      [8, -10],
      [25, -12],
      [28, 3],
      [12, 12],
      [-10, 10],
      [-26, 8],
    ],
    true,
  );
  // Arched wood bridge crossing the lagoon
  addPlaza(-2, 51, 2.8, 22, woodMat, 0.42, 0.22);
  // Iconic white oval architectural pavilion beside Central Lagoon
  addPavilion(15, 66, 4.0, 0xf3f4f6, true);
  // Dual circular colorful splash pads on east side of Central Park
  addPlaygroundZone(48, 52, 7.6, 0xdfc15a);
  addPlaygroundZone(64, 56, 6.0, 0x4eb8c7);
  // 4 Garden gazebos along south border
  addPavilion(-36, 79, 2.8, 0x3b332d);
  addPavilion(-10, 79, 2.8, 0x3b332d);
  addPavilion(32, 79, 2.8, 0x3b332d);
  addPavilion(52, 79, 2.8, 0x3b332d);
  // Winding Central Park stone promenade
  addCurvedPath(
    [
      [-72, 32],
      [-46, 42],
      [-28, 68],
      [12, 74],
      [58, 66],
      [72, 34],
    ],
    3.6,
  );

  // =========================================================================
  // 5. ZONE N LANDSCAPE (x ∈ [+93, +261], center +177)
  // =========================================================================
  // Internal drop-off drive between N2 & N3
  addCurvedPath(
    [
      [140, -69],
      [140, -42],
      [178, -42],
      [208, -42],
    ],
    4.6,
    asphaltMat,
    0.19,
  );

  // NW Circular Water/Fountain Plaza (x = +116, z = -56)
  const fountainApron = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(8.5, 8.8, 0.08, 28)),
    stoneMat,
  );
  fountainApron.position.set(116, 0.21, -56);
  fountainApron.receiveShadow = true;
  root.add(fountainApron);
  const fountainWater = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(4.2, 4.2, 0.14, 24)),
    waterMat,
  );
  fountainWater.position.set(116, 0.28, -56);
  root.add(fountainWater);

  // NE Tropical Pocket Park (x = +234, z = -55)
  addCurvedPath(
    [
      [212, -52],
      [228, -58],
      [246, -54],
      [254, -44],
    ],
    2.6,
    sandBeachMat,
    0.22,
  );

  // Multi-Level Resort Pool & Lazy River
  addPlaza(175, -23, 42, 15, woodMat, 0.22);
  addRectPool(175, -22, 32, 9);
  addOrganicLagoon(
    204,
    3,
    [
      [-18, -8],
      [-4, -12],
      [14, -5],
      [13, 8],
      [-4, 11],
      [-17, 6],
    ],
    false,
  );
  // Connecting channel & Timber Bridge across Zone N lagoon
  addOrganicLagoon(191, -11, [
    [-10, -5],
    [4, -6],
    [12, 2],
    [4, 8],
    [-8, 5],
  ]);
  addPlaza(204, -5, 16, 2.6, woodMat, 0.36, -0.22);
  // 3 Poolside Cabanas
  addCabana(168, -7, 3.0, 3.4);
  addCabana(176, -7, 3.0, 3.4);
  addCabana(184, -7, 3.0, 3.4);

  // Lower-Center Sports & Splash Zone (right of N2)
  addTennisCourt(139, -13, 10, 7.2);
  addTennisCourt(139, -4, 10, 7.2);
  addPlaygroundZone(138, 8, 8.0, 0x4ea8b8);
  addPlaygroundZone(155, 5, 5.2, 0xd47b59);
  addCurvedPath(
    [
      [132, -32],
      [158, -36],
      [188, -34],
      [212, -26],
    ],
    3.0,
  );

  // Zone N Lower: 9 TENNIS COURTS (4 pairs at x=112, 144, 176, 208 in rows z=35 & 49 + 9th at x=242, z=42)
  const courtCols = [112, 144, 176, 208];
  courtCols.forEach((cx) => {
    addTennisCourt(cx, 35, 24, 11.5);
    addTennisCourt(cx, 49, 24, 11.5);
  });
  // 9th single court on East side
  addTennisCourt(242, 42, 23, 12);

  // Zone N Lower: South Zen Waterfront Lagoon Park + Gazebos + West Playground
  addOrganicLagoon(
    194,
    74,
    [
      [-26, -4],
      [-8, -7],
      [12, -6],
      [26, -2],
      [22, 6],
      [2, 7],
      [-20, 5],
    ],
    true,
  );
  addPavilion(178, 66, 2.8, 0x3b332d);
  addPavilion(210, 66, 2.8, 0x3b332d);
  addCurvedPath(
    [
      [104, 74],
      [134, 67],
      [162, 76],
      [230, 72],
      [252, 66],
    ],
    3.2,
  );
  addPlaygroundZone(122, 73, 6.8, 0xc78bb2);
  addPlaygroundZone(244, 72, 5.5, 0xd9a85c);

  // =========================================================================
  // 6. INSTANCED COMPOSITE TREES, PALMS, PARASOLS & STREETLAMPS
  // =========================================================================
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
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0.0,
    }),
  );

  const treeCoords: [number, number, number][] = [];
  // Boulevard & south perimeter street trees
  for (let x = -264; x <= 264; x += 14) {
    if (
      Math.abs(x - -87.5) > 8 &&
      Math.abs(x - 87.5) > 8
    ) {
      treeCoords.push([x, -81.5, 1.0]); // North median
      treeCoords.push([x, -68.5, 0.95]);
      treeCoords.push([x, 89.5, 0.92]);
    }
  }
  avenueXs.forEach((ax) => {
    for (let z = -64; z <= 84; z += 14) {
      if (Math.abs(z - 21) > 5) {
        treeCoords.push([ax - 5.2, z, 0.88]);
        treeCoords.push([ax + 5.2, z, 0.88]);
      }
    }
  });
  // Courtyard & Park tree clusters carefully placed clear of towers & courts
  const parkClusterSeeds: [number, number][] = [
    // Zone S
    [-254, -64], [-226, -64], [-152, -62], [-104, -64], [-254, -36],
    [-162, -26], [-126, -24], [-254, 12], [-98, 14], [-254, 30], [-254, 62],
    [-98, 30], [-98, 56], [-194, 66], [-152, 64], [-122, 82],
    // Zone C
    [-76, -38], [-22, -38], [22, -44], [76, -38], [-76, -12],
    [-28, -14], [38, -14], [74, -14], [-74, 12], [74, 12],
    [-74, 30], [-62, 58], [-44, 70], [-20, 74], [24, 76], [68, 72], [74, 30],
    // Zone N
    [100, -64], [134, -64], [218, -64], [254, -64], [150, -34], [218, -34],
    [100, 12], [158, 12], [220, 12], [254, 12],
    [100, 62], [144, 64], [164, 80], [226, 80], [254, 62],
  ];
  parkClusterSeeds.forEach(([tx, tz], idx) => {
    const jitterX = ((idx * 37) % 5) - 2;
    const jitterZ = ((idx * 53) % 5) - 2;
    treeCoords.push([tx + jitterX, tz + jitterZ, 1.05]);
    treeCoords.push([tx - jitterZ * 0.7 + 3.0, tz + jitterX * 0.7 + 2.2, 0.82]);
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
    [-218, -5], [-200, -5], [-164, -5], [-152, -5],
    [-212, 13], [-168, 13], [-234, 64], [-210, 64],
    [-8, -32], [12, -35], [32, -35], [10, -14], [34, -14],
    [-26, 38], [-4, 36], [20, 38], [-22, 62], [6, 62],
    [164, -30], [188, -30], [214, -10], [190, 12], [218, 12],
    [172, 64], [216, 64],
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
    [-200, -2], [-188, -2], [-174, -2], [-162, -2],
    [-232, 78], [-222, 79], [-212, 78],
    [6, -34], [18, -34], [30, -34],
    [-22, 58], [-12, 60], [6, 58], [20, 56],
    [164, -28], [176, -28], [188, -28], [200, -4],
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
  for (let x = -255; x <= 255; x += 30) {
    lampCoords.push([x, -81.5]);
    lampCoords.push([x, 21]);
  }
  avenueXs.forEach((ax) => {
    for (let z = -58; z <= 76; z += 32) {
      lampCoords.push([ax + 5.2, z]);
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

  // Boulevard cars (Eastbound z=-75.5, Westbound z=-87.5)
  for (let i = 0; i < 10; i++) {
    spawnCar('x', -75.5, -250 + i * 54, -275, 275, 11.5 + (i % 3) * 2.5, 1, i);
    spawnCar('x', -87.5, -225 + i * 54, -275, 275, 12.5 + (i % 2) * 3, -1, i + 2);
  }
  // Avenue cars on vertical cross streets (x = -268, -87.5, 87.5, 268)
  avenueXs.forEach((ax, idx) => {
    spawnCar('z', ax - 2.2, -50 + idx * 24, -70, 92, 8.5, 1, idx + 1);
    spawnCar('z', ax + 2.2, 50 - idx * 22, -70, 92, 9.5, -1, idx + 4);
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
