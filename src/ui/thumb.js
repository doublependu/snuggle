// SPDX-License-Identifier: GPL-3.0-only
// Creature portraits for the HUD's helper chip and the Sprite Book: rendered once into a small render target
// and cached as a data URL.
import { AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderTarget } from 'three';
import { G } from '../game.js';
import { makeCreature } from '../actors/creatures.js';

const thumbs = {};

export function thumb(id) {
  if (thumbs[id]) return thumbs[id];
  const size = 128;
  const renderer = G.renderer;
  try {
    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 1.6));
    const d = new DirectionalLight(0xfff2e0, 2.4);
    d.position.set(1, 2, 3);
    scene.add(d);
    const c = makeCreature(id);
    c.position.set(0, 0, 0);
    c.rotation.y = -0.35;
    scene.add(c);
    const cam = new PerspectiveCamera(30, 1, 0.05, 20);
    const h = { grey: 0.55, cloud: 0.52, homework: 0.58, sock: 0.48, pompom: 0.5 }[id] || 0.35;
    cam.position.set(0.35, h * 0.9, h * 3.2);
    cam.lookAt(0, h * 0.5, 0);
    const rt = new WebGLRenderTarget(size, size);
    rt.texture.colorSpace = SRGBColorSpace;
    const prevRT = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(prevClear, prevAlpha);
    rt.dispose();
    // nothing was drawn (seen before the first frame of a session): don't keep the blank, try again next time
    if (!px.some((v, i) => (i & 3) === 3 && v)) return '';
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    thumbs[id] = cv.toDataURL();
  } catch {
    thumbs[id] = '';
  }
  return thumbs[id];
}
