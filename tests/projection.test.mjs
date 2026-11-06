import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../src/graphics/projection.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
const { rotate4D, createProjection, projectPoint } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('quarter-turns in each W plane expose the fourth coordinate along the chosen visible axis', () => {
  const point = [0, 0, 0, 4];
  assert.deepEqual(projectPoint(point, createProjection([0, 0, 0])), [0, 0, 0]);
  for (let axis = 0; axis < 3; axis++) {
    const angles = [0, 0, 0];
    angles[axis] = 90;
    const projected = projectPoint(point, createProjection(angles));
    projected.forEach((value, i) => assert.ok(Math.abs(value - (i === axis ? -4 : 0)) < 1e-12));
  }
});

test('4D rotations preserve distance and the shadow stays bounded without changing physics coordinates', () => {
  const point = Object.freeze([4, -7, 11, -13]);
  const angles = [37, -81, 123];
  const rotated = rotate4D(point, angles);
  assert.ok(Math.abs(Math.hypot(...rotated) - Math.hypot(...point)) < 1e-12);
  const projected = projectPoint(point, createProjection(angles));
  assert.ok(Math.hypot(...projected) <= Math.hypot(...point) + 1e-12);
  projected.forEach((value, i) => assert.ok(Math.abs(value - rotated[i]) < 1e-12));
  assert.deepEqual(point, [4, -7, 11, -13]);
});

test('3D positions remain unchanged regardless of the retained 4D projection controls', () => {
  assert.deepEqual(projectPoint([12, 34, -56], createProjection([52, -129, 77])), [12, 34, -56]);
});
