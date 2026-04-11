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
  if (typeof document === 'undefined') return;
  if (document.getElementById('app-boot-loader')) return;

  const el = document.createElement('div');
  el.id = 'app-boot-loader';
  el.setAttribute('aria-label', 'Loading');
  el.setAttribute('role', 'status');

  // Keep DOM minimal: one brand line + subtle animated rule.
  el.innerHTML = `
    <div class="boot-inner">
      <div class="boot-brand">
        <span class="boot-text"><span class="boot-reveal">Backlog</span></span>
      </div>
      <div class="boot-line" aria-hidden="true"></div>
      <div class="boot-sub">Loading</div>
    </div>
  `;

  // Force brand fg to black even if page theme changes.
  el.style.color = '#000';

  document.body.appendChild(el);
}

function hideBootLoader() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('app-boot-loader');
  if (!el) return;

  // Kick transition.
  el.setAttribute('data-state', 'hidden');

  const remove = () => {
    try {
      el.removeEventListener('transitionend', remove);
      el.remove();
    } catch {}
  };

  el.addEventListener('transitionend', remove);
  // Safety removal in case transitionend doesn't fire.
  window.setTimeout(remove, 900);
}

// Expose helpers so route-like pages can reuse the same loader.
if (typeof window !== 'undefined') {
  ensureViewportVars();
  window.__ensureBootLoader = ensureBootLoader;
  window.__hideBootLoader = hideBootLoader;
}

ensureBootLoader();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Hide loader once React has committed and the browser has a frame to paint.
if (typeof window !== 'undefined') {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      hideBootLoader();
    });
  });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
