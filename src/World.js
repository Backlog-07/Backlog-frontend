import { useEffect, useMemo, useState, useCallback, useRef } from "react";

const API_BASE = (process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000')).replace(/\/$/, "");
const STRIP_VISIBLE_EACH_SIDE = 15;

function resolveImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http")) return imageUrl;

  // If it's a local upload url, prepend API_BASE
  if (imageUrl.startsWith("/uploads")) {
    return `${API_BASE}${imageUrl}`;
  }

  // Otherwise, it's an object key from Cloudflare R2
  const R2_BASE = "https://pub-ca1e1931d1d24140b20bf79db813ae8c.r2.dev";
  const clean = imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`;
  return `${R2_BASE}${clean}`;
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

  const navigate = useCallback(
    (dir) => {
      if (!count || lockRef.current) return;
      lockRef.current = true;
      setDirection(dir);
      setPrevIdx(currentIdx);
      setCurrentIdx((prev) => {
        if (dir === 1) return (prev + 1) % count;
        return (prev - 1 + count) % count;
      });
      setAnimKey((k) => k + 1);
      setTimeout(() => {
        lockRef.current = false;
      }, 360);
    },
    [count, currentIdx]
  );

  const goNext = useCallback(() => navigate(1), [navigate]);
  const goPrev = useCallback(() => navigate(-1), [navigate]);

  const jumpTo = useCallback(
    (idx) => {
      if (idx === currentIdx || lockRef.current) return;
      lockRef.current = true;
      setDirection(idx > currentIdx ? 1 : -1);
      setPrevIdx(currentIdx);
      setCurrentIdx(idx);
      setAnimKey((k) => k + 1);
      setTimeout(() => {
        lockRef.current = false;
      }, 360);
    },
    [currentIdx]
  );

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
    const onCenter = () => { };
    window.addEventListener("worldCenterClick", onCenter);
    return () => window.removeEventListener("worldCenterClick", onCenter);
  }, []);

  const currentImage = images[currentIdx];
  const previousImage = prevIdx !== null ? images[prevIdx] : null;

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

  if (loadingImages) return null;

  if (!count) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#f0f0f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#888",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        No images in World yet
      </div>
    );
  }

  const hasAnim = direction !== 0;
  const goingNext = direction === 1;

  return (
    <section className="wld">
      <div
        key={`ls-${animKey}`}
        className={`wld-strip wld-strip-l ${hasAnim ? "wld-strip-anim" : ""}`}
        style={hasAnim ? { "--dx": goingNext ? "88px" : "-88px" } : undefined}
      >
        {leftStrip.map((img, i) => (
          <div key={`l-${img.id || i}`} onClick={() => jumpTo(images.indexOf(img))} className="wld-th">
            {img._src && <img src={img._src} alt="" draggable={false} loading="lazy" decoding="async" />}
          </div>
        ))}
      </div>

      <div className="wld-center">
        {previousImage && hasAnim && (
          <div key={`x-${animKey}`} className={`wld-hero wld-exit ${goingNext ? "wld-exit-l" : "wld-exit-r"}`}>
            <img src={previousImage._src || ""} alt="" draggable={false} decoding="async" />
          </div>
        )}
        <div key={`e-${animKey}`} className={`wld-hero ${hasAnim ? "wld-enter" : "wld-init"}`}>
          <img src={currentImage?._src || ""} alt="" draggable={false} loading="eager" fetchPriority="high" decoding="async" />
        </div>
      </div>

      <div
        key={`rs-${animKey}`}
        className={`wld-strip wld-strip-r ${hasAnim ? "wld-strip-anim" : ""}`}
        style={hasAnim ? { "--dx": goingNext ? "-88px" : "88px" } : undefined}
      >
        {rightStrip.map((img, i) => (
          <div key={`r-${img.id || i}`} onClick={() => jumpTo(images.indexOf(img))} className="wld-th">
            {img._src && <img src={img._src} alt="" draggable={false} loading="lazy" decoding="async" />}
          </div>
        ))}
      </div>

      <style>{`
        .wld {
          position: fixed;
          inset: 0;
          background: #f0f0f0;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }

        .wld-strip {
          position: absolute;
          top: 44%;
          transform: translateY(-50%);
          display: flex;
          gap: 12px;
          opacity: 0.7;
          overflow: visible;
        }
        .wld-strip-l { right: calc(50% + min(150px, 13vw) + 18px); justify-content: flex-end; }
        .wld-strip-r { left: calc(50% + min(150px, 13vw) + 18px); justify-content: flex-start; }

        .wld-strip-anim {
          animation: sShift 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes sShift {
          from { transform: translateY(-50%) translateX(var(--dx, 0)); }
          to { transform: translateY(-50%) translateX(0); }
        }

        .wld-th {
          width: 76px;
          height: 104px;
          border-radius: 8px;
          overflow: hidden;
          flex-shrink: 0;
          cursor: pointer;
          background: #ddd;
          transition: transform 0.18s ease, opacity 0.18s ease;
        }
        .wld-th:hover { transform: scale(1.06); opacity: 1; }
        .wld-th img { width: 100%; height: 100%; object-fit: cover; display: block; }

        .wld-center {
          position: relative;
          z-index: 2;
          width: min(300px, 26vw);
          height: min(480px, 60vh);
          transform: translateY(-40px);
        }

        .wld-hero {
          position: absolute;
          inset: 0;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.1);
          will-change: opacity, transform;
          background: #f0f0f0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .wld-hero img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center center;
          display: block;
        }

        .wld-init {
          animation: wInit 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes wInit {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }

        .wld-enter {
          animation: wEnter 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          z-index: 2;
        }
        @keyframes wEnter {
          0% { opacity: 0; transform: scale(1.02); }
          100% { opacity: 1; transform: scale(1); }
        }

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

        @keyframes wExitL {
          0% { opacity: 1; transform: scale(1) translateX(0); }
          100% { opacity: 0; transform: scale(0.7) translateX(-40%); }
        }
        @keyframes wExitR {
          0% { opacity: 1; transform: scale(1) translateX(0); }
          100% { opacity: 0; transform: scale(0.7) translateX(40%); }
        }
      `}</style>
    </section>
  );
}
