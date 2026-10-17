import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initPwa } from './lib/pwa';
import './styles.css';
import { TroopDomainApp } from './TroopDomainApp';
import { troopDomainSlug } from './lib/troopDomain';

// On a troop's own domain the server marks the page; show that troop's site and nothing else.
const slug = troopDomainSlug();

initPwa(); // installable app: service worker, install prompt and update check

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>{slug ? <TroopDomainApp slug={slug} /> : <App />}</StrictMode>,
);
