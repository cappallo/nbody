/**
 * Represents a celestial body in the simulation
 */
export interface Body {
  /** Mass of the body */
  mass: number;
  /** Position vector [x, y] */
  position: [number, number];
  /** Velocity vector [vx, vy] */
  velocity: [number, number];
  /** Color for rendering */
  color: string;
  /** Radius for rendering (proportional to mass) */
  radius: number;
  /** Trail positions for visualization */
  trail: Array<[number, number]>;
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
  /** Whether to use adaptive time stepping */
  useAdaptiveTimeStep: boolean;
  /** Maximum allowed position change ratio per step (for adaptive time stepping) */
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

/**
 * Class implementing the n-body problem physics
 */
export class ThreeBodySystem {
  /** The bodies in the system */
  public bodies: Body[];
  /** Configuration parameters */
  public config: ThreeBodyConfig;
  /** Flag to track if simulation is running */
  private running: boolean = false;
  /** Effective time step after applying speed multiplier and adaptive calculations */
  private effectiveTimeStep: number = 0;

  /**
   * Creates a new n-body system
   * @param config Configuration parameters
   */
  constructor(config: ThreeBodyConfig) {
    // Set default values for new parameters if not provided
    this.config = {
      ...config,
      speedMultiplier: config.speedMultiplier ?? 1.0,
      useAdaptiveTimeStep: config.useAdaptiveTimeStep ?? true,
      maxPositionChangeRatio: config.maxPositionChangeRatio ?? 0.01,
    };
    // Initialize effective time step based only on dt (not speed)
    this.effectiveTimeStep = this.config.dt;
    this.bodies = this.initializeRandomBodies();
  }

  /**
   * Creates bodies with random properties within specified ranges
   * @returns Array of initialized bodies
   */
  private initializeRandomBodies(): Body[] {
    const { canvasWidth, canvasHeight, minMass, maxMass, minVelocity, maxVelocity, numBodies } = this.config;

    // Helper function to get random value in range
    const random = (min: number, max: number): number => {
      return min + Math.random() * (max - min);
    };

    // Color palette for bodies - extended to support up to 5 bodies
    const colors = ['#FF5252', '#4CAF50', '#2196F3', '#9C27B0', '#FFC107'];

    // Initialize bodies with random properties
    return Array.from({ length: numBodies }, (_, i) => {
      // Set position in different areas to ensure interaction
      const angle = (i * 2 * Math.PI) / numBodies + random(-0.3, 0.3);
      const distance = random(canvasWidth * 0.15, canvasWidth * 0.3);
      const x = canvasWidth / 2 + distance * Math.cos(angle);
      const y = canvasHeight / 2 + distance * Math.sin(angle);

      // Create a body with random properties
      const mass = Math.pow(10, random(minMass, maxMass));
      const body: Body = {
        mass,
        position: [x, y],
        velocity: [random(minVelocity, maxVelocity), random(minVelocity, maxVelocity)],
        color: colors[i % colors.length],
        radius: 5 + Math.sqrt(mass) * 2, // Scale radius with mass
        trail: [],
      };

      return body;
    });
  }

  /**
   * Reset the simulation with new random bodies
   */
  public reset(): void {
    this.bodies = this.initializeRandomBodies();
  }

  /**
   * Calculate the gravitational force between two bodies
   * @param body1 First body
   * @param body2 Second body
   * @returns Force vector [Fx, Fy]
   */
  private calculateForce(body1: Body, body2: Body): [number, number] {
    const G = this.config.G;
    const [x1, y1] = body1.position;
    const [x2, y2] = body2.position;

    // Distance between bodies
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distSquared = dx * dx + dy * dy;

    // Avoid division by zero with a small epsilon
    const dist = Math.sqrt(distSquared) + 1e-10;

    // Newton's law of gravitation: F = G * m1 * m2 / r^2
    const forceMagnitude = (G * body1.mass * body2.mass) / distSquared;

    // Force components
    const fx = (forceMagnitude * dx) / dist;
    const fy = (forceMagnitude * dy) / dist;

    return [fx, fy];
  }

  /**
   * Calculate the adaptive time step based on body velocities and positions
   * @returns The calculated adaptive time step
   */
  private calculateAdaptiveTimeStep(): number {
    if (!this.config.useAdaptiveTimeStep) {
      return this.config.dt; // Use base time step without speed multiplier
    }

    const { maxPositionChangeRatio } = this.config;
    const numBodies = this.bodies.length;
    let maxVelocityMagnitude = 0;
    let minDistance = Infinity;

    // Find the maximum velocity magnitude and minimum distance between bodies
    for (let i = 0; i < numBodies; i++) {
      const body = this.bodies[i];
      const [vx, vy] = body.velocity;
      const velocityMagnitude = Math.sqrt(vx * vx + vy * vy);

      if (velocityMagnitude > maxVelocityMagnitude) {
        maxVelocityMagnitude = velocityMagnitude;
      }

      // Find minimum distance between bodies
      for (let j = i + 1; j < numBodies; j++) {
        const otherBody = this.bodies[j];
        const [x1, y1] = body.position;
        const [x2, y2] = otherBody.position;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < minDistance) {
          minDistance = distance;
        }
      }
    }

    // Default to base time step if there's only one body or other edge cases
    if (numBodies <= 1 || minDistance === Infinity || maxVelocityMagnitude === 0) {
      return this.config.dt; // Use base time step without speed multiplier
    }

    // Calculate adaptive time step to ensure bodies don't move more than
    // maxPositionChangeRatio * minDistance in a single time step
    const maxAllowedChange = maxPositionChangeRatio * minDistance;
    const adaptiveTimeStep = maxAllowedChange / maxVelocityMagnitude;

    // Clamp the time step to avoid extremes
    const baseTimeStep = this.config.dt; // Use base time step without speed multiplier
    const maxTimeStep = baseTimeStep * 10;
    const minTimeStep = baseTimeStep * 0.1;

    return Math.min(Math.max(adaptiveTimeStep, minTimeStep), maxTimeStep);
  }

  /**
   * Update the system state by one time step
   */
  public update(): void {
    if (!this.running) return;

    // Calculate effective time step using adaptive algorithm (without speed multiplier)
    this.effectiveTimeStep = this.calculateAdaptiveTimeStep();

    const { maxTrailLength } = this.config;
    const numBodies = this.bodies.length;
    const forces: [number, number][] = Array(numBodies)
      .fill([0, 0])
      .map(() => [0, 0]);

    // Calculate forces between all pairs of bodies
    for (let i = 0; i < numBodies; i++) {
      for (let j = 0; j < numBodies; j++) {
        if (i !== j) {
          const [fx, fy] = this.calculateForce(this.bodies[i], this.bodies[j]);
          forces[i][0] += fx;
          forces[i][1] += fy;
        }
      }
    }

    // Update velocities and positions
    for (let i = 0; i < numBodies; i++) {
      const body = this.bodies[i];

      // Update velocity: v = v + F/m * dt
      body.velocity[0] += (forces[i][0] / body.mass) * this.effectiveTimeStep;
      body.velocity[1] += (forces[i][1] / body.mass) * this.effectiveTimeStep;

      // Update position: p = p + v * dt
      body.position[0] += body.velocity[0] * this.effectiveTimeStep;
      body.position[1] += body.velocity[1] * this.effectiveTimeStep;

      // Store position in trail for visualization
      body.trail.push([...body.position]);
      if (body.trail.length > maxTrailLength) {
        body.trail.shift();
      }
    }
  }

  /**
   * Get the current effective time step being used (after adjustments)
   * @returns The effective time step
   */
  public getEffectiveTimeStep(): number {
    return this.effectiveTimeStep;
  }

  /**
   * Set the speed multiplier
   * @param speedMultiplier New speed multiplier value
   */
  public setSpeedMultiplier(speedMultiplier: number): void {
    if (speedMultiplier > 0) {
      this.config.speedMultiplier = speedMultiplier;
    }
  }

  /**
   * Toggle adaptive time stepping
   * @param useAdaptive Whether to use adaptive time stepping
   */
  public setAdaptiveTimeStep(useAdaptive: boolean): void {
    this.config.useAdaptiveTimeStep = useAdaptive;
  }

  /**
   * Set the number of bodies and reset the simulation
   * @param numBodies New number of bodies (2-5)
   */
  public setNumBodies(numBodies: number): void {
    if (numBodies >= 2 && numBodies <= 5 && numBodies !== this.config.numBodies) {
      this.config.numBodies = numBodies;
      this.reset();
    }
  }

  /**
   * Start the simulation
   */
  public start(): void {
    this.running = true;
  }

  /**
   * Pause the simulation
   */
  public pause(): void {
    this.running = false;
  }

  /**
   * Check if simulation is running
   */
  public isRunning(): boolean {
    return this.running;
  }

  /**
   * Toggle simulation running state
   */
  public toggleRunning(): void {
    this.running = !this.running;
  }
}
