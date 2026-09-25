// SPDX-License-Identifier: GPL-3.0-only
// Night lighting: lantern light painted into a small top-down texture over the zone (the "lamp map").
// Every lit material samples it once per pixel (render/materials.js), so hundreds of lanterns cost the
// same as one, instanced kit pieces and characters are lit alike, and nothing pops as you walk around.
import { Color, DataTexture, LinearFilter, RGBAFormat, ClampToEdgeWrapping } from 'three';
import { shared } from './materials.js';

const _c = new Color();
const none = shared.uLampMap.value; // 1x1 black, bound while no zone is lit

// lamps: [{ position: Vector3, color, radius (m), intensity }]; rect: { minX, minZ, maxX, maxZ } (world).
// texel: metres per texel (capped to 256 texels a side). floorY: the ground the lanterns stand over.
export function bakeLampMap(lamps, rect, { texel = 0.5, floorY = 0, top = 3.2 } = {}) {
  const sx = rect.maxX - rect.minX,
    sz = rect.maxZ - rect.minZ;
  const w = Math.min(256, Math.ceil(sx / texel)),
    h = Math.min(256, Math.ceil(sz / texel));
  const acc = new Float32Array(w * h * 3);
  for (const l of lamps) {
    _c.set(l.color || '#ffb867');
    const r = l.radius || 5;
    const k = l.intensity ?? 1;
    const x0 = Math.max(0, Math.floor(((l.position.x - r - rect.minX) / sx) * w)),
      x1 = Math.min(w - 1, Math.ceil(((l.position.x + r - rect.minX) / sx) * w));
    const z0 = Math.max(0, Math.floor(((l.position.z - r - rect.minZ) / sz) * h)),
      z1 = Math.min(h - 1, Math.ceil(((l.position.z + r - rect.minZ) / sz) * h));
    for (let j = z0; j <= z1; j++) {
      const wz = rect.minZ + ((j + 0.5) / h) * sz;
      for (let i = x0; i <= x1; i++) {
        const wx = rect.minX + ((i + 0.5) / w) * sx;
        const d = Math.hypot(wx - l.position.x, wz - l.position.z) / r;
        if (d >= 1) continue;
        const a = (1 - d) * (1 - d) * k;
        const o = (j * w + i) * 3;
        acc[o] += _c.r * a;
        acc[o + 1] += _c.g * a;
        acc[o + 2] += _c.b * a;
      }
    }
  }
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    // soft knee so crowded lantern rows glow warmly instead of clipping to white; stored at half scale
    for (let c = 0; c < 3; c++) {
      const v = acc[i * 3 + c];
      px[i * 4 + c] = Math.round(255 * Math.min(1, (v / (1 + v * 0.35)) * 0.5));
    }
    px[i * 4 + 3] = 255;
  }
  const tex = new DataTexture(px, w, h, RGBAFormat);
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  if (shared.uLampMap.value !== none) shared.uLampMap.value.dispose();
  shared.uLampMap.value = tex;
  shared.uLampRect.value.set(rect.minX, rect.minZ, 1 / sx, 1 / sz);
  shared.uLampTop.value = floorY + top;
  shared.uLampOn.value = 1;
  return tex;
}

export function clearLamps() {
  shared.uLampOn.value = 0;
  if (shared.uLampMap.value !== none) shared.uLampMap.value.dispose();
  shared.uLampMap.value = none;
}
