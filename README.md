# Three-Body Problem Simulation

A modern web-based visualization of the three-body problem in classical mechanics, built with React, TypeScript, and Material UI.

## Overview

The three-body problem is a classical physics problem that involves predicting the motion of three bodies interacting through gravitational forces. Unlike the two-body problem, which has a closed-form solution, the three-body problem cannot be solved analytically for most initial conditions and exhibits chaotic behavior.

This simulation uses numerical integration to approximate the solution, rendering the results on an HTML Canvas with smooth animations and trails showing the paths of each body.

## Features

- Real-time physics simulation of three gravitational bodies
- Beautiful visual representation with glowing bodies and colorful motion trails
- Adjust simulation parameters like gravitational constant and time step
- Responsive design that works on desktop and mobile devices
- Play, pause, and reset controls for the simulation
- Randomly generated initial conditions to create unique patterns

## Technologies Used

- **React** - UI component architecture
- **TypeScript** - Type-safe JavaScript
- **Material UI** - Modern component library for styling
- **Canvas API** - High-performance rendering
- **Vite** - Fast build tooling

## Getting Started

### Prerequisites

- Node.js 16+ and npm

### Installation

1. Clone the repository:

   ```
   git clone [repository-url]
   cd three-body-simulation
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

## How It Works

The simulation is based on Newton's law of universal gravitation, which states that every point mass attracts every other point mass by a force acting along the line intersecting the two points. The force is proportional to the product of the masses and inversely proportional to the square of the distance between them.

For each time step, the simulation:

1. Calculates the gravitational forces between all pairs of bodies
2. Updates the velocity of each body based on the forces
3. Updates the position of each body based on the velocity
4. Renders the bodies and their trails to the canvas

The simulation uses a numerical integration method to approximate the solution, making small time steps to calculate the motion.

## Physics Implementation

The simulation uses a simplified model with the following assumptions:

- Bodies are treated as point masses for gravitational calculations
- Only gravitational forces are considered (no collisions or other forces)
- The gravitational constant is adjustable for visualization purposes

## License

MIT

## Acknowledgments

- This project was created as an educational visualization of a classic physics problem
- Inspired by the fascinating behavior of three-body systems in space
