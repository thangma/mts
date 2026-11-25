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

// Site layout dimensions in meters (1 unit = 1 meter)
// X: West (-215) to East (+215) => 430m
// Z: North (-92) to South (+88) => 180m
export const SITE_BOUNDS = {
  minX: -215,
  maxX: 215,
  minZ: -92,
  maxZ: 88,
};

export const ZONES = {
  S: { minX: -198, maxX: -74, centerX: -136 },
  C: { minX: -60, maxX: 60, centerX: 0 },
  N: { minX: 74, maxX: 198, centerX: 136 },
};

// Exact 9 towers matching Masteri Trinity Square masterplan
export const TOWERS: TowerSpec[] = [
  // Zone S — Warm Bronze / Champagne Terracotta
  {
    id: 'S3',
    zone: 'S',
    x: -140,
    z: -56,
    footprint: 'stepped_left_north',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },
  {
    id: 'S2',
    zone: 'S',
    x: -183,
    z: -16,
    footprint: 'boomerang_west',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },
  {
    id: 'S1',
    zone: 'S',
    x: -89,
    z: -16,
    footprint: 'boomerang_east',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },

  // Zone C — Pearl White / Silver Ivory
  {
    id: 'C3',
    zone: 'C',
    x: -33,
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
    x: 33,
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
    z: -5,
    footprint: 'stepped_right_north',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },

  // Zone N — Obsidian Graphite / Charcoal Steel
  {
    id: 'N3',
    zone: 'N',
    x: 136,
    z: -56,
    footprint: 'stepped_right_north',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },
  {
    id: 'N2',
    zone: 'N',
    x: 89,
    z: -16,
    footprint: 'boomerang_west',
    floors: 27,
    podiumHeight: 7.2,
    floorHeight: 3.05,
    crownHeight: 4.5,
  },
  {
    id: 'N1',
    zone: 'N',
    x: 183,
    z: -16,
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
    // Left wing higher (+y), right wing lower (-y)
    return [
      [-26, 9.2],
      [1.5, 9.2],
      [1.5, 4.4],
      [26, 4.4],
      [26, -9.2],
      [-1.5, -9.2],
      [-1.5, -4.4],
      [-26, -4.4],
    ];
  }

  if (type === 'stepped_right_north') {
    // Left wing lower (-y), right wing higher (+y)
    return [
      [-26, 4.4],
      [-1.5, 4.4],
      [-1.5, 9.2],
      [26, 9.2],
      [26, -4.4],
      [1.5, -4.4],
      [1.5, -9.2],
      [-26, -9.2],
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
  // Reverse winding so extruded normals face outward consistently
  return westPoints.map(([px, py]) => [-px, py] as [number, number]).reverse();
}

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'overview',
    label: 'Toàn cảnh',
    position: [0, 155, 225],
    yaw: 0,
    pitch: -0.56,
  },
  {
    id: 'zone_s',
    label: 'Phân khu S',
    position: [-136, 62, 68],
    yaw: 0,
    pitch: -0.45,
  },
  {
    id: 'zone_c',
    label: 'Phân khu C',
    position: [0, 58, 108],
    yaw: 0,
    pitch: -0.42,
  },
  {
    id: 'zone_n',
    label: 'Phân khu N',
    position: [136, 64, 96],
    yaw: 0,
    pitch: -0.45,
  },
  {
    id: 'park_walk',
    label: 'Dạo công viên',
    position: [-18, 2.2, 58],
    yaw: -0.35,
    pitch: 0.04,
  },
];

export function detectZoneName(x: number, z: number): string {
  if (z < -68) return 'Đại Lộ Bắc';
  if (x < -70) {
    return z > 12 ? 'Công Viên & Bãi Cỏ Khu S' : 'Nội Khu S (S1–S3)';
  }
  if (x > 70) {
    return z > 12 ? 'Tổ Hợp Tennis & Hồ Khu N' : 'Nội Khu N (N1–N3)';
  }
  return z > 12 ? 'Công Viên Trung Tâm (Khu C)' : 'Nội Khu C (C1–C3)';
}
