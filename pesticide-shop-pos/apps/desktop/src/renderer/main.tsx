import { apiFromBridge, type Bridge } from '@pos/api-contract';
import { App } from '@pos/ui';
import '@pos/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// The preload script exposes `posBridge`: named functions that return plain results. This is the only way the
// page reaches the main process (and so the database, the session and the files).
declare global {
  interface Window {
    posBridge: Bridge;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root');
createRoot(root).render(
  <StrictMode>
    <App api={apiFromBridge(window.posBridge)} />
  </StrictMode>,
);
