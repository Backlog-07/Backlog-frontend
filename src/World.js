import { useEffect, useMemo, useRef, useState, useCallback } from "react";

const API_BASE = (process.env.REACT_APP_API_URL || "http://localhost:4000").replace(/\/$/, "");

function resolveImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http")) return imageUrl;
  const clean = imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`;
  return `${API_BASE}${clean}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export default function World({ onSelect }) {
  const [worldImages, setWorldImages] = useState([]);
  const [loadingImages, setLoadingImages] = useState(true);

  // A continuous floating index; snapping targets integers.
  const indexRef = useRef(0);
  const targetIndexRef = useRef(0);
  const velocityRef = useRef(0);
  const rafRef = useRef(0);

  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  const lastTRef = useRef(0);

  const lastRafTimeRef = useRef(0);

  const count = worldImages.length;

  const images = useMemo(() => {
    return (Array.isArray(worldImages) ? worldImages : []).map((img) => ({
      ...img,
      _src: resolveImageUrl(img.imageUrl),
    }));
  }, [worldImages]);

  // Force lightweight re-render so transforms update smoothly (refs alone don't re-render)
  const [, forceRerender] = useState(0);

  const stageRef = useRef(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver((entries) => {
      const cr = entries?.[0]?.contentRect;
      if (!cr) return;
      setStageSize({ w: cr.width || 0, h: cr.height || 0 });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const metrics = useMemo(() => {
    const w = stageSize.w || window.innerWidth;
    const h = stageSize.h || Math.min(window.innerHeight * 0.58, 620);

    const cardH = clamp(h * 0.56, 220, 340);
    const cardW = clamp(cardH * 0.62, 150, 240);

    // Spacing based on viewport width so the strip reaches edges on all screens
    const spacing = clamp(w * 0.18, cardW * 0.72, cardW * 0.95);

    const lift = clamp(h * 0.018, 8, 14);
    const centerLift = -clamp(h * 0.010, 4, 8);

    return { stageW: w, stageH: h, cardW, cardH, spacing, lift, centerLift };
  }, [stageSize.w, stageSize.h]);

  useEffect(() => {
    const loadWorldImages = async () => {
      try {
        setLoadingImages(true);
        try {
          window.__ensureBootLoader && window.__ensureBootLoader();
        } catch {}

        const res = await fetch(`${API_BASE}/api/world-images`);
        if (!res.ok) throw new Error(`Failed to fetch world images: ${res.status}`);
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];

        arr.sort((a, b) => {
          const at = a?.createdAt ? Date.parse(a.createdAt) : 0;
          const bt = b?.createdAt ? Date.parse(b.createdAt) : 0;
          return at - bt;
        });

        setWorldImages(arr);
        indexRef.current = 0;
        targetIndexRef.current = 0;
        velocityRef.current = 0;
      } catch (e) {
        console.error("Failed to load world images", e);
        setWorldImages([]);
      } finally {
        setLoadingImages(false);
        try {
          window.__hideBootLoader && window.__hideBootLoader();
        } catch {}
      }
    };

    loadWorldImages();
  }, []);

  // Helper: wrap an index into [0, count)
  const wrapIndex = useCallback((i, n) => ((i % n) + n) % n, []);

  // Helper: minimal signed circular distance from 'from' to 'to'
  const circularDelta = useCallback((from, to, n) => {
    let d = to - from;
    if (n <= 0) return d;
    // bring into [-n/2, n/2]
    d = ((d + n / 2) % n) - n / 2;
    return d;
  }, []);

  const snapToNearest = useCallback(() => {
    if (!count) return;

    // Choose nearest integer center in circular space
    const current = indexRef.current;
    const currentWrapped = wrapIndex(current, count);
    const nearestIntWrapped = Math.round(currentWrapped);

    // Convert the wrapped nearest int back into the continuous space near current
    const d = circularDelta(currentWrapped, nearestIntWrapped, count);
    targetIndexRef.current = current + d;

    if (Math.abs(targetIndexRef.current - indexRef.current) < 0.002) {
      indexRef.current = targetIndexRef.current;
      velocityRef.current = 0;
    }
  }, [count, wrapIndex, circularDelta]);

  const animate = useCallback(() => {
    cancelAnimationFrame(rafRef.current);

    const tick = (t) => {
      const lastT = lastRafTimeRef.current || t;
      lastRafTimeRef.current = t;
      const dtMs = Math.max(8, Math.min(34, t - lastT));
      const dt = dtMs / 16.67; // normalize to ~60fps

      let didMove = false;

      if (!draggingRef.current) {
        if (Math.abs(velocityRef.current) > 0) {
          indexRef.current += velocityRef.current * dt;
          didMove = true;
        }

        // Damping
        velocityRef.current *= Math.pow(0.82, dt);
        if (Math.abs(velocityRef.current) < 0.00014) velocityRef.current = 0;

        // Spring toward target in continuous space
        const diff = targetIndexRef.current - indexRef.current;
        if (Math.abs(diff) > 0.00005) {
          indexRef.current += diff * (1 - Math.pow(1 - 0.22, dt));
          didMove = true;
        } else {
          indexRef.current = targetIndexRef.current;
        }
      } else {
        didMove = true;
      }

      // IMPORTANT: do NOT wrap indexRef/targetIndexRef every frame.
      // Wrapping introduces discontinuities and shifts the perceived center.
      // We only wrap for rendering calculations.

      // Only re-render when necessary (prevents constant 60fps state churn)
      if (didMove) {
        forceRerender((v) => (v + 1) % 1000000);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [forceRerender]);

  useEffect(() => {
    animate();
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  const onWheel = useCallback(
    (e) => {
      if (!count) return;
      const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) || 0;

      // Slightly lower gain to reduce jitter on high-res trackpads
      const deltaIndex = d * 0.0022;
      velocityRef.current += deltaIndex;
      targetIndexRef.current = indexRef.current;

      window.clearTimeout(onWheel._t);
      onWheel._t = window.setTimeout(() => {
        snapToNearest();
      }, 55);
    },
    [count, snapToNearest]
  );

  const onPointerDown = useCallback((e) => {
    if (!count) return;
    draggingRef.current = true;
    lastXRef.current = e.clientX;
    lastTRef.current = performance.now();
    velocityRef.current = 0;
    targetIndexRef.current = Math.round(indexRef.current); // start from a locked center

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  }, [count]);

  const onPointerMove = useCallback((e) => {
    if (!draggingRef.current || !count) return;

    const now = performance.now();
    const dx = e.clientX - lastXRef.current;
    const dt = Math.max(8, now - lastTRef.current);

    lastXRef.current = e.clientX;
    lastTRef.current = now;

    // Slightly reduced drag gain for smoother feel
    const deltaIndex = -dx * 0.0088;
    indexRef.current += deltaIndex;
    velocityRef.current = (deltaIndex / dt) * 16;
    targetIndexRef.current = indexRef.current;

    // Immediate paint while dragging
    forceRerender((v) => (v + 1) % 1000000);
  }, [count]);

  const onPointerUp = useCallback(() => {
    if (!count) return;
    draggingRef.current = false;
    snapToNearest();
  }, [count, snapToNearest]);

  // Smooth discrete step (for joystick/keyboard)
  const stepBy = useCallback((dir) => {
    if (!count) return;
    draggingRef.current = false;
    velocityRef.current = 0;

    // Step from the currently centered (nearest) item
    const currentWrapped = wrapIndex(indexRef.current, count);
    const base = Math.round(currentWrapped);
    const nextWrapped = wrapIndex(base + dir, count);

    // Convert to continuous target near current
    const d = circularDelta(currentWrapped, nextWrapped, count);
    targetIndexRef.current = indexRef.current + d;
  }, [count, wrapIndex, circularDelta]);

  // Keyboard support
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepBy(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepBy(1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stepBy]);

  // Joystick support (dispatch a CustomEvent('worldCarouselStep', { detail: { dir: -1|1 } }))
  useEffect(() => {
    const onStep = (e) => {
      const dir = Number(e?.detail?.dir);
      if (dir === 1 || dir === -1) stepBy(dir);
    };

    window.addEventListener('worldCarouselStep', onStep);
    return () => window.removeEventListener('worldCarouselStep', onStep);
  }, [stepBy]);

  const currentIndex = indexRef.current;

  if (loadingImages) return null;

  if (!count) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#666",
          fontWeight: 700,
        }}
      >
        No images in the gallery yet
      </div>
    );
  }

  // Render a window of items around the center to keep DOM light.
  const WINDOW = Math.min(9, count);
  const half = Math.floor(WINDOW / 2);

  const items = [];
  for (let k = -half; k <= half; k++) {
    const base = Math.round(currentIndex);
    const idx = wrapIndex(base + k, count);
    const rel = (base + k) - currentIndex; // signed distance in index units
    items.push({ idx, rel });
  }

  return (
    <section
      style={{
        position: "fixed",
        inset: 0,
        background: "#fff",
        overflow: "hidden",
        // Reserve space for existing UI (header/joystick)
        paddingTop: 86,
        paddingBottom: 140,
        boxSizing: "border-box",
      }}
    >
      {/* Removed vignette/overlay */}

      <div
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          touchAction: "pan-y",
          cursor: draggingRef.current ? "grabbing" : "grab",
          userSelect: "none",
        }}
      >
        <div
          ref={stageRef}
          style={{
            position: "relative",
            width: "100vw",
            height: "min(58vh, 620px)",
          }}
        >
          {items.map(({ idx, rel }) => {
            const img = images[idx];
            const d = Math.abs(rel);

            const t = clamp(1 - d / 1.8, 0, 1);
            const eased = t * t * (3 - 2 * t);

            const scale = lerp(0.66, 1.50, eased);
            const opacity = lerp(0.34, 1.0, eased);
            const dim = lerp(0.78, 1.0, eased);

            // Dynamic spacing + lift based on stage size
            const x = rel * metrics.spacing;
            const y = lerp(metrics.lift, metrics.centerLift, eased);

            const z = Math.round(eased * 1000);

            return (
              <figure
                key={img.id || idx}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0px) scale(${scale})`,
                  transformOrigin: "center center",
                  width: `${metrics.cardW}px`,
                  height: `${metrics.cardH}px`,
                  borderRadius: 14,
                  overflow: "hidden",
                  boxShadow:
                    eased > 0.9
                      ? "0 22px 60px rgba(0,0,0,0.26), 0 8px 20px rgba(0,0,0,0.16)"
                      : "0 12px 30px rgba(0,0,0,0.14)",
                  opacity,
                  filter: `brightness(${dim})`,
                  transition: draggingRef.current ? "none" : "filter 220ms ease-out, box-shadow 220ms ease-out",
                  zIndex: z,
                  background: "#f0f0f0",
                  margin: 0,
                  pointerEvents: eased > 0.92 ? "auto" : "none",
                }}
                onClick={() => {
                  if (onSelect) onSelect(img);
                }}
              >
                {img?._src ? (
                  <img
                    src={img._src}
                    alt=""
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                      transform: "scale(1.02)",
                    }}
                  />
                ) : null}
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}