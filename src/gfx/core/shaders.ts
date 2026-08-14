/**
 * GLSL sources — ships (instanced), ring, water, sky, particles.
 * Zero assets: detail comes from a shared procedural noise texture.
 * Everything runs at highp — mobile GPUs implement mediump as real fp16,
 * which destroys world-space varyings and the inverse view-proj.
 */

const COMMON_HEAD = `#version 300 es
precision highp float;
`;

import { waveOctavesGLSL, waveChopGLSL, waveSwellGLSL } from '../world/waves';

/** Instance record: model(16) stripe(3) flag(3) sailRatio(1) windLocal(2) phase(1). */
export const SHIP_INSTANCE_STRIDE = 26;

export const SHIP_VS = `${COMMON_HEAD}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aColor;
layout(location=3) in vec2 aUV;
layout(location=4) in float aKind;
layout(location=5) in mat4 aModel;
layout(location=9) in vec3 aStripe;
layout(location=10) in vec3 aFlag;
layout(location=11) in float aSailRatio;
layout(location=12) in vec2 aWindLocal;
layout(location=13) in float aPhase;

uniform mat4 u_viewProj;
uniform float u_time;

out vec3 v_normal;
out vec3 v_world;
out vec4 v_color;
out vec2 v_uv;
out vec3 v_stripe;
out vec3 v_flag;
out float v_kind;

void main() {
  vec3 p = aPos;
  if (aKind > 0.5 && aKind < 2.5) {
    // Sails: billow downwind (u across -1..1, v down 0..1), flutter, sag when torn.
    float u = aUV.x;
    float v = aUV.y;
    float billow = sin(u * 3.14159) * (1.0 - v * 0.5) * 0.18 * aSailRatio;
    p.x += aWindLocal.x * billow;
    p.z += aWindLocal.y * billow;
    p.x += sin(u * 7.0 + u_time * 5.0 + aPhase) * 0.012 * aSailRatio;
    p.y -= (1.0 - aSailRatio) * v * 3.0;
  } else if (aKind > 2.5) {
    float wave = sin(aPos.x * 6.0 + u_time * 9.0 + aPhase);
    p.y += wave * 0.03;
    p.z += cos(aPos.x * 6.0 + u_time * 9.0 + aPhase) * 0.03;
  }
  vec4 world = aModel * vec4(p, 1.0);
  v_normal = mat3(aModel) * aNormal;
  v_world = world.xyz;
  v_color = aColor;
  v_stripe = aStripe;
  v_flag = aFlag;
  float uu = aUV.x;
  float vv = aUV.y;
  if (aKind > 0.5 && aKind < 2.5) {
    v_uv = vec2((uu * 0.5 + 0.5) * 2.5, vv * 3.5);
  } else {
    v_uv = vec2(uu * 7.0, vv * 2.5);
  }
  v_kind = aKind;
  gl_Position = u_viewProj * world;
}`;

export const SHIP_FS = `${COMMON_HEAD}
in vec3 v_normal;
in vec3 v_world;
in vec4 v_color;
in vec2 v_uv;
in vec3 v_stripe;
in vec3 v_flag;
in float v_kind;

uniform vec3 u_lightDir;
uniform vec3 u_eye;
uniform vec3 u_fog;
uniform float u_fogStart;
uniform float u_fogEnd;
uniform sampler2D u_tex;

out vec4 frag;

void main() {
  vec3 albedo = v_color.rgb;
  float detail = 1.0;
  if (v_kind > 2.5) {
    albedo = v_flag;
    detail = 1.0;
  } else if (v_kind > 0.5 && v_kind < 2.5) {
    albedo = vec3(0.94, 0.9, 0.78);
    detail = texture(u_tex, v_uv).r;
  } else {
    float stripe = smoothstep(0.1, 0.4, v_color.a);
    detail = texture(u_tex, v_uv).r;
    albedo = mix(albedo, v_stripe, stripe * 0.9);
  }
  vec3 col = albedo * (0.5 + 0.5 * max(dot(normalize(v_normal), u_lightDir), 0.0));
  vec3 viewDir = normalize(u_eye - v_world);
  float rim = pow(1.0 - max(dot(normalize(v_normal), viewDir), 0.0), 2.0) * 0.35;
  col += vec3(1.0, 0.9, 0.75) * rim * 0.25;
  col *= 0.78 + 0.4 * detail;
  float fog = smoothstep(u_fogStart, u_fogEnd, length(u_eye - v_world));
  col = mix(col, u_fog, clamp(fog, 0.0, 0.9));
  frag = vec4(col, 1.0);
}`;

export const RING_VS = `${COMMON_HEAD}
layout(location=0) in vec3 aPos;
layout(location=2) in vec4 aColor;
layout(location=5) in mat4 aModel;
uniform mat4 u_viewProj;
out vec4 v_color;
void main() {
  v_color = aColor;
  gl_Position = u_viewProj * aModel * vec4(aPos, 1.0);
}`;

export const RING_FS = `${COMMON_HEAD}
in vec4 v_color;
out vec4 frag;
void main() {
  frag = vec4(v_color.rgb, 0.9);
}`;

export const WATER_VS = `${COMMON_HEAD}
layout(location=0) in vec3 aPos;

uniform vec2 u_center;
uniform float u_time;
uniform float u_windDir;
uniform mat4 u_viewProj;

out vec3 v_world;
out vec3 v_normal;
out float v_height;
out float v_swell;

float heightAt(vec2 p, float wind) {
  float h = 0.0;
${waveOctavesGLSL()}
  return h;
}

float swellAt(vec2 p, float wind) {
  float s = 0.0;
${waveSwellGLSL()}
  return s;
}

void main() {
  vec2 p = u_center + aPos.xz;
  float wind = u_windDir;
  float h = heightAt(p, wind);
  float swell = swellAt(p, wind);
${waveChopGLSL()}
  // Analytic surface slope via central differences of the same field,
  // sampled at the displaced point so the normals carry the crest lean.
  float e = 6.0;
  float hx = heightAt(p + vec2(e, 0.0), wind) - heightAt(p - vec2(e, 0.0), wind);
  float hz = heightAt(p + vec2(0.0, e), wind) - heightAt(p - vec2(0.0, e), wind);
  v_normal = normalize(vec3(-hx, 2.0 * e, -hz));
  v_height = h;
  v_swell = swell;
  v_world = vec3(p.x, h, p.y);
  gl_Position = u_viewProj * vec4(v_world, 1.0);
}`;

export const WATER_FS = `${COMMON_HEAD}
in vec3 v_world;
in vec3 v_normal;
in float v_height;
in float v_swell;

uniform float u_time;
uniform float u_windDir;
uniform vec3 u_eye;
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform vec3 u_skyTop;
uniform vec3 u_horizon;
uniform vec3 u_deep;
uniform vec3 u_mid;
uniform sampler2D u_tex;
uniform sampler2D u_normFine;
uniform sampler2D u_normCoarse;

out vec4 frag;

float ggxD(float ndotH, float a) {
  float a2 = a * a;
  float d = ndotH * ndotH * (a2 - 1.0) + 1.0;
  return a2 / max(0.0001, d * d);
}

void main() {
  vec3 N = normalize(v_normal);
  vec3 V = normalize(u_eye - v_world);
  float dist = length(u_eye - v_world);

  // Micro-detail, wind-aligned: the maps are streaks across the wind and
  // scroll downwind, so the ripple field moves coherently with the sea.
  float c = cos(u_windDir);
  float s = sin(u_windDir);
  vec2 tc = vec2(v_world.x * c - v_world.z * s, v_world.x * s + v_world.z * c);
  vec2 uvFine = tc * 0.05 + vec2(0.0, u_time * 2.0);
  vec2 uvCoarse = tc * 0.012 + vec2(u_time * 0.35, u_time * 0.8);
  vec2 nf2 = texture(u_normFine, uvFine).xy * 2.0 - 1.0;
  vec2 nc2 = texture(u_normCoarse, uvCoarse).xy * 2.0 - 1.0;
  vec3 nFine = vec3(nf2, sqrt(max(0.0, 1.0 - dot(nf2, nf2))));
  vec3 nCoarse = vec3(nc2, sqrt(max(0.0, 1.0 - dot(nc2, nc2))));
  // The geometry is the framework; the detail rides on it, fading out at
  // distance where texels are smaller than pixels (anti-aliasing LOD).
  float lod = 1.0 - smoothstep(900.0, 2100.0, dist);
  N = normalize(N * 1.5 + (nCoarse * 0.5 + nFine * 0.6) * lod);

  float n = texture(u_tex, v_world.xz * 0.02).r;

  // The mirror: the reflected sky carries the sun disk and its glow.
  vec3 R = reflect(-V, N);
  float skyH = R.y;
  vec3 skyCol = mix(u_horizon, u_skyTop, smoothstep(0.0, 0.42, skyH));
  float sd = max(dot(R, u_sunDir), 0.0);
  skyCol += u_sunColor * (pow(sd, 8.0) * 0.22 + pow(sd, 420.0) * 1.5);

  vec3 volume = mix(u_deep, u_mid, 0.55 + (n - 0.5) * 0.3);
  volume += vec3(0.02, 0.03, 0.035) * (n - 0.5) * 1.2;

  float fres = pow(1.0 - max(dot(V, vec3(0.0, 1.0, 0.0)), 0.0), 3.5);
  vec3 col = mix(volume, skyCol, clamp(fres, 0.0, 0.95));

  // Foam: thin crest lines where the short chop rides high over the
  // local swell — the honest whitecap — plus the roughest tilted faces.
  float crest = v_height - v_swell;
  float foam = smoothstep(0.45, 0.85, crest) * (0.35 + 0.65 * n);
  float steep = clamp(1.0 - N.y, 0.0, 1.0);
  foam += smoothstep(0.16, 0.3, steep) * 0.25;
  col = mix(col, vec3(0.82, 0.9, 0.93), min(foam, 0.75));

  // Specular: GGX-lite whose roughness is choppiness, plus the anisotropic
  // glitter path aligned with the wind — the sun-path on rough water.
  float roughness = clamp(0.12 + nf2.x * 0.3 + nf2.y * 0.2, 0.05, 0.8);
  float a = roughness * roughness;
  vec3 H = normalize(u_sunDir + V);
  float ndotH = max(dot(N, H), 0.0);
  float spec = ggxD(ndotH, a) * 0.35;
  float azDiff = 1.0 - abs(dot(normalize(H.xz), vec2(c, s)));
  float glitter = pow(max(H.y, 0.0), 24.0) * exp(-azDiff * 12.0);
  col += u_sunColor * (spec * fres + glitter * 0.55);

  // Exponential haze: light scatters through the air column above the sea.
  float haze = 1.0 - exp(-dist * 0.0013);
  col = mix(col, u_horizon, clamp(haze, 0.0, 0.78));
  frag = vec4(col, 1.0);
}`;

export const SKY_VS = `${COMMON_HEAD}
layout(location=0) in vec2 aPos;
out vec2 v_uv;
void main() {
  v_uv = aPos;
  gl_Position = vec4(aPos * 2.0 - 1.0, 1.0, 1.0);
}`;

export const SKY_FS = `${COMMON_HEAD}
in vec2 v_uv;
uniform mat4 u_invViewProj;
uniform vec3 u_top;
uniform vec3 u_horizon;
uniform vec3 u_cloudColor;
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform float u_cloudCover;
uniform float u_time;
uniform sampler2D u_tex;

out vec4 frag;

void main() {
  vec4 clip = vec4(v_uv * 2.0 - 1.0, -1.0, 1.0);
  vec4 w = u_invViewProj * clip;
  vec3 dir = normalize(w.xyz / w.w);
  float h = dir.y;
  vec3 col = mix(u_horizon, u_top, smoothstep(0.0, 0.4, h));

  // Luminous haze band at the horizon — the water mirror reflects it.
  float band = exp(-abs(h) * 12.0);
  col = mix(col, u_horizon * 1.3, band * 0.35);
  col = mix(col, u_horizon * 0.6, smoothstep(0.02, -0.3, h) * 0.5);
  float c = texture(u_tex, dir.xz * 3.5 + vec2(u_time * 0.004, 0.0)).r;
  col = mix(col, u_cloudColor, smoothstep(0.55, 0.95, c) * u_cloudCover);
  float sd = max(dot(dir, u_sunDir), 0.0);
  col += u_sunColor * pow(sd, 600.0) * 1.6;
  col += u_sunColor * pow(sd, 10.0) * 0.1;
  frag = vec4(col, 1.0);
}`;

export const PARTICLE_VS = `${COMMON_HEAD}
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

export const PARTICLE_FS = `${COMMON_HEAD}
in vec4 v_color;
out vec4 frag;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  float a = smoothstep(1.0, 0.2, d);
  frag = vec4(v_color.rgb, v_color.a * a);
}`;
