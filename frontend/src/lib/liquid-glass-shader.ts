/**
 * Ported & adapted from rdev/liquid-glass-react (MIT License)
 * https://github.com/rdev/liquid-glass-react
 *
 * Provides the signed-distance-field (SDF) refractive displacement map
 * generator, directional elastic scaling, and cursor-reactive specular
 * border math without the upstream absolute-centering layout bugs.
 */

export interface Vec2 {
  x: number;
  y: number;
}

function smoothStep(a: number, b: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return clamped * clamped * (3 - 2 * clamped);
}

function vecLength(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function roundedRectSDF(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): number {
  const qx = Math.abs(x) - width + radius;
  const qy = Math.abs(y) - height + radius;
  return Math.min(Math.max(qx, qy), 0) + vecLength(Math.max(qx, 0), Math.max(qy, 0)) - radius;
}

export function liquidGlassFragment(uv: Vec2): Vec2 {
  const ix = uv.x - 0.5;
  const iy = uv.y - 0.5;
  // Square 0.38 x 0.38 SDF keeps X and Y refractive rim thickness balanced.
  const distanceToEdge = roundedRectSDF(ix, iy, 0.38, 0.38, 0.55);
  const displacement = smoothStep(0.8, 0, distanceToEdge - 0.15);
  const scaled = smoothStep(0, 1, displacement);
  return {
    x: ix * scaled + 0.5,
    y: iy * scaled + 0.5,
  };
}

/** Deterministic SVG normal-map fallback when Canvas 2D is unavailable (e.g. jsdom). */
const FALLBACK_DISPLACEMENT_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">' +
      '<defs>' +
      '<radialGradient id="g" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0%" stop-color="rgb(128,128,128)"/>' +
      '<stop offset="72%" stop-color="rgb(128,128,128)"/>' +
      '<stop offset="100%" stop-color="rgb(220,36,220)"/>' +
      '</radialGradient>' +
      '</defs>' +
      '<rect width="128" height="128" fill="url(#g)"/>' +
      '</svg>',
  );

const mapCache = new Map<string, string>();

/**
 * Generates (and memoizes) a normal-encoded RGBA displacement map data URL
 * where Red encodes X displacement and Green/Blue encode Y displacement.
 */
export function generateLiquidDisplacementMap(width = 160, height = 160): string {
  const key = `${width}x${height}`;
  const cached = mapCache.get(key);
  if (cached) return cached;

  if (typeof document === 'undefined') {
    mapCache.set(key, FALLBACK_DISPLACEMENT_URI);
    return FALLBACK_DISPLACEMENT_URI;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.createImageData !== 'function') {
      mapCache.set(key, FALLBACK_DISPLACEMENT_URI);
      return FALLBACK_DISPLACEMENT_URI;
    }

    let maxScale = 1;
    const rawValues = new Float32Array(width * height * 2);
    let writeIdx = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = liquidGlassFragment({ x: x / width, y: y / height });
        const dx = pos.x * width - x;
        const dy = pos.y * height - y;
        maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
        rawValues[writeIdx++] = dx;
        rawValues[writeIdx++] = dy;
      }
    }

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    let readIdx = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = rawValues[readIdx++];
        const dy = rawValues[readIdx++];
        const edgeDistance = Math.min(x, y, width - x - 1, height - y - 1);
        const edgeFactor = Math.min(1, edgeDistance / 2);
        const r = (dx * edgeFactor) / maxScale + 0.5;
        const g = (dy * edgeFactor) / maxScale + 0.5;
        const p = (y * width + x) * 4;
        data[p] = Math.max(0, Math.min(255, Math.round(r * 255)));
        data[p + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
        data[p + 2] = Math.max(0, Math.min(255, Math.round(g * 255)));
        data[p + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const url = canvas.toDataURL('image/png');
    mapCache.set(key, url || FALLBACK_DISPLACEMENT_URI);
    return url || FALLBACK_DISPLACEMENT_URI;
  } catch {
    mapCache.set(key, FALLBACK_DISPLACEMENT_URI);
    return FALLBACK_DISPLACEMENT_URI;
  }
}

/**
 * Computes the specular border linear-gradient parameters from a normalized
 * mouse offset (-50..50 on each axis).
 */
export function computeSpecularAngle(mouseOffset: Vec2) {
  const angleDeg = Math.round((135 + mouseOffset.x * 1.2) * 10) / 10;
  const stop1Opacity = Math.min(0.95, 0.14 + Math.abs(mouseOffset.x) * 0.008);
  const stop2Opacity = Math.min(0.98, 0.44 + Math.abs(mouseOffset.x) * 0.012);
  const stop1Pct = Math.round(Math.max(10, 33 + mouseOffset.y * 0.3));
  const stop2Pct = Math.round(Math.min(90, 66 + mouseOffset.y * 0.4));
  return { angleDeg, stop1Opacity, stop2Opacity, stop1Pct, stop2Pct };
}

/**
 * Builds the CSS linear-gradient string for the xor-masked specular border.
 * Dark mode uses luminous white stops; Light mode uses an iridescent
 * indigo -> pure white -> sky-blue prism rim so it remains visible against
 * bright frosted-white cards.
 */
export function computeSpecularGradient(mouseOffset: Vec2, isDark: boolean): string {
  const spec = computeSpecularAngle(mouseOffset);
  if (isDark) {
    return `linear-gradient(${spec.angleDeg}deg, rgba(255,255,255,0) 0%, rgba(255,255,255,${spec.stop1Opacity.toFixed(3)}) ${spec.stop1Pct}%, rgba(255,255,255,${spec.stop2Opacity.toFixed(3)}) ${spec.stop2Pct}%, rgba(255,255,255,0) 100%)`;
  }
  const indigoAlpha = Math.min(0.75, spec.stop1Opacity + 0.18).toFixed(3);
  const skyAlpha = Math.min(0.85, spec.stop2Opacity + 0.12).toFixed(3);
  return `linear-gradient(${spec.angleDeg}deg, rgba(79,70,229,0) 0%, rgba(79,70,229,${indigoAlpha}) ${spec.stop1Pct}%, rgba(255,255,255,0.95) 50%, rgba(14,165,233,${skyAlpha}) ${spec.stop2Pct}%, rgba(14,165,233,0) 100%)`;
}

/**
 * Computes Apple-style directional liquid stretch when the pointer is within
 * 200px of the element's edges. Only used when `elastic={true}` on leaf pills.
 */
export function computeDirectionalScale(
  mousePos: Vec2,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  elasticity = 0.15,
): string {
  if (elasticity <= 0 || rect.width <= 0 || rect.height <= 0) return 'scale(1)';
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const deltaX = mousePos.x - centerX;
  const deltaY = mousePos.y - centerY;

  const edgeDistanceX = Math.max(0, Math.abs(deltaX) - rect.width / 2);
  const edgeDistanceY = Math.max(0, Math.abs(deltaY) - rect.height / 2);
  const edgeDistance = Math.sqrt(edgeDistanceX * edgeDistanceX + edgeDistanceY * edgeDistanceY);
  const activationZone = 200;

  if (edgeDistance > activationZone) return 'scale(1)';

  const centerDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  if (centerDistance === 0) return 'scale(1)';

  const fadeInFactor = 1 - edgeDistance / activationZone;
  const normalizedX = deltaX / centerDistance;
  const normalizedY = deltaY / centerDistance;
  const stretch = Math.min(centerDistance / 300, 1) * elasticity * fadeInFactor;

  const scaleX = Math.max(0.85, 1 + Math.abs(normalizedX) * stretch * 0.25 - Math.abs(normalizedY) * stretch * 0.12);
  const scaleY = Math.max(0.85, 1 + Math.abs(normalizedY) * stretch * 0.25 - Math.abs(normalizedX) * stretch * 0.12);

  return `scaleX(${scaleX.toFixed(4)}) scaleY(${scaleY.toFixed(4)})`;
}
