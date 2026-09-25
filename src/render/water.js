// SPDX-License-Identifier: GPL-3.0-only
// Stylized water: two scrolling noise normals, fresnel to a reflected sky gradient and a sun glint.
// No render-to-texture, so it is cheap on every tier (the tier only toggles one noise octave).
// Optional vertex colour red channel = "shallowness" painted near shores in Blender.
import { Color, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three';
import { shared } from './materials.js';

export function makeWater(opts = {}) {
  const o = { deep: '#1f5a5c', shallow: '#4a948a', top: '#6fa7d8', horizon: '#dcebf2', sun: new Vector3(0.4, 0.5, -0.6), detail: 1, ...opts };
  const m = new ShaderMaterial({
    fog: true,
    defines: { DETAIL: o.detail },
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        deep: { value: new Color(o.deep) },
        shallow: { value: new Color(o.shallow) },
        skyTop: { value: new Color(o.top) },
        skyHorizon: { value: new Color(o.horizon) },
        sunDir: { value: o.sun.clone().normalize() },
        grey: { value: 0 },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute vec4 color;
      varying vec3 vWorld; varying float vShore;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vShore = color.r;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 deep, shallow, skyTop, skyHorizon, sunDir; uniform float grey;
      uniform sampler2D uLampMap; uniform vec4 uLampRect; uniform float uLampOn;
      varying vec3 vWorld; varying float vShore;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      float hgt(vec2 p){
        float h = n2(p * 0.9 + vec2(uTime * 0.12, uTime * 0.05)) * 0.6 + n2(p * 2.1 - vec2(uTime * 0.07, -uTime * 0.11)) * 0.3;
        #if DETAIL > 0
          h += n2(p * 5.3 + vec2(uTime * 0.2, 0.0)) * 0.12;
        #endif
        return h; }
      void main(){
        vec2 p = vWorld.xz;
        float e = 0.08;
        float h0 = hgt(p);
        vec3 n = normalize(vec3(h0 - hgt(p + vec2(e, 0.0)), 0.35, h0 - hgt(p + vec2(0.0, e))));
        vec3 v = normalize(cameraPosition - vWorld);
        float fr = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 r = reflect(-v, n);
        vec3 sky = mix(skyHorizon, skyTop, smoothstep(0.0, 0.6, r.y));
        vec3 base = mix(deep, shallow, clamp(vShore + 0.15 * h0, 0.0, 1.0));
        vec3 c = mix(base, sky, 0.14 + fr * 0.6);
        float s = pow(max(dot(r, normalize(sunDir)), 0.0), 120.0);
        c += vec3(1.0, 0.95, 0.85) * s * 1.4;
        if (uLampOn > 0.5) {
          // lantern light on the water: wobbling warm reflections under nearby lanterns
          vec2 luv = (vWorld.xz + (n.xz * 1.8) - uLampRect.xy) * uLampRect.zw;
          vec3 lamp = texture2D(uLampMap, luv).rgb * 2.0;
          float streak = 0.35 + 0.65 * smoothstep(0.35, 0.75, h0);
          c += lamp * (0.35 + fr * 0.5) * streak;
        }
        c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), grey);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uTime = shared.uTime;
  m.uniforms.uLampMap = shared.uLampMap;
  m.uniforms.uLampRect = shared.uLampRect;
  m.uniforms.uLampOn = shared.uLampOn;
  return m;
}
