/**
 * The render pipeline — the graphics engine's frame contract.
 * Scenes register drawables onto ordered layers once; each frame the engine
 * resizes the camera, runs layers in order, and owns the world↔screen
 * transforms. The overworld (v0.3) adds its layers on top of this.
 */
import { DirectorCamera } from './camera';

export type GfxLayer = 'ocean' | 'wake' | 'entity' | 'fx' | 'overlay';

const LAYER_ORDER: GfxLayer[] = ['ocean', 'wake', 'entity', 'fx', 'overlay'];

export class GfxEngine {
  readonly camera = new DirectorCamera();
  w = 0;
  h = 0;
  private readonly layers: Record<GfxLayer, Array<() => void>> = {
    ocean: [],
    wake: [],
    entity: [],
    fx: [],
    overlay: [],
  };

  constructor(readonly ctx: CanvasRenderingContext2D) {}

  /** Register a drawable on a layer (once per scene enter). */
  on(layer: GfxLayer, fn: () => void): void {
    this.layers[layer].push(fn);
  }

  clear(): void {
    for (const key of LAYER_ORDER) this.layers[key].length = 0;
  }

  /** Run one frame: size the camera, draw layers in order. */
  frame(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.camera.resize(w, h);
    for (const layer of LAYER_ORDER) {
      for (const fn of this.layers[layer]) fn();
    }
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    return this.camera.worldToScreen(x, y);
  }

  screenToWorld(x: number, y: number): { x: number; y: number } {
    return this.camera.screenToWorld(x, y);
  }
}
