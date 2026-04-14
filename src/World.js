import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { fetchWorldGallery } from "./shopifyApi";

const WORLD_LAYOUT_QUERY = "(max-width: 900px)";
const R2_BASE = 'https://pub-ca1e1931d1d24140b20bf79db813ae8c.r2.dev/World%20Images/';
const FALLBACK_IMAGES = [
  'WhatsApp%20Image%202026-04-10%20at%2011.47.25%20PM%20%281%29.jpeg',
  'WhatsApp%20Image%202026-04-10%20at%2011.47.25%20PM.jpeg',
  'WhatsApp%20Image%202026-04-10%20at%2011.47.26%20PM%20%281%29.jpeg',
  'WhatsApp%20Image%202026-04-10%20at%2011.47.26%20PM%20%282%29.jpeg',
  'WhatsApp%20Image%202026-04-10%20at%2011.47.26%20PM.jpeg',
  'WhatsApp%20Image%202026-04-10%20at%2011.47.27%20PM%20%281%29.jpeg',
  'WhatsApp%20Image%202026-04-10%20at%2011.47.27%20PM.jpeg',
  'WhatsApp%20Image%202026-04-10%20at%2011.47.28%20PM%20%281%29.jpeg',
  'WhatsApp%20Image%202026-04-10%20at%2011.47.28%20PM.jpeg',
  'WhatsApp%20Image%202026-04-10%20at%2011.47.29%20PM%20%281%29.jpeg',
  'WhatsApp%20Image%202026-04-10%20at%2011.47.29%20PM%20%282%29.jpeg',
].map((f, i) => ({ id: `r2-${i}`, imageUrl: `${R2_BASE}${f}`, caption: '' }));

export default function World() {
  const [worldImages, setWorldImages] = useState(FALLBACK_IMAGES);
  const [loadingImages, setLoadingImages] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  const [isCompactLayout, setIsCompactLayout] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(WORLD_LAYOUT_QUERY).matches;
  });
  const touchStartRef = useRef(null);
  const suppressNextClickRef = useRef(false);

  const images = useMemo(() => {
    return (Array.isArray(worldImages) ? worldImages : []).map((img) => ({
      ...img,
      _src: img.imageUrl,
    }));
  }, [worldImages]);

  const count = images.length;

  useEffect(() => {
    const load = async () => {
      setLoadingImages(true);
      setLoadError(null);
      try {
        const items = await fetchWorldGallery();
        if (items.length > 0) setWorldImages(items);
      } catch (e) {
        if (!FALLBACK_IMAGES.length) {
          setLoadError(e?.message || "Could not load world gallery.");
        }
      } finally {
        setLoadingImages(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia(WORLD_LAYOUT_QUERY);
    const update = () => setIsCompactLayout(mediaQuery.matches);

    update();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);



  const navigate = useCallback(
    (dir) => {
      if (!count) return;
      setCurrentIdx((prev) => (dir === 1 ? (prev + 1) % count : (prev - 1 + count) % count));
    },
    [count]
  );

  const goNext = useCallback(() => navigate(1), [navigate]);
  const goPrev = useCallback(() => navigate(-1), [navigate]);

  const jumpTo = useCallback(
    (idx) => {
      if (idx === currentIdx) return;
      setCurrentIdx(((idx % count) + count) % count);
    },
    [currentIdx, count]
  );

  const carouselItems = useMemo(() => {
    if (!count) return [];

    const vwHalf = typeof window !== 'undefined' ? window.innerWidth / 2 : 195;

    const normalizeDelta = (index) => {
      let delta = index - currentIdx;
      const half = count / 2;
      if (delta > half) delta -= count;
      if (delta < -half) delta += count;
      return delta;
    };

    return images.map((img, index) => {
      const delta = normalizeDelta(index);
      const abs = Math.abs(delta);
      const isActive = delta === 0;
      const isPeek = isCompactLayout && abs === 1;
      const x = isActive
        ? 0
        : isPeek
          ? Math.sign(delta) * (vwHalf * 0.9)
          : Math.sign(delta) * (
              (isCompactLayout ? vwHalf * 2 : 188) + (Math.max(abs - 1, 0) * (isCompactLayout ? 58 : 62))
            );
      const y = 0;
      const scale = isActive
        ? (isCompactLayout ? 4.1 : 4.45)
        : (isPeek ? 0.75 : (isCompactLayout ? 0.11 : 0.78));
      const opacity = isActive
        ? 1
        : (isPeek ? 0.55 : (isCompactLayout ? 0 : Math.max(0.58, 0.94 - Math.min(abs, 7) * 0.018)));
      const rotateY = 0;
      const zIndex = isActive ? 12 : Math.max(1, 12 - abs);

      return {
        ...img,
        _index: index,
        _delta: delta,
        _abs: abs,
        _isActive: isActive,
        _isPeek: isPeek,
        _x: x,
        _y: y,
        _scale: scale,
        _opacity: opacity,
        _rotateY: rotateY,
        _zIndex: zIndex,
      };
    });
  }, [images, currentIdx, count, isCompactLayout]);

  const handleHeroTouchStart = useCallback((e) => {
    const touch = e.touches?.[0];
    if (!touch) return;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      t: Date.now(),
    };
    suppressNextClickRef.current = false;
  }, []);

  const handleHeroTouchEnd = useCallback((e) => {
    const start = touchStartRef.current;
    const touch = e.changedTouches?.[0];
    touchStartRef.current = null;
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const elapsed = Date.now() - start.t;

    const SWIPE_DISTANCE = 44;
    const SWIPE_MAX_VERTICAL = 28;
    const SWIPE_MAX_TIME = 650;

    if (elapsed <= SWIPE_MAX_TIME && absX > SWIPE_DISTANCE && absX > absY && absY < SWIPE_MAX_VERTICAL) {
      suppressNextClickRef.current = true;
      if (dx < 0) goNext();
      else goPrev();
    }
  }, [goNext, goPrev]);

  const handleCardClick = useCallback((e, index, isActive) => {
    if (suppressNextClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressNextClickRef.current = false;
      return;
    }
    if (isActive) {
      // Gallery panel removed as per request
      return;
    }
    jumpTo(index);
  }, [jumpTo]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev]);

  useEffect(() => {
    const onStep = (e) => {
      const dir = Number(e?.detail?.dir);
      if (dir === 1) goNext();
      else if (dir === -1) goPrev();
    };
    window.addEventListener("worldCarouselStep", onStep);
    return () => window.removeEventListener("worldCarouselStep", onStep);
  }, [goNext, goPrev]);

  useEffect(() => {
    const onCenter = () => {
      // Gallery panel toggle removed as per request
    };
    window.addEventListener("worldCenterClick", onCenter);
    return () => window.removeEventListener("worldCenterClick", onCenter);
  }, []);


  if (loadingImages) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 13 }}>
        Loading world gallery…
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f0f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{ color: '#c00', fontWeight: 700, fontSize: 13 }}>Error loading world gallery</div>
        <div style={{ color: '#888', fontSize: 11, maxWidth: 400, textAlign: 'center' }}>{loadError}</div>
      </div>
    );
  }

  if (!count) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontWeight: 600, fontSize: 14 }}>
        No images in World yet — add entries in Shopify → Content → Metaobjects → World-Image
      </div>
    );
  }

  return (
    <section className="wld">
      <div className="wld-center">
        <div
          className="wld-track"
          onTouchStart={handleHeroTouchStart}
          onTouchEnd={handleHeroTouchEnd}
          onTouchCancel={() => {
            touchStartRef.current = null;
            suppressNextClickRef.current = false;
          }}
        >
          {carouselItems.map((img) => (
            <button
              key={`${img.id || img._index}`}
              type="button"
              className={`wld-card ${img._isActive ? "wld-card-active" : "wld-card-passive"}`}
              onClick={(e) => handleCardClick(e, img._index, img._isActive)}
              style={{
                "--card-x": `${img._x}px`,
                "--card-y": `${img._y}px`,
                "--card-scale": img._scale,
                "--card-opacity": img._opacity,
                "--card-rotate": `${img._rotateY}deg`,
                "--card-z": img._zIndex,
              }}
            >
              <img
                src={img._src}
                alt={img.caption || "World gallery image"}
                loading="lazy"
                decoding="async"
              />

            </button>
          ))}
        </div>
      </div>



      <style>{`
        .wld {
          position: fixed;
          inset: 0;
          background:
            radial-gradient(circle at 50% 42%, rgba(255,255,255,0.92) 0%, rgba(245,245,245,0.96) 28%, #ececec 62%, #e4e4e4 100%);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          perspective: 1400px;
        }

        .wld-center {
          position: relative;
          z-index: 2;
          width: 100vw;
          height: calc(var(--app-vh, 1vh) * 100);
          transform: translateY(-70px) translateZ(70px) translateX(-10px);
          overflow: visible;
        }

        .wld-track {
          position: absolute;
          inset: 0;
          overflow: visible;
          transform-style: preserve-3d;
        }

        .wld-card {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 66px;
          height: 88px;
          border: 0;
          padding: 0;
          border-radius: 6px;
          overflow: hidden;
          background: #ddd;
          box-shadow: 0 10px 26px rgba(0,0,0,0.08);
          cursor: pointer;
          transform-style: preserve-3d;
          transform:
            translate3d(calc(-50% + var(--card-x, 0px)), calc(-50% + var(--card-y, 0px)), 0)
            rotateY(var(--card-rotate, 0deg))
            scale(var(--card-scale, 1));
          opacity: var(--card-opacity, 1);
          z-index: var(--card-z, 1);
          transition:
            transform 780ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 780ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 780ms cubic-bezier(0.22, 1, 0.36, 1),
            filter 780ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform, opacity;
        }

        .wld-card:hover {
          box-shadow: 0 14px 32px rgba(0,0,0,0.14);
          opacity: 1;
        }

        .wld-card-active {
          box-shadow: 0 26px 60px rgba(0, 0, 0, 0.16);
          background: #f0f0f0;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: visible;
        }

        @keyframes wldHintFade {
          0%, 100% { opacity: 0.55; transform: translateY(0px); }
          50% { opacity: 1; transform: translateY(-3px); }
        }

        .wld-card-hint {
          position: absolute;
          bottom: -28px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.55);
          white-space: nowrap;
          pointer-events: none;
          animation: wldHintFade 2.4s ease-in-out infinite;
          z-index: 20;
        }

        .wld-card-passive {
          filter: saturate(0.92) brightness(0.98);
        }



        .wld-card img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center center;
          display: block;
          pointer-events: none;
        }



        @media (max-width: 900px) {
          .wld-center {
            width: 100vw;
            height: calc(var(--app-vh, 1vh) * 100);
            transform: translateY(clamp(-105px, calc(var(--app-vh, 1vh) * -8.5), -75px));
          }

          .wld-card {
            width: clamp(64px, 17vw, 76px);
            height: clamp(86px, 22vw, 102px);
            border-radius: 8px;
          }

          .wld-card-passive {
            opacity: 0;
            pointer-events: none;
          }

          .wld-card img {
            object-position: center top;
          }

          .wld-panel-card {
            width: min(100vw - 24px, 640px);
            padding: 16px;
            border-radius: 18px;
          }
        }
      `}</style>
    </section>
  );
}
