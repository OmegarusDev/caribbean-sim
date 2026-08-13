/** GLSL sources — ships, water, sky, particles. Zero assets, all procedural. */

export const SHIP_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aColor;
layout(location=3) in vec2 aBind;
layout(location=4) in float aKind;

uniform mat4 u_model;
uniform mat4 u_viewProj;
uniform vec2 u_windLocal;
uniform float u_time;
uniform float u_sailRatio;

out vec3 v_normal;
out vec3 v_world;
out vec4 v_color;
out float v_kind;

void main() {
  vec3 p = aPos;
  if (aKind > 0.5 && aKind < 2.5) {
    // Sails: billow downwind (u across -1..1, v down 0..1), flutter, sag when torn.
    float u = aBind.x;
    float v = aBind.y;
    float billow = sin(u * 3.14159) * (1.0 - v * 0.5) * 0.18 * u_sailRatio;
    p.x += u_windLocal.x * billow;
    p.z += u_windLocal.y * billow;
    p.x += sin(u * 7.0 + u_time * 5.0) * 0.012 * u_sailRatio;
    p.y -= (1.0 - u_sailRatio) * v * 3.0;
  } else if (aKind > 2.5) {
    float wave = sin(aPos.x * 6.0 + u_time * 9.0);
    p.y += wave * 0.03;
    p.z += cos(aPos.x * 6.0 + u_time * 9.0) * 0.03;
  }
  vec4 world = u_model * vec4(p, 1.0);
  v_normal = mat3(u_model) * aNormal;
  v_world = world.xyz;
  v_color = aColor;
  v_kind = aKind;
  gl_Position = u_viewProj * world;
}`;

export const SHIP_FS = `#version 300 es
precision mediump float;

in vec3 v_normal;
in vec3 v_world;
in vec4 v_color;
in float v_kind;

uniform vec3 u_lightDir;
uniform vec3 u_eye;
uniform vec3 u_stripe;
uniform vec3 u_flag;
uniform vec3 u_fog;
uniform float u_fogStart;
uniform float u_fogEnd;

out vec4 frag;

void main() {
  vec3 albedo = v_color.rgb;
  if (v_kind > 2.5) {
    albedo = u_flag;
  } else if (v_kind > 0.5 && v_kind < 2.5) {
    albedo = vec3(0.94, 0.9, 0.78);
  } else {
    float stripe = smoothstep(0.1, 0.4, v_color.a);
    albedo = mix(albedo, u_stripe, stripe * 0.9);
  }
  vec3 n = normalize(v_normal);
  float diff = max(dot(n, u_lightDir), 0.0);
  vec3 viewDir = normalize(u_eye - v_world);
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.0) * 0.35;
  vec3 col = albedo * (0.45 + 0.55 * diff) + vec3(1.0, 0.9, 0.75) * rim * 0.25;
  float fog = smoothstep(u_fogStart, u_fogEnd, length(u_eye - v_world));
  col = mix(col, u_fog, clamp(fog, 0.0, 0.9));
  frag = vec4(col, 1.0);
}`;

export const WATER_VS = `#version 300 es
layout(location=0) in vec2 aPos;

uniform vec2 u_center;
uniform float u_time;
uniform mat4 u_viewProj;

out vec3 v_world;
out float v_height;

float wave(vec2 p, vec2 dir, float amp, float freq, float speed) {
  float d = dot(p, dir);
  return sin(d * freq + u_time * speed) * amp;
}

void main() {
  vec2 wp = u_center + aPos;
  float h = 0.0;
  h += wave(wp, normalize(vec2(1.0, 0.35)), 3.2, 0.013, 1.4);
  h += wave(wp, normalize(vec2(-0.7, 0.8)), 2.0, 0.021, 2.0);
  h += wave(wp, normalize(vec2(0.25, -1.0)), 1.1, 0.034, 2.7);
  h += wave(wp, normalize(vec2(0.9, 0.1)), 0.7, 0.05, 3.4);
  v_height = h;
  v_world = vec3(wp.x, h, wp.y);
  gl_Position = u_viewProj * vec4(v_world, 1.0);
}`;

export const WATER_FS = `#version 300 es
precision mediump float;

in vec3 v_world;
in float v_height;

uniform vec3 u_eye;
uniform vec3 u_sunDir;
uniform vec3 u_horizon;

out vec4 frag;

void main() {
  vec3 deep = vec3(0.012, 0.07, 0.105);
  vec3 mid = vec3(0.024, 0.14, 0.19);
  vec3 col = mix(deep, mid, 0.55);
  float swell = sin(v_world.x * 0.05) * sin(v_world.z * 0.043);
  col *= 0.96 + 0.04 * swell;
  float foam = smoothstep(2.4, 3.6, v_height);
  col = mix(col, vec3(0.72, 0.84, 0.87), foam * 0.75);
  vec3 v = normalize(u_eye - v_world);
  float spec = pow(max(dot(reflect(-u_sunDir, vec3(0.0, 1.0, 0.0)), v), 0.0), 80.0);
  col += vec3(1.0, 0.92, 0.72) * spec * 0.9;
  float dist = length(u_eye - v_world);
  float fog = clamp(dist / 2400.0, 0.0, 1.0);
  col = mix(col, u_horizon, fog * 0.88);
  frag = vec4(col, 1.0);
}`;

export const SKY_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 v_uv;
void main() {
  v_uv = aPos;
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.999, 1.0);
}`;

export const SKY_FS = `#version 300 es
precision mediump float;

in vec2 v_uv;
uniform mat4 u_invViewProj;
uniform vec3 u_top;
uniform vec3 u_horizon;
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;

out vec4 frag;

void main() {
  vec4 clip = vec4(v_uv * 2.0 - 1.0, -1.0, 1.0);
  vec4 w = u_invViewProj * clip;
  vec3 dir = normalize(w.xyz / w.w);
  float h = dir.y;
  vec3 col = mix(u_horizon, u_top, smoothstep(0.0, 0.4, h));
  col = mix(col, u_horizon * 0.6, smoothstep(0.02, -0.3, h) * 0.5);
  float sd = max(dot(dir, u_sunDir), 0.0);
  col += u_sunColor * pow(sd, 600.0) * 1.6;
  col += u_sunColor * pow(sd, 10.0) * 0.1;
  frag = vec4(col, 1.0);
}`;

export const PARTICLE_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in float aSize;
layout(location=2) in vec4 aColor;

uniform mat4 u_viewProj;
uniform float u_scale;

out vec4 v_color;

void main() {
  vec4 view = u_viewProj * vec4(aPos, 1.0);
  gl_Position = view;
  gl_PointSize = aSize * (u_scale / max(-view.z, 0.1));
  v_color = aColor;
}`;

export const PARTICLE_FS = `#version 300 es
precision mediump float;

in vec4 v_color;
out vec4 frag;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  float a = smoothstep(1.0, 0.2, d);
  frag = vec4(v_color.rgb, v_color.a * a);
}`;
