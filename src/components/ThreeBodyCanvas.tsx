import React, { useRef, useEffect, useState, useCallback, useReducer } from 'react';
import { ThreeBodySystem, ThreeBodyConfig, Body } from '../physics/ThreeBodySystem';
// Import Material UI icons
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import GridOnIcon from '@mui/icons-material/GridOn';
import GridOffIcon from '@mui/icons-material/GridOff';

/**
 * Props for ThreeBodyCanvas component
 */
interface ThreeBodyCanvasProps {
  /** Initial width of the canvas */
  width: number;
  /** Initial height of the canvas */
  height: number;
  /** Configuration options for simulation */
  config?: Partial<ThreeBodyConfig>;
  /** Callback when simulation is reset */
  onReset?: () => void;
}

/**
 * Camera state for the simulation view
 */
interface CameraState {
  /** X offset of the camera */
  x: number;
  /** Y offset of the camera */
  y: number;
  /** Zoom level (1 = 100%) */
  zoom: number;
  /** Whether auto-follow is enabled */
  autoFollow: boolean;
}

/**
 * Component that renders the n-body problem animation using Canvas
 */
const ThreeBodyCanvas: React.FC<ThreeBodyCanvasProps> = ({
  width: initialWidth,
  height: initialHeight,
  config = {},
  onReset,
}) => {
  // Force update function (to trigger re-renders)
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  // Canvas dimensions state
  const [canvasDimensions, setCanvasDimensions] = useState({ width: initialWidth, height: initialHeight });

  // Canvas reference
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Animation frame reference
  const animationFrameRef = useRef<number | null>(null);
  // Reference to the system
  const systemRef = useRef<ThreeBodySystem | null>(null);
  // FPS counter - use ref instead of state to avoid re-render cycles
  const fpsRef = useRef<number>(0);
  // Frame timing references
  const frameTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  // Running state for UI updates
  const [isRunning, setIsRunning] = useState<boolean>(true);
  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  // Grid visibility state
  const [showGrid, setShowGrid] = useState<boolean>(true);
  // Use a ref for grid visibility to ensure animation loop has latest value
  const showGridRef = useRef<boolean>(true);
  // Container reference for fullscreen
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Camera state - we'll use both ref and state
  const cameraRef = useRef<CameraState>({
    x: 0,
    y: 0,
    zoom: 1,
    autoFollow: true,
  });

  // React state for UI updates
  const [camera, setCamera] = useState<CameraState>(cameraRef.current);

  // Update interval ref (for forcing re-renders)
  const updateIntervalRef = useRef<number | null>(null);

  // Track mouse state for dragging
  const dragRef = useRef({
    isDragging: false,
    lastX: 0,
    lastY: 0,
  });

  /**
   * Calculate the bounding box for all bodies
   * @param bodies Array of bodies to calculate bounds for
   * @returns The bounding box with padding
   */
  const calculateBoundingBox = useCallback(
    (bodies: Body[]) => {
      const { width, height } = canvasDimensions;

      if (!bodies.length)
        return { minX: -width / 2, maxX: width / 2, minY: -height / 2, maxY: height / 2, centerX: 0, centerY: 0 };

      // Find min/max coordinates including trail positions
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      // Check if any body is escaping (too far from others)
      const avgX = bodies.reduce((sum, body) => sum + body.position[0], 0) / bodies.length;
      const avgY = bodies.reduce((sum, body) => sum + body.position[1], 0) / bodies.length;

      // Threshold for considering a body as "escaping"
      const escapeThreshold = Math.max(width, height) * 3;

      // Filter out escaping bodies
      const nonEscapingBodies = bodies.filter((body) => {
        const dx = body.position[0] - avgX;
        const dy = body.position[1] - avgY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < escapeThreshold;
      });

      // If all bodies are escaping, use all bodies
      const bodiesToUse = nonEscapingBodies.length > 1 ? nonEscapingBodies : bodies;

      // Calculate bounds including trail positions
      bodiesToUse.forEach((body) => {
        // Include current position
        minX = Math.min(minX, body.position[0]);
        maxX = Math.max(maxX, body.position[0]);
        minY = Math.min(minY, body.position[1]);
        maxY = Math.max(maxY, body.position[1]);

        // Include trail positions
        body.trail.forEach((pos) => {
          minX = Math.min(minX, pos[0]);
          maxX = Math.max(maxX, pos[0]);
          minY = Math.min(minY, pos[1]);
          maxY = Math.max(maxY, pos[1]);
        });
      });

      // Add padding (20% of dimensions)
      const paddingX = Math.max((maxX - minX) * 0.2, 50);
      const paddingY = Math.max((maxY - minY) * 0.2, 50);

      minX -= paddingX;
      maxX += paddingX;
      minY -= paddingY;
      maxY += paddingY;

      // Ensure minimum size to prevent extreme zoom
      const minWidth = width * 0.2;
      const minHeight = height * 0.2;

      if (maxX - minX < minWidth) {
        const center = (minX + maxX) / 2;
        minX = center - minWidth / 2;
        maxX = center + minWidth / 2;
      }

      if (maxY - minY < minHeight) {
        const center = (minY + maxY) / 2;
        minY = center - minHeight / 2;
        maxY = center + minHeight / 2;
      }

      return {
        minX,
        maxX,
        minY,
        maxY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
      };
    },
    [canvasDimensions]
  );

  /**
   * Update camera to follow the bodies if auto-follow is enabled
   * @param bodies The bodies to follow
   */
  const updateCamera = useCallback(
    (bodies: Body[]) => {
      if (!cameraRef.current.autoFollow) return;

      // Get fresh dimensions directly from the container if possible
      // This ensures we're using the most up-to-date dimensions
      let width = canvasDimensions.width;
      let height = canvasDimensions.height;

      // Try to get live dimensions from container
      if (containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        width = containerRect.width;
        height = containerRect.height;
      }

      const bounds = calculateBoundingBox(bodies);

      // Calculate target zoom
      const contentWidth = bounds.maxX - bounds.minX;
      const contentHeight = bounds.maxY - bounds.minY;

      // Adjust zoom based on actual container dimensions
      const zoomX = width / contentWidth;
      const zoomY = height / contentHeight;

      // Target zoom should adapt to both dimensions, but not exceed 1.0
      const targetZoom = Math.min(zoomX, zoomY, 1); // Limit max zoom to 1x

      // Smoothly interpolate camera position and zoom
      // Use a more responsive smoothing factor when dimensions change significantly
      const smoothingFactor = 0.1; // Increased for more responsive movement

      // Update the camera ref directly (UI updates via interval)
      const prevCamera = cameraRef.current;
      const newZoom = prevCamera.zoom + (targetZoom - prevCamera.zoom) * smoothingFactor;

      // Calculate target center position
      const targetX = width / 2 - bounds.centerX * newZoom;
      const targetY = height / 2 - bounds.centerY * newZoom;

      // Smoothly move towards target position
      const newX = prevCamera.x + (targetX - prevCamera.x) * smoothingFactor;
      const newY = prevCamera.y + (targetY - prevCamera.y) * smoothingFactor;

      // Update camera ref
      cameraRef.current = {
        x: newX,
        y: newY,
        zoom: newZoom,
        autoFollow: prevCamera.autoFollow,
      };
    },
    [calculateBoundingBox, canvasDimensions]
  );

  // Set up resize observer to adapt canvas to container
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    // Function to update canvas dimensions based on container size
    const updateCanvasSize = () => {
      if (!containerRef.current || !canvasRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();

      const newWidth = containerRect.width;
      const newHeight = containerRect.height;

      setCanvasDimensions({ width: newWidth, height: newHeight });

      // Update canvas hardware pixels
      canvasRef.current.width = newWidth;
      canvasRef.current.height = newHeight;

      // If we have a system, update its config
      if (systemRef.current) {
        systemRef.current.config.canvasWidth = newWidth;
        systemRef.current.config.canvasHeight = newHeight;

        // Force camera update when container dimensions change
        if (systemRef.current.bodies.length > 0) {
          // Set a timeout to allow the state to update first
          setTimeout(() => {
            // Reset camera position to better fit the new dimensions
            if (cameraRef.current.autoFollow) {
              updateCamera(systemRef.current!.bodies);
            } else {
              // Even if not auto-following, recenter in the new container
              const center = calculateBoundingBox(systemRef.current!.bodies);
              cameraRef.current.x = newWidth / 2 - center.centerX * cameraRef.current.zoom;
              cameraRef.current.y = newHeight / 2 - center.centerY * cameraRef.current.zoom;
            }
          }, 0);
        }
      }
    };

    // Initial size update
    updateCanvasSize();

    // Set up resize observer
    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });

    resizeObserver.observe(containerRef.current);

    // Clean up
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Initialize the system on mount
  useEffect(() => {
    console.log('Initializing simulation system');

    // Default configuration with reasonable values
    const defaultConfig: ThreeBodyConfig = {
      G: 1000, // Gravitational constant
      dt: 0.02, // Time step
      canvasWidth: canvasDimensions.width,
      canvasHeight: canvasDimensions.height,
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

    // Reset timing variables
    frameTimeRef.current = performance.now();
    frameCountRef.current = 0;

    // Clean up the previous animation frame if it exists
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Clean up previous interval if it exists
    if (updateIntervalRef.current !== null) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }

    // Ensure the camera is initialized to the center position
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      cameraRef.current = {
        x: containerRect.width / 2,
        y: containerRect.height / 2,
        zoom: 1,
        autoFollow: true,
      };
      setCamera(cameraRef.current);
    }

    // Set up an interval to ensure the UI updates regularly (30fps is enough for UI)
    updateIntervalRef.current = window.setInterval(() => {
      // Copy from refs to state to ensure React renders
      setCamera({ ...cameraRef.current });
      forceUpdate();
    }, 33); // ~30fps refresh rate for UI updates

    // Start the animation loop
    startAnimation();

    // Cleanup on unmount
    return () => {
      console.log('Cleaning up animation');
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (updateIntervalRef.current !== null) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
    };
  }, []); // Only run once on mount

  // Handle config changes separately
  useEffect(() => {
    if (!systemRef.current) return;
    console.log('Updating simulation config', config);

    // Update number of bodies if changed
    if (config.numBodies !== undefined && systemRef.current.bodies.length !== config.numBodies) {
      systemRef.current.setNumBodies(config.numBodies);
      if (onReset) onReset();

      // Reset camera on body count change
      cameraRef.current = {
        x: 0,
        y: 0,
        zoom: 1,
        autoFollow: true,
      };
      setCamera(cameraRef.current);
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

  // Sync the showGridRef with showGrid state
  useEffect(() => {
    showGridRef.current = showGrid;
  }, [showGrid]);

  /**
   * Start the animation loop
   */
  const startAnimation = (): void => {
    console.log('Starting animation loop');

    // Force an initial camera position update once bodies are initialized
    if (systemRef.current && systemRef.current.bodies.length > 0) {
      // Get container dimensions
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasDimensions({ width: rect.width, height: rect.height });
      }

      // Initialize camera position to center on bodies
      updateCamera(systemRef.current.bodies);
    }

    // Define the render function for animation
    const renderFrame = (timestamp: number): void => {
      // Check if canvas and system are available
      if (!canvasRef.current || !systemRef.current) {
        console.warn('Canvas or system not available, skipping frame');
        animationFrameRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      // Update the simulation if it's running
      if (systemRef.current.isRunning()) {
        systemRef.current.update();
      }

      // Calculate FPS
      frameCountRef.current++;
      const elapsed = timestamp - frameTimeRef.current;

      if (elapsed >= 1000) {
        // Calculate and update FPS once per second
        const newFps = Math.round((frameCountRef.current * 1000) / elapsed);
        fpsRef.current = newFps;

        frameCountRef.current = 0;
        frameTimeRef.current = timestamp;

        console.log(`FPS: ${newFps}`);
      }

      // Update camera position if auto-follow is enabled
      updateCamera(systemRef.current.bodies);

      // Render the current state
      renderSystem();

      // Continue the animation loop
      animationFrameRef.current = requestAnimationFrame(renderFrame);
    };

    // Start the animation loop
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(renderFrame);
    }
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

    // Save the untransformed context
    ctx.save();

    // Get current camera values from ref for rendering
    const currentCamera = cameraRef.current;

    // Apply camera transformation
    ctx.translate(currentCamera.x, currentCamera.y);
    ctx.scale(currentCamera.zoom, currentCamera.zoom);

    // Draw grid lines if enabled - use the ref for most up-to-date value
    if (showGridRef.current) {
      const gridSize = 50;
      const gridOffsetX = Math.floor(-currentCamera.x / currentCamera.zoom / gridSize) * gridSize;
      const gridOffsetY = Math.floor(-currentCamera.y / currentCamera.zoom / gridSize) * gridSize;
      const gridCountX = Math.ceil(canvas.width / currentCamera.zoom / gridSize) + 2;
      const gridCountY = Math.ceil(canvas.height / currentCamera.zoom / gridSize) + 2;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1 / currentCamera.zoom; // Maintain constant visual thickness

      // Draw horizontal grid lines
      for (let i = 0; i < gridCountY; i++) {
        const y = gridOffsetY + i * gridSize;
        ctx.beginPath();
        ctx.moveTo(gridOffsetX, y);
        ctx.lineTo(gridOffsetX + gridCountX * gridSize, y);
        ctx.stroke();
      }

      // Draw vertical grid lines
      for (let i = 0; i < gridCountX; i++) {
        const x = gridOffsetX + i * gridSize;
        ctx.beginPath();
        ctx.moveTo(x, gridOffsetY);
        ctx.lineTo(x, gridOffsetY + gridCountY * gridSize);
        ctx.stroke();
      }
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

    // Restore original transformation
    ctx.restore();

    // Draw FPS counter and camera info (not affected by camera)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`FPS: ${fpsRef.current}`, canvas.width - 10, 20);

    // Draw auto-follow indicator
    ctx.textAlign = 'left';
    ctx.fillText(`Auto-follow: ${currentCamera.autoFollow ? 'ON' : 'OFF'}`, 10, 20);
    ctx.fillText(`Zoom: ${Math.round(currentCamera.zoom * 100)}%`, 10, 40);
    ctx.fillText(`Grid: ${showGridRef.current ? 'ON' : 'OFF'}`, 10, 60);
  };

  /**
   * Reset the simulation with new random initial conditions
   */
  const handleReset = (): void => {
    if (systemRef.current) {
      systemRef.current.reset();

      // Reset camera on simulation reset
      cameraRef.current = {
        x: 0,
        y: 0,
        zoom: 1,
        autoFollow: true,
      };
      setCamera(cameraRef.current);

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

  /**
   * Toggle auto-follow camera mode
   */
  const toggleAutoFollow = (): void => {
    cameraRef.current = {
      ...cameraRef.current,
      autoFollow: !cameraRef.current.autoFollow,
    };
    setCamera(cameraRef.current);
  };

  /**
   * Toggle grid visibility
   */
  const toggleGrid = (): void => {
    const newValue = !showGridRef.current;
    showGridRef.current = newValue; // Update ref immediately for rendering
    setShowGrid(newValue); // Update state for UI
    console.log('Grid toggled:', newValue); // Debug log
  };

  // Mouse event handlers for manual camera control
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    // Use left click for dragging (more intuitive)
    e.preventDefault();
    console.log('Mouse down', e.button);

    dragRef.current = {
      isDragging: true,
      lastX: e.clientX,
      lastY: e.clientY,
    };

    // Disable auto-follow when user starts dragging
    if (cameraRef.current.autoFollow) {
      cameraRef.current = {
        ...cameraRef.current,
        autoFollow: false,
      };
      setCamera(cameraRef.current);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (dragRef.current.isDragging) {
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;

      console.log('Dragging', dx, dy);

      // Update camera ref directly
      cameraRef.current = {
        ...cameraRef.current,
        x: cameraRef.current.x + dx,
        y: cameraRef.current.y + dy,
        autoFollow: false, // Ensure auto-follow is disabled during drag
      };

      // Update last positions
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;

      // No need to call setCamera here, the interval will handle it
    }
  };

  const handleMouseUp = (): void => {
    console.log('Mouse up');
    dragRef.current.isDragging = false;
  };

  const handleMouseLeave = (): void => {
    console.log('Mouse leave');
    dragRef.current.isDragging = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>): void => {
    e.preventDefault();

    // Disable auto-follow when user starts zooming
    if (cameraRef.current.autoFollow) {
      cameraRef.current = {
        ...cameraRef.current,
        autoFollow: false,
      };
      setCamera(cameraRef.current);
    }

    const zoomFactor = 0.1;
    const delta = e.deltaY > 0 ? -zoomFactor : zoomFactor;

    // Calculate zoom center point (mouse position)
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Update camera ref directly
    const prevCamera = cameraRef.current;
    const newZoom = Math.max(0.1, Math.min(5, prevCamera.zoom * (1 + delta)));

    // Adjust position to zoom toward mouse
    const zoomRatio = newZoom / prevCamera.zoom;
    const newX = mouseX - (mouseX - prevCamera.x) * zoomRatio;
    const newY = mouseY - (mouseY - prevCamera.y) * zoomRatio;

    cameraRef.current = {
      x: newX,
      y: newY,
      zoom: newZoom,
      autoFollow: false,
    };
  };

  /**
   * Toggle fullscreen mode
   */
  const toggleFullscreen = (): void => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current
        .requestFullscreen()
        .then(() => {
          setIsFullscreen(true);
        })
        .catch((err) => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
      document
        .exitFullscreen()
        .then(() => {
          setIsFullscreen(false);
        })
        .catch((err) => {
          console.error(`Error attempting to exit fullscreen: ${err.message}`);
        });
    }
  };

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreenNow = !!document.fullscreenElement;
      setIsFullscreen(isFullscreenNow);

      // Force immediate camera update when fullscreen state changes
      if (containerRef.current && systemRef.current && systemRef.current.bodies.length > 0) {
        // Get the new container dimensions
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidth = containerRect.width;
        const newHeight = containerRect.height;

        // Update canvas dimensions in the system
        if (systemRef.current) {
          systemRef.current.config.canvasWidth = newWidth;
          systemRef.current.config.canvasHeight = newHeight;
        }

        // Reset canvasDimensions to ensure calculations use correct values
        setCanvasDimensions({ width: newWidth, height: newHeight });

        // Force a camera reset to properly center the view
        setTimeout(() => {
          // If auto-follow was already on, ensure it properly recalculates with new dimensions
          if (cameraRef.current.autoFollow) {
            updateCamera(systemRef.current!.bodies);
          } else {
            // If not auto-following, at least center the view with the new dimensions
            const bounds = calculateBoundingBox(systemRef.current!.bodies);
            cameraRef.current.x = newWidth / 2 - bounds.centerX * cameraRef.current.zoom;
            cameraRef.current.y = newHeight / 2 - bounds.centerY * cameraRef.current.zoom;
            // Update the React state for immediate UI update
            setCamera({ ...cameraRef.current });
          }
        }, 50); // Small delay to ensure dimensions are updated
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          cursor: dragRef.current.isDragging ? 'grabbing' : 'grab',
          width: '100%',
          height: '100%',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()} // Prevent context menu on right click
      />
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
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {isRunning ? <PauseIcon fontSize='small' /> : <PlayArrowIcon fontSize='small' />}
          {isRunning ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={handleReset}
          style={{
            background: '#444',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <RestartAltIcon fontSize='small' />
          Reset
        </button>
        <button
          onClick={toggleAutoFollow}
          style={{
            background: camera.autoFollow ? '#4CAF50' : '#444',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <CenterFocusStrongIcon fontSize='small' />
          Auto-Follow
        </button>
        <button
          onClick={toggleGrid}
          style={{
            background: showGrid ? '#8E24AA' : '#444',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {showGrid ? <GridOnIcon fontSize='small' /> : <GridOffIcon fontSize='small' />}
          Grid
        </button>
        <button
          onClick={toggleFullscreen}
          style={{
            background: isFullscreen ? '#2196F3' : '#444',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {isFullscreen ? <FullscreenExitIcon fontSize='small' /> : <FullscreenIcon fontSize='small' />}
          {isFullscreen ? 'Exit' : 'Fullscreen'}
        </button>
      </div>
    </div>
  );
};

export default ThreeBodyCanvas;
