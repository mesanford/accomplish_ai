import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initPwa } from './lib/pwa';
import './styles.css';

initPwa(); // installable app: service worker, install prompt and update check

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
