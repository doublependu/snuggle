// SPDX-License-Identifier: GPL-3.0-only
// One small family of stylized Lambert materials, picked by the glTF material *name* that the
// Blender scripts assign (see tools/blender/snuglib.py). Colours come from vertex colours, so no
// textures are downloaded. Variants are cached so the whole game compiles only a handful of programs.
import { MeshLambertMaterial, MeshBasicMaterial, Color, DataTexture, DoubleSide, Vector2, Vector4 } from 'three';

const black = new DataTexture(new Uint8Array(4), 1, 1);
black.needsUpdate = true;

export const shared = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  // The Quiet District (Chapter 3): zone scenery greys out (uFade, 0 = full colour) except in colour pockets
  // (restored memories: xyz + radius), and a height fog thickens near the ground and toward a fog wall.
  // Only materials made with { fade: 1 } (a zone's static scenery) grey out; characters and sprites keep
  // their colour. Everything is off (uniform branches) in other zones. See setGreyOut() below.
  uFade: { value: 0 },
  uFadeTint: { value: new Color(1, 1, 1) },
  uPockets: { value: Array.from({ length: 8 }, () => new Vector4()) },
  uPocketN: { value: 0 },
  uHFog: { value: new Vector4() }, // on, top y, falloff (m), strength
  uHFogWall: { value: new Vector4() }, // toward a fog wall: dir x, dir z, start (m along dir), 1 / length
  // The mist beyond a map's walls (the forest round the station and the Academy, procgen/forest.js): fog by
  // distance outside a rectangle on the ground, so the grounds stay clear and the forest fades out. See setMist().
  uMistRect: { value: new Vector4() }, // centre x, centre z, half size x, half size z
  uMistP: { value: new Vector4() }, // start (m beyond the rectangle), 1 / length, low mist's top y, on
  uMistSea: { value: -1e4 }, // no mist at or below this height: the sea keeps its own horizon
  // Night lighting (render/lamps.js): lantern light painted into a small top-down texture over the zone.
  // Every lit material adds it per pixel, so static scenery, kit instances, characters and creatures all
  // glow the same way for one texture fetch. uLampOn = 0 in daytime zones.
  uLampMap: { value: black },
  uLampRect: { value: new Vector4(0, 0, 1, 1) }, // minX, minZ, 1 / sizeX, 1 / sizeZ
  uLampOn: { value: 0 },
  uLampTop: { value: 4 }, // surfaces this high above the lanterns' floor fade out of their light
};

// Vertex: world position (after skinning / instancing) for the lamp map. Fragment: add the lantern light.
const LAMP_VERT_HEAD = 'varying vec3 vLampWorld;\n';
const LAMP_VERT = `{ vec4 lw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    lw = instanceMatrix * lw;
  #endif
  vLampWorld = (modelMatrix * lw).xyz; }\n`;
const LAMP_FRAG_HEAD = 'varying vec3 vLampWorld; uniform sampler2D uLampMap; uniform vec4 uLampRect; uniform float uLampOn, uLampTop;\n';
const LAMP_FRAG = `if (uLampOn > 0.5) {
    vec2 luv = (vLampWorld.xz - uLampRect.xy) * uLampRect.zw;
    vec3 lamp = texture2D(uLampMap, luv).rgb * 2.0;
    float lh = 1.0 - smoothstep(uLampTop - 1.5, uLampTop + 1.0, vLampWorld.y);
    float face = 0.55 + 0.45 * saturate(normal.y * 0.5 + 0.7);
    outgoingLight += diffuseColor.rgb * lamp * lh * face * uLampOn;
  }\n`;
const lampUniforms = (sh, fade = 0) => {
  sh.uniforms.uLampMap = shared.uLampMap;
  sh.uniforms.uLampRect = shared.uLampRect;
  sh.uniforms.uLampOn = shared.uLampOn;
  sh.uniforms.uLampTop = shared.uLampTop;
  for (const k of ['uFade', 'uFadeTint', 'uPockets', 'uPocketN', 'uHFog', 'uHFogWall', 'uMistRect', 'uMistP', 'uMistSea']) sh.uniforms[k] = shared[k];
  sh.uniforms.uFadeOn = { value: fade };
};

// Grey-out with colour pockets (after the lamp light), and three's fog plus the height fog / fog wall.
// W is the world-position varying of the shader it goes into.
const FADE_HEAD = 'uniform float uFade, uFadeOn, uPocketN; uniform vec3 uFadeTint; uniform vec4 uPockets[8], uHFog, uHFogWall, uMistRect, uMistP; uniform float uMistSea;\n';
const FADE_FRAG = `if (uFade > 0.0 && uFadeOn > 0.5) {
    float keep = 0.0;
    for (int i = 0; i < 8; i++) {
      if (float(i) >= uPocketN) break;
      keep = max(keep, 1.0 - smoothstep(uPockets[i].w * 0.55, uPockets[i].w, distance(vLampWorld, uPockets[i].xyz)));
    }
    outgoingLight = mix(outgoingLight, vec3(dot(outgoingLight, vec3(0.3, 0.59, 0.11))) * uFadeTint, uFade * (1.0 - keep));
  }\n`;
export const fogGLSL = (W) => `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  if (uHFog.x > 0.5) {
    float low = saturate((uHFog.y - ${W}.y) / uHFog.z) * saturate(vFogDepth / 30.0);
    float wall = saturate((dot(${W}.xz, uHFogWall.xy) - uHFogWall.z) * uHFogWall.w);
    fogFactor = saturate(fogFactor + low * uHFog.w + wall * wall);
  }
  if (uMistP.w > 0.5) {
    float out_ = length(max(abs(${W}.xz - uMistRect.xy) - uMistRect.zw, 0.0));
    float m = saturate((out_ - uMistP.x) * uMistP.y);
    float lowm = saturate((uMistP.z - ${W}.y) * 0.6) * saturate(out_ * 0.1) * 0.45;
    fogFactor = saturate(fogFactor + (m * (2.0 - m) + lowm) * smoothstep(uMistSea + 0.1, uMistSea + 1.2, ${W}.y));
  }
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif\n`;

const KINDS = {
  mixed: { mixed: true }, // Blender meshes: shader family per vertex in the colour alpha (tools/blender/snuglib.py)
  cloth: { grid: 0.034, gridStrength: 0.3, rim: 0.22 },
  skin: { rim: 0.28, warm: 0.06 },
  hair: { rim: 0.18, sheen: true },
  paper: { flat: true, rim: 0.16, fiber: 0.05 },
  plain: {},
  ground: { fiber: 0.09, fiberScale: 3 },
  wood: { fiber: 0.05 },
  stone: { fiber: 0.06 },
  roof: { tiles: true },
  leaf: { sway: 1, flat: true, rim: 0.12 },
  grass: { sway: 1.6 },
  glow: { basic: true },
  eye: { basic: true },
  glass: { basic: true, transparent: 0.28 },
  sprite: { basic: true, transparent: 0.9, additive: true },
};

const cache = new Map();

export function materialFor(kind, opts = {}) {
  const def = KINDS[kind] || KINDS.plain;
  const o = { ...def, ...opts };
  const key = kind + '|' + JSON.stringify(opts);
  let m = cache.get(key);
  if (m) return m;
  if (o.basic) {
    m = new MeshBasicMaterial({ vertexColors: o.vertexColors !== false, color: o.color ?? 0xffffff });
    if (o.transparent) {
      m.transparent = true;
      m.opacity = o.transparent;
      m.depthWrite = false;
    }
    if (o.additive) m.blending = 2; // AdditiveBlending
    if (kind === 'glow' || kind === 'sprite') m.toneMapped = false;
  } else {
    m = new MeshLambertMaterial({ vertexColors: o.vertexColors !== false, color: o.color ?? 0xffffff, flatShading: !!o.flat });
    if (o.emissive) m.emissive = new Color(o.emissive);
    if (o.mixed) patchMixed(m, null, o.fade ? 1 : 0);
    else patch(m, o);
  }
  if (o.side === 'double') m.side = DoubleSide;
  m.name = kind;
  cache.set(key, m);
  return m;
}

const SHADER_FLAGS = ['grid', 'gridStrength', 'fiber', 'fiberScale', 'tiles', 'rim', 'warm', 'sheen', 'sway'];

function patch(m, o) {
  const needObj = o.grid || o.fiber || o.tiles;
  // program key from shader-affecting flags only, so colour / emissive variants share one program
  const progKey = SHADER_FLAGS.map((k) => o[k] ?? '').join('|');
  m.customProgramCacheKey = () => progKey;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uWind = shared.uWind;
    lampUniforms(sh, o.fade ? 1 : 0);
    let vHead = LAMP_VERT_HEAD;
    let vBody = '';
    if (needObj) {
      vHead += 'varying vec3 vObjPos; varying vec3 vObjN;\n';
      vBody += 'vObjPos = position; vObjN = objectNormal;\n';
    }
    if (o.sway) {
      vHead += 'uniform float uTime; uniform float uWind;\n';
    }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + vHead)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vBody + (o.sway ? swayGLSL(o.sway) : ''))
      .replace('#include <project_vertex>', LAMP_VERT + '#include <project_vertex>');

    let fHead = LAMP_FRAG_HEAD + FADE_HEAD;
    let fColor = '';
    let fOut = '';
    if (needObj) fHead += 'varying vec3 vObjPos; varying vec3 vObjN;\n' + NOISE;
    if (o.grid) {
      fHead += GRID;
      fColor += `{ float g = clothGrid(vObjPos, vObjN, ${f(o.grid)}); diffuseColor.rgb *= 1.0 - g * ${f(o.gridStrength)}; }\n`;
    }
    if (o.fiber) fColor += `diffuseColor.rgb *= 1.0 - ${f(o.fiber)} * vnoise(vObjPos * ${f(o.fiberScale || 38)}) - ${f(o.fiber * 0.5)} * vnoise(vObjPos * ${f((o.fiberScale || 38) * 4.3)});\n`;
    if (o.tiles) {
      fColor += `{ float rows = abs(fract(vObjPos.z * 5.0) - 0.5); float cols = abs(fract(vObjPos.x * 7.0 + step(0.5, fract(vObjPos.z * 2.5)) * 0.5) - 0.5);
        float t = smoothstep(0.42, 0.5, rows) + 0.5 * smoothstep(0.44, 0.5, cols);
        diffuseColor.rgb *= 1.0 - 0.22 * min(t, 1.0) * step(0.2, abs(vObjN.y)); }\n`;
    }
    if (o.rim || o.warm || o.sheen) {
      fOut += `{ vec3 vdir = normalize(vViewPosition); float fr = pow(1.0 - saturate(dot(normal, vdir)), 3.0);\n`;
      if (o.rim) fOut += `outgoingLight += fr * ${f(o.rim)} * vec3(1.0, 0.93, 0.82) * diffuseColor.rgb * 2.0;\n`;
      if (o.warm) fOut += `outgoingLight += ${f(o.warm)} * diffuseColor.rgb * vec3(1.0, 0.55, 0.4);\n`;
      if (o.sheen) fOut += `outgoingLight += 0.08 * pow(saturate(normal.y * 0.5 + 0.5), 6.0) * vec3(1.0);\n`;
      fOut += '}\n';
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + fHead)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + fColor)
      .replace('#include <opaque_fragment>', fOut + LAMP_FRAG + FADE_FRAG + '#include <opaque_fragment>')
      .replace('#include <fog_fragment>', fogGLSL('vLampWorld'));
  };
}

const f = (x) => (Number.isInteger(x) ? x + '.0' : String(x));

// Characters: 'mixed' plus the character's atlas (tools/blender/bake.py). The atlas holds the painted
// albedo and baked shading; codes 9 / 10 mark the eye and mouth regions of the face, whose UVs are
// shifted by uEye / uMouth to show another expression cell (src/actors/face.js). One material per
// character instance (own face uniforms), one shared program.
export function atlasMaterial(map) {
  const m = new MeshLambertMaterial({ vertexColors: true, map });
  const face = { uEye: { value: new Vector2() }, uMouth: { value: new Vector2() } };
  patchMixed(m, face);
  m.name = 'mixed';
  m.userData.face = face;
  return m;
}

// One program for every Blender mesh. Codes (alpha * 10): 1 plain/wood/stone, 2 cloth, 3 skin, 4 hair,
// 5 eye/glow (unlit), 6 roof tiles, 7 paper (faceted), 8 ground, 9 / 10 face eyes / mouth (atlas only).
function patchMixed(m, face = null, fade = 0) {
  m.customProgramCacheKey = () => (face ? 'mixedAtlas' : 'mixed');
  m.onBeforeCompile = (sh) => {
    if (face) Object.assign(sh.uniforms, face);
    lampUniforms(sh, fade);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec3 vObjN;\n' + LAMP_VERT_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position; vObjN = objectNormal;')
      .replace('#include <project_vertex>', LAMP_VERT + '#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec3 vObjN;\n' + LAMP_FRAG_HEAD + FADE_HEAD + (face ? 'uniform vec2 uEye; uniform vec2 uMouth;\n' : '') + NOISE + GRID)
      .replace('#include <map_fragment>', '')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        int sCode = 1;
        #ifdef USE_COLOR_ALPHA
          sCode = int(vColor.a * 10.0 + 0.5);
          diffuseColor.a = 1.0;
        #endif
        #ifdef USE_MAP
          vec2 aUv = vMapUv;
          if (sCode == 9) aUv += uEye;
          else if (sCode == 10) aUv += uMouth;
          diffuseColor.rgb *= texture2D(map, aUv).rgb;
          if (sCode >= 9) sCode = 3;
        #endif
        if (sCode == 2) diffuseColor.rgb *= 1.0 - 0.3 * clothGrid(vObjPos, vObjN, 0.034);
        else if (sCode == 1) diffuseColor.rgb *= 1.0 - 0.05 * vnoise(vObjPos * 38.0);
        else if (sCode == 8) diffuseColor.rgb *= 1.0 - 0.09 * vnoise(vObjPos * 3.0) - 0.045 * vnoise(vObjPos * 12.9);
        else if (sCode == 6) {
          vec3 an = abs(vObjN);
          float across = an.x > an.z ? vObjPos.z : vObjPos.x;
          float ridge = smoothstep(0.3, 0.5, abs(fract(across * 4.0) - 0.5));
          float rows = smoothstep(0.42, 0.5, abs(fract(vObjPos.y * 5.0) - 0.5));
          diffuseColor.rgb *= 1.0 - (0.22 * ridge + 0.12 * rows) * step(0.25, vObjN.y);
        }`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        if (sCode == 7) normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{ vec3 vdir = normalize(vViewPosition); float fr = pow(1.0 - saturate(dot(normal, vdir)), 3.0);
          if (sCode >= 2 && sCode <= 4) outgoingLight += fr * 0.22 * vec3(1.0, 0.93, 0.82) * diffuseColor.rgb * 2.0;
          if (sCode == 7) outgoingLight += fr * 0.14 * diffuseColor.rgb * 2.0;
          if (sCode == 3) outgoingLight += 0.06 * diffuseColor.rgb * vec3(1.0, 0.55, 0.4);
          if (sCode == 4) outgoingLight += 0.08 * pow(saturate(normal.y * 0.5 + 0.5), 6.0) * vec3(1.0);
          if (sCode == 5) outgoingLight = diffuseColor.rgb + totalEmissiveRadiance; }
        if (sCode != 5) ${LAMP_FRAG}
        if (sCode != 5) ${FADE_FRAG}
        #include <opaque_fragment>`,
      )
      .replace('#include <fog_fragment>', fogGLSL('vLampWorld'));
  };
}

function swayGLSL(amount) {
  // sway grows with height above the object's origin; phase from world position so neighbours differ
  return `{ vec4 wp = modelMatrix * vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #endif
  float h = max(0.0, transformed.y);
  float ph = wp.x * 0.35 + wp.z * 0.27;
  float s = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25;
  transformed.x += s * h * 0.03 * ${f(amount)} * uWind;
  transformed.z += cos(uTime * 1.1 + ph) * h * 0.02 * ${f(amount)} * uWind; }\n`;
}

const NOISE = `
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) { vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

// Thin anti-aliased grid in object space (triplanar by dominant normal axis): the stitched-fabric look.
const GRID = `
float gridAxis(vec2 p, float cell) {
  vec2 q = p / cell;
  vec2 w = fwidth(q);
  vec2 g = abs(fract(q - 0.5) - 0.5) / max(w, vec2(1e-4));
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  float fade = 1.0 - smoothstep(0.18, 0.45, max(w.x, w.y));
  return line * fade;
}
float clothGrid(vec3 p, vec3 n, float cell) {
  vec3 a = abs(n);
  vec2 uv = a.x > a.y && a.x > a.z ? p.yz : (a.y > a.z ? p.xz : p.xy);
  return gridAxis(uv, cell);
}
`;

// Replace glTF materials with the stylized family; returns the root for chaining.
// fade: a zone's static scenery, which greys out in the Quiet District (see shared.uFade).
export function stylize(root, { shadows = true, receive = true, overrides = {}, fade = false } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const name = (o.material?.name || 'plain').split('.')[0];
    const kind = overrides[name] || name;
    o.material = kind === 'mixed' && o.material.map ? atlasMaterial(o.material.map) : materialFor(kind, fade ? { fade: 1 } : {});
    const basic = KINDS[kind]?.basic;
    o.castShadow = shadows && !basic;
    o.receiveShadow = receive && !basic;
  });
  return root;
}

// The Quiet District's look (Chapter 3): grey-out amount and tint, the height fog and the fog wall.
// setGreyOut() with no argument turns it all off (zones do on dispose).
export function setGreyOut({ fade = 0, tint = '#ffffff', fog = null, wall = null } = {}) {
  shared.uFade.value = fade;
  shared.uFadeTint.value.set(tint);
  const h = shared.uHFog.value;
  if (fog) h.set(1, fog.top, fog.falloff, fog.strength);
  else h.set(0, 0, 1, 0);
  const w = shared.uHFogWall.value;
  if (wall) {
    const len = Math.hypot(wall.dir.x, wall.dir.z) || 1;
    w.set(wall.dir.x / len, wall.dir.z / len, wall.start, 1 / wall.length);
  } else w.set(0, 0, 1e9, 0);
  if (!fog) setPockets([]);
}

// Colour pockets: [{ position: Vector3, radius }] (at most 8).
export function setPockets(list) {
  const n = Math.min(8, list.length);
  for (let i = 0; i < n; i++) shared.uPockets.value[i].set(list[i].position.x, list[i].position.y, list[i].position.z, list[i].radius);
  shared.uPocketN.value = n;
}

// The mist beyond a map's walls: rect { minX, maxX, minZ, maxZ } is the play area (an open side: +-Infinity),
// start and length in metres beyond it, lowTop the top of the low mist between the trunks (null: none), sea
// the water level (the sea is left out: it keeps its own horizon).
// setMist() with no argument turns it off (zones do on dispose).
export function setMist(rect = null, { start = 8, length = 70, lowTop = null, sea = null } = {}) {
  const BIG = 1e5;
  const c = (v) => Math.max(-BIG, Math.min(BIG, v));
  if (rect) shared.uMistRect.value.set((c(rect.minX) + c(rect.maxX)) / 2, (c(rect.minZ) + c(rect.maxZ)) / 2, (c(rect.maxX) - c(rect.minX)) / 2, (c(rect.maxZ) - c(rect.minZ)) / 2);
  shared.uMistP.value.set(start, 1 / length, lowTop ?? -1e4, rect ? 1 : 0);
  shared.uMistSea.value = sea ?? -1e4;
}
