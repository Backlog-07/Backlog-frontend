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

  el.innerHTML = `
    <div class="boot-inner">
      <div class="boot-brand">
        <span class="boot-text"><span class="boot-reveal">Backlog</span></span>
      </div>
      <div class="boot-percent" aria-live="polite">0%</div>
      <div class="boot-progress" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
        <div class="boot-progress-fill"></div>
      </div>
    </div>
  `;

  document.body.appendChild(el);

  // Count 0 → 100 % over 2000 ms (~60fps)
  const percentEl = el.querySelector('.boot-percent');
  const progressEl = el.querySelector('.boot-progress');
  const fillEl = el.querySelector('.boot-progress-fill');
  const DURATION = 3500;
  const INTERVAL = 16;
  const steps = Math.round(DURATION / INTERVAL);
  let step = 0;

  const timer = setInterval(() => {
    step++;
    const pct = Math.min(Math.round((step / steps) * 100), 100);
    if (percentEl) percentEl.textContent = pct + '%';
    if (progressEl) progressEl.setAttribute('aria-valuenow', pct);
    if (fillEl) fillEl.style.width = pct + '%';
    
    if (step >= steps) clearInterval(timer);
  }, INTERVAL);
}

function hideBootLoader() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('app-boot-loader');
  if (!el) return;

  el.setAttribute('data-state', 'hidden');

  const remove = () => {
    try {
      el.removeEventListener('transitionend', remove);
      el.remove();
    } catch {}
  };

  el.addEventListener('transitionend', remove);
  window.setTimeout(remove, 600);
}

// Proactive cleanup for HMR: instantly remove the old loader from document.body if it got stuck during hot-reloads.
if (typeof document !== 'undefined') {
  const stuckLoader = document.getElementById('app-boot-loader');
  if (stuckLoader) stuckLoader.remove();
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

// Hide loader after the 3.5s progress animation completes.
if (typeof window !== 'undefined') {
  window.setTimeout(() => {
    hideBootLoader();
  }, 3800);
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
