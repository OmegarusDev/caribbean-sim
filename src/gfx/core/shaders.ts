/**
 * GLSL sources — ships (instanced), ring, water, sky, particles.
 * Zero assets: detail comes from a shared procedural noise texture.
 * Everything runs at highp — mobile GPUs implement mediump as real fp16,
 * which destroys world-space varyings and the inverse view-proj.
 */

const COMMON_HEAD = `#version 300 es
precision highp float;
`;

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
  h += wave(wp, normalize(vec2(1.0, 0.35)), 2.6, 0.011, 1.2);
  h += wave(wp, normalize(vec2(-0.7, 0.8)), 1.7, 0.018, 1.8);
  h += wave(wp, normalize(vec2(0.25, -1.0)), 1.1, 0.03, 2.5);
  h += wave(wp, normalize(vec2(0.9, 0.1)), 0.8, 0.05, 3.2);
  h += wave(wp, normalize(vec2(-0.3, 0.6)), 0.5, 0.085, 4.2);
  v_height = h;
  v_world = vec3(wp.x, h, wp.y);
  gl_Position = u_viewProj * vec4(v_world, 1.0);
}`;

export const WATER_FS = `${COMMON_HEAD}
in vec3 v_world;
in float v_height;

uniform vec3 u_eye;
uniform vec3 u_sunDir;
uniform vec3 u_horizon;
uniform vec3 u_deep;
uniform vec3 u_mid;
uniform sampler2D u_tex;

out vec4 frag;

void main() {
  vec3 col = mix(u_deep, u_mid, 0.55);
  float swell = sin(v_world.x * 0.045) * sin(v_world.z * 0.04);
  col *= 0.95 + 0.05 * swell;
  float n = texture(u_tex, v_world.xz * 0.02).r;
  col += vec3(0.02, 0.03, 0.035) * (n - 0.5) * 1.4;
  float foam = smoothstep(1.8, 3.0, v_height);
  col = mix(col, vec3(0.78, 0.88, 0.9), foam * (0.5 + 0.9 * n));
  vec3 v = normalize(u_eye - v_world);
  float spec = pow(max(dot(reflect(-u_sunDir, vec3(0.0, 1.0, 0.0)), v), 0.0), 90.0);
  col += vec3(1.0, 0.93, 0.75) * spec * 1.0;
  float dist = length(u_eye - v_world);
  float fog = clamp((dist - 900.0) / 2200.0, 0.0, 1.0);
  col = mix(col, u_horizon, fog * 0.6);
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
