import React from 'react';
import { SITE_BOUNDS, TOWERS, getTowerFootprintPoints } from '../scene/masterplanData';

interface MinimapProps {
  x: number;
  z: number;
  yaw: number;
  zoneName: string;
}

export const Minimap: React.FC<MinimapProps> = ({ x, z, yaw, zoneName }) => {
  const width = SITE_BOUNDS.maxX - SITE_BOUNDS.minX;
  const depth = SITE_BOUNDS.maxZ - SITE_BOUNDS.minZ;

  // Clamp marker within SVG viewbox
  const clampedX = Math.max(SITE_BOUNDS.minX + 6, Math.min(SITE_BOUNDS.maxX - 6, x));
  const clampedZ = Math.max(SITE_BOUNDS.minZ + 6, Math.min(SITE_BOUNDS.maxZ - 6, z));

  // yaw = 0 looks toward -Z (up on map). Rotate arrow accordingly:
  // In Three.js, yaw > 0 rotates counter-clockwise around +Y (looking toward -X = left on map)
  const deg = (-yaw * 180) / Math.PI;

  return (
    <div
      className="pointer-events-auto rounded-xl border border-white/15 bg-[#0e1520]/90 p-2.5 shadow-lg"
      style={{ width: 210 }}
    >
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-300">
        <span className="font-medium text-slate-100 truncate">{zoneName}</span>
        <span className="font-mono-tabular text-slate-400 shrink-0 ml-2">
          {Math.round(x)}, {Math.round(z)}
        </span>
      </div>

      <svg
        viewBox={`${SITE_BOUNDS.minX} ${SITE_BOUNDS.minZ} ${width} ${depth}`}
        className="w-full rounded-lg bg-[#16202e] border border-white/10"
        style={{ height: 84 }}
      >
        {/* Zone S, C, N blocks */}
        <rect x={-198} y={-69} width={122} height={77} rx={3} fill="#25362c" />
        <rect x={-198} y={16} width={122} height={59} rx={3} fill="#2a422f" />

        <rect x={-59} y={-69} width={118} height={77} rx={3} fill="#25362c" />
        <rect x={-59} y={16} width={118} height={59} rx={3} fill="#22382c" />

        <rect x={75} y={-69} width={122} height={77} rx={3} fill="#25362c" />
        <rect x={75} y={16} width={122} height={59} rx={3} fill="#213838" />

        {/* Pools highlights */}
        <rect x={-152} y={-7} width={38} height={10} rx={3} fill="#2ca6be" opacity={0.8} />
        <rect x={-8} y={-32} width={44} height={10} rx={3} fill="#2ca6be" opacity={0.8} />
        <ellipse cx={-3} cy={40} rx={22} ry={11} fill="#2ca6be" opacity={0.8} />
        <rect x={115} y={-28} width={34} height={9} rx={3} fill="#2ca6be" opacity={0.8} />

        {/* 9 Towers */}
        {TOWERS.map((t) => {
          const pts = getTowerFootprintPoints(t.footprint)
            .map(([px, py]) => `${t.x + px},${t.z - py}`)
            .join(' ');
          const fill =
            t.zone === 'C' ? '#cbb79d' : '#7d5a47';
          return <polygon key={t.id} points={pts} fill={fill} />;
        })}

        {/* Zone letters */}
        <text x={-136} y={48} fill="rgba(255,255,255,0.45)" fontSize={18} fontWeight={700} textAnchor="middle">
          S
        </text>
        <text x={0} y={66} fill="rgba(255,255,255,0.45)" fontSize={18} fontWeight={700} textAnchor="middle">
          C
        </text>
        <text x={136} y={48} fill="rgba(255,255,255,0.45)" fontSize={18} fontWeight={700} textAnchor="middle">
          N
        </text>

        {/* Camera / Player position & heading */}
        <g transform={`translate(${clampedX}, ${clampedZ}) rotate(${deg})`}>
          <polygon
            points="0,-13 9,9 0,4 -9,9"
            fill="#e2b872"
            stroke="#0f172a"
            strokeWidth={2}
          />
        </g>
      </svg>
    </div>
  );
};
