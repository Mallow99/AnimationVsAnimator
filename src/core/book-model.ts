import { add3, cross3, norm3, scale3, type V3 } from './math';
import { modelBox, type PropModel, type ModelAxes, type ModelPose } from './prop-model';

/** Symmetric spine hinges. Closed halves meet; opened pages face into the V toward the reader. */
export const bookHinge = (open: number) => Math.max(0, Math.min(1, open)) * Math.PI * 0.43;
export const bookDepth = (open: number) => 12 * Math.cos(bookHinge(open)) + 0.65;
export function bookModel(open: number, page = 0): PropModel {
  const theta = bookHinge(open),
    faces: PropModel['faces'] = [],
    grips: PropModel['grips'] = { spine: { x: 0, y: 0, z: 0 } };
  for (const side of [-1, 1] as const) {
    const right = { x: side * Math.sin(theta), y: 0, z: Math.cos(theta) };
    const down = { x: 0, y: 1, z: 0 },
      front = cross3(right, down);
    const inside = { x: -side * Math.cos(theta), y: 0, z: Math.sin(theta) };
    const axes = { right, down, front },
      pose: ModelPose = { ...axes, at: { x: 0, y: 0, z: 0 }, scale: 1 };
    // front points inside on the right panel and outside on the left panel.
    const cover = side === 1 ? [-1.65, -1.25] : [1.25, 1.65];
    const paper = side === 1 ? [-1.25, -0.08] : [0.08, 1.25];
    faces.push(
      ...modelBox(
        { x: 0, y: -20, z: cover[0] },
        { x: 12, y: 0, z: cover[1] },
        '#687c95',
        'cover',
        pose,
      ),
    );
    const block = modelBox(
      { x: 0.45, y: -19, z: paper[0] },
      { x: 11.5, y: -0.65, z: paper[1] },
      '#d5ccb7',
      'page-edge',
      pose,
    );
    // The broad page surface is distinguishable from the paper block's cut edges.
    const innerIndex = side === 1 ? 5 : 4;
    block[innerIndex].color = '#eee6ce';
    block[innerIndex].surface = 'page-surface';
    faces.push(...block);
    grips[side === 1 ? 'right' : 'left'] = add3(add3(scale3(right, 10), scale3(inside, -1.45)), {
      x: 0,
      y: -1.3,
      z: 0,
    });
  }
  faces.push(
    ...modelBox({ x: -1.7, y: -20, z: -0.65 }, { x: 1.7, y: 0, z: 0.45 }, '#354357', 'spine'),
  );
  if (page > 0 && page < 1 && open > 0.1) {
    const phi = theta * (1 - 2 * page),
      along = { x: Math.sin(phi), y: 0, z: Math.cos(phi) };
    const normal = { x: -Math.cos(phi), y: 0, z: Math.sin(phi) };
    const point = (r: number, y: number) =>
      add3(add3(scale3(along, r), scale3(normal, -0.04)), { x: 0, y, z: 0 });
    const points = [point(0.4, -19), point(11.3, -19), point(11.3, -0.7), point(0.4, -0.7)];
    faces.push(
      { points, color: '#f6eedb', surface: 'turning-page' },
      { points: [...points].reverse(), color: '#e6dcc6', surface: 'turning-page' },
    );
    grips.turn = point(10, -1.3);
  }
  return { faces, grips };
}

/** A book below the eyes: local front points toward the reader, never toward a screen camera. */
export function readerBookAxes(forward: V3, tilt = 0.38): ModelAxes {
  const horizontal = norm3({ x: forward.x, y: 0, z: forward.z });
  const front = norm3({
    x: -horizontal.x * Math.cos(tilt),
    y: -Math.sin(tilt),
    z: -horizontal.z * Math.cos(tilt),
  });
  const right = norm3({ x: -horizontal.z, y: 0, z: horizontal.x });
  return { right, front, down: norm3(cross3(front, right)) };
}
/** Existing flat-world items can use solid geometry with their usual grip-to-tip direction. */
export function looseBookAxes(dir: V3): ModelAxes {
  const front = norm3(Math.hypot(dir.x, dir.y, dir.z) > 1e-6 ? dir : { x: 1, y: 0, z: 0 });
  const down =
    Math.hypot(front.x, front.y) > 1e-6
      ? norm3({ x: -front.y, y: front.x, z: 0 })
      : { x: 0, y: 1, z: 0 };
  const right = norm3(cross3(down, front));
  return { right, front, down: norm3(cross3(front, right)) };
}
