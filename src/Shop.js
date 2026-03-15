import React, { useEffect, useState } from "react";
import ProductDetail from "./ProductDetail";

const API_BASE = "http://localhost:4000";

function isProbablyPng(url = "") {
  return String(url).toLowerCase().includes(".png");
}

async function trimTransparentPadding(imageSrc, { alphaThreshold = 8, debug = false } = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve({ src: imageSrc, meta: { ok: false, reason: "no_ctx", w, h } });

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);

        let imgData;
        try {
          imgData = ctx.getImageData(0, 0, w, h);
        } catch (e) {
          // Most common failure: CORS tainted canvas
          return resolve({
            src: imageSrc,
            meta: { ok: false, reason: "tainted_canvas", w, h, error: String(e?.message || e) },
          });
        }

        const { data } = imgData;

        let minX = w,
          minY = h,
          maxX = -1,
          maxY = -1;

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const a = data[i + 3];
            if (a > alphaThreshold) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }

        // Fully transparent -> return original
        if (maxX < 0 || maxY < 0) {
          return resolve({ src: imageSrc, meta: { ok: false, reason: "fully_transparent", w, h } });
        }

        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;

        const out = document.createElement("canvas");
        out.width = cropW;
        out.height = cropH;
        const outCtx = out.getContext("2d");
        if (!outCtx) {
          return resolve({
            src: imageSrc,
            meta: { ok: false, reason: "no_out_ctx", w, h, minX, minY, maxX, maxY, cropW, cropH },
          });
        }

        outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
        const dataUrl = out.toDataURL("image/png");

        return resolve({
          src: dataUrl,
          meta: { ok: true, w, h, minX, minY, maxX, maxY, cropW, cropH },
        });
      } catch (e) {
        return resolve({ src: imageSrc, meta: { ok: false, reason: "exception", error: String(e?.message || e) } });
      }
    };
    img.onerror = () => resolve({ src: imageSrc, meta: { ok: false, reason: "img_error" } });
    img.src = imageSrc;
  });
}

const Shop = () => {
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

  const [trimmedThumbs, setTrimmedThumbs] = useState({});
  const [trimDebug, setTrimDebug] = useState({});

  const selectedProduct =
    products.find((p) => String(p.id) === String(selectedProductId)) || null;

  useEffect(() => {
    console.log("[SHOP] mounted");
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/products`)
      .then((response) => response.json())
      .then((data) => {
        console.log("[SHOP] fetched products:", data);
        setProducts(data);
      })
      .catch((error) => console.error("[SHOP] Error fetching products:", error));
  }, []);

  // Build trimmed thumbnails for PNGs (removes transparent padding)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      console.log("[TRIM DEBUG] starting trim for", (products || []).length, "products");

      const entries = await Promise.all(
        (products || []).map(async (p) => {
          const src = `${API_BASE}${p.imageUrl}`;
          if (!isProbablyPng(p.imageUrl)) {
            return [p.id, src, { ok: false, reason: "not_png" }];
          }

          const result = await trimTransparentPadding(src, { alphaThreshold: 8 });
          return [p.id, result.src, result.meta];
        })
      );

      if (cancelled) return;
      const next = {};
      const dbg = {};
      for (const [id, src, meta] of entries) {
        next[id] = src;
        dbg[id] = meta;
      }
      setTrimmedThumbs(next);
      setTrimDebug(dbg);

      // Log a compact summary once per run
      try {
        console.table(
          (products || []).map((p) => {
            const m = dbg[p.id] || {};
            return {
              id: p.id,
              imageUrl: p.imageUrl,
              ok: !!m.ok,
              reason: m.reason,
              src: m.w && m.h ? `${m.w}x${m.h}` : "",
              crop: m.cropW && m.cropH ? `${m.cropW}x${m.cropH}` : "",
            };
          })
        );
      } catch {}

      // Console debug for the provided sample file (match by substring)
      const sampleNeedle = "1773412970975-BACKLOG-(1).png";
      const sample = (products || []).find((p) => String(p.imageUrl || "").includes(sampleNeedle));
      if (sample) {
        console.log("[TRIM DEBUG] sample", sample.imageUrl, dbg[sample.id]);
      } else {
        console.warn("[TRIM DEBUG] sample not found in products. Looking for", sampleNeedle);
      }
    };

    if (products?.length) run();
    return () => {
      cancelled = true;
    };
  }, [products]);

  const handleProductClick = (product) => {
    if (!product) return;
    setSelectedProductId(product.id);
    setIsBottomSheetOpen(true);
  };

  const handleCloseBottomSheet = () => {
    setIsBottomSheetOpen(false);
    // Clear after close animation so it cannot flash stale content
    setTimeout(() => setSelectedProductId(null), 300);
  };

  return (
    <div className="shop">
      {products.map((product) => {
        const thumbSrc =
          trimmedThumbs[product.id] || `${API_BASE}${product.imageUrl}`;
        const debug = trimDebug[product.id];

        return (
          <div
            key={product.id}
            className="product"
            onClick={() => handleProductClick(product)}
            style={{ cursor: "pointer" }}
          >
            <div
              className="shop-thumb"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 720,
                height: 420,
                overflow: "hidden",
                borderRadius: 12,
                background: "rgba(255, 0, 0, 0.08)",
                outline: "2px solid rgba(255,0,0,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 10,
                position: "relative",
              }}
            >
              <img
                src={thumbSrc}
                alt={product.name}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                  background: "transparent",
                  display: "block",
                }}
                onError={(e) => {
                  console.error("Image load error:", product.imageUrl);
                  e.target.src = "/placeholder.png";
                }}
              />

              {/* Debug badge (temporary) */}
              {isProbablyPng(product.imageUrl) && debug && (
                <div
                  style={{
                    position: "absolute",
                    left: 8,
                    bottom: 8,
                    background: debug.ok ? "rgba(0,0,0,0.65)" : "rgba(176,0,32,0.75)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "6px 8px",
                    borderRadius: 10,
                    maxWidth: "calc(100% - 16px)",
                    lineHeight: 1.2,
                  }}
                >
                  <div>trim: {debug.ok ? "ok" : "fail"}</div>
                  {debug.w && debug.h ? (
                    <div>
                      src: {debug.w}×{debug.h}
                      {debug.ok && debug.cropW && debug.cropH
                        ? ` → crop ${debug.cropW}×${debug.cropH}`
                        : ""}
                    </div>
                  ) : null}
                  {!debug.ok && debug.reason ? <div>reason: {debug.reason}</div> : null}
                </div>
              )}
            </div>
            <h2 onClick={(e) => e.stopPropagation()}>{product.name}</h2>
            <p onClick={(e) => e.stopPropagation()}>{product.description}</p>
            <p onClick={(e) => e.stopPropagation()}>${product.price}</p>
          </div>
        );
      })}

      {/* Bottom Sheet with Product Detail */}
      {selectedProduct && (
        <ProductDetail
          key={selectedProductId}
          product={selectedProduct}
          isOpen={isBottomSheetOpen}
          onClose={handleCloseBottomSheet}
        />
      )}
    </div>
  );
};

export default Shop;