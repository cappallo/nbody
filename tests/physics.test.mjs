import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/physics/ThreeBodySystem.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
const { ThreeBodySystem } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const config = {
  G: 1, dt: 0.1, speedMultiplier: 1, useAdaptiveTimeStep: true, maxPositionChangeRatio: 0.01,
  canvasWidth: 800, canvasHeight: 600, maxTrailLength: 0, minMass: 0, maxMass: 1,
  minVelocity: -1, maxVelocity: 1, numBodies: 2,
};
function body(position, velocity, mass = 1) {
  return { mass, position: position.length === 2 ? [...position, 0] : position,
    velocity: velocity.length === 2 ? [...velocity, 0] : velocity, radius: 5, color: '#ffffff', trail: [] };
}
function system(bodies, overrides = {}) {
  const s = new ThreeBodySystem({ ...config, ...overrides, numBodies: bodies.length });
  s.bodies = bodies;
  s.start();
  return s;
}
function advance(s, target, chunk = 0.03) {
  for (let i = 0; i < 1000000; i++) {
    const remaining = target - s.getDiagnostics().time;
    if (remaining < 2e-12 * Math.max(1, target)) return;
    const elapsed = s.update(Math.min(chunk, remaining));
    assert.ok(elapsed > 0, JSON.stringify(s.getDiagnostics()));
    assert.equal(s.getDiagnostics().warning, null);
  }
  assert.fail('Integration did not reach the requested physical time');
}
function separation(s) { return Math.hypot(...s.bodies[0].position.map((p, i) => p - s.bodies[1].position[i])); }
function circular(overrides = {}) {
  return system([body([-0.5, 0], [0, -Math.SQRT1_2]), body([0.5, 0], [0, Math.SQRT1_2])], overrides);
}

test('circular binary: 100 orbits conserve radius, phase, energy, and momentum', () => {
  const s = circular();
  advance(s, 100 * 2 * Math.PI / Math.sqrt(2));
  assert.ok(Math.abs(separation(s) - 1) < 1e-7);
  assert.ok(Math.hypot(s.bodies[0].position[0] + 0.5, s.bodies[0].position[1]) < 1e-6);
  assert.ok(s.getDiagnostics().energyError < 1e-8);
  for (let axis = 0; axis < 2; axis++) {
    assert.ok(Math.abs(s.bodies.reduce((p, b) => p + b.mass * b.velocity[axis], 0)) < 1e-11);
  }
});

test('eccentric binary: resolves a 0.001 pericenter and returns without an artificial ejection', () => {
  const e = 0.999, r = 1 + e;
  const v = Math.sqrt(2 * (2 / r - 1));
  const s = system([body([-r / 2, 0], [0, -v / 2]), body([r / 2, 0], [0, v / 2])]);
  const period = 2 * Math.PI / Math.sqrt(2);
  advance(s, period / 2);
  assert.ok(Math.abs(separation(s) - (1 - e)) < 1e-7, `pericenter ${separation(s)}`);
  assert.ok(s.getEffectiveTimeStep() < 1e-5, `step ${s.getEffectiveTimeStep()}`);
  advance(s, 5 * period);
  assert.ok(Math.abs(separation(s) - r) < 1e-5, `apocenter ${separation(s)}`);
  assert.ok(s.getDiagnostics().energyError < 1e-7, `energy ${s.getDiagnostics().energyError}`);
});

test('safety stays active with extra refinement off and bodies initially at rest', () => {
  const s = system([body([-0.005, 0], [0, 0]), body([0.005, 0], [0, 0])], { useAdaptiveTimeStep: false });
  const initialPotential = -100;
  s.update(0.1);
  assert.ok(s.getDiagnostics().steps > 1);
  assert.ok(s.getEffectiveTimeStep() < config.dt * 0.1);
  const r = separation(s);
  const energy = s.bodies.reduce((sum, b) => sum + 0.5 * b.mass * (b.velocity[0] ** 2 + b.velocity[1] ** 2), 0) - 1 / r;
  assert.ok(Math.abs((energy - initialPotential) / initialPotential) < 1e-6);
  assert.ok(s.bodies.every(b => [...b.position, ...b.velocity].every(Number.isFinite)));
});

test('exact point collision pauses without corrupting the last finite state', () => {
  const s = system([body([0, 0], [0, 0]), body([0, 0], [0, 0])]);
  const original = structuredClone(s.bodies);
  assert.equal(s.update(), 0);
  assert.equal(s.isRunning(), false);
  assert.match(s.getDiagnostics().warning, /collision|precision/);
  assert.deepEqual(s.bodies, original);
});

test('unbound two-body scattering retains the analytically conserved positive energy', () => {
  const s = system([body([-5, -0.1], [1, 0]), body([5, 0.1], [-1, 0])]);
  const initial = 1 - 1 / Math.hypot(10, 0.2);
  advance(s, 12);
  const final = s.bodies.reduce((sum, b) => sum + 0.5 * (b.velocity[0] ** 2 + b.velocity[1] ** 2), 0) - 1 / separation(s);
  assert.ok(Math.abs(final - initial) < 1e-7, `energy ${final} vs ${initial}`);
  assert.ok(separation(s) > 10); // A real escape remains possible.
});

test('figure-eight three-body orbit returns and conserves energy', () => {
  const v = [0.466203685, 0.43236573];
  const s = system([
    body([-0.97000436, 0.24308753], [...v]), body([0.97000436, -0.24308753], [...v]),
    body([0, 0], v.map(x => -2 * x)),
  ]);
  advance(s, 6.32591398);
  assert.ok(Math.hypot(s.bodies[2].position[0], s.bodies[2].position[1]) < 1e-6);
  assert.ok(s.getDiagnostics().energyError < 1e-8);
});

test('different playback chunks and speed settings agree at the same physical time', () => {
  const a = circular({ speedMultiplier: 0.1 });
  const b = circular({ speedMultiplier: 5 });
  advance(a, 10, 0.003);
  advance(b, 10, 0.15);
  assert.ok(Math.hypot(...a.bodies[0].position.map((p, i) => p - b.bodies[0].position[i])) < 1e-8);
  a.pause();
  const before = structuredClone(a.bodies);
  assert.equal(a.update(1), 0);
  assert.deepEqual(a.bodies, before);
});


test('inclined circular binary follows the analytic orbit in all three dimensions', () => {
  const u = [1 / Math.sqrt(2), 1 / Math.sqrt(2), 0];
  const v = [-1 / Math.sqrt(6), 1 / Math.sqrt(6), 2 / Math.sqrt(6)];
  const s = system([body(u.map(x => -0.5 * x), v.map(x => -Math.SQRT1_2 * x)),
    body(u.map(x => 0.5 * x), v.map(x => Math.SQRT1_2 * x))]);
  const t = 10 * 2 * Math.PI / Math.sqrt(2) + 0.75;
  advance(s, t);
  const theta = Math.sqrt(2) * t;
  const expected = u.map((x, axis) => -0.5 * (x * Math.cos(theta) + v[axis] * Math.sin(theta)));
  assert.ok(Math.hypot(...s.bodies[0].position.map((x, axis) => x - expected[axis])) < 1e-7);
  assert.ok(Math.abs(s.bodies[0].position[2]) > 0.1);
  assert.ok(s.getDiagnostics().energyError < 1e-8);
});

test('non-coplanar four-body system conserves 3D momentum, angular momentum, and energy', () => {
  const s = system([
    body([1, 1, 1], [0.1, -0.2, 0.3]), body([-1, -1, 1], [-0.3, 0.4, -0.1], 2),
    body([-1, 1, -1], [0.2, -0.1, 0.4], 0.5), body([1, -1, -1], [-0.2, 0.3, -0.4], 1.5),
  ]);
  const invariants = () => {
    const momentum = [0, 1, 2].map(axis => s.bodies.reduce((sum, b) => sum + b.mass * b.velocity[axis], 0));
    const angular = [0, 1, 2].map(axis => {
      const j = (axis + 1) % 3, k = (axis + 2) % 3;
      return s.bodies.reduce((sum, b) => sum + b.mass * (b.position[j] * b.velocity[k] - b.position[k] * b.velocity[j]), 0);
    });
    return [...momentum, ...angular];
  };
  const initial = invariants();
  advance(s, 2);
  invariants().forEach((x, i) => assert.ok(Math.abs(x - initial[i]) < 1e-8));
  assert.ok(s.getDiagnostics().energyError < 1e-8);
});


test('uneven render-frame boundaries do not cause a false precision-limit pause', () => {
  const s = system([body([-300, 0, 0], [0.5, 0, 0]), body([300, 0, 0], [-0.5, 0, 0])],
    { G: 100, dt: 0.03 });
  const intervals = [0.05 * 1.8, 0.02994, 0.03006, 0.03168, 0.0288, 0.0306];
  for (let i = 0; i < 300; i++) {
    s.update(intervals[i % intervals.length]);
    assert.equal(s.getDiagnostics().warning, null, `frame ${i}`);
    assert.equal(s.isRunning(), true);
  }
});


test('4D inverse-cube gravity acts along W even when projected positions coincide', () => {
  const close = system([body([0, 0, 0, -1], [0, 0, 0, 0]), body([0, 0, 0, 1], [0, 0, 0, 0])], { dimensions: 4 });
  const far = system([body([0, 0, 0, -2], [0, 0, 0, 0]), body([0, 0, 0, 2], [0, 0, 0, 0])], { dimensions: 4 });
  close.update(1e-5);
  far.update(1e-5);
  assert.equal(close.getDiagnostics().warning, null);
  assert.ok(Math.abs(close.bodies[0].velocity[3] - 1.25e-6) < 1e-14);
  assert.ok(Math.abs(close.bodies[0].velocity[3] / far.bodies[0].velocity[3] - 8) < 1e-8);
  assert.deepEqual(close.bodies[0].position.slice(0, 3), [0, 0, 0]);
  assert.ok(close.getDiagnostics().energyError < 1e-10);
});

test('4D circular motion follows the analytic inverse-cube orbit in an inclined plane', () => {
  const u = [0.5, 0.5, 0.5, 0.5], v = [0.5, -0.5, 0.5, -0.5];
  const omega = Math.sqrt(2) / 4; // relative radius 2: omega^2 = G(m1+m2)/r^4
  const s = system([body(u.map(x => -x), v.map(x => -omega * x)),
    body([...u], v.map(x => omega * x))], { dimensions: 4 });
  const t = 2 * Math.PI / omega + 0.75;
  advance(s, t);
  const expected = u.map((x, axis) => -(x * Math.cos(omega * t) + v[axis] * Math.sin(omega * t)));
  assert.ok(Math.hypot(...s.bodies[0].position.map((x, axis) => x - expected[axis])) < 1e-7);
  assert.ok(Math.abs(separation(s) - 2) < 1e-7);
  assert.ok(s.getDiagnostics().energyError < 1e-8); // Total energy is zero; normalization must remain finite.
});

test('4D five-body motion conserves energy and all six angular-momentum components', () => {
  const s = system([
    body([1, 1, 1, 1], [0.1, -0.2, 0.3, -0.4]),
    body([-1, -1, 1, 0], [-0.3, 0.4, -0.1, 0.2], 2),
    body([-1, 1, -1, 0.5], [0.2, -0.1, 0.4, 0.1], 0.5),
    body([1, -1, -1, -0.5], [-0.2, 0.3, -0.4, 0.3], 1.5),
    body([0.1, 0.3, 0.8, -1.5], [0.2, -0.1, -0.1, 0.2], 0.75),
  ], { dimensions: 4 });
  const invariants = () => {
    const momentum = [0, 1, 2, 3].map(axis => s.bodies.reduce((sum, b) => sum + b.mass * b.velocity[axis], 0));
    const angular = [];
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      angular.push(s.bodies.reduce((sum, p) => sum + p.mass * (p.position[a] * p.velocity[b] - p.position[b] * p.velocity[a]), 0));
    }
    let energy = s.bodies.reduce((sum, p) => sum + 0.5 * p.mass * p.velocity.reduce((q, x) => q + x * x, 0), 0);
    for (let i = 0; i < s.bodies.length; i++) for (let j = i + 1; j < s.bodies.length; j++) {
      const r2 = s.bodies[i].position.reduce((sum, p, axis) => sum + (p - s.bodies[j].position[axis]) ** 2, 0);
      energy -= s.config.G * s.bodies[i].mass * s.bodies[j].mass / (2 * r2);
    }
    return [...momentum, ...angular, energy];
  };
  const initial = invariants();
  advance(s, 0.5);
  invariants().forEach((value, i) => assert.ok(Math.abs(value - initial[i]) < 1e-9, `invariant ${i}`));
  assert.ok(s.getDiagnostics().energyError < 1e-9);
});

test('switching spatial dimensions resets state, trails, and diagnostics coherently', () => {
  const s = circular({ maxTrailLength: 10 });
  s.update(0.01);
  assert.ok(s.bodies[0].trail.length > 0);
  s.setDimensions(4);
  assert.equal(s.config.dimensions, 4);
  assert.equal(s.getDiagnostics().time, 0);
  assert.ok(s.bodies.every(b => b.position.length === 4 && b.velocity.length === 4 && b.trail.length === 0));
  s.update(0.01);
  assert.equal(s.getDiagnostics().warning, null);
  s.setDimensions(3);
  assert.ok(s.bodies.every(b => b.position.length === 3 && b.velocity.length === 3 && b.trail.length === 0));
  assert.equal(s.getDiagnostics().time, 0);
});
