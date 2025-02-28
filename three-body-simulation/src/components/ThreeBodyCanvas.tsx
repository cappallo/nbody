import React, { useRef, useEffect, useState } from 'react';
import { ThreeBodySystem, ThreeBodyConfig } from '../physics/ThreeBodySystem';

/**
 * Props for ThreeBodyCanvas component
 */
interface ThreeBodyCanvasProps {
  /** Width of the canvas */
  width: number;
  /** Height of the canvas */
  height: number;
  /** Configuration options for simulation */
  config?: Partial<ThreeBodyConfig>;
  /** Callback when simulation is reset */
  onReset?: () => void;
}

/**
 * Component that renders the n-body problem animation using Canvas
 */
const ThreeBodyCanvas: React.FC<ThreeBodyCanvasProps> = ({ width, height, config = {}, onReset }) => {
  // Canvas reference
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Animation frame reference
  const animationFrameRef = useRef<number | null>(null);
  // Reference to the system
  const systemRef = useRef<ThreeBodySystem | null>(null);
  // FPS counter state
  const [fps, setFps] = useState<number>(0);
  // Last frame timestamp for FPS calculation
  const lastFrameTimeRef = useRef<number>(0);
  // Frame count for FPS calculation
  const frameCountRef = useRef<number>(0);
  // Last FPS update timestamp
  const lastFpsUpdateRef = useRef<number>(0);
  // Running state for UI updates
  const [isRunning, setIsRunning] = useState<boolean>(true);

  // Initialize the system on mount
  useEffect(() => {
    // Default configuration with reasonable values
    const defaultConfig: ThreeBodyConfig = {
      G: 1000, // Gravitational constant
      dt: 0.02, // Time step
      canvasWidth: width,
      canvasHeight: height,
      maxTrailLength: 100, // Store 100 previous positions for trails
      minMass: 100,
      maxMass: 1000,
      minVelocity: -20,
      maxVelocity: 20,
      numBodies: 3, // Default to 3 bodies
    };

    // Merge with any provided config options
    const mergedConfig = { ...defaultConfig, ...config };

    // Create the system
    systemRef.current = new ThreeBodySystem(mergedConfig);
    systemRef.current.start(); // Start the simulation
    setIsRunning(true);

    // Start the animation loop
    startAnimation();

    // Cleanup on unmount
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [width, height]);

  // Update the simulation when config changes
  useEffect(() => {
    if (!systemRef.current) return;

    // Update number of bodies if changed
    if (config.numBodies !== undefined && systemRef.current.bodies.length !== config.numBodies) {
      systemRef.current.setNumBodies(config.numBodies);
      if (onReset) onReset();
    }

    // Update other configurable properties
    if (config.G !== undefined) {
      systemRef.current.config.G = config.G;
    }

    if (config.dt !== undefined) {
      systemRef.current.config.dt = config.dt;
    }

    if (config.maxTrailLength !== undefined) {
      systemRef.current.config.maxTrailLength = config.maxTrailLength;
    }
  }, [config, onReset]);

  /**
   * Start the animation loop
   */
  const startAnimation = (): void => {
    if (!canvasRef.current) return;

    const renderFrame = (timestamp: number): void => {
      if (!systemRef.current || !canvasRef.current) return;

      // Update the simulation
      systemRef.current.update();

      // Calculate FPS
      frameCountRef.current++;
      if (timestamp - lastFpsUpdateRef.current >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / (timestamp - lastFpsUpdateRef.current)));
        frameCountRef.current = 0;
        lastFpsUpdateRef.current = timestamp;
      }

      // Render the current state
      renderSystem();

      // Continue the animation loop
      lastFrameTimeRef.current = timestamp;
      animationFrameRef.current = requestAnimationFrame(renderFrame);
    };

    // Start the animation loop
    animationFrameRef.current = requestAnimationFrame(renderFrame);
  };

  /**
   * Render the current state of the system to the canvas
   */
  const renderSystem = (): void => {
    if (!canvasRef.current || !systemRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear the canvas
    ctx.fillStyle = '#121212'; // Dark background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    // Draw horizontal grid lines
    for (let y = 0; y < canvas.height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw vertical grid lines
    for (let x = 0; x < canvas.width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Draw the bodies and their trails
    systemRef.current.bodies.forEach((body) => {
      const [x, y] = body.position;
      const radius = body.radius;

      // Draw trail
      if (body.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(body.trail[0][0], body.trail[0][1]);

        for (let i = 1; i < body.trail.length; i++) {
          ctx.lineTo(body.trail[i][0], body.trail[i][1]);
        }

        // Gradient trail with transparency
        const gradient = ctx.createLinearGradient(
          body.trail[0][0],
          body.trail[0][1],
          body.trail[body.trail.length - 1][0],
          body.trail[body.trail.length - 1][1]
        );

        gradient.addColorStop(0, `${body.color}00`); // Transparent at start
        gradient.addColorStop(1, `${body.color}99`); // More opaque at end

        ctx.strokeStyle = gradient;
        ctx.lineWidth = radius * 0.4;
        ctx.stroke();
      }

      // Draw the body
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);

      // Radial gradient for body
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, '#FFFFFF'); // White center
      gradient.addColorStop(0.3, body.color); // Main color
      gradient.addColorStop(1, `${body.color}00`); // Transparent edge

      ctx.fillStyle = gradient;
      ctx.fill();

      // Add glow effect
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
      const glowGradient = ctx.createRadialGradient(x, y, radius, x, y, radius * 1.5);
      glowGradient.addColorStop(0, `${body.color}33`); // Semi-transparent
      glowGradient.addColorStop(1, `${body.color}00`); // Transparent

      ctx.fillStyle = glowGradient;
      ctx.fill();
    });

    // Draw FPS counter
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`FPS: ${fps}`, canvas.width - 10, 20);
  };

  /**
   * Reset the simulation with new random initial conditions
   */
  const handleReset = (): void => {
    if (systemRef.current) {
      systemRef.current.reset();
      if (onReset) onReset();
    }
  };

  /**
   * Toggle pause/play simulation
   */
  const handlePlayPause = (): void => {
    if (systemRef.current) {
      systemRef.current.toggleRunning();
      setIsRunning(systemRef.current.isRunning());
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block' }} />
      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          display: 'flex',
          gap: '10px',
        }}
      >
        <button
          onClick={handlePlayPause}
          style={{
            background: '#444',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {isRunning ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={handleReset}
          style={{
            background: '#444',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
};

export default ThreeBodyCanvas;
