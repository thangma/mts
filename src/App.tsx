import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlOverlay } from './components/ControlOverlay';
import {
  CAMERA_PRESETS,
  CameraPreset,
  TimeOfDay,
} from './scene/masterplanData';
import { FlightTelemetry, MasteriEngine } from './scene/MasteriEngine';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MasteriEngine | null>(null);

  const [telemetry, setTelemetry] = useState<FlightTelemetry>({
    x: CAMERA_PRESETS[0].position[0],
    y: CAMERA_PRESETS[0].position[1],
    z: CAMERA_PRESETS[0].position[2],
    yaw: CAMERA_PRESETS[0].yaw,
    speed: 0,
    zoneName: 'Công Viên Trung Tâm (Khu C)',
    isPointerLocked: false,
  });

  const [activePresetId, setActivePresetId] = useState<string>('overview');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
  const [labelsVisible, setLabelsVisible] = useState<boolean>(true);
  const [minimapVisible, setMinimapVisible] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [flightSpeed, setFlightSpeed] = useState<number>(38);
  const [contextLost, setContextLost] = useState<boolean>(false);

  // Initialize Three.js WebGL scene once on mount
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const engine = new MasteriEngine(mountEl, {
      onTelemetry: (data) => setTelemetry(data),
      onPointerLockChange: (locked) =>
        setTelemetry((prev) => ({ ...prev, isPointerLocked: locked })),
      onContextLost: (lost) => setContextLost(lost),
    });

    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Keyboard shortcuts for UI toggles (H, L, M)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.code === 'KeyH') {
        setDockCollapsed((v) => !v);
      } else if (e.code === 'KeyL') {
        setLabelsVisible((v) => {
          const next = !v;
          engineRef.current?.setLabelsVisible(next);
          return next;
        });
      } else if (e.code === 'KeyM') {
        setMinimapVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleEnterFlight = useCallback(() => {
    if (telemetry.isPointerLocked) {
      engineRef.current?.exitPointerLock();
    } else {
      engineRef.current?.requestPointerLock();
    }
  }, [telemetry.isPointerLocked]);

  const handleSelectPreset = useCallback((preset: CameraPreset) => {
    setActivePresetId(preset.id);
    engineRef.current?.flyToPreset(preset);
  }, []);

  const handleChangeTimeOfDay = useCallback((mode: TimeOfDay) => {
    setTimeOfDay(mode);
    engineRef.current?.setTimeOfDay(mode);
  }, []);

  const handleToggleLabels = useCallback(() => {
    setLabelsVisible((prev) => {
      const next = !prev;
      engineRef.current?.setLabelsVisible(next);
      return next;
    });
  }, []);

  const handleToggleMinimap = useCallback(() => {
    setMinimapVisible((prev) => !prev);
  }, []);

  const handleToggleDock = useCallback(() => {
    setDockCollapsed((prev) => !prev);
  }, []);

  const handleChangeSpeed = useCallback((speed: number) => {
    setFlightSpeed(speed);
    engineRef.current?.setBaseSpeed(speed);
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0b111a]">
      {/* Dedicated isolated WebGL canvas container */}
      <div ref={canvasMountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

      {/* Semantic HUD overlay */}
      <ControlOverlay
        telemetry={telemetry}
        activePresetId={activePresetId}
        timeOfDay={timeOfDay}
        labelsVisible={labelsVisible}
        minimapVisible={minimapVisible}
        dockCollapsed={dockCollapsed}
        flightSpeed={flightSpeed}
        contextLost={contextLost}
        onEnterFlight={handleEnterFlight}
        onSelectPreset={handleSelectPreset}
        onChangeTimeOfDay={handleChangeTimeOfDay}
        onToggleLabels={handleToggleLabels}
        onToggleMinimap={handleToggleMinimap}
        onToggleDock={handleToggleDock}
        onChangeSpeed={handleChangeSpeed}
      />
    </main>
  );
}
