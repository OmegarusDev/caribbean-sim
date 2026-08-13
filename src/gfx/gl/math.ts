/** Minimal column-major mat4 / vec3 for WebGL2 (zero runtime deps). */

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}

export function mat4Identity(out: Mat4 = new Float32Array(16)): Mat4 {
  out.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return out;
}

export function mat4Perspective(
  out: Mat4,
  fovy: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out[0] = f / Math.max(1e-6, aspect);
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = 2 * far * near * nf;
  out[15] = 0;
  return out;
}

export function mat4LookAt(out: Mat4, eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const [ex, ey, ez] = eye;
  let zx = ex - center[0];
  let zy = ey - center[1];
  let zz = ez - center[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len;
  zy /= len;
  zz /= len;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len;
  xy /= len;
  xz /= len;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[3] = 0;
  out[4] = xy;
  out[5] = yy;
  out[6] = zy;
  out[7] = 0;
  out[8] = xz;
  out[9] = yz;
  out[10] = zz;
  out[11] = 0;
  out[12] = -(xx * ex + xy * ey + xz * ez);
  out[13] = -(yx * ex + yy * ey + yz * ez);
  out[14] = -(zx * ex + zy * ey + zz * ez);
  out[15] = 1;
  return out;
}

export function mat4Multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0]!,
    a01 = a[1]!,
    a02 = a[2]!,
    a03 = a[3]!;
  const a10 = a[4]!,
    a11 = a[5]!,
    a12 = a[6]!,
    a13 = a[7]!;
  const a20 = a[8]!,
    a21 = a[9]!,
    a22 = a[10]!,
    a23 = a[11]!;
  const a30 = a[12]!,
    a31 = a[13]!,
    a32 = a[14]!,
    a33 = a[15]!;
  for (let i = 0; i < 4; i++) {
    const bi0 = b[i * 4]!,
      bi1 = b[i * 4 + 1]!,
      bi2 = b[i * 4 + 2]!,
      bi3 = b[i * 4 + 3]!;
    out[i * 4] = a00 * bi0 + a10 * bi1 + a20 * bi2 + a30 * bi3;
    out[i * 4 + 1] = a01 * bi0 + a11 * bi1 + a21 * bi2 + a31 * bi3;
    out[i * 4 + 2] = a02 * bi0 + a12 * bi1 + a22 * bi2 + a32 * bi3;
    out[i * 4 + 3] = a03 * bi0 + a13 * bi1 + a23 * bi2 + a33 * bi3;
  }
  return out;
}

const INV_SCRATCH = new Float32Array(16);

export function mat4Invert(out: Mat4, a: Mat4): Mat4 | null {
  const m = a;
  const inv = INV_SCRATCH;
  inv[0] =
    m[5]! * m[10]! * m[15]! - m[5]! * m[11]! * m[14]! - m[9]! * m[6]! * m[15]! +
    m[9]! * m[7]! * m[14]! + m[13]! * m[6]! * m[11]! - m[13]! * m[7]! * m[10]!;
  inv[4] =
    -m[4]! * m[10]! * m[15]! + m[4]! * m[11]! * m[14]! + m[8]! * m[6]! * m[15]! -
    m[8]! * m[7]! * m[14]! - m[12]! * m[6]! * m[11]! + m[12]! * m[7]! * m[10]!;
  inv[8] =
    m[4]! * m[9]! * m[15]! - m[4]! * m[11]! * m[13]! - m[8]! * m[5]! * m[15]! +
    m[8]! * m[7]! * m[13]! + m[12]! * m[5]! * m[11]! - m[12]! * m[7]! * m[9]!;
  inv[12] =
    -m[4]! * m[9]! * m[14]! + m[4]! * m[10]! * m[13]! + m[8]! * m[5]! * m[14]! -
    m[8]! * m[6]! * m[13]! - m[12]! * m[5]! * m[10]! + m[12]! * m[6]! * m[9]!;
  inv[1] =
    -m[1]! * m[10]! * m[15]! + m[1]! * m[11]! * m[14]! + m[9]! * m[2]! * m[15]! -
    m[9]! * m[3]! * m[14]! - m[13]! * m[2]! * m[11]! + m[13]! * m[3]! * m[10]!;
  inv[5] =
    m[0]! * m[10]! * m[15]! - m[0]! * m[11]! * m[14]! - m[8]! * m[2]! * m[15]! +
    m[8]! * m[3]! * m[14]! + m[12]! * m[2]! * m[11]! - m[12]! * m[3]! * m[10]!;
  inv[9] =
    -m[0]! * m[9]! * m[15]! + m[0]! * m[11]! * m[13]! + m[8]! * m[1]! * m[15]! -
    m[8]! * m[3]! * m[13]! - m[12]! * m[1]! * m[11]! + m[12]! * m[3]! * m[9]!;
  inv[13] =
    m[0]! * m[9]! * m[14]! - m[0]! * m[10]! * m[13]! - m[8]! * m[1]! * m[14]! +
    m[8]! * m[2]! * m[13]! + m[12]! * m[1]! * m[10]! - m[12]! * m[2]! * m[9]!;
  inv[2] =
    m[1]! * m[6]! * m[15]! - m[1]! * m[7]! * m[14]! - m[5]! * m[2]! * m[15]! +
    m[5]! * m[3]! * m[14]! + m[13]! * m[2]! * m[7]! - m[13]! * m[3]! * m[6]!;
  inv[6] =
    -m[0]! * m[6]! * m[15]! + m[0]! * m[7]! * m[14]! + m[4]! * m[2]! * m[15]! -
    m[4]! * m[3]! * m[14]! - m[12]! * m[2]! * m[7]! + m[12]! * m[3]! * m[6]!;
  inv[10] =
    m[0]! * m[5]! * m[15]! - m[0]! * m[7]! * m[13]! - m[4]! * m[1]! * m[15]! +
    m[4]! * m[3]! * m[13]! + m[12]! * m[1]! * m[7]! - m[12]! * m[3]! * m[5]!;
  inv[14] =
    -m[0]! * m[5]! * m[14]! + m[0]! * m[6]! * m[13]! + m[4]! * m[1]! * m[14]! -
    m[4]! * m[2]! * m[13]! - m[12]! * m[1]! * m[6]! + m[12]! * m[2]! * m[5]!;
  inv[3] =
    -m[1]! * m[6]! * m[11]! + m[1]! * m[7]! * m[10]! + m[5]! * m[2]! * m[11]! -
    m[5]! * m[3]! * m[10]! - m[9]! * m[2]! * m[7]! + m[9]! * m[3]! * m[6]!;
  inv[7] =
    m[0]! * m[6]! * m[11]! - m[0]! * m[7]! * m[10]! - m[4]! * m[2]! * m[11]! +
    m[4]! * m[3]! * m[10]! + m[8]! * m[2]! * m[7]! - m[8]! * m[3]! * m[6]!;
  inv[11] =
    -m[0]! * m[5]! * m[11]! + m[0]! * m[7]! * m[9]! + m[4]! * m[1]! * m[11]! -
    m[4]! * m[3]! * m[9]! - m[8]! * m[1]! * m[7]! + m[8]! * m[3]! * m[5]!;
  inv[15] =
    m[0]! * m[5]! * m[10]! - m[0]! * m[6]! * m[9]! - m[4]! * m[1]! * m[10]! +
    m[4]! * m[2]! * m[9]! + m[8]! * m[1]! * m[6]! - m[8]! * m[2]! * m[5]!;
  let det = m[0]! * inv[0]! + m[1]! * inv[4]! + m[2]! * inv[8]! + m[3]! * inv[12]!;
  if (Math.abs(det) < 1e-8) return null;
  det = 1 / det;
  for (let i = 0; i < 16; i++) out[i] = inv[i]! * det;
  return out;
}

export function transformMat4(out: Vec3, a: Vec3, m: Mat4): Vec3 {
  const x = a[0],
    y = a[1],
    z = a[2];
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]! || 1;
  out[0] = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
  out[1] = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
  out[2] = (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / w;
  return out;
}

/** Project a world point to NDC via viewProj (w divide). */
export function projectToNdc(out: Vec3, a: Vec3, viewProj: Mat4): Vec3 {
  const x = a[0],
    y = a[1],
    z = a[2];
  const w = viewProj[3]! * x + viewProj[7]! * y + viewProj[11]! * z + viewProj[15]!;
  if (Math.abs(w) < 1e-8) return vec3(0, 0, -1);
  out[0] = (viewProj[0]! * x + viewProj[4]! * y + viewProj[8]! * z + viewProj[12]!) / w;
  out[1] = (viewProj[1]! * x + viewProj[5]! * y + viewProj[9]! * z + viewProj[13]!) / w;
  out[2] = w;
  return out;
}

export function hexToRgb(hex: string): Vec3 {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
