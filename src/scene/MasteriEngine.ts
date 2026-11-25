import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildLandscape } from './buildLandscape';
import { buildTowers } from './buildTowers';
import {
  CAMERA_PRESETS,
  CameraPreset,
  detectZoneName,
  TimeOfDay,
} from './masterplanData';

export interface FlightTelemetry {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  zoneName: string;
  isPointerLocked: boolean;
}

// Pre-allocated math helpers outside loop (Zero GC)
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveInput = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

function detectSoftwareWebGL(): boolean {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export class MasteriEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private skyMat: THREE.ShaderMaterial;

  private towers: ReturnType<typeof buildTowers>;
  private landscape: ReturnType<typeof buildLandscape>;
  private envRenderTarget: THREE.WebGLRenderTarget;

  // FPS Flight state
  private keys: Record<string, boolean> = {};
  private velocity = new THREE.Vector3();
  private targetYaw = CAMERA_PRESETS[0].yaw;
  private targetPitch = CAMERA_PRESETS[0].pitch;
  private currentYaw = CAMERA_PRESETS[0].yaw;
  private currentPitch = CAMERA_PRESETS[0].pitch;
  private baseSpeed = 38;
  private isPointerLocked = false;
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Smooth camera preset glide
  private glideActive = false;
  private glideTargetPos = new THREE.Vector3();
  private glideTargetYaw = 0;
  private glideTargetPitch = 0;

  // Time & loop management
  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;
  private lastTelemetryEmit = 0;
  private onTelemetry?: (data: FlightTelemetry) => void;
  private onPointerLockChange?: (locked: boolean) => void;
  private onContextLost?: (lost: boolean) => void;

  // Cleanup bound handlers
  private handleResizeBound: () => void;
  private handleKeyDownBound: (e: KeyboardEvent) => void;
  private handleKeyUpBound: (e: KeyboardEvent) => void;
  private handleMouseMoveBound: (e: MouseEvent) => void;
  private handlePointerDownBound: (e: PointerEvent) => void;
  private handlePointerMoveBound: (e: PointerEvent) => void;
  private handlePointerUpBound: () => void;
  private handleWheelBound: (e: WheelEvent) => void;
  private handlePointerLockChangeBound: () => void;
  private handleContextLostBound: (e: Event) => void;
  private handleContextRestoredBound: () => void;

  constructor(
    container: HTMLElement,
    callbacks: {
      onTelemetry?: (data: FlightTelemetry) => void;
      onPointerLockChange?: (locked: boolean) => void;
      onContextLost?: (lost: boolean) => void;
    },
  ) {
    this.container = container;
    this.onTelemetry = callbacks.onTelemetry;
    this.onPointerLockChange = callbacks.onPointerLockChange;
    this.onContextLost = callbacks.onContextLost;

    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // Scene & Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xc5dce8);
    this.scene.fog = new THREE.FogExp2(0xc5dce8, 0.00135);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.4,
      2200,
    );
    const startPreset = CAMERA_PRESETS[0];
    this.camera.position.set(...startPreset.position);
    _euler.set(this.currentPitch, this.currentYaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);

    // Studio & Sky Environment Reflection
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRenderTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    pmrem.dispose();

    // Procedural Atmospheric Sky Dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x5b9bd5) },
        uHorizonColor: { value: new THREE.Color(0xcde2ed) },
        uBottomColor: { value: new THREE.Color(0x88a296) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uBottomColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y;
          vec3 col = h >= 0.0
            ? mix(uHorizonColor, uTopColor, pow(h, 0.55))
            : mix(uHorizonColor, uBottomColor, pow(-h, 0.5));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(1200, 24, 16),
      this.skyMat,
    );
    this.scene.add(skyDome);

    // 3-Point Architectural Daylight Rig (Warm Sun + Cool Sky Hemisphere + Soft Rim)
    this.hemiLight = new THREE.HemisphereLight(0xdaf0ff, 0x6b7561, 0.72);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    this.sunLight.position.set(160, 220, 140);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = 820;
    const d = 310;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.04;
    this.scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight(0x9bc4e8, 0.55);
    this.rimLight.position.set(-140, 110, -160);
    this.scene.add(this.rimLight);

    // Build 3D Masterplan Geometry
    const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.towers = buildTowers(anisotropy);
    this.scene.add(this.towers.group);
    this.scene.add(this.towers.labelsGroup);

    this.landscape = buildLandscape(anisotropy, this.isSoftwareGl);
    this.scene.add(this.landscape.group);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind events
    this.handleResizeBound = this.onResize.bind(this);
    this.handleKeyDownBound = this.onKeyDown.bind(this);
    this.handleKeyUpBound = this.onKeyUp.bind(this);
    this.handleMouseMoveBound = this.onPointerLockMouseMove.bind(this);
    this.handlePointerDownBound = this.onPointerDown.bind(this);
    this.handlePointerMoveBound = this.onPointerDragMove.bind(this);
    this.handlePointerUpBound = this.onPointerUp.bind(this);
    this.handleWheelBound = this.onWheel.bind(this);
    this.handlePointerLockChangeBound = this.onLockChange.bind(this);
    this.handleContextLostBound = (e: Event) => {
      e.preventDefault();
      this.onContextLost?.(true);
    };
    this.handleContextRestoredBound = () => {
      this.onContextLost?.(false);
    };

    window.addEventListener('resize', this.handleResizeBound);
    window.addEventListener('keydown', this.handleKeyDownBound);
    window.addEventListener('keyup', this.handleKeyUpBound);
    document.addEventListener('mousemove', this.handleMouseMoveBound);
    document.addEventListener(
      'pointerlockchange',
      this.handlePointerLockChangeBound,
    );

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDownBound);
    window.addEventListener('pointermove', this.handlePointerMoveBound);
    window.addEventListener('pointerup', this.handlePointerUpBound);
    canvas.addEventListener('wheel', this.handleWheelBound, { passive: true });
    canvas.addEventListener('webglcontextlost', this.handleContextLostBound);
    canvas.addEventListener(
      'webglcontextrestored',
      this.handleContextRestoredBound,
    );

    this.startLoop();
  }

  public requestPointerLock(): void {
    try {
      this.renderer.domElement.requestPointerLock();
    } catch {
      // Fallback drag-to-look remains active if iframe restricts PointerLock
    }
  }

  public exitPointerLock(): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
  }

  public setBaseSpeed(speed: number): void {
    this.baseSpeed = THREE.MathUtils.clamp(speed, 8, 110);
  }

  public setLabelsVisible(visible: boolean): void {
    this.towers.labelsGroup.visible = visible;
  }

  public flyToPreset(preset: CameraPreset): void {
    this.glideTargetPos.set(...preset.position);
    this.glideTargetYaw = preset.yaw;
    this.glideTargetPitch = preset.pitch;
    this.glideActive = true;
    this.velocity.set(0, 0, 0);
  }

  public setTimeOfDay(mode: TimeOfDay): void {
    if (mode === 'day') {
      this.skyMat.uniforms.uTopColor.value.setHex(0x5b9bd5);
      this.skyMat.uniforms.uHorizonColor.value.setHex(0xcde2ed);
      this.skyMat.uniforms.uBottomColor.value.setHex(0x88a296);
      (this.scene.background as THREE.Color).setHex(0xcde2ed);
      (this.scene.fog as THREE.FogExp2).color.setHex(0xcde2ed);
      (this.scene.fog as THREE.FogExp2).density = 0.00135;

      this.sunLight.color.setHex(0xfff1d6);
      this.sunLight.intensity = 2.2;
      this.sunLight.position.set(160, 220, 140);
      this.hemiLight.color.setHex(0xdaf0ff);
      this.hemiLight.groundColor.setHex(0x6b7561);
      this.hemiLight.intensity = 0.72;
      this.rimLight.intensity = 0.55;
      this.renderer.toneMappingExposure = 1.08;

      this.towers.facadeMaterials.forEach((m) => (m.emissiveIntensity = 0.0));
      this.towers.podiumGlassMaterials.forEach(
        (m) => (m.emissiveIntensity = 0.15),
      );
      this.landscape.lampEmissiveMat.emissiveIntensity = 0.15;
      this.landscape.carHeadlightMat.emissiveIntensity = 0.4;
    } else if (mode === 'sunset') {
      this.skyMat.uniforms.uTopColor.value.setHex(0x3a4e7a);
      this.skyMat.uniforms.uHorizonColor.value.setHex(0xe89b6c);
      this.skyMat.uniforms.uBottomColor.value.setHex(0x52413d);
      (this.scene.background as THREE.Color).setHex(0xe09c72);
      (this.scene.fog as THREE.FogExp2).color.setHex(0xd9946b);
      (this.scene.fog as THREE.FogExp2).density = 0.00155;

      this.sunLight.color.setHex(0xffa45b);
      this.sunLight.intensity = 2.5;
      this.sunLight.position.set(-220, 58, 120);
      this.hemiLight.color.setHex(0xffc299);
      this.hemiLight.groundColor.setHex(0x473a42);
      this.hemiLight.intensity = 0.65;
      this.rimLight.intensity = 0.45;
      this.renderer.toneMappingExposure = 1.05;

      this.towers.facadeMaterials.forEach((m) => (m.emissiveIntensity = 0.65));
      this.towers.podiumGlassMaterials.forEach(
        (m) => (m.emissiveIntensity = 0.75),
      );
      this.landscape.lampEmissiveMat.emissiveIntensity = 1.4;
      this.landscape.carHeadlightMat.emissiveIntensity = 1.4;
    } else {
      // Night mode
      this.skyMat.uniforms.uTopColor.value.setHex(0x09111f);
      this.skyMat.uniforms.uHorizonColor.value.setHex(0x1b2940);
      this.skyMat.uniforms.uBottomColor.value.setHex(0x0e141f);
      (this.scene.background as THREE.Color).setHex(0x142033);
      (this.scene.fog as THREE.FogExp2).color.setHex(0x142033);
      (this.scene.fog as THREE.FogExp2).density = 0.0016;

      this.sunLight.color.setHex(0x7ca2d6);
      this.sunLight.intensity = 0.65;
      this.sunLight.position.set(120, 180, -140);
      this.hemiLight.color.setHex(0x48648f);
      this.hemiLight.groundColor.setHex(0x1a202c);
      this.hemiLight.intensity = 0.48;
      this.rimLight.intensity = 0.35;
      this.renderer.toneMappingExposure = 1.15;

      this.towers.facadeMaterials.forEach((m) => (m.emissiveIntensity = 1.35));
      this.towers.podiumGlassMaterials.forEach(
        (m) => (m.emissiveIntensity = 1.45),
      );
      this.landscape.lampEmissiveMat.emissiveIntensity = 2.8;
      this.landscape.carHeadlightMat.emissiveIntensity = 2.6;
    }
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    this.keys[e.code] = true;
    // Cancel scripted glide if player flies manually
    if (
      [
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Space',
        'KeyC',
        'ControlLeft',
      ].includes(e.code)
    ) {
      this.glideActive = false;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys[e.code] = false;
  }

  private onLockChange(): void {
    this.isPointerLocked =
      document.pointerLockElement === this.renderer.domElement;
    this.onPointerLockChange?.(this.isPointerLocked);
  }

  private onPointerLockMouseMove(e: MouseEvent): void {
    if (!this.isPointerLocked) return;
    this.glideActive = false;
    const sensitivity = 0.0022;
    this.targetYaw -= e.movementX * sensitivity;
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch - e.movementY * sensitivity,
      -Math.PI * 0.48,
      Math.PI * 0.48,
    );
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.isPointerLocked) return;
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  }

  private onPointerDragMove(e: PointerEvent): void {
    if (this.isPointerLocked || !this.isDragging) return;
    this.glideActive = false;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    const sensitivity = 0.0032;
    this.targetYaw -= dx * sensitivity;
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch - dy * sensitivity,
      -Math.PI * 0.48,
      Math.PI * 0.48,
    );
  }

  private onPointerUp(): void {
    this.isDragging = false;
  }

  private onWheel(e: WheelEvent): void {
    this.baseSpeed = THREE.MathUtils.clamp(
      this.baseSpeed - Math.sign(e.deltaY) * 4,
      8,
      110,
    );
  }

  private updateFlight(delta: number): void {
    if (this.glideActive) {
      const k = 4.2;
      this.camera.position.x = THREE.MathUtils.damp(
        this.camera.position.x,
        this.glideTargetPos.x,
        k,
        delta,
      );
      this.camera.position.y = THREE.MathUtils.damp(
        this.camera.position.y,
        this.glideTargetPos.y,
        k,
        delta,
      );
      this.camera.position.z = THREE.MathUtils.damp(
        this.camera.position.z,
        this.glideTargetPos.z,
        k,
        delta,
      );
      this.targetYaw = THREE.MathUtils.damp(
        this.targetYaw,
        this.glideTargetYaw,
        k,
        delta,
      );
      this.targetPitch = THREE.MathUtils.damp(
        this.targetPitch,
        this.glideTargetPitch,
        k,
        delta,
      );

      if (
        this.camera.position.distanceTo(this.glideTargetPos) < 0.25 &&
        Math.abs(this.targetYaw - this.glideTargetYaw) < 0.01
      ) {
        this.glideActive = false;
      }
    }

    // Smooth look damping
    const lookLambda = this.isSoftwareGl ? 30 : 22;
    this.currentYaw = THREE.MathUtils.damp(
      this.currentYaw,
      this.targetYaw,
      lookLambda,
      delta,
    );
    this.currentPitch = THREE.MathUtils.damp(
      this.currentPitch,
      this.targetPitch,
      lookLambda,
      delta,
    );

    _euler.set(this.currentPitch, this.currentYaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);

    // 6DOF FPS Flight directions relative to look vector
    _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    _right.crossVectors(_forward, _worldUp).normalize();

    const fwd =
      (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) -
      (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
    const strafe =
      (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) -
      (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);
    const vert =
      (this.keys['Space'] || this.keys['KeyE'] ? 1 : 0) -
      (this.keys['KeyC'] || this.keys['ControlLeft'] || this.keys['KeyQ']
        ? 1
        : 0);

    _moveInput.set(0, 0, 0);
    if (fwd !== 0) _moveInput.addScaledVector(_forward, fwd);
    if (strafe !== 0) _moveInput.addScaledVector(_right, strafe);
    if (vert !== 0) _moveInput.y += vert;

    if (_moveInput.lengthSq() > 0) {
      _moveInput.normalize();
    }

    const boost =
      this.keys['ShiftLeft'] || this.keys['ShiftRight'] ? 2.6 : 1.0;
    const targetSpeed = this.baseSpeed * boost;

    const dampFactor = 8.5;
    this.velocity.x = THREE.MathUtils.damp(
      this.velocity.x,
      _moveInput.x * targetSpeed,
      dampFactor,
      delta,
    );
    this.velocity.y = THREE.MathUtils.damp(
      this.velocity.y,
      _moveInput.y * targetSpeed,
      dampFactor,
      delta,
    );
    this.velocity.z = THREE.MathUtils.damp(
      this.velocity.z,
      _moveInput.z * targetSpeed,
      dampFactor,
      delta,
    );

    this.camera.position.addScaledVector(this.velocity, delta);

    // Subtle FOV expansion when boosting at high flight speed
    const currentSpeed = this.velocity.length();
    const targetFov = 60 + Math.min(12, currentSpeed * 0.085);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(
        this.camera.fov,
        targetFov,
        6,
        delta,
      );
      this.camera.updateProjectionMatrix();
    }

    // Clamp world bounds & keep above ground (human eye-level minimum 1.65m)
    this.camera.position.x = THREE.MathUtils.clamp(
      this.camera.position.x,
      -540,
      540,
    );
    this.camera.position.y = THREE.MathUtils.clamp(
      this.camera.position.y,
      1.65,
      380,
    );
    this.camera.position.z = THREE.MathUtils.clamp(
      this.camera.position.z,
      -380,
      380,
    );
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      const delta = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.elapsedTime;

      this.updateFlight(delta);
      this.landscape.update(delta, elapsed);

      this.renderer.render(this.scene, this.camera);

      // Throttle React HUD telemetry updates (~10Hz) so React never slows down WebGL
      if (this.onTelemetry && elapsed - this.lastTelemetryEmit > 0.1) {
        this.lastTelemetryEmit = elapsed;
        this.onTelemetry({
          x: this.camera.position.x,
          y: this.camera.position.y,
          z: this.camera.position.z,
          yaw: this.currentYaw,
          speed: this.velocity.length(),
          zoneName: detectZoneName(
            this.camera.position.x,
            this.camera.position.z,
          ),
          isPointerLocked: this.isPointerLocked,
        });
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResizeBound);
    window.removeEventListener('keydown', this.handleKeyDownBound);
    window.removeEventListener('keyup', this.handleKeyUpBound);
    document.removeEventListener('mousemove', this.handleMouseMoveBound);
    document.removeEventListener(
      'pointerlockchange',
      this.handlePointerLockChangeBound,
    );
    window.removeEventListener('pointermove', this.handlePointerMoveBound);
    window.removeEventListener('pointerup', this.handlePointerUpBound);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handlePointerDownBound);
    canvas.removeEventListener('wheel', this.handleWheelBound);
    canvas.removeEventListener('webglcontextlost', this.handleContextLostBound);
    canvas.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestoredBound,
    );

    this.towers.dispose();
    this.landscape.dispose();
    this.envRenderTarget.dispose();
    this.skyMat.dispose();
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
