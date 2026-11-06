import React, { useState, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Stack,
  Switch,
  FormControlLabel,
} from '@mui/material';
import ThreeBodyCanvas from './ThreeBodyCanvas';
import type { ThreeBodyConfig, Dimensions } from '../physics/ThreeBodySystem';
import { DEFAULT_PROJECTION } from '../graphics/projection';
import type { ProjectionAngles } from '../graphics/projection';

/**
 * Component that wraps the simulation canvas with controls and information
 */
const SimulationContainer: React.FC = () => {
  // Initial canvas size - use useMemo since we no longer need to update it
  const canvasSize = useMemo(
    () => ({
      width: window.innerWidth - 40,
      height: Math.min(window.innerHeight - 150, 800),
    }),
    []
  );

  // Configuration state for the simulation
  const [config, setConfig] = useState<Partial<ThreeBodyConfig>>({
    dimensions: 3,
    G: 1000,
    dt: 0.03,
    speedMultiplier: 1.0,
    useAdaptiveTimeStep: true,
    maxPositionChangeRatio: 0.01,
    maxTrailLength: 500,
    numBodies: 3, // Default to 3 bodies
  });

  const dimensions = config.dimensions ?? 3;
  const [projection, setProjection] = useState<ProjectionAngles>(DEFAULT_PROJECTION);
  const changeDimensions = (next: Dimensions) => {
    setConfig(prev => {
      if ((prev.dimensions ?? 3) === next) return prev;
      // Different dimensions give G different units. Match force magnitudes at r = 200.
      const scale = next === 4 ? 200 : 1 / 200;
      return { ...prev, dimensions: next, G: (prev.G ?? 1000) * scale };
    });
  };

  /**
   * Handle change of the gravitational constant
   * @param event Change event
   * @param value New value
   */
  const handleGConstantChange = (_event: Event, value: number | number[]): void => {
    setConfig((prev) => ({
      ...prev,
      G: value as number,
    }));
  };

  /**
   * Handle change of the time step
   * @param event Change event
   * @param value New value
   */
  const handleDtChange = (_event: Event, value: number | number[]): void => {
    setConfig((prev) => ({
      ...prev,
      dt: value as number,
    }));
  };

  /**
   * Handle change of the speed multiplier
   * @param event Change event
   * @param value New value
   */
  const handleSpeedMultiplierChange = (_event: Event, value: number | number[]): void => {
    setConfig((prev) => ({
      ...prev,
      speedMultiplier: value as number,
    }));
  };

  /**
   * Handle change of adaptive time stepping
   * @param event Change event
   */
  const handleAdaptiveTimeStepChange = (_event: React.ChangeEvent<HTMLInputElement>): void => {
    setConfig((prev) => ({
      ...prev,
      useAdaptiveTimeStep: _event.target.checked,
    }));
  };

  /**
   * Handle change of the position change ratio for adaptive time stepping
   * @param event Change event
   * @param value New value
   */
  const handlePositionChangeRatioChange = (_event: Event, value: number | number[]): void => {
    setConfig((prev) => ({
      ...prev,
      maxPositionChangeRatio: value as number,
    }));
  };

  /**
   * Handle change of the number of bodies
   * @param event Change event
   * @param value New value
   */
  const handleNumBodiesChange = (_event: Event, value: number | number[]): void => {
    setConfig((prev) => ({
      ...prev,
      numBodies: value as number,
    }));
  };

  /**
   * Handle change of the trail length
   * @param event Change event
   */
  const handleTrailLengthChange = (event: SelectChangeEvent): void => {
    setConfig((prev) => ({
      ...prev,
      maxTrailLength: Number(event.target.value),
    }));
  };

  /**
   * Handle simulation reset
   */
  const handleReset = (): void => {
    // Force a re-render of the canvas component
    setConfig((prev) => ({ ...prev }));
  };

  return (
    <Container maxWidth='lg' sx={{ py: { xs: 3, sm: 4 } }}>
      <Typography className='page-kicker' align='center'>NEWTONIAN GRAVITY &nbsp; / &nbsp; {dimensions === 4 ? 'FOUR SPATIAL DIMENSIONS' : 'THREE DIMENSIONS'}</Typography>
      <Typography
        variant='h3'
        component='h1'
        gutterBottom
        align='center'
        sx={{
          fontSize: { xs: '2rem', sm: '3rem' },
          fontWeight: 'bold',
          background: 'linear-gradient(45deg, #FE6B8B 30%, #FF8E53 90%)',
          backgroundClip: 'text',
          textFillColor: 'transparent',
          mb: 1.5,
        }}
      >
        N-Body Problem Simulation
      </Typography>

      <Typography align='center' sx={{ color: '#9ca8bf', maxWidth: 700, mx: 'auto', mb: 3, lineHeight: 1.7 }}>
        {dimensions === 4 ? 'Four spatial dimensions, seen as a rotatable three-dimensional shadow.' : 'Follow two to five bodies through three-dimensional space.'}<br />
        Drag to explore the system from any angle, or let the camera orbit for you.
      </Typography>

      <div className='dimension-row'>
        <div className='dimension-picker' role='group' aria-label='Spatial dimensions'>
          <button aria-pressed={dimensions === 3} onClick={() => changeDimensions(3)}>3D</button>
          <button aria-pressed={dimensions === 4} onClick={() => changeDimensions(4)}>4D</button>
        </div>
        <span>{dimensions === 4 ? 'x, y, z, w / inverse-cube gravity' : 'x, y, z / inverse-square gravity'}</span>
        <small>Switching dimensions starts a new system.</small>
      </div>
      {dimensions === 4 && <section className='hyper-controls' aria-label='4D projection controls'>
        <div className='hyper-intro'>
          <strong>Explore the fourth dimension</strong>
          <span>Mix w into the visible axes. These rotations change only the view, even while paused.</span>
          <button onClick={() => setProjection(DEFAULT_PROJECTION)}>Reset projection</button>
        </div>
        <div className='hyper-sliders'>
          {['XW', 'YW', 'ZW'].map((plane, axis) => <div key={plane}>
            <label id={`projection-${plane}`}>{plane} rotation <span>{projection[axis]}&deg;</span></label>
            <Slider aria-labelledby={`projection-${plane}`} min={-180} max={180} step={1}
              value={projection[axis]} valueLabelDisplay='auto'
              getAriaValueText={value => `${value} degrees`}
              onChange={(_, value) => setProjection(prev => {
                const next: [number, number, number] = [...prev];
                next[axis] = value as number;
                return next;
              })} sx={{ color: '#ae9cff' }} />
          </div>)}
        </div>
        <p>W is another spatial direction; time stays separate. The scene is a projection, not a 3D slice.</p>
      </section>}

      <Box
        component='div'
        sx={{
          flexGrow: 1,
          width: '100%',
          height: dimensions === 4 ? 'min(58vh, 650px)' : 'min(68vh, 760px)',
          minHeight: { xs: '500px', sm: '540px' },
          bgcolor: 'background.paper',
          boxShadow: 3,
          borderRadius: 2,
          position: 'relative',
          mb: 2,
          overflow: 'hidden',
        }}
      >
        <ThreeBodyCanvas width={canvasSize.width} height={canvasSize.height} config={config} onReset={handleReset} projection={projection} />
      </Box>

      <Typography className='view-help'>
        <span>Drag to orbit &nbsp; &middot; &nbsp; Scroll to zoom &nbsp; &middot; &nbsp; Right-drag to pan</span>
        <span>Touch: one finger to orbit, pinch to zoom</span>
      </Typography>

      <Paper
        elevation={3}
        sx={{
          p: 3,
          background: 'rgba(14, 19, 32, 0.85)',
          border: '1px solid rgba(154, 178, 232, 0.1)',
          color: 'white',
          borderRadius: 2,
        }}
      >
        <Typography variant='h6' gutterBottom>
          Simulation Controls
        </Typography>

        <Stack sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 4 }}>
          <Box>
            <Typography id='num-bodies-slider' gutterBottom>
              Number of Bodies: {config.numBodies}
            </Typography>
            <Slider
              aria-labelledby='num-bodies-slider'
              min={2}
              max={5}
              step={1}
              marks
              value={config.numBodies ?? 3}
              onChange={handleNumBodiesChange}
              sx={{
                color: '#9C27B0',
                '& .MuiSlider-thumb': {
                  '&:hover, &.Mui-focusVisible': {
                    boxShadow: '0px 0px 0px 8px rgba(156, 39, 176, 0.16)',
                  },
                },
                '& .MuiSlider-markLabel': {
                  color: 'white',
                },
              }}
            />
          </Box>

          <Box>
            <Typography id='speed-multiplier-slider' gutterBottom>
              Speed Multiplier: {config.speedMultiplier?.toFixed(2)} x
            </Typography>
            <Typography variant='caption' sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 1, display: 'block' }}>
              Controls animation speed without affecting physics behavior
            </Typography>
            <Slider
              aria-labelledby='speed-multiplier-slider'
              min={0.1}
              max={5}
              step={0.1}
              value={config.speedMultiplier ?? 1.0}
              onChange={handleSpeedMultiplierChange}
              sx={{
                color: '#2196F3',
                '& .MuiSlider-thumb': {
                  '&:hover, &.Mui-focusVisible': {
                    boxShadow: '0px 0px 0px 8px rgba(33, 150, 243, 0.16)',
                  },
                },
              }}
            />
          </Box>

          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={config.useAdaptiveTimeStep ?? true}
                  onChange={handleAdaptiveTimeStepChange}
                  color='primary'
                />
              }
              label='Extra encounter refinement'
              sx={{ mb: 2 }}
            />
            <Typography variant='caption' sx={{ display: 'block', color: 'rgba(255, 255, 255, 0.7)', mb: 1 }}>
              Error control and collision safeguards stay active. Extra refinement uses smaller encounter steps.
            </Typography>
            {config.useAdaptiveTimeStep && (
              <>
                <Typography id='position-change-ratio-slider' gutterBottom>
                  Encounter Step Fraction: {config.maxPositionChangeRatio?.toFixed(3)}
                </Typography>
                <Slider
                  aria-labelledby='position-change-ratio-slider'
                  min={0.001}
                  max={0.05}
                  step={0.001}
                  value={config.maxPositionChangeRatio ?? 0.01}
                  onChange={handlePositionChangeRatioChange}
                  sx={{
                    color: '#4CAF50',
                    '& .MuiSlider-thumb': {
                      '&:hover, &.Mui-focusVisible': {
                        boxShadow: '0px 0px 0px 8px rgba(76, 175, 80, 0.16)',
                      },
                    },
                  }}
                />
              </>
            )}
          </Box>

          <Box>
            <Typography id='g-constant-slider' gutterBottom>
              Gravitational Constant ({dimensions}D): {config.G?.toLocaleString()}
            </Typography>
            {dimensions === 4 && <Typography variant='caption' sx={{ display: 'block', color: '#93a1b8', mb: 1 }}>
              4D G has different units. Switching modes rescales it so force strengths match at a distance of 200 units.
            </Typography>}
            <Slider
              aria-labelledby='g-constant-slider'
              min={dimensions === 4 ? 20000 : 100}
              max={dimensions === 4 ? 1000000 : 5000}
              step={dimensions === 4 ? 20000 : 100}
              value={config.G ?? 1000}
              onChange={handleGConstantChange}
              sx={{
                color: '#FE6B8B',
                '& .MuiSlider-thumb': {
                  '&:hover, &.Mui-focusVisible': {
                    boxShadow: '0px 0px 0px 8px rgba(254, 107, 139, 0.16)',
                  },
                },
              }}
            />
          </Box>

          <Box>
            <Typography id='dt-slider' gutterBottom>
              Maximum Solver Step: {config.dt}
            </Typography>
            <Typography variant='caption' sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 1, display: 'block' }}>
              Upper limit for internal steps; playback speed is independent
            </Typography>
            <Slider
              aria-labelledby='dt-slider'
              min={0.001}
              max={0.1}
              step={0.001}
              value={config.dt ?? 0.03}
              onChange={handleDtChange}
              sx={{
                color: '#FF8E53',
                '& .MuiSlider-thumb': {
                  '&:hover, &.Mui-focusVisible': {
                    boxShadow: '0px 0px 0px 8px rgba(255, 142, 83, 0.16)',
                  },
                },
              }}
            />
          </Box>

          <FormControl sx={{ minWidth: 200 }} size='small'>
            <InputLabel id='trail-length-label'>Trail Length</InputLabel>
            <Select
              labelId='trail-length-label'
              id='trail-length-select'
              value={String(config.maxTrailLength ?? 100)}
              label='Trail Length'
              onChange={handleTrailLengthChange}
              sx={{
                color: 'white',
                '.MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgba(255, 255, 255, 0.5)',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#4caf50',
                },
              }}
            >
              <MenuItem value='100'>Short (100)</MenuItem>
              <MenuItem value='500'>Medium (500)</MenuItem>
              <MenuItem value='1000'>Long (1000)</MenuItem>
              <MenuItem value='2000'>Extra Long (2000)</MenuItem>
            </Select>
          </FormControl>
        </Stack>
        <Typography variant='body2' sx={{ mt: 3, color: '#93a1b8', lineHeight: 1.7 }}>
          Gravity and motion are calculated in {dimensions} spatial dimensions, with {dimensions === 4 ? 'inverse-cube' : 'inverse-square'} gravity. Close encounters use smaller, error-controlled steps;
          real gravitational slingshots can still eject a body. The spheres are visual markers for point masses,
          so their glowing surfaces do not collide. Reset generates a new system.
        </Typography>
      </Paper>
    </Container>
  );
};

export default SimulationContainer;
