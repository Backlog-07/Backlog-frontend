import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { fetchProducts as fetchShopifyProducts, createCart, addToCart } from "./shopifyApi";
import Scene from "./Scene";
import EnhancedJoystick from "./EnhancedJoystick";
import "./styles.css";
import CartPanel from "./CartPanel";
import cartIcon from "./whitecart.png";
import { getCarouselItemWidth } from "./carouselLayout";

const AdminPanel = lazy(() => import("./AdminPanel"));
const CheckoutPage = lazy(() => import("./checkout"));
const World = lazy(() => import("./World"));

const getItemWidth = () => getCarouselItemWidth();
const DEFAULT_PRODUCTS = [];
const SHOPIFY_CART_STORAGE_KEY = "shopify-cart";
const PRODUCTS_CACHE_KEY = "backlog-products-cache";
const PRODUCTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const readProductCache = () => {
  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > PRODUCTS_CACHE_TTL) return null;
    return data;
  } catch { return null; }
};

const writeProductCache = (data) => {
  try { localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch { }
};
const normalizeShopifyProduct = (p) => ({
  id: p.id,
  name: p.title,
  desc: p.description,
  imageUrl: p.images?.edges?.[0]?.node?.url || null,
  imageUrls: (p.images?.edges || []).map(e => e?.node?.url).filter(Boolean),
  glbUrl: p.metafield?.value || null,
  sizes: p.variants?.edges?.map((v) => v.node.title) || [],
  variants: p.variants,
  price: p.variants?.edges?.[0]?.node?.price?.amount || "0",
  stock: p.variants?.edges?.[0]?.node?.availableForSale ? 10 : 0,
  available: p.variants?.edges?.[0]?.node?.availableForSale,
});
const formatPrice = (value) => {
  if (value == null) return "₹0";
  return `₹${value}`;
};

const navigateTo = (path) => {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

const readStoredCart = () => {
  try {
    const raw = localStorage.getItem(SHOPIFY_CART_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const writeStoredCart = (cart) => {
  try {
    if (cart) {
      localStorage.setItem(SHOPIFY_CART_STORAGE_KEY, JSON.stringify(cart));
    } else {
      localStorage.removeItem(SHOPIFY_CART_STORAGE_KEY);
    }
  } catch { }
};


function SiteMenu({ activePage, menuOpen, setMenuOpen, onCartOpen, cartItemCount }) {
  return (
    <nav
      className={`expanding-menu ${menuOpen ? "open" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="menu-tabs">
        <button
          className={`menu-tab ${activePage === "shop" ? "active" : ""}`}
          onClick={() => {
            setMenuOpen(false);
            navigateTo("/");
          }}
        >
          SHOP
        </button>
        <button
          className={`menu-tab ${activePage === "world" ? "active" : ""}`}
          onClick={() => {
            setMenuOpen(false);
            navigateTo("/world");
          }}
        >
          WORLD
        </button>
        <button
          className={`menu-tab ${activePage === "about" ? "active" : ""}`}
          onClick={() => {
            setMenuOpen(false);
            navigateTo("/about");
          }}
        >
          ABOUT
        </button>
        <button
          className="menu-tab cart-tab"
          onClick={() => {
            onCartOpen();
            setMenuOpen(false);
          }}
        >
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            {cartIcon ? (
              <img
                src={cartIcon}
                alt="Cart"
                style={{ width: 22, height: 22 }}
              />
            ) : (
              "CART"
            )}
            {cartItemCount > 0 && (
              <span
                aria-label={`${cartItemCount} items in cart`}
                style={{
                  position: "absolute",
                  top: -8,
                  right: -10,
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                  borderRadius: 999,
                  background: "#ff2d55",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 800,
                  lineHeight: "18px",
                  textAlign: "center",
                  border: "2px solid rgba(0,0,0,0.75)",
                  boxSizing: "border-box",
                  pointerEvents: "none",
                }}
              >
                {cartItemCount > 99 ? "99+" : cartItemCount}
              </span>
            )}
          </span>
        </button>
      </div>
    </nav>
  );
}

function MainApp() {
  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [offset, setOffset] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [noProducts, setNoProducts] = useState(false);
  const [selectedSize, setSelectedSize] = useState(null);
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState(false);
  const [isMobileSizeLayout, setIsMobileSizeLayout] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 768px)").matches;
  });
  const [quantity, setQuantity] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [isClosingSheet, setIsClosingSheet] = useState(false);
  const [isClosingHero, setIsClosingHero] = useState(false);
  const [slideDir, setSlideDir] = useState('none');
  const [cartOpen, setCartOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState("3d"); // "2d" or "3d"
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [zoomedImage, setZoomedImage] = useState(null); // url string | null

  // Shopify cart state
  const [cart, setCart] = useState(() => readStoredCart()); // { id, lines, checkoutUrl }
  const cartItemCount = cart?.lines?.edges?.reduce((sum, edge) => sum + (edge.node.quantity || 0), 0) || 0;

  const scrollTimeoutRef = useRef(null);
  const offsetRef = useRef(0);
  const touchStartRef = useRef(0);
  const touchEndRef = useRef(0);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobileSizeLayout(mediaQuery.matches);

    update();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  useEffect(() => {
    if (isMobileSizeLayout) setSizeDropdownOpen(false);
  }, [isMobileSizeLayout]);

  const handleCloseHero = () => {
    setIsClosingHero(true);
    setTimeout(() => {
      setSelectedProduct(null);
      setSelectedMediaIndex(0);
      setSheetVisible(false);
      setIsClosingSheet(false);
      setIsClosingHero(false);
    }, 520); // Sync with smooth pop-down duration
  };

  const handleCloseSheet = () => {
    setIsClosingSheet(true);
    setTimeout(() => {
      setSheetVisible(false);
      setIsClosingSheet(false);
    }, 520); // Sync with smooth pop-down duration
  };

  const renderSizeSelector = () => {
    const sizes = selectedProduct?.sizes || [];
    const activeSize = selectedSize || sizes[0];

    if (!sizes.length) return null;

    return (
      <div style={{ position: "relative", marginBottom: 14, zIndex: 20 }}>
        <div
          onClick={() => setSizeDropdownOpen(!sizeDropdownOpen)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.08)", position: "relative", zIndex: 21 }}
        >
          <span style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#333" }}>SIZE</span>
          <span style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#111", display: "flex", alignItems: "center", gap: 6 }}>
            {activeSize}
            <span style={{ fontSize: 7, opacity: 0.5, transition: "transform 0.2s ease", transform: sizeDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
          </span>
        </div>
        {sizeDropdownOpen && (
          <div style={{ position: "absolute", bottom: "calc(100% + 8px)", right: 0, minWidth: 120, background: "rgba(255,255,255,0.98)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", padding: "4px", zIndex: 100, animation: "sizeDropIn 0.18s ease", maxHeight: 220, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setSelectedSize(s); setSizeDropdownOpen(false); }}
                style={{
                  width: "100%",
                  padding: "9px 16px",
                  fontSize: 11,
                  fontWeight: activeSize === s ? 800 : 500,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: activeSize === s ? "#111" : "#666",
                  cursor: "pointer",
                  border: "none",
                  borderRadius: 8,
                  textAlign: "left",
                  transition: "background 0.12s ease, color 0.12s ease",
                  background: activeSize === s ? "rgba(0,0,0,0.06)" : "transparent",
                }}
                onMouseEnter={(e) => { if (activeSize !== s) e.currentTarget.style.background = "rgba(0,0,0,0.03)"; }}
                onMouseLeave={(e) => { if (activeSize !== s) e.currentTarget.style.background = "transparent"; }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const getActiveIndexFromOffset = useCallback((off) => {
    if (!products.length) return 0;
    const w = getCurrentItemWidth();
    const raw = Math.round(off / w);
    return ((raw % products.length) + products.length) % products.length;
  }, [products.length]);

  // Replace offset animation with time-based damping for smoother feel
  const animRef = useRef({
    raf: 0,
    lastT: 0,
    vel: 0,
    target: 0,
    active: false,
  });

  const startInertial = useCallback(() => {
    const a = animRef.current;
    if (a.active) return;
    a.active = true;

    const tick = (t) => {
      const last = a.lastT || t;
      a.lastT = t;
      const dtMs = Math.max(8, Math.min(34, t - last));
      const dt = dtMs / 16.67;

      // integrate velocity
      if (Math.abs(a.vel) > 0) {
        const step = a.vel * dt;
        setOffset((prev) => prev + step);
        a.vel *= Math.pow(0.84, dt); // smooth damping
        if (Math.abs(a.vel) < 0.00035) a.vel = 0;
      }

      // spring to target
      if (a.target != null) {
        setOffset((prev) => {
          const diff = a.target - prev;
          if (Math.abs(diff) < 0.0012 && a.vel === 0) {
            return a.target;
          }
          return prev + diff * (1 - Math.pow(1 - 0.22, dt));
        });
      }

      a.raf = requestAnimationFrame(tick);
    };

    a.raf = requestAnimationFrame(tick);
  }, []);

  const stopInertial = useCallback(() => {
    const a = animRef.current;
    if (a.raf) cancelAnimationFrame(a.raf);
    a.raf = 0;
    a.lastT = 0;
    a.active = false;
  }, []);

  useEffect(() => {
    return () => {
      stopInertial();
    };
  }, [stopInertial]);

  useEffect(() => {
    writeStoredCart(cart);
  }, [cart]);

  // Replace with dynamic-width driven calculations (Shop page only)
  const getCurrentItemWidth = () => {
    // keep in sync with Scene.js
    return getItemWidth();
  };

  const MAX_OFFSET_JUMP_DYNAMIC = () => getCurrentItemWidth() * 1.5;

  const setSnapTarget = useCallback((rawIndex) => {
    const a = animRef.current;
    const w = getCurrentItemWidth();
    a.target = rawIndex * w;
    startInertial();
  }, [startInertial]);

  const addVelocity = useCallback((v) => {
    const a = animRef.current;
    a.vel += v;
    a.target = null; // free movement until snap
    startInertial();
  }, [startInertial]);

  const snapToNearest = useCallback(() => {
    if (products.length === 0) return;
    const currentOffset = offsetRef.current;
    const w = getCurrentItemWidth();
    const raw = Math.round(currentOffset / w);
    setSnapTarget(raw);
  }, [products.length, setSnapTarget]);

  const stepBy = useCallback((direction) => {
    if (!products.length) return;
    const currentOffset = offsetRef.current;
    const w = getCurrentItemWidth();
    const raw = Math.round(currentOffset / w);
    const nextRaw = raw + direction;
    setSnapTarget(nextRaw);
  }, [products.length, setSnapTarget]);

  const handleArrowClick = useCallback((direction) => {
    stepBy(-direction);
  }, [stepBy]);

  const handleJoystickDrag = (delta) => {
    stopInertial();
    const limit = MAX_OFFSET_JUMP_DYNAMIC();
    const safeDelta = Math.max(-limit, Math.min(limit, delta));
    setOffset((prev) => prev + safeDelta);
  };

  const handleJoystickDragEnd = () => {
    snapToNearest();
  };

  useEffect(() => {
    const handleWheel = (e) => {
      if (selectedProduct) return;
      e.preventDefault();

      // slower + smoother than before
      const dominant = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const px = dominant || 0;

      // convert wheel pixels to offset velocity
      addVelocity(px * 0.0016);

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        snapToNearest();
      }, 90);
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", handleWheel);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [selectedProduct, addVelocity, snapToNearest]);

  // No need to persist cart in localStorage; Shopify cart is persistent via API

  useEffect(() => {
    const load = async () => {
      // ⚡ Show cached products instantly while fresh data loads
      const cached = readProductCache();
      if (cached && cached.length > 0) {
        setProducts(cached);
        setNoProducts(false);
      }

      try {
        const data = await fetchShopifyProducts();
        const normalized = (Array.isArray(data) ? data : []).map(normalizeShopifyProduct);
        if (normalized.length > 0) {
          setProducts(normalized);
          writeProductCache(normalized);
          setNoProducts(false);
        } else {
          if (!cached?.length) setNoProducts(true);
        }
      } catch (e) {
        if (!cached?.length) setNoProducts(true);
      }
    };
    load();
  }, []);



  useEffect(() => {
    const handleKeyDown = (e) => {
      if (selectedProduct) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        handleArrowClick(1);
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        handleArrowClick(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedProduct, handleArrowClick]);

  useEffect(() => {
    if (!sheetVisible) return;
    const handleEsc = (e) => {
      if (e.key === "Escape") closeBottomSheet();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [sheetVisible]);

  useEffect(() => {
    const prev = typeof document !== 'undefined' ? document.body.style.overflow : '';
    if (sheetVisible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = prev || '';
    }
    return () => {
      try {
        document.body.style.overflow = prev || '';
      } catch (e) { }
    };
  }, [sheetVisible]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      const menuContainer = document.querySelector(".nav-menu");
      const expandingMenu = document.querySelector(".expanding-menu");
      if (menuContainer && expandingMenu) {
        if (
          !menuContainer.contains(e.target) &&
          !expandingMenu.contains(e.target)
        ) {
          setMenuOpen(false);
        }
      }
    };

    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("click", handleClickOutside);
  }, [menuOpen]);

  const openProductView = (product) => {
    const base = {
      ...product,
      stock: Number(product.stock) || 0,
      available: (Number(product.stock) || 0) > 0,
    };
    setSelectedProduct(base);
    setSelectedSize(base.sizes?.[0] ?? null);
    setSelectedMediaIndex(0);
    setSheetTab(base.glbUrl ? "3d" : "2d");
    setSheetVisible(false);
    setQuantity(1);
  };

  const handleCenterButtonClick = () => {
    if (!products.length) return;
    // Derive active product at click-time to avoid using a stale activeIndex.
    const idx = getActiveIndexFromOffset(offsetRef.current);
    const activeProduct = products[idx];
    if (activeProduct) openProductView(activeProduct);
  };

  const closeBottomSheet = () => {
    setSheetVisible(false);
    setTimeout(() => {
      setSelectedProduct(null);
      setSelectedSize(null);
      setQuantity(1);
    }, 300);
  };

  const handleAddToCart = async () => {
    if (!selectedProduct) return;
    // Find the selected variant (Shopify requires variant ID)
    const variant = products
      .find(p => p.id === selectedProduct.id)
      ?.variants?.edges?.find(v => v.node.title === selectedSize)?.node;
    if (!variant) {
      alert("Variant not found for selected size");
      return;
    }
    try {
      let newCart = cart;
      if (!cart) {
        // Create a new cart
        newCart = await createCart([
          { merchandiseId: variant.id, quantity: Number(quantity) || 1 }
        ]);
      } else {
        // Add to existing cart
        newCart = await addToCart(cart.id, [
          { merchandiseId: variant.id, quantity: Number(quantity) || 1 }
        ]);
      }
      setCart(newCart);
      closeBottomSheet();
      setCartOpen(true);
    } catch (err) {
      alert("Error adding to cart");
    }
  };


  return (
    <div className="app" style={{ position: "relative" }}>
      {noProducts && !selectedProduct && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "#111",
            opacity: 0.8,
          }}
        >
          <div style={{ textAlign: "center", padding: 20 }}>
            <div>No products right now</div>


          </div>
        </div>
      )}


      {/* Header */}
      {!selectedProduct && (
        <header className="header">
          <div className="logo">Backlog</div>
          <div className="nav">
            <span className="nav-text">
              {products[getActiveIndexFromOffset(offsetRef.current)]?.name || ""}
            </span>
          </div>
        </header>
      )}

      {/* Expanding Menu */}
      {!selectedProduct && (
        <SiteMenu
          activePage="shop"
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          onCartOpen={() => setCartOpen(true)}
          cartItemCount={cartItemCount}
        />
      )}

      <CartPanel
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        setCart={setCart}
        setProducts={setProducts}
      />

      {/* 3D Scene - Glued to the same animation track as the UI! */}
      <div
        className={selectedProduct ? (isClosingHero ? 'damso-pop-down' : 'damso-pop-up') : ''}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 5,
          pointerEvents: sheetVisible ? 'none' : 'auto',
          opacity: selectedProduct
            ? (selectedProduct.glbUrl && selectedMediaIndex === 0 ? 1 : 0)
            : 1,
          transition: 'opacity 0.25s'
        }}>
        <Scene
          offset={selectedProduct ? 0 : offset}
          products={selectedProduct ? [selectedProduct] : products}
          onSelect={openProductView}
          forceCentered={!!selectedProduct}
          isPreview={!!selectedProduct}
          interactive={!!selectedProduct?.glbUrl && sheetTab === "3d"}
        />
      </div>

      {/* Enhanced Joystick */}
      {!selectedProduct && (
        <EnhancedJoystick
          onDrag={handleJoystickDrag}
          onDragEnd={handleJoystickDragEnd}
          onArrowClick={handleArrowClick}
          onCenterClick={handleCenterButtonClick}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
        />
      )}

      {/* Background Modal Box Layer (z-index 1) — renders glass behind the unblurred 3D canvas! */}
      {selectedProduct && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          padding: isMobileSizeLayout ? '10px 20px 12px' : '20px',
          transform: isMobileSizeLayout ? 'translateY(-48px)' : 'none',
        }}>
          <div className={`damso-modal ${isClosingHero ? 'damso-pop-down' : 'damso-pop-up'}`} style={{ pointerEvents: 'none', display: (sheetVisible && !isClosingSheet) ? 'none' : 'flex' }} />
        </div>
      )}

      {/* Full Area Background Tint/Dim when Modal is open */}
      {selectedProduct && (sheetVisible || isClosingSheet) && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 8,
          pointerEvents: 'auto',
          backgroundColor: 'rgba(0, 0, 0, 0.2)', // Slight dim for the modal
          animation: (isClosingHero || isClosingSheet) ? 'fadeOut 0.4s ease forwards' : 'fadeIn 0.6s ease'
        }} onClick={handleCloseSheet} />
      )}

      {/* Product Hero Layer (z-index 10) */}
      {selectedProduct && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10, pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          padding: isMobileSizeLayout ? '10px 20px 12px' : '20px',
          transform: isMobileSizeLayout ? 'translateY(-48px)' : 'none',
        }}>

          <div className={`damso-modal ${isClosingHero ? 'damso-pop-down' : 'damso-pop-up'}`} style={{
            pointerEvents: 'none', // The modal itself passes clicks to 3D Canvas, unless sheetVisible
            background: 'transparent',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            boxShadow: 'none',
            transition: 'background 0.4s ease, backdrop-filter 0.4s ease, box-shadow 0.4s ease',
            ...((sheetVisible && !isClosingSheet) ? {
              pointerEvents: 'auto',
              background: 'rgba(180, 180, 180, 0.55)',
              backdropFilter: 'blur(30px)',
              WebkitBackdropFilter: 'blur(30px)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
            } : {})
          }}>

            <div key={selectedProduct.id} className={`slide-content-${slideDir}`} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              {(!sheetVisible || isClosingSheet) ? (
                <>
                  {/* Minimal Closed State - Just Title and MORE INFO */}
                  <div style={{ padding: '30px', pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#111' }}>{selectedProduct.name}</span>
                      <span style={{ background: '#e0e0e0', color: '#666', fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 4, letterSpacing: 0.5 }}>MERCH</span>
                    </div>
                    <button className="more-info-btn" style={{ position: 'relative', top: 0, left: 0, alignSelf: 'flex-start' }} onClick={() => setSheetVisible(true)}>
                      MORE INFORMATIONS +
                    </button>
                  </div>

                  {/* ─── MEDIA CAROUSEL ─── slide 0 = 3D (transparent), 1+ = Shopify images */}
                  {(() => {
                    const imgs = selectedProduct.imageUrls || (selectedProduct.imageUrl ? [selectedProduct.imageUrl] : []);
                    const has3d = !!selectedProduct.glbUrl;
                    // total slides: 3D slide (if model exists) + image slides
                    const slides = has3d ? ['3d', ...imgs] : imgs;
                    const totalSlides = slides.length;
                    const isImgSlide = slides[selectedMediaIndex] !== '3d';
                    const imgUrl = isImgSlide ? slides[selectedMediaIndex] : null;

                    return (
                      <div
                        onTouchStart={e => { touchStartRef.current = e.targetTouches[0].clientX; }}
                        onTouchMove={e => { touchEndRef.current = e.targetTouches[0].clientX; }}
                        onTouchEnd={() => {
                          if (!touchStartRef.current || !touchEndRef.current) return;
                          const distance = touchStartRef.current - touchEndRef.current;
                          if (distance > 50) {
                            const next = (selectedMediaIndex + 1) % totalSlides;
                            setSelectedMediaIndex(next);
                            setSheetTab(next === 0 && has3d ? '3d' : '2d');
                          } else if (distance < -50) {
                            const prev = (selectedMediaIndex - 1 + totalSlides) % totalSlides;
                            setSelectedMediaIndex(prev);
                            setSheetTab(prev === 0 && has3d ? '3d' : '2d');
                          }
                          touchStartRef.current = 0;
                          touchEndRef.current = 0;
                        }}
                        style={{
                          flex: 1, position: 'relative',
                          zIndex: 1,
                          pointerEvents: totalSlides > 1 ? 'auto' : 'none',
                          overflow: 'hidden',
                          background: isImgSlide ? 'rgba(220,220,220,0.98)' : 'transparent',
                          transition: 'background 0.2s ease',
                          borderRadius: '0 0 6px 6px',
                          paddingBottom: isMobileSizeLayout ? 36 : 0,
                        }}>
                        {/* Image overlay – covers the 3D canvas when on a photo slide */}
                        {isImgSlide && imgUrl && (
                          <div style={{
                            position: 'absolute', inset: 0, zIndex: 2,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent',
                            animation: 'fadeIn 0.22s ease',
                          }}>
                            <img
                              src={imgUrl}
                              alt={selectedProduct.name}
                              onClick={() => setZoomedImage(imgUrl)}
                              style={{
                                maxWidth: '88%',
                                maxHeight: '88%',
                                objectFit: 'contain',
                                borderRadius: 8,
                                boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                                userSelect: 'none',
                                pointerEvents: 'auto',
                                cursor: 'pointer',
                              }}
                            />
                          </div>
                        )}

                        {/* Transparent fill so 3D canvas is visible on slide 0 */}
                        {!isImgSlide && <div style={{ position: 'absolute', inset: 0, zIndex: 1 }} />}

                        {/* Left / Right arrow buttons */}
                        {totalSlides > 1 && (
                          <>
                            <button
                              onClick={() => {
                                const prev = (selectedMediaIndex - 1 + totalSlides) % totalSlides;
                                setSelectedMediaIndex(prev);
                                setSheetTab(prev === 0 && has3d ? '3d' : '2d');
                              }}
                              style={{
                                position: 'absolute', left: isMobileSizeLayout ? 8 : 10, top: isMobileSizeLayout ? '50%' : '50%', transform: 'translateY(-50%)',
                                zIndex: 4, background: 'rgba(255,255,255,0.9)', border: 'none',
                                borderRadius: '50%', width: isMobileSizeLayout ? 36 : 32, height: isMobileSizeLayout ? 36 : 32, display: 'flex',
                                alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
                                transition: 'background 0.15s ease', color: '#111',
                                WebkitAppearance: 'none', appearance: 'none',
                                WebkitTapHighlightColor: 'transparent',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,1)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.85)'}
                              aria-label="Previous"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '-1px' }}><polyline points="15 18 9 12 15 6"></polyline></svg>
                            </button>
                            <button
                              onClick={() => {
                                const next = (selectedMediaIndex + 1) % totalSlides;
                                setSelectedMediaIndex(next);
                                setSheetTab(next === 0 && has3d ? '3d' : '2d');
                              }}
                              style={{
                                position: 'absolute', right: isMobileSizeLayout ? 8 : 10, top: isMobileSizeLayout ? '50%' : '50%', transform: 'translateY(-50%)',
                                zIndex: 4, background: 'rgba(255,255,255,0.9)', border: 'none',
                                borderRadius: '50%', width: isMobileSizeLayout ? 36 : 32, height: isMobileSizeLayout ? 36 : 32, display: 'flex',
                                alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
                                transition: 'background 0.15s ease', color: '#111',
                                WebkitAppearance: 'none', appearance: 'none',
                                WebkitTapHighlightColor: 'transparent',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,1)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.85)'}
                              aria-label="Next"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '-1px' }}><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                          </>
                        )}


                      </div>
                    );
                  })()}

                  {/* Size + Add to Cart Area */}
                  <div style={{ marginTop: 'auto', padding: '0 30px 55px 30px', pointerEvents: 'auto', animationDelay: isClosingHero ? '0s' : '0.1s', position: 'relative', zIndex: 30 }} className={isClosingHero ? 'damso-pop-down' : 'damso-pop-up'}>
                    {renderSizeSelector()}
                    <button className="hero-add-btn" onClick={() => {
                      if (selectedProduct.sizes?.length > 0 && !selectedSize) {
                        setSelectedSize(selectedProduct.sizes[0]);
                      }
                      setTimeout(() => handleAddToCart(), 0);
                    }}>
                      Add to cart - {formatPrice(selectedProduct.price)}
                    </button>
                  </div>
                </>
              ) : null}

              {(sheetVisible && !isClosingSheet) ? (
                <>
                  <div className={`hero-details-content ${isClosingSheet ? 'animate-slide-down' : (slideDir === 'none' ? 'animate-slide-up' : '')}`} style={{ pointerEvents: 'auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 15, position: 'absolute', top: 30, left: 30 }}>
                      <span style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#111' }}>{selectedProduct.name}</span>
                      <span style={{ background: '#e0e0e0', color: '#666', fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 4, letterSpacing: 0.5 }}>MERCH</span>
                    </div>

                    <button onClick={handleCloseSheet} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#111', padding: 0, lineHeight: 1, position: 'absolute', top: 30, right: 30 }}>
                      —
                    </button>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px 30px' }}>
                      <div className="sheet-desc" style={{ textAlign: 'left', color: '#ffffff', fontWeight: 500, fontSize: 14 }}>
                        {selectedProduct.desc ? (
                          selectedProduct.desc.split('\n').map((line, i) => (
                            <div key={i} style={{ marginBottom: 6, fontSize: 15, color: '#111', letterSpacing: 0.2 }}>{line}</div>
                          ))
                        ) : (
                          <div style={{ fontSize: 14, color: '#444' }}>No description available.</div>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: 'auto', padding: '0 30px 40px 30px', position: 'relative', zIndex: 30 }}>
                      {renderSizeSelector()}
                      <button className="hero-add-btn" style={{ pointerEvents: 'auto' }} onClick={() => {
                        if (selectedProduct.sizes?.length > 0 && !selectedSize) {
                          setSelectedSize(selectedProduct.sizes[0]);
                        }
                        setTimeout(() => handleAddToCart(), 0);
                      }}>
                        Add to cart - {formatPrice(selectedProduct.price)}
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Damso Pill Controller Wrapper - Anchored cleanly OUTSIDE and BELOW the modal */}
            <div style={{ position: 'absolute', top: isMobileSizeLayout ? 'calc(100% + 14px)' : 'calc(100% + 16px)', left: 0, width: '100%', display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 1000 }}>
              <div className={`damso-pill-controller ${isClosingHero ? 'damso-pop-down' : 'damso-pop-up'}`} style={{ pointerEvents: 'auto', animationDelay: isClosingHero ? '0s' : '0.2s' }}>
                <button className="pill-btn" onClick={() => {
                  setSlideDir('prev');
                  const w = getCurrentItemWidth();
                  const raw = Math.round(offsetRef.current / w);
                  setSnapTarget(raw - 1);
                  const newIdx = (((raw - 1) % products.length) + products.length) % products.length;
                  if (products[newIdx]) openProductView(products[newIdx]);
                }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <polygon points="11,19 2,12 11,5" />
                    <polygon points="22,19 13,12 22,5" />
                  </svg>
                </button>

                <button className="pill-btn pill-close-btn" onClick={handleCloseHero}>✕</button>

                <button className="pill-btn" onClick={() => {
                  setSlideDir('next');
                  const w = getCurrentItemWidth();
                  const raw = Math.round(offsetRef.current / w);
                  setSnapTarget(raw + 1);
                  const newIdx = (((raw + 1) % products.length) + products.length) % products.length;
                  if (products[newIdx]) openProductView(products[newIdx]);
                }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <polygon points="13,19 22,12 13,5" />
                    <polygon points="2,19 11,12 2,5" />
                  </svg>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ─── FULLSCREEN IMAGE LIGHTBOX ─── */}
      {zoomedImage && (() => {
        // Close on ESC key
        const handleKey = (e) => { if (e.key === 'Escape') setZoomedImage(null); };
        return (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0,0,0,0.92)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'fadeIn 0.18s ease',
              cursor: 'zoom-out',
            }}
            onClick={() => setZoomedImage(null)}
            onKeyDown={handleKey}
            tabIndex={0}
            ref={el => el && el.focus()}
          >
            {/* Close button */}
            <button
              onClick={e => { e.stopPropagation(); setZoomedImage(null); }}
              style={{
                position: 'absolute', top: 20, right: 20,
                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff', borderRadius: '50%',
                width: 44, height: 44,
                fontSize: 20, lineHeight: '1', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 10000,
                transition: 'background 0.15s',
                backdropFilter: 'blur(8px)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
              aria-label="Close image"
            >✕</button>

            {/* The full-size image — stop click so overlay close still works */}
            <img
              src={zoomedImage}
              alt="Product"
              onClick={e => e.stopPropagation()}
              style={{
                maxWidth: '92vw',
                maxHeight: '92vh',
                objectFit: 'contain',
                borderRadius: 6,
                boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
                cursor: 'default',
                animation: 'zoomIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
              }}
            />
          </div>
        );
      })()}

    </div>
  );
}

export default function App() {
  // Simple URL-based routing without React Router
  const [currentPage, setCurrentPage] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPage(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Handle navigation
  useEffect(() => {
    const handleNavigation = (e) => {
      if (e.target.tagName === "A" && e.target.href.includes(window.location.origin)) {
        e.preventDefault();
        const path = e.target.href.replace(window.location.origin, "");
        window.history.pushState({}, "", path);
        setCurrentPage(path);
      }
    };

    document.addEventListener("click", handleNavigation);
    return () => document.removeEventListener("click", handleNavigation);
  }, []);

  return (
    <Suspense>
      {currentPage === "/checkout" ? (
        <CheckoutPage />
      ) : currentPage === "/admin" ? (
        <AdminPanel />
      ) : currentPage === "/world" ? (
        <WorldApp />
      ) : currentPage === "/about" ? (
        <AboutApp />
      ) : (
        <MainApp />
      )}
    </Suspense>
  );
}

function WorldApp() {
  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [offset, setOffset] = useState(0); // used for UI/label and selection logic
  // activeIndex not needed now that the bottom sheet is removed
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);


  const [cart, setCart] = useState(() => readStoredCart());
  const cartItemCount = cart?.lines?.edges?.reduce((sum, edge) => sum + (edge.node.quantity || 0), 0) || 0;

  const snapAnimRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const isAnimatingRef = useRef(false);
  const offsetRef = useRef(0);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const animateToOffset = useCallback((target) => {
    if (snapAnimRef.current) {
      cancelAnimationFrame(snapAnimRef.current);
      snapAnimRef.current = null;
    }
    isAnimatingRef.current = true;

    const startOffset = offsetRef.current;
    const delta = target - startOffset;
    const duration = 320;
    const startedAt = performance.now();

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const tick = (now) => {
      const elapsed = Math.min(duration, now - startedAt);
      const t = elapsed / duration;
      const eased = easeOutCubic(t);
      const next = startOffset + delta * eased;
      setOffset(next);

      if (elapsed < duration) {
        snapAnimRef.current = requestAnimationFrame(tick);
      } else {
        snapAnimRef.current = null;
        isAnimatingRef.current = false;
        setOffset(target);
      }
    };

    snapAnimRef.current = requestAnimationFrame(tick);
  }, []);

  const snapToNearest = useCallback(() => {
    if (products.length === 0) return;
    const currentOffset = offsetRef.current;
    const w = getCarouselItemWidth();
    const currentRawIndex = Math.round(-currentOffset / w);
    const targetOffset = -currentRawIndex * w;
    animateToOffset(targetOffset);
  }, [products.length, animateToOffset]);

  const animateByDelta = useCallback((delta) => {
    const maxJump = getCarouselItemWidth() * 1.5;
    const safeDelta = Math.max(-maxJump, Math.min(maxJump, delta));
    setOffset((prev) => {
      const target = prev + safeDelta;
      animateToOffset(target);
      return prev;
    });
  }, [animateToOffset]);

  const stepBy = useCallback((direction) => {
    if (!products.length) return;
    if (snapAnimRef.current) {
      cancelAnimationFrame(snapAnimRef.current);
      snapAnimRef.current = null;
    }
    isAnimatingRef.current = false;

    const currentOffset = offsetRef.current;
    const w = getCarouselItemWidth();
    const currentRawIndex = Math.round(-currentOffset / w);
    const nextRawIndex = currentRawIndex + direction;
    const targetOffset = -nextRawIndex * w;
    animateToOffset(targetOffset);
  }, [products.length, animateToOffset]);

  const handleArrowClick = useCallback((direction) => {
    // When on world page, also nudge the cinematic carousel (DOM-based)
    const worldDirection = direction === 1 ? -1 : 1;
    try {
      window.dispatchEvent(
        new CustomEvent('worldCarouselStep', { detail: { dir: worldDirection } })
      );
    } catch { }

    stepBy(direction);
  }, [stepBy]);

  // (activeIndex tracking removed)

  useEffect(() => {
    writeStoredCart(cart);
  }, [cart]);




  const handleJoystickDrag = (delta) => {
    if (snapAnimRef.current) {
      cancelAnimationFrame(snapAnimRef.current);
      snapAnimRef.current = null;
    }
    isAnimatingRef.current = false;
    const maxJump = getCarouselItemWidth() * 1.5;
    const safeDelta = Math.max(-maxJump, Math.min(maxJump, delta));
    setOffset((prev) => prev + safeDelta);
  };

  const handleJoystickDragEnd = () => {
    snapToNearest();
  };

  useEffect(() => {
    const handleWheel = (e) => {
      e.preventDefault();

      if (isAnimatingRef.current) return;

      if (Math.abs(e.deltaY) > 10) {
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

        scrollTimeoutRef.current = setTimeout(() => {
          const direction = e.deltaY > 0 ? 1 : -1;
          animateByDelta(-direction * getCarouselItemWidth());
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = setTimeout(() => {
            snapToNearest();
          }, 120);
        }, 40);
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", handleWheel);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [animateByDelta, snapToNearest]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        handleArrowClick(1);
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        handleArrowClick(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleArrowClick]);

  const openBottomSheet = async (_product) => {
    // bottom sheet removed on World page
    return;
  };

  const handleCenterButtonClick = () => {
    try {
      window.dispatchEvent(new CustomEvent('worldCenterClick'));
    } catch { }
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="logo">Backlog</div>
        <div className="nav">
          <span className="nav-text">
            {/* World page: keep header clean (no shifting product name) */}
            {""}
          </span>
        </div>
      </header>

      {/* Expanding Menu — wrapped in a separate div so inline opacity never fights the CSS animation */}
      <div style={{ opacity: 1, pointerEvents: "auto", transition: "opacity 0.3s ease" }}>
        <SiteMenu
          activePage="world"
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          onCartOpen={() => setCartOpen(true)}
          cartItemCount={cartItemCount}
        />
      </div>

      <CartPanel
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        setCart={setCart}
        setProducts={setProducts}
      />

      {/* 3D World Scene */}
      <World offset={offset} products={products} onSelect={openBottomSheet} />

      {/* Enhanced Joystick */}
      <div style={{ opacity: 1, pointerEvents: 'auto', transition: 'opacity 0.3s ease' }}>
        <EnhancedJoystick
          onDrag={handleJoystickDrag}
          onDragEnd={handleJoystickDragEnd}
          onArrowClick={handleArrowClick}
          onCenterClick={handleCenterButtonClick}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
        />
      </div>

      {/* World page bottom sheet removed */}
    </div>
  );
}

function AboutApp() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState(() => readStoredCart());
  const cartItemCount = cart?.lines?.edges?.reduce((sum, edge) => sum + (edge.node.quantity || 0), 0) || 0;

  useEffect(() => {
    writeStoredCart(cart);
  }, [cart]);

  const handleAboutArrowClick = useCallback((direction) => {
    if (direction === 1) {
      navigateTo("/");
      return;
    }
    navigateTo("/world");
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        handleAboutArrowClick(1);
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        handleAboutArrowClick(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleAboutArrowClick]);

  return (
    <div className="app about-page">
      <header className="header">
        <div className="logo">Backlog</div>
        <div className="nav">
          <span className="nav-text">Brand manifesto</span>
        </div>
      </header>

      <SiteMenu
        activePage="about"
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        onCartOpen={() => setCartOpen(true)}
        cartItemCount={cartItemCount}
      />

      <CartPanel
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        setCart={setCart}
      />

      <main className="about-shell">
        <section className="about-board">
          <div className="about-map-center">
            <div className="about-map-square">
              <iframe
                title="Backlog company location"
                src="https://www.openstreetmap.org/export/embed.html?bbox=77.5795%2C12.9645%2C77.6075%2C12.9815&layer=mapnik&marker=12.9730%2C77.5938"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <div className="about-map-pin" aria-hidden="true" />
            </div>
          </div>

          <div className="about-copy-row">
            <div className="about-contact-block">
              <div className="about-contact-grid">
                <p className="about-contact-item">TIET Patiala</p>
                <p className="about-contact-item">Nabha Road, Patiala</p>
                <p className="about-contact-item">+91 90564 68217</p>
                <p className="about-contact-item">customercare@backlogstore.in</p>
                <p className="about-contact-item">Mon - Sat</p>
                <p className="about-contact-item">10:00 AM - 7:00 PM</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <EnhancedJoystick
        onArrowClick={handleAboutArrowClick}
        onCenterClick={() => setMenuOpen((v) => !v)}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />
    </div>
  );
}
