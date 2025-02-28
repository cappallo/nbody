import { useState } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Box } from '@mui/material';
import SimulationContainer from './components/SimulationContainer';

/**
 * Main application component
 */
function App() {
  // State for dark/light mode
  const [darkMode] = useState<boolean>(true);

  // Create MUI theme with dark mode preference
  const theme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: {
        main: '#FE6B8B',
      },
      secondary: {
        main: '#FF8E53',
      },
      background: {
        default: darkMode ? '#0a0a0a' : '#f5f5f5',
        paper: darkMode ? '#1a1a1a' : '#ffffff',
      },
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h3: {
        fontWeight: 700,
      },
      h6: {
        fontWeight: 600,
      },
    },
    shape: {
      borderRadius: 8,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
          },
        },
      },
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          width: '100%',
          background: darkMode
            ? 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)'
            : 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
        }}
      >
        <SimulationContainer />
      </Box>
    </ThemeProvider>
  );
}

export default App;
