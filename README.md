(This was all built by Claude Sonnet 3.7, including the readme below.)

# N-Body Problem Simulation

A modern web-based visualization of the n-body problem in classical mechanics, built with React, TypeScript, and Material UI.

## Overview

The three-body problem is a classical physics problem that involves predicting the motion of three bodies interacting through gravitational forces. Unlike the two-body problem, which has a closed-form solution, the three-body problem cannot be solved analytically for most initial conditions and exhibits chaotic behavior.

This simulation uses numerical integration to approximate the solution, rendering the results in a Three.js WebGL scene with luminous spheres and trails showing the paths of each body.

## Features

- Real-time physics simulation of two to five gravitational bodies
- Selectable 3D or 4D positions, velocities, and gravity, with glowing spheres and fading spatial trails
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

## Spatial dimensions and the 4D view

3D is the default. The dimension selector starts a new random system when changing
between three and four **spatial** dimensions; time remains separate. A 4D body has
four positions and four velocities, including a genuine W coordinate.

The force law is the Gauss-law generalization of Newtonian gravity:
`F_ij = G m_i m_j (r_j - r_i) / |r_j - r_i|^D`. Its magnitude is inverse-square
in 3D and inverse-cube in 4D. The matching potential energy is
`U_ij = -G m_i m_j / ((D - 2) r^(D - 2))`, so in 4D it is `-G m_i m_j / (2r^2)`.
See the [Max Planck Institute's explanation of dimension-dependent force laws](https://eo.aei.mpg.de/en/spotlight/extra_dimensions_force/).

G has different units in the two modes. On switching from 3D to 4D, the UI multiplies
G by 200 (and divides by 200 on switching back), so the force magnitudes agree at
a reference separation of 200 simulation units. The displayed G is the actual
constant used by the solver; there is no hidden force normalization. Inverse-cube
gravity can produce plunges and escapes, and a true singular encounter still pauses
when it can no longer be resolved accurately.

To draw 4D, the renderer rotates the full coordinates through the XW, YW, and ZW
planes, in that order, then drops the rotated W component to form an orthographic
3D shadow. The ordinary orbit camera then views that shadow. The projection sliders
work while physics is paused and do not reset or alter the simulation. They can
bring W into any visible axis. The body legend shows each body's original W value.
This is a projection of the whole system, not a 3D slice through it.

Trails retain all four physical coordinates; every point is reprojected with the
current angles. Overlap in the projected view is not a physical collision. The
orthographic projection has no perspective denominator or projection-plane
singularity, and cannot expand distances beyond their 4D lengths.

## How It Works

The simulation is based on Newton's law of universal gravitation, which states that every point mass attracts every other point mass by a force acting along the line intersecting the two points. In the default 3D mode, the force is proportional to the product of the masses and inversely proportional to the square of the distance between them; the 4D mode uses the law described above.

The physics engine uses an embedded Dormand-Prince 5(4) solver. Each candidate step
estimates its local error; unacceptable steps are rejected and retried at a smaller
size before changing any body. Relative and absolute local tolerances are `1e-10`
and `1e-11`. Pair-relative error scales avoid making a close binary less accurate
when another body escapes far away. The standard method is described in the
[SciPy RK45 documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.RK45.html).

Each body's acceleration is calculated from Newtonian point-mass gravity in
the selected spatial dimensions, using six state components in 3D and eight in 4D. Every
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
not only finite output values. The 4D checks cover the inverse-cube force along W,
an inclined analytic circular orbit, all six angular-momentum components, the
correct potential energy, dimension-switch resets, and the rotation/projection
geometry independently of the physics.

## License

MIT

## Acknowledgments

- This project was created as an educational visualization of a classic physics problem
- Inspired by the fascinating behavior of three-body systems in space
