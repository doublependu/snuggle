// One small family of stylized Lambert materials, picked by the glTF material *name* that the
// Blender scripts assign (see tools/blender/snuglib.py). Colours come from vertex colours, so no
// textures are downloaded. Variants are cached so the whole game compiles only a handful of programs.
import { MeshLambertMaterial, MeshBasicMaterial, Color, DoubleSide, Vector2 } from 'three';

export const shared = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uFade: { value: 0 }, // Quiet-District grey-out, later chapters
};

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
    if (o.mixed) patchMixed(m);
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
  if (!(needObj || o.rim || o.sway || o.warm || o.sheen)) return;
  // program key from shader-affecting flags only, so colour / emissive variants share one program
  const progKey = SHADER_FLAGS.map((k) => o[k] ?? '').join('|');
  m.customProgramCacheKey = () => progKey;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uWind = shared.uWind;
    let vHead = '';
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
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vBody + (o.sway ? swayGLSL(o.sway) : ''));

    let fHead = '';
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
      .replace('#include <opaque_fragment>', fOut + '#include <opaque_fragment>');
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
function patchMixed(m, face = null) {
  m.customProgramCacheKey = () => (face ? 'mixedAtlas' : 'mixed');
  m.onBeforeCompile = (sh) => {
    if (face) Object.assign(sh.uniforms, face);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position; vObjN = objectNormal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec3 vObjN;\n' + (face ? 'uniform vec2 uEye; uniform vec2 uMouth;\n' : '') + NOISE + GRID)
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
        #include <opaque_fragment>`,
      );
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
export function stylize(root, { shadows = true, receive = true, overrides = {} } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const name = (o.material?.name || 'plain').split('.')[0];
    const kind = overrides[name] || name;
    o.material = kind === 'mixed' && o.material.map ? atlasMaterial(o.material.map) : materialFor(kind);
    const basic = KINDS[kind]?.basic;
    o.castShadow = shadows && !basic;
    o.receiveShadow = receive && !basic;
  });
  return root;
}
