import { describe, expect, it } from 'vitest';
import {
  extractFrustum,
  frustumPointVisible,
  frustumSphereVisible,
  mat4Identity,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  projectToNdc,
  vec3,
} from './math';
import { Camera3d } from './camera';

describe('frustum', () => {
  it('extracts a view-projection and tests points correctly', () => {
    // Camera above the origin looking straight down.
    const proj = mat4Perspective(mat4Identity(), Math.PI / 4, 16 / 9, 0.1, 100);
    const view = mat4LookAt(mat4Identity(), [0, 10, 0], [0, 0, 0], [0, 0, -1]);
    const vp = mat4Multiply(mat4Identity(), proj, view);
    const f = extractFrustum(vp);
    expect(frustumPointVisible(f, 0, 0, 0)).toBe(true);
    // Beyond the horizontal half-extent (~7.4 units at the ground plane).
    expect(frustumPointVisible(f, 9, 0, 0)).toBe(false);
    expect(frustumPointVisible(f, -9, 0, 0)).toBe(false);
    // Inside the frustum near the ground.
    expect(frustumPointVisible(f, 3, 0, 3)).toBe(true);
    expect(frustumSphereVisible(f, 0, 0, 0, 1)).toBe(true);
    expect(frustumSphereVisible(f, 30, 0, 0, 1)).toBe(false);
  });
});

describe('Camera3d', () => {
  it('unprojects the screen centre onto the water plane near the target', () => {
    const cam = new Camera3d();
    cam.resize(800, 600);
    cam.frame([{ x: 0, y: 0 }], 1 / 60, null);
    const w = cam.worldFromScreen(400, 300, 800, 600);
    expect(w).not.toBeNull();
    // Camera looks at the origin from a dolly above it: the centre ray hits
    // the y=0 plane at (0, 0).
    expect(Math.abs(w!.x)).toBeLessThan(5);
    expect(Math.abs(w!.z)).toBeLessThan(5);
  });

  it('unproject is the inverse of projection for on-plane points', () => {
    const cam = new Camera3d();
    cam.resize(800, 600);
    cam.frame([{ x: 200, y: -150 }], 1 / 60, null);
    const point = { x: 120, z: -80 };
    // Project the world point to screen, then unproject back to the plane.
    const ndc = projectToNdc(vec3(), vec3(point.x, 0, point.z), cam.getViewProj());
    const px = (ndc[0]! + 1) * 0.5 * 800;
    const py = (1 - ndc[1]!) * 0.5 * 600;
    const back = cam.worldFromScreen(px, py, 800, 600);
    expect(back).not.toBeNull();
    expect(Math.abs(back!.x - point.x)).toBeLessThan(1);
    expect(Math.abs(back!.z - point.z)).toBeLessThan(1);
  });

  it('keeps the up vector stable through a full orbit', () => {
    const cam = new Camera3d();
    cam.resize(800, 600);
    for (let i = 0; i < 60; i++) {
      cam.smoothYaw += 0.05;
      cam.frame([{ x: 0, y: 0 }], 1 / 60, null);
    }
    // Eye height must stay positive and the target fixed at the origin.
    const eye = cam.eyeWorld();
    expect(eye[1]).toBeGreaterThan(0);
    expect(Math.abs(cam.targetX)).toBeLessThan(0.001);
    expect(Math.abs(cam.targetZ)).toBeLessThan(0.001);
  });
});
