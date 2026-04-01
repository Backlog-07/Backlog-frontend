import { useEffect, useMemo, useState, useCallback, useRef } from "react";

const API_BASE = (process.env.REACT_APP_API_URL || "http://localhost:4000").replace(/\/$/, "");

function resolveImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http")) return imageUrl;
  const clean = imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`;
  return `${API_BASE}${clean}`;
}

export default function World() {
  const [worldImages, setWorldImages] = useState([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState(null);
  const [direction, setDirection] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const lockRef = useRef(false);

  const images = useMemo(() => {
    return (Array.isArray(worldImages) ? worldImages : []).map((img) => ({
      ...img,
      _src: resolveImageUrl(img.imageUrl),
    }));
  }, [worldImages]);

  const count = images.length;

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingImages(true);
        const res = await fetch(`${API_BASE}/api/world-images`);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        arr.sort((a, b) => {
          const at = a?.createdAt ? Date.parse(a.createdAt) : 0;
          const bt = b?.createdAt ? Date.parse(b.createdAt) : 0;
          return at - bt;
        });
        setWorldImages(arr);
      } catch (e) {
        console.error("Failed to load world images", e);
        setWorldImages([]);
      } finally {
        setLoadingImages(false);
      }
    };
    load();
  }, []);

  const navigate = useCallback((dir) => {
    if (!count || lockRef.current) return;
    lockRef.current = true;
    setDirection(dir);
    setPrevIdx(currentIdx);
    setCurrentIdx((prev) => {
      if (dir === 1) return (prev + 1) % count;
      return (prev - 1 + count) % count;
    });
    setAnimKey((k) => k + 1);
    setTimeout(() => { lockRef.current = false; }, 360);
  }, [count, currentIdx]);

  const goNext = useCallback(() => navigate(1), [navigate]);
  const goPrev = useCallback(() => navigate(-1), [navigate]);

  const jumpTo = useCallback((idx) => {
    if (idx === currentIdx || lockRef.current) return;
    lockRef.current = true;
    setDirection(idx > currentIdx ? 1 : -1);
    setPrevIdx(currentIdx);
    setCurrentIdx(idx);
    setAnimKey((k) => k + 1);
    setTimeout(() => { lockRef.current = false; }, 360);
  }, [currentIdx]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
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
    const onCenter = () => { };
    window.addEventListener("worldCenterClick", onCenter);
    return () => window.removeEventListener("worldCenterClick", onCenter);
  }, []);

  const currentImage = images[currentIdx];
  const previousImage = prevIdx !== null ? images[prevIdx] : null;

  const leftStrip = [];
  const rightStrip = [];
  if (count > 1) {
    for (let i = 1; i <= Math.min(12, count - 1); i++) {
      const idx = (currentIdx - i + count) % count;
      leftStrip.unshift(images[idx]);
    }
    for (let i = 1; i <= Math.min(12, count - 1); i++) {
      const idx = (currentIdx + i) % count;
      rightStrip.push(images[idx]);
    }
  }

  if (loadingImages) return null;
  if (!count) {
    return (
      <div style={{ minHeight: "100vh", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontWeight: 600, fontSize: 14 }}>
        No images in World yet
      </div>
    );
  }

  const hasAnim = direction !== 0;
  const goingNext = direction === 1;

  return (
    <section className="wld">

      {/* Left filmstrip */}
      <div
        key={`ls-${animKey}`}
        className={`wld-strip wld-strip-l ${hasAnim ? "wld-strip-anim" : ""}`}
        style={hasAnim ? { "--dx": goingNext ? "72px" : "-72px" } : undefined}
      >
        {leftStrip.map((img, i) => (
          <div key={`l-${img.id || i}`} onClick={() => jumpTo(images.indexOf(img))} className="wld-th">
            {img._src && <img src={img._src} alt="" draggable={false} />}
          </div>
        ))}
      </div>

      {/* Center */}
      <div className="wld-center">
        {previousImage && hasAnim && (
          <div
            key={`x-${animKey}`}
            className={`wld-hero wld-exit ${goingNext ? "wld-exit-l" : "wld-exit-r"}`}
          >
            <img src={previousImage._src || ""} alt="" draggable={false} />
          </div>
        )}
        <div
          key={`e-${animKey}`}
          className={`wld-hero ${hasAnim ? "wld-enter" : "wld-init"}`}
        >
          <img src={currentImage?._src || ""} alt="" draggable={false} />
        </div>
      </div>

      {/* Right filmstrip */}
      <div
        key={`rs-${animKey}`}
        className={`wld-strip wld-strip-r ${hasAnim ? "wld-strip-anim" : ""}`}
        style={hasAnim ? { "--dx": goingNext ? "-72px" : "72px" } : undefined}
      >
        {rightStrip.map((img, i) => (
          <div key={`r-${img.id || i}`} onClick={() => jumpTo(images.indexOf(img))} className="wld-th">
            {img._src && <img src={img._src} alt="" draggable={false} />}
          </div>
        ))}
      </div>

      {/* Nav pill */}
      <div className="wld-pill">
        <button onClick={goPrev} className="wld-btn">◀◀</button>
        <button className="wld-btn wld-btn-x">✕</button>
        <button onClick={goNext} className="wld-btn">▶▶</button>
      </div>

      <style>{`
        .wld {
          position: fixed; inset: 0;
          background: #f0f0f0;
          overflow: hidden;
          display: flex; align-items: center; justify-content: center;
        }

        /* ═══ STRIPS ═══ */
        .wld-strip {
          position: absolute; top: 50%; transform: translateY(-50%);
          display: flex; gap: 3px;
          opacity: 0.5;
          overflow: visible;
        }
        .wld-strip-l { left: 0; padding-left: 3px; }
        .wld-strip-r { right: 0; padding-right: 3px; }

        .wld-strip-anim {
          animation: sShift 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes sShift {
          from { transform: translateY(-50%) translateX(var(--dx, 0)); }
          to   { transform: translateY(-50%) translateX(0); }
        }

        .wld-th {
          width: 68px; height: 92px;
          border-radius: 8px; overflow: hidden;
          flex-shrink: 0; cursor: pointer; background: #ddd;
          transition: transform 0.18s ease;
        }
        .wld-th:hover { transform: scale(1.06); }
        .wld-th img { width: 100%; height: 100%; object-fit: cover; display: block; }

        /* ═══ CENTER ═══ */
        .wld-center {
          position: relative; z-index: 2;
          width: min(420px, 38vw);
          height: min(580px, 75vh);
        }

        .wld-hero {
          position: absolute; inset: 0;
          border-radius: 16px; overflow: hidden;
          box-shadow: 0 24px 64px rgba(0,0,0,0.16);
          will-change: opacity, transform;
        }
        .wld-hero img {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }

        /* Page load entrance */
        .wld-init {
          animation: wInit 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes wInit {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }

        /* Incoming: subtle fade-in + tiny scale settle */
        .wld-enter {
          animation: wEnter 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          z-index: 2;
        }
        @keyframes wEnter {
          0%   { opacity: 0; transform: scale(1.02); }
          100% { opacity: 1; transform: scale(1); }
        }

        /* Exiting: subtle shrink + slide toward strip + fade */
        .wld-exit {
          z-index: 3;
          pointer-events: none;
        }
        .wld-exit-l {
          animation: wExitL 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          transform-origin: left center;
        }
        .wld-exit-r {
          animation: wExitR 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          transform-origin: right center;
        }

        /* Gone next → exit shrinks left toward left strip */
        @keyframes wExitL {
          0%   { opacity: 1; transform: scale(1) translateX(0); }
          100% { opacity: 0; transform: scale(0.7) translateX(-40%); }
        }
        /* Gone prev → exit shrinks right toward right strip */
        @keyframes wExitR {
          0%   { opacity: 1; transform: scale(1) translateX(0); }
          100% { opacity: 0; transform: scale(0.7) translateX(40%); }
        }

        /* ═══ PILL ═══ */
        .wld-pill {
          position: absolute; bottom: 28px; left: 50%;
          transform: translateX(-50%);
          display: flex; align-items: center;
          background: rgba(200,200,200,0.5);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-radius: 999px; padding: 4px 5px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
          animation: wPill 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both;
          z-index: 10;
        }
        .wld-btn {
          background: none; border: none; cursor: pointer;
          font-size: 13px; font-weight: 700; color: #555;
          padding: 6px 14px;
          transition: color 0.15s ease, opacity 0.12s ease;
        }
        .wld-btn:hover { color: #222; }
        .wld-btn:active { opacity: 0.4; }
        .wld-btn-x {
          background: rgba(80,80,80,0.1);
          font-size: 12px; color: #444;
          padding: 5px 12px; border-radius: 999px;
        }
        @keyframes wPill {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </section>
  );
}