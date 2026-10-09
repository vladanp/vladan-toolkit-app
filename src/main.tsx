import './styles/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { createAppRouter } from './app/router';
import { installNativeBehaviors } from './core/native-feel';
import { platform } from './core/platform';
import { useSettings } from './core/stores/settings';
import { applyTheme, resolveTheme } from './core/theme';

// Native end-to-end test builds only (`vite build --mode e2e`); removed from production bundles.
if (import.meta.env.MODE === 'e2e') {
  await import('@wdio/tauri-plugin');
}

// Paint with the saved theme before React mounts so there is no flash of the wrong theme.
const { theme, accent } = useSettings.getState();
applyTheme(resolveTheme(theme), accent);
document.documentElement.dataset.platform = platform;
installNativeBehaviors();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App router={createAppRouter()} />
  </StrictMode>,
);
