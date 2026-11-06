export type Vector3 = [number, number, number];

/**
 * Represents a celestial body in the simulation
 */
export interface Body {
  /** Mass of the body */
  mass: number;
  /** Position vector [x, y, z] */
  position: Vector3;
  /** Velocity vector [vx, vy, vz] */
  velocity: Vector3;
  /** Color for rendering */
  color: string;
  /** Radius for rendering (proportional to mass) */
  radius: number;
  /** Trail positions for visualization */
  trail: Vector3[];
}

/**
 * Configuration options for the three-body system
 */
export interface ThreeBodyConfig {
  /** Gravitational constant */
  G: number;
  /** Base time step for simulation */
  dt: number;
  /** Speed multiplier (independent of time resolution) */
  speedMultiplier: number;
  /** Whether to add extra encounter refinement (error control is always enabled) */
  useAdaptiveTimeStep: boolean;
  /** Fraction of each pair's encounter timescale used for extra refinement */
  maxPositionChangeRatio: number;
  /** Canvas dimensions */
  canvasWidth: number;
  /** Canvas height */
  canvasHeight: number;
  /** Maximum trail length */
  maxTrailLength: number;
  /** Minimum mass value */
  minMass: number;
  /** Maximum mass value */
  maxMass: number;
  /** Minimum initial velocity component */
  minVelocity: number;
  /** Maximum initial velocity component */
  maxVelocity: number;
  /** Number of bodies in the simulation (2-5) */
  numBodies: number;
}

/** Dormand–Prince 5(4), with pairwise encounter limits and rejected-step retry.
 * Newtonian point masses: no force softening, velocity clamps, or energy rescaling.
 * Tableau: Dormand & Prince (1980), also used by scipy.integrate.RK45.
 */
const A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const E = [-71 / 57600, 0, 71 / 16695, -71 / 1920, 17253 / 339200, -22 / 525, 1 / 40];
const RTOL = 1e-10;
const ATOL = 1e-11;
const MAX_ATTEMPTS = 256;

export interface Diagnostics {
  time: number;
  energyError: number;
  steps: number;
  rejectedSteps: number;
  slowed: boolean;
  warning: string | null;
}

export class ThreeBodySystem {
  public bodies: Body[];
  public config: ThreeBodyConfig;
  private running = false;
  private effectiveTimeStep = 0;
  private nextStep = Infinity;
  private referenceEnergy: { total: number; scale: number } | null = null;
  private referenceG: number;
  private diagnostics: Diagnostics = {
    time: 0, energyError: 0, steps: 0, rejectedSteps: 0, slowed: false, warning: null,
  };

  constructor(config: ThreeBodyConfig) {
    this.config = { ...config };
    this.referenceG = config.G;
    this.bodies = this.initializeRandomBodies();
  }

  private initializeRandomBodies(): Body[] {
    const c = this.config;
    const random = (min: number, max: number) => min + Math.random() * (max - min);
    const colors = ['#FF5252', '#4CAF50', '#2196F3', '#9C27B0', '#FFC107'];
    const bodies: Body[] = Array.from({ length: c.numBodies }, (_, i) => {
      const angle = i * Math.PI * (3 - Math.sqrt(5)) + random(-0.2, 0.2);
      const cosTheta = Math.max(-0.95, Math.min(0.95, 1 - 2 * (i + 0.5) / c.numBodies + random(-0.1, 0.1)));
      const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
      const distance = random(Math.min(c.canvasWidth, c.canvasHeight) * 0.25,
        Math.min(c.canvasWidth, c.canvasHeight) * 0.4);
      const mass = Math.pow(10, random(c.minMass, c.maxMass));
      return {
        mass,
        position: [distance * sinTheta * Math.cos(angle), distance * cosTheta,
          distance * sinTheta * Math.sin(angle)],
        velocity: [random(c.minVelocity, c.maxVelocity), random(c.minVelocity, c.maxVelocity),
          random(c.minVelocity, c.maxVelocity)],
        color: colors[i % colors.length], radius: 5 + Math.cbrt(mass) * 1.1, trail: [],
      };
    });
    // Choose the center-of-mass frame once; do not alter later dynamics.
    const mass = bodies.reduce((sum, b) => sum + b.mass, 0);
    for (let axis = 0; axis < 3; axis++) {
      const center = bodies.reduce((sum, b) => sum + b.mass * b.position[axis], 0) / mass;
      const velocity = bodies.reduce((sum, b) => sum + b.mass * b.velocity[axis], 0) / mass;
      for (const b of bodies) {
        b.position[axis] -= center;
        b.velocity[axis] -= velocity;
      }
    }
    return bodies;
  }

  public reset(): void {
    this.bodies = this.initializeRandomBodies();
    this.effectiveTimeStep = 0;
    this.nextStep = Infinity;
    this.referenceEnergy = null;
    this.referenceG = this.config.G;
    this.diagnostics = { time: 0, energyError: 0, steps: 0, rejectedSteps: 0, slowed: false, warning: null };
  }

  /** State layout is x, y, z, vx, vy, vz per body. Evaluate each pair once. */
  private derivative(state: number[]): number[] {
    const result = new Array<number>(state.length).fill(0);
    for (let i = 0; i < this.bodies.length; i++) {
      const a = i * 6;
      for (let axis = 0; axis < 3; axis++) result[a + axis] = state[a + 3 + axis];
      for (let j = i + 1; j < this.bodies.length; j++) {
        const b = j * 6;
        const r = Math.hypot(state[b] - state[a], state[b + 1] - state[a + 1], state[b + 2] - state[a + 2]);
        if (!(r > 0)) return result.fill(NaN); // Exact point collision is singular.
        const factor = this.config.G / r / r / r;
        for (let axis = 0; axis < 3; axis++) {
          const force = factor * (state[b + axis] - state[a + axis]);
          result[a + 3 + axis] += this.bodies[j].mass * force;
          result[b + 3 + axis] -= this.bodies[i].mass * force;
        }
      }
    }
    return result;
  }

  /** Relative speed AND gravitational free-fall time, including pairs at rest.
   * There is deliberately no minimum encounter step that could overrule this limit.
   */
  private encounterStep(state: number[]): number {
    let limit = this.config.dt;
    const fraction = this.config.useAdaptiveTimeStep
      ? Math.min(0.05, Math.max(0.001, this.config.maxPositionChangeRatio)) : 0.05;
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = 6 * i, b = 6 * j;
        const r = Math.hypot(state[b] - state[a], state[b + 1] - state[a + 1], state[b + 2] - state[a + 2]);
        const v = Math.hypot(state[b + 3] - state[a + 3], state[b + 4] - state[a + 4], state[b + 5] - state[a + 5]);
        const mu = this.config.G * (this.bodies[i].mass + this.bodies[j].mass);
        limit = Math.min(limit, fraction * Math.min(v > 0 ? r / v : Infinity,
          mu > 0 ? r * Math.sqrt(r / mu) : Infinity));
      }
    }
    return limit;
  }

  private trial(state: number[], h: number): { state: number[]; error: number } {
    const stages: number[][] = [];
    let candidate = state;
    for (let s = 0; s < A.length; s++) {
      candidate = state.map((value, k) => value + h * A[s].reduce((sum, a, j) => sum + a * stages[j][k], 0));
      stages.push(this.derivative(candidate));
    }
    const errors = state.map((_, k) => h * E.reduce((sum, e, j) => sum + e * stages[j][k], 0));
    let error = 0;
    // Pair-relative error scales keep accuracy independent of screen origin or bulk velocity.
    // In particular, a distant escaping body cannot relax a close binary's tolerance.
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = i * 6, b = j * 6;
        const r = Math.max(Math.hypot(state[b] - state[a], state[b + 1] - state[a + 1], state[b + 2] - state[a + 2]),
          Math.hypot(candidate[b] - candidate[a], candidate[b + 1] - candidate[a + 1], candidate[b + 2] - candidate[a + 2]));
        const v = Math.max(Math.hypot(state[b + 3] - state[a + 3], state[b + 4] - state[a + 4], state[b + 5] - state[a + 5]),
          Math.hypot(candidate[b + 3] - candidate[a + 3], candidate[b + 4] - candidate[a + 4], candidate[b + 5] - candidate[a + 5]),
          Math.sqrt(this.config.G * (this.bodies[i].mass + this.bodies[j].mass) / r));
        for (let k = 0; k < 6; k++) {
          error = Math.max(error, Math.abs(errors[b + k] - errors[a + k]) / (ATOL + RTOL * (k < 3 ? r : v)));
        }
      }
    }
    if (!candidate.every(Number.isFinite) || !Number.isFinite(error)) error = Infinity;
    return { state: candidate, error };
  }

  /** Advance a requested amount of simulated time, independent of render cadence.
   * Bounded work slows playback during expensive encounters; no unsafe catch-up step.
   * Returns actual elapsed simulated time, which may be less than requested.
   */
  public update(duration = this.config.dt): number {
    if (!this.running || !(duration > 0) || !Number.isFinite(duration)) return 0;
    if (!(this.config.dt > 0) || !Number.isFinite(this.config.dt) ||
      !(this.config.G >= 0) || !Number.isFinite(this.config.G) ||
      this.bodies.some(b => !(b.mass > 0) || !Number.isFinite(b.mass) ||
        ![...b.position, ...b.velocity].every(Number.isFinite))) {
      this.stopWithWarning('Invalid physical state. Reset to begin again.');
      return 0;
    }
    // Changing G changes the Hamiltonian, so start a new energy comparison.
    if (this.referenceG !== this.config.G) {
      this.referenceEnergy = null;
      this.referenceG = this.config.G;
      this.nextStep = Infinity;
    }
    this.referenceEnergy ??= this.energy();
    let state = this.bodies.flatMap(b => [...b.position, ...b.velocity]);
    let elapsed = 0;
    let attempts = 0;
    this.diagnostics.slowed = false;
    while (elapsed < duration && attempts++ < MAX_ATTEMPTS) {
      const remaining = duration - elapsed;
      const resolution = 16 * Number.EPSILON * Math.max(1, this.diagnostics.time);
      // Ignore a sub-resolution frame-end remainder; it is not a physical encounter.
      if (remaining <= resolution) break;
      const proposed = Math.min(this.nextStep, this.encounterStep(state));
      const h = Math.min(remaining, proposed);
      // Stop rather than enlarge an unresolvable physical step. Never write non-finite state.
      if (!(h > 0) || !Number.isFinite(h) || h < resolution) {
        this.stopWithWarning('Point-mass collision or precision limit reached. Reset to begin again.');
        break;
      }
      const result = this.trial(state, h);
      const factor = result.error === 0 ? 4 : Math.max(0.1, Math.min(4, 0.9 * result.error ** (-1 / 5)));
      this.nextStep = h * factor;
      if (result.error > 1) {
        this.diagnostics.rejectedSteps++;
        continue;
      }
      // A short frame boundary must not poison the next frame's step-size proposal.
      if (h === remaining && factor >= 1) this.nextStep = Math.max(this.nextStep, proposed);
      state = result.state;
      elapsed += h;
      this.diagnostics.time += h;
      this.effectiveTimeStep = h;
      this.diagnostics.steps++;
    }
    this.diagnostics.slowed = duration - elapsed > 16 * Number.EPSILON * Math.max(1, this.diagnostics.time) && !this.diagnostics.warning;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      b.position = [state[6 * i], state[6 * i + 1], state[6 * i + 2]];
      b.velocity = [state[6 * i + 3], state[6 * i + 4], state[6 * i + 5]];
      // Sample trails by playback updates, not by tiny internal solver steps.
      if (elapsed > 0) b.trail.push([...b.position]);
      const excess = b.trail.length - this.config.maxTrailLength;
      if (excess > 0) b.trail.splice(0, excess);
    }
    const energy = this.energy();
    this.diagnostics.energyError = Math.abs(energy.total - this.referenceEnergy.total) / this.referenceEnergy.scale;
    return elapsed;
  }

  /** Energy in the center-of-mass frame; normalize by K + |U|, not near-zero E. */
  private energy(): { total: number; scale: number } {
    const mass = this.bodies.reduce((sum, b) => sum + b.mass, 0);
    const velocity = [0, 1, 2].map(axis => this.bodies.reduce((sum, b) => sum + b.mass * b.velocity[axis], 0) / mass);
    let kinetic = 0, potential = 0;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      kinetic += 0.5 * b.mass * b.velocity.reduce((sum, v, axis) => sum + (v - velocity[axis]) ** 2, 0);
      for (let j = i + 1; j < this.bodies.length; j++) {
        const other = this.bodies[j];
        const r = Math.hypot(other.position[0] - b.position[0], other.position[1] - b.position[1], other.position[2] - b.position[2]);
        if (r === 0) return { total: 0, scale: 1 }; // Undefined at a collision; solver pauses.
        potential -= this.config.G * b.mass * other.mass / r;
      }
    }
    return { total: kinetic + potential, scale: Math.max(kinetic + Math.abs(potential), Number.MIN_VALUE) };
  }

  private stopWithWarning(message: string): void {
    this.running = false;
    this.diagnostics.warning = message;
  }

  public getDiagnostics(): Diagnostics { return { ...this.diagnostics }; }
  public getEffectiveTimeStep(): number { return this.effectiveTimeStep; }
  public setSpeedMultiplier(value: number): void {
    if (value > 0 && Number.isFinite(value)) this.config.speedMultiplier = value;
  }
  public setAdaptiveTimeStep(value: boolean): void { this.config.useAdaptiveTimeStep = value; }
  public setNumBodies(value: number): void {
    if (Number.isInteger(value) && value >= 2 && value <= 5 && value !== this.config.numBodies) {
      this.config.numBodies = value;
      this.reset();
    }
  }
  public start(): void { if (!this.diagnostics.warning) this.running = true; }
  public pause(): void { this.running = false; }
  public isRunning(): boolean { return this.running; }
  public toggleRunning(): void { if (this.running) this.pause(); else this.start(); }
}
