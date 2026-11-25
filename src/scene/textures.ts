import * as THREE from 'three';
import { ZoneId } from './masterplanData';

export interface FacadeTextureSet {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

// Deterministic pseudo-random generator for consistent architectural window lighting
function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isSRGB: boolean,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createTowerFacadeTextures(
  zone: ZoneId,
  anisotropy: number,
): FacadeTextureSet {
  const size = 512;
  const cols = 4; // 4 apartment bays horizontally (= 12m)
  const rows = 4; // 4 floors vertically (= 12.2m)
  const cellW = size / cols;
  const cellH = size / rows;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d')!;

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = size;
  emissiveCanvas.height = size;
  const eCtx = emissiveCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  // Zone-specific architectural palette:
  // - Zones S & N share the deep espresso-bronze cladding & sky-blue glass (image_e15e5b52.png)
  // - Zone C uses champagne-ivory, warm taupe loggia accent & vivid sky-blue glass (image_d00f0056.png)
  const palette =
    zone === 'C'
      ? {
          spandrel: '#cbb79d',       // Warm sand-beige horizontal slabs & outer piers
          spandrelHighlight: '#dfd0bc',
          pier: '#7a5c45',           // Rich warm brown-taupe recessed loggia piers
          mullion: '#47382d',        // Warm dark brown-charcoal mullions
          glassTop: '#526270',       // Muted neutral-slate glass (no icy blue cast)
          glassBot: '#73828f',
          balconyGlass: '#8c7d6b',   // Warm bronze-tinted balcony glass
          interiorWarm: '#a88c6f',   // Warm tan interior depth
        }
      : {
          spandrel: '#6b4c3b',       // Deep roasted espresso-bronze cladding
          spandrelHighlight: '#9c745c', // Sunlit champagne-bronze slab edge
          pier: '#573c2e',           // Darker espresso vertical piers
          mullion: '#29201c',        // Dark bronze-charcoal mullions
          glassTop: '#456982',       // Cool sky-blue / teal-slate glass
          glassBot: '#6e94ad',
          balconyGlass: '#4b677d',
          interiorWarm: '#52443c',
        };

  const rand = seededRandom(zone === 'S' ? 101 : zone === 'C' ? 202 : 303);

  // Base fill
  aCtx.fillStyle = palette.spandrel;
  aCtx.fillRect(0, 0, size, size);

  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, size, size);

  rCtx.fillStyle = '#a0a0a0'; // matte cladding default
  rCtx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#d0d0d0'; // raised spandrel default
  bCtx.fillRect(0, 0, size, size);

  for (let row = 0; row < rows; row++) {
    const y0 = row * cellH;
    const spandrelH = 20;
    const balconyH = 22;
    const windowY = y0 + spandrelH;
    const windowH = cellH - spandrelH;

    // Horizontal floor slab / spandrel band
    aCtx.fillStyle = palette.spandrelHighlight;
    aCtx.fillRect(0, y0, size, 6);
    aCtx.fillStyle = palette.spandrel;
    aCtx.fillRect(0, y0 + 6, size, spandrelH - 6);

    // Subtle underside shadow beneath each floor slab
    aCtx.fillStyle = 'rgba(0,0,0,0.3)';
    aCtx.fillRect(0, windowY, size, 5);

    bCtx.fillStyle = '#ffffff';
    bCtx.fillRect(0, y0, size, spandrelH);

    for (let col = 0; col < cols; col++) {
      const x0 = col * cellW;
      const isMajorPier = col % 2 === 0;
      const padLeft = isMajorPier ? 10 : 6;
      const padRight = zone === 'C' ? 8 : 5;
      const paneW = cellW - padLeft - padRight;

      // Glass gradient per apartment bay
      const grad = aCtx.createLinearGradient(x0, windowY, x0, windowY + windowH);
      grad.addColorStop(0, palette.glassTop);
      grad.addColorStop(0.65, palette.glassBot);
      grad.addColorStop(1, palette.interiorWarm);
      aCtx.fillStyle = grad;
      aCtx.fillRect(x0 + padLeft, windowY, paneW, windowH);

      // Subtle interior curtain/blind variation
      const curtainChance = rand();
      if (curtainChance > 0.45) {
        aCtx.fillStyle = 'rgba(255, 248, 235, 0.14)';
        const cw = paneW * (0.3 + rand() * 0.45);
        aCtx.fillRect(x0 + padLeft, windowY + 4, cw, windowH - 6);
      }

      // Vertical window mullions inside each apartment bay (3 sub-panes)
      aCtx.fillStyle = palette.mullion;
      aCtx.fillRect(x0 + padLeft + paneW * 0.33, windowY, 3, windowH);
      aCtx.fillRect(x0 + padLeft + paneW * 0.67, windowY, 3, windowH);
      // Outer architectural vertical pilaster pier
      aCtx.fillStyle = isMajorPier ? palette.spandrelHighlight : palette.pier;
      aCtx.fillRect(x0, windowY, padLeft, windowH);
      aCtx.fillStyle = palette.pier;
      aCtx.fillRect(x0 + cellW - padRight, windowY, padRight, windowH);

      // Balcony glass railing across lower portion
      if ((col + row) % 2 === 0 || col % 2 === 0) {
        const railY = y0 + cellH - balconyH;
        aCtx.fillStyle = palette.balconyGlass;
        aCtx.globalAlpha = 0.62;
        aCtx.fillRect(x0 + padLeft, railY, paneW, balconyH - 2);
        aCtx.globalAlpha = 1;
        aCtx.fillStyle = palette.spandrelHighlight;
        aCtx.fillRect(x0 + padLeft, railY, paneW, 3); // top handrail
      }

      // Roughness: glossy glass (dark = low roughness), matte frames
      rCtx.fillStyle = '#1d1d1d';
      rCtx.fillRect(x0 + padLeft, windowY, paneW, windowH);
      rCtx.fillStyle = '#9e9e9e';
      rCtx.fillRect(x0 + padLeft + paneW * 0.33, windowY, 3, windowH);
      rCtx.fillRect(x0 + padLeft + paneW * 0.67, windowY, 3, windowH);

      // Bump: recessed glass
      bCtx.fillStyle = '#555555';
      bCtx.fillRect(x0 + padLeft, windowY, paneW, windowH);

      // Emissive night lighting for ~42% of apartments
      if (rand() < 0.44) {
        const warmColors = ['#ffcf87', '#ffdca8', '#ffe9c7', '#f5ba6e'];
        const glow = warmColors[Math.floor(rand() * warmColors.length)];
        eCtx.fillStyle = glow;
        eCtx.globalAlpha = 0.55 + rand() * 0.45;
        eCtx.fillRect(x0 + padLeft + 3, windowY + 6, paneW - 6, windowH - 12);
        eCtx.globalAlpha = 1;
      }
    }
  }

  // Repeat scaled to world-unit UVs from ExtrudeGeometry (12m horizontal, 12.2m vertical = 4 floors * 3.05m)
  const rx = 1 / 12.0;
  const ry = 1 / 12.2;

  return {
    map: configureTexture(albedoCanvas, true, anisotropy, rx, ry),
    emissiveMap: configureTexture(emissiveCanvas, true, anisotropy, rx, ry),
    roughnessMap: configureTexture(roughCanvas, false, anisotropy, rx, ry),
    bumpMap: configureTexture(bumpCanvas, false, anisotropy, rx, ry),
  };
}

export function createGrassTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(77);

  ctx.fillStyle = '#5c8a3d';
  ctx.fillRect(0, 0, size, size);

  // Subtle manicured lawn mowing stripes
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)';
    ctx.fillRect(i * (size / 16), 0, size / 16, size);
  }

  // Organic grass blades / tonal mottling
  for (let i = 0; i < 4500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const shade = rand();
    ctx.fillStyle =
      shade > 0.5 ? 'rgba(130, 175, 84, 0.16)' : 'rgba(55, 92, 34, 0.16)';
    ctx.fillRect(x, y, 2 + rand() * 3, 2 + rand() * 3);
  }

  return configureTexture(canvas, true, anisotropy, 24, 24);
}

export function createStonePavingTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(88);

  ctx.fillStyle = '#d4cfc4';
  ctx.fillRect(0, 0, size, size);

  const rows = 8;
  const cols = 4;
  const rh = size / rows;
  const cw = size / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (cw * 0.5);
    for (let c = -1; c <= cols; c++) {
      const tone = 204 + Math.floor(rand() * 20);
      ctx.fillStyle = `rgb(${tone}, ${tone - 5}, ${tone - 14})`;
      ctx.fillRect(c * cw + offset + 2, r * rh + 2, cw - 4, rh - 4);
    }
  }

  return configureTexture(canvas, true, anisotropy, 10, 10);
}

export function createWoodDeckTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(99);

  ctx.fillStyle = '#9e744e';
  ctx.fillRect(0, 0, size, size);

  const planks = 16;
  const ph = size / planks;
  for (let i = 0; i < planks; i++) {
    const shift = Math.floor(rand() * 22) - 11;
    ctx.fillStyle = `rgb(${158 + shift}, ${114 + shift}, ${76 + Math.floor(shift * 0.7)})`;
    ctx.fillRect(0, i * ph + 1, size, ph - 2);
    ctx.fillStyle = 'rgba(42, 24, 12, 0.45)';
    ctx.fillRect(0, i * ph, size, 1.5);
  }

  return configureTexture(canvas, true, anisotropy, 4, 4);
}

export function createAsphaltTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(44);

  ctx.fillStyle = '#3a3f47';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 6000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = 45 + Math.floor(rand() * 32);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    ctx.fillRect(x, y, 2, 2);
  }

  return configureTexture(canvas, true, anisotropy, 16, 4);
}

export function createTennisCourtTexture(anisotropy: number): THREE.CanvasTexture {
  const w = 512;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Outer green surround
  ctx.fillStyle = '#357b65';
  ctx.fillRect(0, 0, w, h);

  // Inner blue playing court
  const mx = 68;
  const my = 110;
  const cw = w - mx * 2;
  const ch = h - my * 2;
  ctx.fillStyle = '#2c6c99';
  ctx.fillRect(mx, my, cw, ch);

  // Crisp white regulation court lines
  ctx.strokeStyle = '#f2f5f7';
  ctx.lineWidth = 6;
  ctx.strokeRect(mx, my, cw, ch);

  // Singles sidelines
  const sx = mx + 46;
  const sw = cw - 92;
  ctx.beginPath();
  ctx.moveTo(sx, my);
  ctx.lineTo(sx, my + ch);
  ctx.moveTo(sx + sw, my);
  ctx.lineTo(sx + sw, my + ch);

  // Service lines
  const servOffset = ch * 0.27;
  ctx.moveTo(sx, my + servOffset);
  ctx.lineTo(sx + sw, my + servOffset);
  ctx.moveTo(sx, my + ch - servOffset);
  ctx.lineTo(sx + sw, my + ch - servOffset);

  // Center service line
  ctx.moveTo(w / 2, my + servOffset);
  ctx.lineTo(w / 2, my + ch - servOffset);

  // Center hash marks
  ctx.moveTo(w / 2, my);
  ctx.lineTo(w / 2, my + 16);
  ctx.moveTo(w / 2, my + ch - 16);
  ctx.lineTo(w / 2, my + ch);
  ctx.stroke();

  // Net line
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(mx - 12, h / 2);
  ctx.lineTo(mx + cw + 12, h / 2);
  ctx.stroke();

  return configureTexture(canvas, true, anisotropy, 1, 1);
}

export function createBasketballCourtTexture(
  variant: 'S' | 'C',
  anisotropy: number,
): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  if (variant === 'S') {
    // Zone S: Warm terracotta surround + sand/cream court + red keys
    ctx.fillStyle = '#9f4a3b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d4b58f';
    ctx.fillRect(48, 36, w - 96, h - 72);
    ctx.fillStyle = '#a84e3e';
  } else {
    // Zone C: Slate navy court + warm orange keys & center circle
    ctx.fillStyle = '#2b3e56';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#334a66';
    ctx.fillRect(48, 36, w - 96, h - 72);
    ctx.fillStyle = '#d97e38';
  }

  const mx = 48;
  const my = 36;
  const cw = w - 96;
  const ch = h - 72;

  // Keys
  const keyW = 148;
  const keyH = 128;
  ctx.fillRect(mx, h / 2 - keyH / 2, keyW, keyH);
  ctx.fillRect(mx + cw - keyW, h / 2 - keyH / 2, keyW, keyH);

  // Center circle fill
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 58, 0, Math.PI * 2);
  ctx.fill();

  // White lines
  ctx.strokeStyle = '#f8f6f0';
  ctx.lineWidth = 5;
  ctx.strokeRect(mx, my, cw, ch);

  // Half court line & center circle
  ctx.beginPath();
  ctx.moveTo(w / 2, my);
  ctx.lineTo(w / 2, my + ch);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 58, 0, Math.PI * 2);
  ctx.stroke();

  // Key borders & 3-point arcs
  ctx.strokeRect(mx, h / 2 - keyH / 2, keyW, keyH);
  ctx.strokeRect(mx + cw - keyW, h / 2 - keyH / 2, keyW, keyH);

  ctx.beginPath();
  ctx.arc(mx + 42, h / 2, 165, -Math.PI * 0.45, Math.PI * 0.45);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(mx + cw - 42, h / 2, 165, Math.PI * 0.55, Math.PI * 1.45);
  ctx.stroke();

  return configureTexture(canvas, true, anisotropy, 1, 1);
}

export function createPoolTileTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(55);

  ctx.fillStyle = '#2ca6be';
  ctx.fillRect(0, 0, size, size);

  const cells = 16;
  const s = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const v = rand();
      ctx.fillStyle =
        v > 0.65 ? '#3bc0d6' : v > 0.3 ? '#289eb5' : '#218ea3';
      ctx.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
    }
  }

  return configureTexture(canvas, true, anisotropy, 8, 8);
}

export function createTowerBadgeSprite(id: string, zone: ZoneId): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const bgColor =
    zone === 'C'
      ? 'rgba(30, 58, 92, 0.92)'
      : 'rgba(92, 58, 40, 0.92)';

  const borderColor =
    zone === 'C' ? '#e3dacb' : '#d4a379';

  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 4;

  // Rounded architectural plaque
  const rx = 28;
  const ry = 18;
  const rw = 200;
  const rh = 92;
  const r = 16;
  ctx.beginPath();
  ctx.moveTo(rx + r, ry);
  ctx.lineTo(rx + rw - r, ry);
  ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
  ctx.lineTo(rx + rw, ry + rh - r);
  ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
  ctx.lineTo(rx + r, ry + rh);
  ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
  ctx.lineTo(rx, ry + r);
  ctx.quadraticCurveTo(rx, ry, rx + r, ry);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 52px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(id, 128, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(16, 8, 1);
  return sprite;
}
