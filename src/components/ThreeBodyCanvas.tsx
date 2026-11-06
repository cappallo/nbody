import { useEffect, useRef, useState } from 'react';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import ThreeSixtyIcon from '@mui/icons-material/ThreeSixty';
import GridOnIcon from '@mui/icons-material/GridOn';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { ThreeBodySystem } from '../physics/ThreeBodySystem';
import type { Diagnostics, ThreeBodyConfig } from '../physics/ThreeBodySystem';
import { SpaceRenderer } from '../graphics/SpaceRenderer';

interface Props {
  width: number;
  height: number;
  config?: Partial<ThreeBodyConfig>;
  onReset?: () => void;
}

export default function ThreeBodyCanvas({ width, height, config = {}, onReset }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const systemRef = useRef<ThreeBodySystem | null>(null);
  const rendererRef = useRef<SpaceRenderer | null>(null);
  const initialConfig = useRef(config);
  const [running, setRunning] = useState(true);
  const [following, setFollowing] = useState(true);
  const [orbiting, setOrbiting] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [grid, setGrid] = useState(true);
  const [glow, setGlow] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stats, setStats] = useState<{ diagnostics: Diagnostics; fps: number; step: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const container = containerRef.current!;
    const bounds = container.getBoundingClientRect();
    const system = new ThreeBodySystem({
      G: 1000, dt: 0.03, speedMultiplier: 1, useAdaptiveTimeStep: true,
      maxPositionChangeRatio: 0.01, canvasWidth: bounds.width || width,
      canvasHeight: bounds.height || height, maxTrailLength: 500,
      minMass: 1.75, maxMass: 3.75, minVelocity: -50, maxVelocity: 50,
      numBodies: 3, ...initialConfig.current,
    });
    systemRef.current = system;
    let view: SpaceRenderer;
    try {
      view = new SpaceRenderer(canvas, () => { setFollowing(false); setOrbiting(false); });
    } catch (err) {
      console.error('Unable to initialize 3D rendering', err);
      setError('This view needs WebGL 2. Try a browser with hardware acceleration enabled.');
      system.pause();
      setRunning(false);
      return;
    }
    rendererRef.current = view;
    system.start();
    setRunning(true);
    view.setOrbiting(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const resize = () => {
      const rect = container.getBoundingClientRect();
      view.resize(rect.width, rect.height);
      system.config.canvasWidth = rect.width;
      system.config.canvasHeight = rect.height;
    };
    resize();
    view.fit(system.bodies, true);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const onContextLost = (event: Event) => {
      event.preventDefault();
      system.pause();
      setRunning(false);
      setError('The graphics context was lost. Reload to restore the 3D view.');
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key.startsWith('Arrow')) {
        view.setFollowing(false);
        view.setOrbiting(false);
        setFollowing(false);
        setOrbiting(false);
      }
      if (event.key === 'Home') {
        event.preventDefault();
        view.fit(system.bodies, true);
        view.setFollowing(true);
        setFollowing(true);
      }
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('keydown', onKey);
    let frame = 0, previous: number | null = null, lastUI = 0, fpsStart = 0, frames = 0, fps = 0;
    const render = (timestamp: number) => {
      frame = requestAnimationFrame(render);
      if (document.hidden) { previous = null; return; }
      // Cap drawing at 60 fps rather than consuming the GPU at the monitor's maximum refresh rate.
      if (previous !== null && timestamp - previous < 1000 / 60 - 0.5) return;
      const delta = previous === null ? 0 : Math.min(0.05, (timestamp - previous) / 1000);
      previous = timestamp;
      if (system.isRunning()) system.update(delta * 1.8 * system.config.speedMultiplier);
      const diagnostics = system.getDiagnostics();
      view.render(system.bodies, diagnostics.time, delta);
      frames++;
      if (timestamp - fpsStart >= 1000) {
        fps = Math.round(frames * 1000 / (timestamp - fpsStart));
        frames = 0;
        fpsStart = timestamp;
      }
      if (timestamp - lastUI >= 200) {
        setStats({ diagnostics, fps, step: system.getEffectiveTimeStep() });
        setRunning(system.isRunning());
        lastUI = timestamp;
      }
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('keydown', onKey);
      view.dispose();
      rendererRef.current = null;
      systemRef.current = null;
    };
  }, []);

  useEffect(() => {
    const system = systemRef.current;
    if (!system) return;
    const previousCount = system.bodies.length;
    if (config.numBodies !== undefined) system.setNumBodies(config.numBodies);
    for (const key of ['G', 'dt', 'maxTrailLength', 'maxPositionChangeRatio'] as const) {
      if (config[key] !== undefined) system.config[key] = config[key];
    }
    if (config.speedMultiplier !== undefined) system.setSpeedMultiplier(config.speedMultiplier);
    if (config.useAdaptiveTimeStep !== undefined) system.setAdaptiveTimeStep(config.useAdaptiveTimeStep);
    if (previousCount !== system.bodies.length) {
      rendererRef.current?.fit(system.bodies, true);
      setStats(null);
      setFollowing(true);
    }
  }, [config]);
  useEffect(() => { rendererRef.current?.setFollowing(following); }, [following]);
  useEffect(() => { rendererRef.current?.setOrbiting(orbiting); }, [orbiting]);
  useEffect(() => { rendererRef.current?.setGrid(grid); }, [grid]);
  useEffect(() => { rendererRef.current?.setBloom(glow); }, [glow]);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  const reset = () => {
    const system = systemRef.current;
    if (!system) return;
    const wasWarning = Boolean(system.getDiagnostics().warning);
    system.reset();
    if (wasWarning) { system.start(); setRunning(true); }
    setStats(null);
    setFollowing(true);
    rendererRef.current?.setFollowing(true);
    rendererRef.current?.fit(system.bodies, true);
    onReset?.();
  };
  const toggleRunning = () => {
    systemRef.current?.toggleRunning();
    setRunning(systemRef.current?.isRunning() ?? false);
  };
  const frameAll = () => {
    setFollowing(true);
    rendererRef.current?.setFollowing(true);
    rendererRef.current?.fit(systemRef.current?.bodies ?? []);
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen();
    } catch { setNotice('Fullscreen is unavailable in this browser. You can keep using the 3D view here.'); }
  };
  const diagnostics = stats?.diagnostics;

  return (
    <div className='space-stage' ref={containerRef}>
      <canvas ref={canvasRef} tabIndex={0}
        aria-label='Interactive 3D gravity simulation. Drag to orbit, scroll to zoom, right-drag to pan. Arrow keys pan; Home resets the camera.' />
      <div className='space-vignette' />
      <div className='scene-heading'>
        <span className={`live-dot ${running ? '' : 'paused'}`} />
        <span>{running ? 'LIVE SIMULATION' : 'PAUSED'}</span>
        <span className='dimension-badge'>3D</span>
      </div>
      <div className='scene-hint'>DRAG TO ORBIT <span>/</span> SCROLL TO ZOOM</div>
      <div className='space-stats'>
        <span><b>{(diagnostics?.time ?? 0).toFixed(2)}</b> SIM TIME</span>
        <span title='Change in total energy, normalized by initial kinetic plus absolute potential energy.'>
          <b>{((diagnostics?.energyError ?? 0) * 100).toExponential(1)}%</b> ENERGY DRIFT
        </span>
        <span className='performance-stat'><b>{stats?.fps ?? 0}</b> FPS</span>
      </div>
      <div className='body-legend' aria-label='Body colors'>
        {systemRef.current?.bodies.map((body, i) => (
          <span key={i}><i style={{ background: body.color, boxShadow: `0 0 9px ${body.color}` }} />{i + 1}</span>
        ))}
      </div>
      {(diagnostics?.warning || diagnostics?.slowed || notice) && (
        <div className='simulation-notice' role='status'>
          {diagnostics?.warning ?? notice ?? 'Resolving close encounter - playback slowed to preserve accuracy.'}
        </div>
      )}
      {error && <div className='graphics-error' role='alert'><strong>Graphics notice</strong><p>{error}</p>
        <button onClick={() => window.location.reload()}>Reload</button></div>}
      {!error && <div className='space-toolbar'>
        <button className='primary-control' onClick={toggleRunning} title='Pause or resume the physics'>
          {running ? <PauseIcon fontSize='small' /> : <PlayArrowIcon fontSize='small' />}{running ? 'Pause' : 'Play'}
        </button>
        <button onClick={reset} title='Create a new random 3D system'><RestartAltIcon fontSize='small' />Reset</button>
        <span className='toolbar-separator' />
        <button onClick={frameAll} aria-pressed={following} title='Fit all bodies and trails, and follow the system'>
          <CenterFocusStrongIcon fontSize='small' />Frame all
        </button>
        <button onClick={() => setOrbiting(!orbiting)} aria-pressed={orbiting} title='Slowly orbit the camera automatically'>
          <ThreeSixtyIcon fontSize='small' />Auto-orbit
        </button>
        <button onClick={() => setGrid(!grid)} aria-pressed={grid} title='Toggle the reference grid'>
          <GridOnIcon fontSize='small' /><span className='optional-label'>Grid</span>
        </button>
        <button onClick={() => setGlow(!glow)} aria-pressed={glow} title='Toggle bloom glow'>
          <AutoAwesomeIcon fontSize='small' /><span className='optional-label'>Glow</span>
        </button>
        <button className='fullscreen-control' onClick={toggleFullscreen}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
        </button>
      </div>}
    </div>
  );
}
