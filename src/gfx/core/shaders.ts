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

/**
 * Single-scattering atmosphere — the physics that makes the sky real.
 * Rayleigh scattering scales with 1/lambda^4 (blue sky, red sunset),
 * transmittance is Beer-Lambert exp(-tau) along the view AND sun paths, and
 * the sunset reddening falls out of the sun's own longer grazing path
 * through the atmosphere. Evaluated by BOTH the sky pass and the water
 * mirror: one atmosphere, two consumers — the sea reflects the same sky.
 */
const SKY_SCATTER_GLSL = `
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform float u_sunIntensity;

const vec3 BETA_R = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const vec3 BETA_M = vec3(12.0e-6, 12.0e-6, 12.0e-6);
const float SCALE_H_R = 8000.0;
const float SCALE_H_M = 1500.0;
const float SOLAR_E = 90000.0;
const float MIE_MULT = 0.8;
const float MIE_G = 0.76;

float hgPhase(float mu) {
  float g2 = MIE_G * MIE_G;
  float denom = 4.0 * 3.14159265 * pow(1.0 + g2 - 2.0 * MIE_G * mu, 1.5);
  return (1.0 - g2) / max(denom, 1e-4);
}

vec3 skyColor(vec3 dir) {
  float mu = clamp(dot(dir, u_sunDir), -1.0, 1.0);
  float viewH = max(dir.y, 0.02);
  float sunH = max(u_sunDir.y, 0.02);
  vec3 tauView = BETA_R * (SCALE_H_R / viewH) + BETA_M * (SCALE_H_M / viewH);
  vec3 tauSun = BETA_R * (SCALE_H_R / sunH) + BETA_M * (SCALE_H_M / sunH);
  vec3 tView = exp(-tauView);
  vec3 tSun = exp(-tauSun);
  float phaseR = 0.75 * (1.0 + mu * mu);
  vec3 ray = BETA_R * phaseR * (1.0 - tView);
  vec3 mie = BETA_M * hgPhase(mu) * (1.0 - tView);
  vec3 col = (ray + mie * MIE_MULT) * tSun * u_sunColor * u_sunIntensity * SOLAR_E;
  float disk = pow(max(mu, 0.0), 1500.0);
  col += u_sunColor * tSun * disk * SOLAR_E * u_sunIntensity * 0.12;
  // The camera, not the sky: a gentle filmic tone curve so the bright
  // horizon haze and the deep zenith both read.
  return vec3(1.0) - exp(-col * 1.15);
}
`;

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
    // The billow is curvature, not just silhouette: tilt the normal along
    // the wind by the billow's gradient so the sail reads as a taut sheet.
    float dBdu = cos(u * 3.14159) * 3.14159 * (1.0 - v * 0.5) * 0.18 * aSailRatio;
    vec3 sailN = normalize(vec3(-aWindLocal.x * dBdu, 1.0, -aWindLocal.y * dBdu));
    aNormal = sailN;
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
  vec3 N = normalize(v_normal);
  vec3 col = albedo * (0.5 + 0.5 * max(dot(N, u_lightDir), 0.0));
  vec3 viewDir = normalize(u_eye - v_world);
  float rim = pow(1.0 - max(dot(N, viewDir), 0.0), 2.0) * 0.35;
  col += vec3(1.0, 0.9, 0.75) * rim * 0.25;
  // A breath of sheen on the wood — wet hull, polished rail, sun on the decks.
  float sheen = pow(max(dot(N, normalize(u_lightDir + viewDir)), 0.0), 24.0);
  col += vec3(1.0, 0.85, 0.6) * sheen * (0.25 * (1.0 - smoothstep(0.5, 2.5, v_kind)));
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
uniform vec3 u_deep;
uniform vec3 u_mid;
uniform sampler2D u_tex;
uniform sampler2D u_normFine;
uniform sampler2D u_normCoarse;
${SKY_SCATTER_GLSL}

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

  // The mirror: the same physical sky evaluated along the reflected ray.
  vec3 R = reflect(-V, N);
  vec3 skyCol = skyColor(R);

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

  // Exponential haze into the physical horizon sky, not a flat colour.
  float haze = 1.0 - exp(-dist * 0.0013);
  vec3 horizonCol = skyColor(normalize(vec3(V.x, 0.04, V.z)));
  col = mix(col, horizonCol, clamp(haze, 0.0, 0.78));
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
uniform vec3 u_cloudColor;
uniform float u_cloudCover;
uniform float u_time;
uniform sampler2D u_tex;
${SKY_SCATTER_GLSL}

out vec4 frag;

void main() {
  vec4 clip = vec4(v_uv * 2.0 - 1.0, -1.0, 1.0);
  vec4 w = u_invViewProj * clip;
  vec3 dir = normalize(w.xyz / w.w);
  vec3 col = skyColor(dir);

  // Clouds, lit from the sun's side, thinning as the light goes.
  float mu = clamp(dot(dir, u_sunDir), 0.0, 1.0);
  float light = 0.25 + 0.75 * u_sunIntensity;
  float c = texture(u_tex, dir.xz * 3.5 + vec2(u_time * 0.004, 0.0)).r;
  vec3 cloudTint = u_cloudColor * light + u_sunColor * pow(mu, 2.0) * 0.25;
  col = mix(col, cloudTint, smoothstep(0.55, 0.95, c) * u_cloudCover * light);

  // At night the sky shows the real stars, faint and sparse.
  float night = 1.0 - u_sunIntensity;
  vec3 fl = floor(dir * 600.0);
  float h1 = fract(sin(dot(fl, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float star = step(0.9965, h1) * (0.4 + 0.6 * fract(sin(fl.x * 91.17 + fl.y * 19.31 + fl.z * 53.13) * 9189.1));
  col += vec3(0.6, 0.7, 1.0) * star * night * 0.9;
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
