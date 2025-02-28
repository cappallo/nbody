import React, { useState } from 'react';
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
} from '@mui/material';
import ThreeBodyCanvas from './ThreeBodyCanvas';
import { ThreeBodyConfig } from '../physics/ThreeBodySystem';

/**
 * Component that wraps the simulation canvas with controls and information
 */
const SimulationContainer: React.FC = () => {
  // State for canvas size - responsive by default
  const [canvasSize, setCanvasSize] = useState({
    width: Math.min(window.innerWidth - 40, 1000),
    height: Math.min(window.innerHeight - 200, 700),
  });

  // Configuration state for the simulation
  const [config, setConfig] = useState<Partial<ThreeBodyConfig>>({
    G: 1000,
    dt: 0.02,
    maxTrailLength: 100,
    numBodies: 3, // Default to 3 bodies
  });

  // Handle window resize for responsive canvas
  React.useEffect(() => {
    const handleResize = (): void => {
      setCanvasSize({
        width: Math.min(window.innerWidth - 40, 1000),
        height: Math.min(window.innerHeight - 200, 700),
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    <Container maxWidth='lg' sx={{ py: 4 }}>
      <Typography
        variant='h3'
        component='h1'
        gutterBottom
        align='center'
        sx={{
          fontWeight: 'bold',
          background: 'linear-gradient(45deg, #FE6B8B 30%, #FF8E53 90%)',
          backgroundClip: 'text',
          textFillColor: 'transparent',
          mb: 4,
        }}
      >
        N-Body Problem Simulation
      </Typography>

      <Paper
        elevation={3}
        sx={{
          p: 2,
          mb: 4,
          background: 'rgba(25, 25, 25, 0.8)',
          color: 'white',
          borderRadius: 2,
        }}
      >
        <Typography variant='body1' paragraph>
          The n-body problem is a classical physics problem that involves predicting the motion of n objects interacting
          through gravitational forces. Unlike the two-body problem, which has a closed-form solution, the n-body
          problem (where n ≥ 3) cannot be solved analytically for most initial conditions and exhibits chaotic behavior.
        </Typography>
        <Typography variant='body1'>
          This simulation uses numerical integration to approximate the solution. The bodies are initialized with random
          masses and velocities, creating unique patterns each time you reset the simulation. Try changing the number of
          bodies to see how the system dynamics change!
        </Typography>
      </Paper>

      <Paper
        elevation={3}
        sx={{
          mb: 4,
          overflow: 'hidden',
          borderRadius: 2,
        }}
      >
        <ThreeBodyCanvas width={canvasSize.width} height={canvasSize.height} config={config} onReset={handleReset} />
      </Paper>

      <Paper
        elevation={3}
        sx={{
          p: 3,
          background: 'rgba(25, 25, 25, 0.8)',
          color: 'white',
          borderRadius: 2,
        }}
      >
        <Typography variant='h6' gutterBottom>
          Simulation Controls
        </Typography>

        <Stack spacing={4}>
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
            <Typography id='g-constant-slider' gutterBottom>
              Gravitational Constant: {config.G}
            </Typography>
            <Slider
              aria-labelledby='g-constant-slider'
              min={100}
              max={5000}
              step={100}
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
              Time Step: {config.dt}
            </Typography>
            <Slider
              aria-labelledby='dt-slider'
              min={0.001}
              max={0.05}
              step={0.001}
              value={config.dt ?? 0.02}
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
                  borderColor: '#FE6B8B',
                },
              }}
            >
              <MenuItem value={0}>No Trail</MenuItem>
              <MenuItem value={50}>Short</MenuItem>
              <MenuItem value={100}>Medium</MenuItem>
              <MenuItem value={200}>Long</MenuItem>
              <MenuItem value={500}>Very Long</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>
    </Container>
  );
};

export default SimulationContainer;
