import { paintMaterial, paintPageText } from './materials';
// Small renderer-independent solid models. x right, y down, z toward the viewer.
import { cross3, dot3, norm3, sub3, type V3, type Vec } from './math';
import { polygonDistance } from './geometry';
import { shade, type DepthPart, type Ctx2D } from './render';

export interface ModelFace {
  points: V3[];
  color: string;
  surface: string;
}
export interface PropModel {
  faces: ModelFace[];
  grips: Record<string, V3>;
}
export interface ModelAxes {
  right: V3;
  down: V3;
  front: V3;
}
export interface ModelPose extends ModelAxes {
  at: V3;
  scale: number;
}
export interface ProjectedFace extends ModelFace {
  depth: number;
  normal: V3;
}
// Models are immutable geometry snapshots; hinges produce a new snapshot. Bounds reuse shared vertices.
const verticesByModel = new WeakMap<PropModel, V3[]>();

export const IDENTITY_AXES: ModelAxes = {
  right: { x: 1, y: 0, z: 0 },
  down: { x: 0, y: 1, z: 0 },
  front: { x: 0, y: 0, z: 1 },
};
export function modelVector(p: V3, axes: ModelAxes): V3 {
  return {
    x: axes.right.x * p.x + axes.down.x * p.y + axes.front.x * p.z,
    y: axes.right.y * p.x + axes.down.y * p.y + axes.front.y * p.z,
    z: axes.right.z * p.x + axes.down.z * p.y + axes.front.z * p.z,
  };
}
export function modelPoint(p: V3, pose: ModelPose): V3 {
  const v = modelVector(p, pose);
  return {
    x: pose.at.x + v.x * pose.scale,
    y: pose.at.y + v.y * pose.scale,
    z: pose.at.z + v.z * pose.scale,
  };
}
export function modelGrip(model: PropModel, name: string, pose: ModelPose): V3 {
  const grip = model.grips[name];
  if (!grip) throw new Error(`Missing model grip: ${name}`);
  return modelPoint(grip, pose);
}
/** A hand holds an exact local grip, so the model follows the real hand without floating. */
export function poseAtGrip(
  model: PropModel,
  name: string,
  hand: V3,
  axes: ModelAxes,
  scale: number,
): ModelPose {
  const grip = model.grips[name];
  if (!grip) throw new Error(`Missing model grip: ${name}`);
  const v = modelVector(grip, axes);
  return {
    ...axes,
    scale,
    at: { x: hand.x - v.x * scale, y: hand.y - v.y * scale, z: hand.z - v.z * scale },
  };
}
export function modelVertices(model: PropModel, pose: ModelPose): V3[] {
  let vertices = verticesByModel.get(model);
  if (!vertices) {
    const unique = new Map<string, V3>();
    for (const face of model.faces)
      for (const p of face.points) unique.set(`${p.x}:${p.y}:${p.z}`, p);
    vertices = [...unique.values()];
    verticesByModel.set(model, vertices);
  }
  return vertices.map((p) => modelPoint(p, pose));
}
/** Fixed orthographic camera. Back faces never turn themselves toward the viewer. */
export function projectModel(model: PropModel, pose: ModelPose): ProjectedFace[] {
  const faces: ProjectedFace[] = [];
  for (const face of model.faces) {
    const points = face.points.map((p) => modelPoint(p, pose));
    const normal = norm3(cross3(sub3(points[1], points[0]), sub3(points[2], points[0])));
    if (normal.z <= 1e-6) continue;
    faces.push({
      ...face,
      points,
      normal,
      depth: points.reduce((n, p) => n + p.z, 0) / points.length,
    });
  }
  return faces.sort((a, b) => a.depth - b.depth);
}
export function projectedDistance(faces: readonly ProjectedFace[], at: Vec): number {
  return faces.reduce((best, face) => Math.min(best, polygonDistance(at, face.points)), Infinity);
}
function paintFace(g: Ctx2D, face: ProjectedFace) {
  g.beginPath();
  face.points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.fillStyle = shade(
    face.color,
    -0.18 * (1 - Math.max(0, dot3(face.normal, { x: -0.25, y: -0.45, z: 0.857321 }))),
  );
  g.fill();
  const material=face.surface==='cover'||face.surface==='spine'?'leather':face.surface.startsWith('page')||face.surface==='turning-page'?'paper':undefined;
  if(material && face.points.length===4){
    const [a,b,,d]=face.points,w=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z),h=Math.hypot(d.x-a.x,d.y-a.y,d.z-a.z);
    if(w>.01 && h>.01){g.save();g.clip();g.transform((b.x-a.x)/w,(b.y-a.y)/w,(d.x-a.x)/h,(d.y-a.y)/h,a.x,a.y);paintMaterial(g,material,0,0,w,h);if(face.surface==='page-surface'||face.surface==='turning-page')paintPageText(g,w,h);g.restore();}
  }
}
export function modelParts(model: PropModel, pose: ModelPose, alpha = 1): DepthPart[] {
  return projectModel(model, pose).map((face) => ({
    z: face.depth,
    pts: face.points,
    draw: (g) => {
      g.globalAlpha *= alpha;
      paintFace(g, face);
    },
  }));
}
export function drawModel(g: Ctx2D, model: PropModel, pose: ModelPose) {
  for (const face of projectModel(model, pose)) paintFace(g, face);
}

/** Six outward-wound faces, transformed from the same solid used for bounds/picking/grips. */
export function modelBox(
  min: V3,
  max: V3,
  color: string,
  surface: string,
  pose: ModelPose = { ...IDENTITY_AXES, at: { x: 0, y: 0, z: 0 }, scale: 1 },
): ModelFace[] {
  const p = (x: number, y: number, z: number) => modelPoint({ x, y, z }, pose);
  const { x: a, y: b, z: c } = min,
    { x: d, y: e, z: f } = max;
  const quads = [
    [p(a, b, c), p(a, b, f), p(a, e, f), p(a, e, c)], // -x
    [p(d, b, f), p(d, b, c), p(d, e, c), p(d, e, f)], // +x
    [p(a, b, c), p(d, b, c), p(d, b, f), p(a, b, f)], // -y
    [p(a, e, f), p(d, e, f), p(d, e, c), p(a, e, c)], // +y
    [p(d, b, c), p(a, b, c), p(a, e, c), p(d, e, c)], // -z
    [p(a, b, f), p(d, b, f), p(d, e, f), p(a, e, f)], // +z
  ];
  return quads.map((points) => ({ points, color, surface }));
}
