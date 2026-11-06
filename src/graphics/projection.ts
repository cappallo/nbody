import type { Vector3 } from '../physics/ThreeBodySystem';

/** Degrees of rotation in XW, then YW, then ZW. These affect only the view. */
export type ProjectionAngles = readonly [number, number, number];
export const DEFAULT_PROJECTION: ProjectionAngles = [35, -20, 15];
export type ProjectionMatrix = Float64Array;

export function rotate4D(position: readonly number[], angles: ProjectionAngles): number[] {
  const result = Array.from({ length: 4 }, (_, axis) => position[axis] ?? 0);
  for (let axis = 0; axis < 3; axis++) {
    const angle = angles[axis] * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle);
    const a = result[axis], w = result[3];
    result[axis] = c * a - s * w;
    result[3] = s * a + c * w;
  }
  return result;
}

/** First three rows of an orthogonal 4D rotation: a bounded 3D shadow, no perspective pole. */
export function createProjection(angles: ProjectionAngles): ProjectionMatrix {
  const matrix = new Float64Array(12);
  for (let column = 0; column < 4; column++) {
    const basis = Array.from({ length: 4 }, (_, i) => i === column ? 1 : 0);
    const rotated = rotate4D(basis, angles);
    for (let row = 0; row < 3; row++) matrix[row * 4 + column] = rotated[row];
  }
  return matrix;
}

/** Does not mutate the physical point. A reusable output avoids allocating every trail vertex. */
export function projectPoint(position: readonly number[], matrix: ProjectionMatrix, out: Vector3 = [0, 0, 0]): Vector3 {
  for (let row = 0; row < 3; row++) {
    out[row] = position.length === 3 ? position[row] :
      matrix[row * 4] * position[0] + matrix[row * 4 + 1] * position[1] +
      matrix[row * 4 + 2] * position[2] + matrix[row * 4 + 3] * position[3];
  }
  return out;
}
