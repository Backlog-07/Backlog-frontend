import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

function syncViewportVars() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const vv = window.visualViewport;
  const height = Math.max(1, Math.round(vv?.height || window.innerHeight || 1));
  const width = Math.max(1, Math.round(vv?.width || window.innerWidth || 1));
  const root = document.documentElement;

  root.style.setProperty('--app-vh', `${height * 0.01}px`);
  root.style.setProperty('--app-vw', `${width * 0.01}px`);
}

function ensureViewportVars() {
  if (typeof window === 'undefined') return;
  syncViewportVars();

  const vv = window.visualViewport;
  const onResize = () => syncViewportVars();

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  vv?.addEventListener('resize', onResize);
  vv?.addEventListener('scroll', onResize);

  window.__removeViewportVars = () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    vv?.removeEventListener('resize', onResize);
    vv?.removeEventListener('scroll', onResize);
  };
}

function ensureBootLoader() {
  // Removed boot loader as requested
}

function hideBootLoader() {
  // Removed boot loader as requested
}

// Expose helpers so route-like pages can reuse the same loader.
if (typeof window !== 'undefined') {
  ensureViewportVars();
  window.__ensureBootLoader = ensureBootLoader;
  window.__hideBootLoader = hideBootLoader;
}

// Removed call to ensureBootLoader() since it is disabled

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Hide loader removed - app renders immediately without splash screen

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
