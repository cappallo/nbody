(This was all built by Claude Sonnet 3.7, including the readme below.)

# N-Body Problem Simulation

A modern web-based visualization of the n-body problem in classical mechanics, built with React, TypeScript, and Material UI.

## Overview

The three-body problem is a classical physics problem that involves predicting the motion of three bodies interacting through gravitational forces. Unlike the two-body problem, which has a closed-form solution, the three-body problem cannot be solved analytically for most initial conditions and exhibits chaotic behavior.

This simulation uses numerical integration to approximate the solution, rendering the results in a Three.js WebGL scene with luminous spheres and trails showing the paths of each body.

## Features

- Real-time physics simulation of two to five gravitational bodies
- Full 3D positions, velocities, and gravity, with glowing spheres and fading spatial trails
- Drag-to-orbit camera, zoom, pan, automatic orbit, and frame-all tracking
- Procedural starfield, depth grid, bloom lighting, and touch controls
- Adjust simulation parameters like gravitational constant and time step
- Responsive design that works on desktop and mobile devices
- Play, pause, and reset controls for the simulation
- Randomly generated initial conditions to create unique patterns

## Technologies Used

- **React** - UI component architecture
- **TypeScript** - Type-safe JavaScript
- **Material UI** - Modern component library for styling
- **Three.js / WebGL 2** - GPU rendering, orbit camera, shaders, and bloom post-processing
- **Vite** - Fast build tooling

## Getting Started

### Prerequisites

- Node.js 16+ and npm

### Installation

1. Clone the repository:

   ```
   git clone [repository-url]
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Start the development server:

   ```
   npm run dev
   ```

4. Open your browser to the URL shown in the terminal (typically http://localhost:5173)

## Camera and graphics

- Left-drag / one finger: orbit the camera.
- Wheel / pinch: zoom. Right-drag / two-finger drag: pan.
- Frame all: fit every body and trail and resume automatic tracking.
- Auto-orbit: enable a slow cinematic camera rotation. It starts off when the
  browser requests reduced motion.
- Grid and Glow: toggle the depth reference and bloom effect independently.
- Pause stops the physics while leaving the camera usable. Reset creates a new
  spatial configuration. Fullscreen expands the scene.
- With the canvas focused, arrow keys pan; Home resets and frames the camera.

Manual camera input disables automatic tracking and orbiting so they do not
fight the user's movement. All graphics and camera operations are independent of
the physics. Body size and atmosphere are visual markers, not collision surfaces.

The scene uses procedural materials and a generated starfield, without downloaded
textures. Trail GPU buffers are reused. Rendering is capped at 60 fps and a 1.5
pixel ratio. WebGL 2 is required; an unavailable or lost context shows a visible
notice with a reload action. Resizing and fullscreen update the perspective view.

## How It Works

The simulation is based on Newton's law of universal gravitation, which states that every point mass attracts every other point mass by a force acting along the line intersecting the two points. The force is proportional to the product of the masses and inversely proportional to the square of the distance between them.

The physics engine uses an embedded Dormand-Prince 5(4) solver. Each candidate step
estimates its local error; unacceptable steps are rejected and retried at a smaller
size before changing any body. Relative and absolute local tolerances are `1e-10`
and `1e-11`. Pair-relative error scales avoid making a close binary less accurate
when another body escapes far away. The standard method is described in the
[SciPy RK45 documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.RK45.html).

Each body's acceleration is calculated from Newtonian point-mass gravity in all
three dimensions, using six state components (x, y, z, vx, vy, vz). Every
pair is evaluated once, applying equal and opposite forces. There is no softening,
velocity clamp, artificial confinement, or energy rescaling. The rendered glows
are visual markers, not collision surfaces.

Steps are also limited by every pair's crossing and gravitational free-fall times,
including bodies that start at rest. There is no fixed minimum timestep that can
override an encounter's requirements. The Maximum Solver Step control sets an
upper bound; Extra encounter refinement controls an additional safety fraction.
Local error control and the baseline encounter limit always remain active.

## Playback and numerical limits

Playback requests 1.8 simulated time units per real second at 1x speed, independent
of refresh rate and the solver-step control. Internal work is bounded per frame;
very tight encounters slow playback instead of forcing a larger, inaccurate step.
Long background-tab gaps are discarded. The camera includes every body and uses
a grid whose spacing adapts to zoom.

The energy readout is `abs(E - E0) / (K0 + abs(U0))`, measured in the center-of-mass
frame. This remains meaningful when total energy is near zero. Resetting bodies
or changing G starts a new reference. It is a diagnostic, not a proof that a chaotic
trajectory is exact. Real gravitational slingshots and escapes are still possible.

Exact point-mass collisions are singular. If a collision or the floating-point time
resolution makes progress unresolvable, the simulation pauses with a visible
message and preserves the last finite accepted state. Reset clears the warning.
This is a browser visualization, not an arbitrary-precision research integrator.

## Verification

Run `npm test` for numerical regression checks and `npm run build` for TypeScript
validation and production assets. On Ash, **building also publishes** because nginx
serves `dist/`; see [DEPLOYMENT.md](DEPLOYMENT.md).

The tests cover a circular binary over 100 orbits, an eccentricity-0.999 binary with
a 0.001-unit pericenter over five orbits, initially stationary close bodies with
extra refinement off, an exact collision, unbound scattering, a figure-eight
three-body orbit, and agreement across different playback chunks. Additional checks cover an
inclined analytic orbit, conservation of 3D angular momentum in a non-coplanar
four-body system, and uneven render-frame boundaries that must not trigger a false
precision-limit pause. They check analytic trajectories or conserved quantities,
not only finite output values.

## License

MIT

## Acknowledgments

- This project was created as an educational visualization of a classic physics problem
- Inspired by the fascinating behavior of three-body systems in space
