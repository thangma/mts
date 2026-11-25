import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Map as MapIcon,
  Moon,
  Navigation,
  Sun,
  Sunset,
  Tag,
} from 'lucide-react';
import { CAMERA_PRESETS, CameraPreset, TimeOfDay } from '../scene/masterplanData';
import { FlightTelemetry } from '../scene/MasteriEngine';
import { Minimap } from './Minimap';

interface ControlOverlayProps {
  telemetry: FlightTelemetry;
  activePresetId: string;
  timeOfDay: TimeOfDay;
  labelsVisible: boolean;
  minimapVisible: boolean;
  dockCollapsed: boolean;
  flightSpeed: number;
  contextLost: boolean;
  onEnterFlight: () => void;
  onSelectPreset: (preset: CameraPreset) => void;
  onChangeTimeOfDay: (mode: TimeOfDay) => void;
  onToggleLabels: () => void;
  onToggleMinimap: () => void;
  onToggleDock: () => void;
  onChangeSpeed: (speed: number) => void;
}

export const ControlOverlay: React.FC<ControlOverlayProps> = ({
  telemetry,
  activePresetId,
  timeOfDay,
  labelsVisible,
  minimapVisible,
  dockCollapsed,
  flightSpeed,
  contextLost,
  onEnterFlight,
  onSelectPreset,
  onChangeTimeOfDay,
  onToggleLabels,
  onToggleMinimap,
  onToggleDock,
  onChangeSpeed,
}) => {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
      {/* Top Row: Minimal Brand/Telemetry (Left) + Optional Minimap (Right) */}
      <div className="flex items-start justify-between gap-4">
        <div className="pointer-events-auto rounded-xl border border-white/15 bg-[#0e1520]/90 px-4 py-2.5 shadow-lg">
          <div className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-white">
            <span>Masteri Trinity Square</span>
            <span className="text-slate-500" aria-hidden="true">
              ·
            </span>
            <span className="text-xs font-medium text-[#e2b872]">
              {telemetry.zoneName}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-300 font-mono-tabular">
            <span>Độ cao {Math.round(telemetry.y)} m</span>
            <span className="text-slate-600" aria-hidden="true">
              /
            </span>
            <span>Tốc độ {telemetry.speed.toFixed(1)} m/s</span>
          </div>
        </div>

        {minimapVisible && (
          <div className="hidden sm:block">
            <Minimap
              x={telemetry.x}
              z={telemetry.z}
              yaw={telemetry.yaw}
              zoneName={telemetry.zoneName}
            />
          </div>
        )}
      </div>

      {/* Subtle Center FPS Crosshair when Pointer Locked */}
      {telemetry.isPointerLocked && (
        <div className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="relative h-4 w-4">
            <div className="absolute left-1/2 top-0 h-4 w-[1.5px] -translate-x-1/2 bg-white/70" />
            <div className="absolute left-0 top-1/2 h-[1.5px] w-4 -translate-y-1/2 bg-white/70" />
          </div>
        </div>
      )}

      {/* WebGL Context Lost Notice */}
      {contextLost && (
        <div className="pointer-events-auto mx-auto rounded-xl border border-amber-400/40 bg-[#131b26] px-5 py-3 text-sm text-amber-200 shadow-xl">
          Đang khôi phục ngữ cảnh đồ họa 3D...
        </div>
      )}

      {/* Unified Collapsible Bottom Control Dock */}
      <div className="flex flex-col items-center">
        {/* Collapse / Expand Drawer Toggle */}
        <button
          type="button"
          onClick={onToggleDock}
          className="pointer-events-auto mb-1.5 flex items-center gap-1.5 rounded-t-lg border border-b-0 border-white/15 bg-[#0e1520]/90 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-[#e2b872]"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              <span>Mở điều khiển (H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              <span>Ẩn điều khiển (H)</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div
            className="pointer-events-auto w-full max-w-[940px] rounded-xl border border-white/15 bg-[#0e1520]/92 px-3.5 py-2.5 shadow-2xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* Primary Action: Enter FPS Flight */}
              <button
                type="button"
                onClick={onEnterFlight}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-white ${
                  telemetry.isPointerLocked
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-[#e2b872] text-[#0f172a] hover:bg-[#ecc788]'
                }`}
              >
                <Navigation className="h-3.5 w-3.5" />
                <span>
                  {telemetry.isPointerLocked
                    ? 'Đang bay FPS (Esc thoát)'
                    : 'Bay Tự Do (FPS)'}
                </span>
              </button>

              {/* Camera Presets */}
              <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1 overflow-x-auto">
                <Compass className="mx-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
                {CAMERA_PRESETS.map((preset) => {
                  const active = activePresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onSelectPreset(preset)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-white/18 text-white'
                          : 'text-slate-300 hover:bg-white/8 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* Time of Day Switcher */}
              <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => onChangeTimeOfDay('day')}
                  title="Ban ngày"
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    timeOfDay === 'day'
                      ? 'bg-white/18 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Sun className="h-3.5 w-3.5" />
                  <span>Sáng</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTimeOfDay('sunset')}
                  title="Hoàng hôn"
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    timeOfDay === 'sunset'
                      ? 'bg-white/18 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Sunset className="h-3.5 w-3.5" />
                  <span>Chiều</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTimeOfDay('night')}
                  title="Ban đêm"
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    timeOfDay === 'night'
                      ? 'bg-white/18 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Moon className="h-3.5 w-3.5" />
                  <span>Đêm</span>
                </button>
              </div>

              {/* Labels, Minimap & Flight Speed */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleLabels}
                  title="Bật/tắt tên tòa nhà (L)"
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    labelsVisible
                      ? 'border-[#e2b872]/50 bg-[#e2b872]/15 text-[#f3d49b]'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  <Tag className="h-3.5 w-3.5" />
                  <span>Nhãn</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleMinimap}
                  title="Bật/tắt bản đồ nhỏ (M)"
                  className={`hidden sm:flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    minimapVisible
                      ? 'border-[#e2b872]/50 bg-[#e2b872]/15 text-[#f3d49b]'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  <MapIcon className="h-3.5 w-3.5" />
                  <span>Bản đồ</span>
                </button>

                <div className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">
                    Tốc độ
                  </span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={2}
                    value={flightSpeed}
                    onChange={(e) => onChangeSpeed(Number(e.target.value))}
                    className="flight-slider w-16 sm:w-20"
                    aria-label="Tốc độ bay"
                  />
                  <span className="w-7 text-right text-[11px] font-mono-tabular text-slate-200">
                    {flightSpeed}
                  </span>
                </div>
              </div>
            </div>

            {/* Quiet Single-Line Keybinding Hint */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-1.5 text-[11px] text-slate-400">
              <span>
                <strong className="text-slate-200 font-medium">WASD</strong> Bay theo hướng nhìn
                <span className="mx-1.5 text-slate-600">·</span>
                <strong className="text-slate-200 font-medium">Space / C</strong> Lên / Xuống
                <span className="mx-1.5 text-slate-600">·</span>
                <strong className="text-slate-200 font-medium">Shift</strong> Tăng tốc 2.6×
                <span className="mx-1.5 text-slate-600">·</span>
                <strong className="text-slate-200 font-medium">Kéo chuột / Click</strong> Xoay góc nhìn
              </span>
              <span className="hidden md:inline text-slate-500">
                9 tòa S1–S3 · C1–C3 · N1–N3
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
