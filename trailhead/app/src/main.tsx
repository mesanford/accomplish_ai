import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { TroopDomainApp } from './TroopDomainApp';
import { troopDomainSlug } from './lib/troopDomain';

// On a troop's own domain the server marks the page; show that troop's site and nothing else.
const slug = troopDomainSlug();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>{slug ? <TroopDomainApp slug={slug} /> : <App />}</StrictMode>,
);
