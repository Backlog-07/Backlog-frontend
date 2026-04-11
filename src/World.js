import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { fetchWorldGallery } from "./shopifyApi";

const STRIP_VISIBLE_EACH_SIDE = 15;

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
  const [galleryOpen, setGalleryOpen] = useState(false);
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
    window.dispatchEvent(
      new CustomEvent("worldGalleryState", { detail: { open: galleryOpen } })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("worldGalleryState", { detail: { open: false } })
      );
    };
  }, [galleryOpen]);

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
      setCurrentIdx(idx);
    },
    [currentIdx]
  );

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

  const handleHeroClick = useCallback((e) => {
    if (suppressNextClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressNextClickRef.current = false;
      return;
    }
    setGalleryOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && galleryOpen) {
        e.preventDefault();
        setGalleryOpen(false);
        return;
      }
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
  }, [galleryOpen, goNext, goPrev]);

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
      setGalleryOpen((prev) => !prev);
    };
    window.addEventListener("worldCenterClick", onCenter);
    return () => window.removeEventListener("worldCenterClick", onCenter);
  }, []);

  const currentImage = images[currentIdx];

  const leftStrip = [];
  const rightStrip = [];
  if (count > 1) {
    for (let i = 1; i <= Math.min(STRIP_VISIBLE_EACH_SIDE, count - 1); i++) {
      const idx = (currentIdx - i + count) % count;
      leftStrip.unshift(images[idx]);
    }
    for (let i = 1; i <= Math.min(STRIP_VISIBLE_EACH_SIDE, count - 1); i++) {
      const idx = (currentIdx + i) % count;
      rightStrip.push(images[idx]);
    }
  }

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
      <div className="wld-strip wld-strip-l">
        {leftStrip.map((img, i) => (
          <div
            key={`l-${img.id || i}`}
            onClick={() => jumpTo(images.indexOf(img))}
            className="wld-th"
          >
            {img._src && <img src={img._src} alt="" draggable={false} loading="lazy" decoding="async" />}
          </div>
        ))}
      </div>

      <div className="wld-center">
        <div
          className={`wld-hero ${galleryOpen ? "wld-hero-open" : ""}`}
          onClick={handleHeroClick}
          onTouchStart={handleHeroTouchStart}
          onTouchEnd={handleHeroTouchEnd}
          onTouchCancel={() => {
            touchStartRef.current = null;
            suppressNextClickRef.current = false;
          }}
          role="button"
          tabIndex={0}
          aria-label={galleryOpen ? "Close world gallery" : "Open world gallery"}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setGalleryOpen((prev) => !prev);
            }
          }}
        >
          <img src={currentImage?._src || ""} alt={currentImage?.caption || "World gallery"} draggable={false} loading="eager" fetchPriority="high" decoding="async" />
        </div>
      </div>

      <div className="wld-strip wld-strip-r">
        {rightStrip.map((img, i) => (
          <div
            key={`r-${img.id || i}`}
            onClick={() => jumpTo(images.indexOf(img))}
            className="wld-th"
          >
            {img._src && <img src={img._src} alt="" draggable={false} loading="lazy" decoding="async" />}
          </div>
        ))}
      </div>

      {galleryOpen && (
        <div className="wld-panel" onClick={() => setGalleryOpen(false)}>
          <div className="wld-panel-card" onClick={(e) => e.stopPropagation()}>
            <div className="wld-panel-head">
              <div className="wld-panel-title">World Gallery</div>
              <button className="wld-panel-close" onClick={() => setGalleryOpen(false)} aria-label="Close world gallery">
                x
              </button>
            </div>

            <div className="wld-panel-preview">
              <img src={currentImage?._src || ""} alt={currentImage?.caption || "World gallery"} />
            </div>

            <div className="wld-panel-meta">
              <div>{count} images</div>
              <div>{currentIdx + 1} / {count}</div>
            </div>

            <div className="wld-panel-grid">
              {images.map((img, idx) => (
                <button
                  key={img.id || idx}
                  type="button"
                  className={`wld-panel-thumb ${idx === currentIdx ? "is-active" : ""}`}
                  onClick={() => jumpTo(idx)}
                  aria-label={`View world image ${idx + 1}`}
                >
                  <img src={img._src || ""} alt={img.caption || `World image ${idx + 1}`} loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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

        .wld-strip {
          position: absolute;
          top: 44%;
          transform: translateY(-50%);
          display: flex;
          gap: 10px;
          opacity: 0.78;
          overflow: visible;
          pointer-events: auto;
        }
        .wld-strip-l { right: calc(50% + min(150px, 13vw) + 18px); justify-content: flex-end; }
        .wld-strip-r { left: calc(50% + min(150px, 13vw) + 18px); justify-content: flex-start; }

        .wld-th {
          width: 76px;
          height: 104px;
          border-radius: 8px;
          overflow: hidden;
          flex-shrink: 0;
          cursor: pointer;
          background: #ddd;
          transform:
            translateX(var(--thumb-shift, 0))
            translateZ(calc(var(--thumb-shift, 0) * -0.35))
            scale(var(--thumb-scale, 1));
          opacity: var(--thumb-opacity, 0.82);
          box-shadow: 0 10px 26px rgba(0,0,0,0.08);
        }
        .wld-th:hover {
          opacity: 1;
          box-shadow: 0 14px 32px rgba(0,0,0,0.14);
        }
        .wld-th img { width: 100%; height: 100%; object-fit: cover; display: block; }

        .wld-center {
          position: relative;
          z-index: 2;
          width: min(300px, 26vw);
          height: min(480px, 60vh);
          transform: translateY(-40px) translateZ(70px);
        }

        .wld-hero {
          position: absolute;
          inset: 0;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 26px 60px rgba(0, 0, 0, 0.16);
          background: #f0f0f0;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .wld-hero-open { box-shadow: 0 30px 72px rgba(0, 0, 0, 0.2); }
        .wld-hero img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center center;
          display: block;
          pointer-events: none;
        }

        .wld-panel {
          position: fixed;
          inset: 0;
          z-index: 8;
          background: rgba(240, 240, 240, 0.84);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .wld-panel-card {
          width: min(1040px, calc(100vw - 48px));
          max-height: min(88vh, 860px);
          overflow: auto;
          background: rgba(255, 255, 255, 0.78);
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.12);
          border-radius: 24px;
          padding: 20px;
        }

        .wld-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .wld-panel-title {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }

        .wld-panel-close {
          width: 36px;
          height: 36px;
          border: 0;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.08);
          color: #111;
          font-size: 14px;
          cursor: pointer;
        }

        .wld-panel-preview {
          aspect-ratio: 4 / 5;
          width: min(320px, 100%);
          border-radius: 18px;
          overflow: hidden;
          background: #e2e2e2;
          margin: 0 auto 16px;
        }

        .wld-panel-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .wld-panel-meta {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.62);
        }

        .wld-panel-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
          gap: 12px;
        }

        .wld-panel-thumb {
          aspect-ratio: 4 / 5;
          border: 0;
          border-radius: 14px;
          overflow: hidden;
          padding: 0;
          background: #ddd;
          cursor: pointer;
          box-shadow: inset 0 0 0 1px transparent;
        }

        .wld-panel-thumb.is-active {
          box-shadow: inset 0 0 0 2px #111;
        }

        .wld-panel-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        @media (max-width: 900px) {
          .wld-strip {
            display: none;
          }

          .wld-center {
            width: min(88vw, 380px);
            aspect-ratio: 4 / 5;
            height: auto;
            max-height: min(66vh, 520px);
            transform: translateY(-56px);
          }

          .wld-hero {
            border-radius: 14px;
          }

          .wld-hero img {
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
