// SPDX-License-Identifier: GPL-3.0-only
// Scenery seen from the train windows: the world slides past at train speed. Poles, bushes and trees
// are instanced and wrap around a fixed span; the paddy ground is a scrolling canvas texture.
import {
  BoxGeometry, CanvasTexture, Color, CylinderGeometry, DynamicDrawUsage, IcosahedronGeometry, InstancedMesh, Mesh,
  MeshLambertMaterial, Object3D, PlaneGeometry, RepeatWrapping, SRGBColorSpace,
} from 'three';
import { mulberry } from '../render/sky.js';

const SPAN = 140;

export function trainScenery(group, { speed = 13, density = 1 } = {}) {
  const rnd = mulberry(11);
  const layers = [];
  const dummy = new Object3D();

  // paddy fields: green patches with water channels, scrolling
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#5f7f55';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const g = 90 + ((i * 7 + j * 13) % 5) * 12;
      x.fillStyle = `rgb(${g - 30},${g + 30},${g - 40})`;
      x.fillRect(i * 64 + 3, j * 64 + 3, 58, 58);
      x.fillStyle = 'rgba(160,190,200,0.35)';
      for (let k = 0; k < 6; k++) x.fillRect(i * 64 + 6, j * 64 + 8 + k * 9, 52, 2);
    }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(SPAN / 24, 12);
  const ground = new Mesh(new PlaneGeometry(SPAN * 2, 300).rotateX(-Math.PI / 2), new MeshLambertMaterial({ map: tex }));
  ground.position.y = -1.4;
  group.add(ground);

  const addLayer = (geo, color, count, zMin, zMax, scaleFn, yFn = () => -1.4) => {
    const m = new InstancedMesh(geo, new MeshLambertMaterial({ color: new Color(color), flatShading: true }), count);
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    const items = [];
    for (let i = 0; i < count; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const s = scaleFn();
      items.push({ x: (rnd() - 0.5) * SPAN * 2, z: side * (zMin + rnd() * (zMax - zMin)), y: yFn(), s, r: rnd() * 6 });
    }
    m.frustumCulled = false;
    group.add(m);
    layers.push({ m, items });
  };
  // telegraph poles close to the track
  const poleGeo = new CylinderGeometry(0.08, 0.1, 7, 5).translate(0, 3.5, 0);
  const poles = new InstancedMesh(poleGeo, new MeshLambertMaterial({ color: 0x4a3b30 }), 12);
  poles.frustumCulled = false;
  group.add(poles);
  const poleItems = Array.from({ length: 12 }, (_, i) => ({ x: -SPAN + i * ((SPAN * 2) / 12), z: i % 2 ? 4.6 : -4.6, y: -1.4, s: 1, r: 0 }));
  layers.push({ m: poles, items: poleItems });
  const n = (k) => Math.max(4, Math.round(k * density));
  addLayer(new IcosahedronGeometry(1, 0), '#4f7a45', n(40), 7, 22, () => 0.8 + rnd() * 1.4);
  addLayer(new IcosahedronGeometry(1, 0).translate(0, 1.4, 0), '#3f6a3f', n(36), 18, 70, () => 2 + rnd() * 3);
  addLayer(new BoxGeometry(4, 3, 4).translate(0, 1.5, 0), '#d9cfbf', n(8), 30, 90, () => 1 + rnd() * 0.6);
  addLayer(new CylinderGeometry(0, 3.2, 2.2, 4).translate(0, 4.1, 0), '#4d5358', n(8), 30, 90, () => 1 + rnd() * 0.6);
  // roofs must sit on the houses: share positions with the house layer
  const houses = layers[layers.length - 2].items;
  layers[layers.length - 1].items = houses.map((h) => ({ ...h }));

  return (dt) => {
    const d = speed * dt;
    tex.offset.x += d / 24;
    for (const L of layers) {
      L.items.forEach((it, i) => {
        it.x -= d;
        if (it.x < -SPAN) it.x += SPAN * 2;
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(0, it.r, 0);
        dummy.scale.setScalar(it.s);
        dummy.updateMatrix();
        L.m.setMatrixAt(i, dummy.matrix);
      });
      L.m.instanceMatrix.needsUpdate = true;
    }
  };
}
