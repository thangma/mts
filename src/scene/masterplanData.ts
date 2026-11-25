export type ZoneId = 'S' | 'C' | 'N';

export type TowerFootprintType =
  | 'stepped_left_north'
  | 'stepped_right_north'
  | 'boomerang_west'
  | 'boomerang_east';

export interface TowerSpec {
  id: string;
  zone: ZoneId;
  x: number;
  z: number;
  footprint: TowerFootprintType;
  floors: number;
  podiumHeight: number;
  floorHeight: number;
  crownHeight: number;
}

export interface CameraPreset {
  id: string;
  label: string;
  position: [number, number, number];
  yaw: number;   // radians around Y (0 looks toward -Z North)
  pitch: number; // radians around X (negative looks down)
}

export type TimeOfDay = 'day' | 'sunset' | 'night';

// Site layout dimensions in meters (1 unit = 1 meter), calibrated to 1699x300 & 1775x592 masterplan images
// X: West (-278) to East (+278) => 556m total width (3 blocks of ~168m + 4 avenues)
// Z: North (-98) to South (+94) => 192m total depth
export const SITE_BOUNDS = {
  minX: -278,
  maxX: 278,
  minZ: -98,
  maxZ: 94,
};

export const ZONES = {
  S: { minX: -261, maxX: -93, centerX: -177 },
  C: { minX: -82, maxX: 82, centerX: 0 },
  N: { minX: 93, maxX: 261, centerX: 177 },
};

// Exact 9 towers positioned to match pixel-measured masterplan proportions
export const TOWERS: TowerSpec[] = [
  // Zone S (x in [-261, -93], center -177)
  {
    id: 'S3',
    zone: 'S',
    x: -181.5,
    z: -55.5,
    footprint: 'stepped_left_north',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },
  {
    id: 'S2',
    zone: 'S',
    x: -244,
    z: -12,
    footprint: 'boomerang_west',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },
  {
    id: 'S1',
    zone: 'S',
    x: -107,
    z: -12,
    footprint: 'boomerang_east',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },

  // Zone C (x in [-82, +82], center 0) — 48m wide open plaza between C3 & C1, C2 centered below
  {
    id: 'C3',
    zone: 'C',
    x: -50,
    z: -56,
    footprint: 'stepped_left_north',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },
  {
    id: 'C1',
    zone: 'C',
    x: 52,
    z: -56,
    footprint: 'stepped_right_north',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },
  {
    id: 'C2',
    zone: 'C',
    x: 2,
    z: 1.5,
    footprint: 'stepped_right_north',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },

  // Zone N (x in [+93, +261], center +177)
  {
    id: 'N3',
    zone: 'N',
    x: 180,
    z: -55.5,
    footprint: 'stepped_right_north',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },
  {
    id: 'N2',
    zone: 'N',
    x: 107,
    z: -12,
    footprint: 'boomerang_west',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },
  {
    id: 'N1',
    zone: 'N',
    x: 244,
    z: -12,
    footprint: 'boomerang_east',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },
];

// Returns 2D footprint polygon points in (x, y) where +y = North (-Z in Three.js)
export function getTowerFootprintPoints(type: TowerFootprintType): [number, number][] {
  if (type === 'stepped_left_north') {
    return [
      [-27, 9.2],
      [1.5, 9.2],
      [1.5, 4.4],
      [27, 4.4],
      [27, -9.2],
      [-1.5, -9.2],
      [-1.5, -4.4],
      [-27, -4.4],
    ];
  }

  if (type === 'stepped_right_north') {
    return [
      [-27, 4.4],
      [-1.5, 4.4],
      [-1.5, 9.2],
      [27, 9.2],
      [27, -4.4],
      [1.5, -4.4],
      [1.5, -9.2],
      [-27, -9.2],
    ];
  }

  // Boomerang West (S2, N2): vertical lower wing + ~35deg NE upper wing
  const westPoints: [number, number][] = [
    [-7.2, -23.5],
    [6.8, -23.5],
    [6.8, -6.2],
    [22.4, 4.7],
    [14.4, 16.2],
    [-7.2, 1.1],
  ];

  if (type === 'boomerang_west') {
    return westPoints;
  }

  // Boomerang East (S1, N1): horizontal mirror of Boomerang West
  return westPoints.map(([px, py]) => [-px, py] as [number, number]).reverse();
}

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'overview',
    label: 'Toàn cảnh',
    position: [0, 185, 275],
    yaw: 0,
    pitch: -0.56,
  },
  {
    id: 'zone_s',
    label: 'Phân khu S',
    position: [-177, 74, 92],
    yaw: 0,
    pitch: -0.45,
  },
  {
    id: 'zone_c',
    label: 'Phân khu C',
    position: [0, 72, 132],
    yaw: 0,
    pitch: -0.42,
  },
  {
    id: 'zone_n',
    label: 'Phân khu N',
    position: [177, 74, 122],
    yaw: 0,
    pitch: -0.45,
  },
  {
    id: 'park_walk',
    label: 'Dạo công viên',
    position: [-26, 2.2, 72],
    yaw: -0.32,
    pitch: 0.04,
  },
];

export function detectZoneName(x: number, z: number): string {
  if (z < -70) return 'Đại Lộ Bắc';
  if (x < -88) {
    return z > 20 ? 'Công Viên & Bãi Cỏ Khu S' : 'Nội Khu S (S1–S3)';
  }
  if (x > 88) {
    return z > 20 ? 'Tổ Hợp Tennis & Hồ Khu N' : 'Nội Khu N (N1–N3)';
  }
  return z > 20 ? 'Công Viên Trung Tâm (Khu C)' : 'Nội Khu C (C1–C3)';
}
