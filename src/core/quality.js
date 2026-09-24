// Quality tiers + dynamic resolution. The tier is probed from the device, then refined from the
// measured frame time during the first seconds of play; players can override it in Settings.
export const TIERS = {
  low: { pixelRatio: 1.0, shadows: false, shadowSize: 0, water: 0, foliage: 0.4, particles: 0.3, sway: false, drawDistance: 70 },
  medium: { pixelRatio: 1.25, shadows: true, shadowSize: 1024, water: 1, foliage: 0.7, particles: 0.6, sway: true, drawDistance: 110 },
  high: { pixelRatio: 1.5, shadows: true, shadowSize: 2048, water: 2, foliage: 1, particles: 1, sway: true, drawDistance: 160 },
};

export function probeTier() {
  const q = new URLSearchParams(location.search).get('quality');
  if (q && TIERS[q]) return q;
  const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    /* no probe */
  }
  const weakGpu = /Mali-G(5|6|7[0-2])|Mali-T|Adreno \(TM\) [3-6]\d\d|PowerVR|SwiftShader|llvmpipe|Intel\(R\) (HD|UHD) Graphics [4-6]\d\d/i.test(gpu);
  if (mobile) return mem >= 6 && cores >= 8 && !weakGpu ? 'medium' : 'low';
  if (weakGpu || cores <= 4) return 'medium';
  return 'high';
}

export class Quality {
  constructor(renderer, tierName) {
    this.renderer = renderer;
    this.auto = true;
    this.scale = 1;
    this.ema = 16.7;
    this.samples = 0;
    this.lastAdjust = 0;
    this.listeners = new Set();
    this.set(tierName);
  }
  onChange(fn) {
    this.listeners.add(fn);
  }
  set(name) {
    this.name = name;
    this.tier = TIERS[name];
    this.scale = 1;
    this.applyPixelRatio();
    for (const fn of this.listeners) fn(this.tier, name);
  }
  applyPixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.tier.pixelRatio);
    this.renderer.setPixelRatio(Math.max(0.5, dpr * this.scale));
  }
  // Called every frame with the real frame time (ms).
  sample(ms, now) {
    if (ms > 250) return; // tab switch / hitch
    this.ema += (ms - this.ema) * 0.05;
    this.samples++;
    if (now - this.lastAdjust < 2000 || this.samples < 90) return;
    this.lastAdjust = now;
    const target = this.name === 'low' ? 30 : 17.5; // ms budget
    if (this.ema > target * 1.25 && this.scale > 0.65) {
      this.scale = Math.max(0.65, this.scale - 0.1);
      this.applyPixelRatio();
    } else if (this.ema < target * 0.8 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.05);
      this.applyPixelRatio();
    }
    // step the tier down once if even the lowest scale can't keep up
    if (this.auto && this.scale <= 0.66 && this.ema > target * 1.3 && this.name !== 'low') {
      this.set(this.name === 'high' ? 'medium' : 'low');
    }
  }
}
