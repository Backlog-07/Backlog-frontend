import { useState, useEffect, useRef, useCallback } from "react";
import { fetchProducts as fetchShopifyProducts, createCart, addToCart } from "./shopifyApi";
import Scene from "./Scene";
import EnhancedJoystick from "./EnhancedJoystick";
import "./styles.css";
import AdminPanel from "./AdminPanel";
import CartPanel from "./CartPanel";
import CheckoutPage from "./checkout";
import World from "./World";
import cartIcon from "./whitecart.png";
import { getCarouselItemWidth } from "./carouselLayout";

const API_BASE = (process.env.REACT_APP_API_URL || "http://localhost:4000").replace(/\/$/, "");
const getItemWidth = () => getCarouselItemWidth();
const DEFAULT_PRODUCTS = [];
const formatPrice = (value) => {
  if (value == null) return "₹0";
  return `₹${value}`;
};

function MainApp() {
  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [offset, setOffset] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [noProducts, setNoProducts] = useState(false);
  const [shopifyError, setShopifyError] = useState("");
  const [selectedSize, setSelectedSize] = useState(null);
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [isClosingSheet, setIsClosingSheet] = useState(false);
  const [isClosingHero, setIsClosingHero] = useState(false);
  const [slideDir, setSlideDir] = useState('none');
  const [cartOpen, setCartOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState("3d"); // "2d" or "3d"

  // Shopify cart state
  const [cart, setCart] = useState(null); // { id, lines, checkoutUrl }
  const cartItemCount = cart?.lines?.edges?.reduce((sum, edge) => sum + (edge.node.quantity || 0), 0) || 0;

  const scrollTimeoutRef = useRef(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const handleCloseHero = () => {
    setIsClosingHero(true);
    setTimeout(() => {
       setSelectedProduct(null);
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
      try {
        const data = await fetchShopifyProducts();
        const normalized = (Array.isArray(data) ? data : []).map((p) => ({
          id: p.id,
          name: p.title,
          desc: p.description,
          imageUrl: p.images?.edges?.[0]?.node?.url || null,
          glbUrl: p.metafield?.value || null,
          sizes: p.variants?.edges?.map((v) => v.node.title) || [],
          variants: p.variants, // preserve raw variants for cart
          price: p.variants?.edges?.[0]?.node?.price?.amount || "0",
          stock: p.variants?.edges?.[0]?.node?.availableForSale ? 10 : 0,
          available: p.variants?.edges?.[0]?.node?.availableForSale,
        }));

        setProducts(normalized);
        setNoProducts(normalized.length === 0);
        setShopifyError("");
      } catch (e) {
        setProducts(DEFAULT_PRODUCTS);
        setNoProducts(true);
        setShopifyError(String(e?.message || e || "Failed to fetch from Shopify"));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // (Optional) You can add polling or subscription logic for live updates if needed

  useEffect(() => {
    if (typeof window === "undefined" || !window.EventSource) return;
    let es;
    try {
      es = new EventSource(`${API_BASE}/api/products/stream`);
      es.addEventListener("products", (evt) => {
        try {
          const payload = JSON.parse(evt.data || "[]");
          const normalized = (Array.isArray(payload) ? payload : []).map(
            (p) => ({
              ...p,
              stock: Number(p.stock) || 0,
              available: (Number(p.stock) || 0) > 0,
            })
          );
          setProducts(normalized);
        } catch (err) {}
      });
    } catch (e) {}
    return () => {
      try {
        if (es) es.close();
      } catch (e) {}
    };
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
      } catch (e) {}
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

  const openProductView = async (product) => {
    // instantly show product details while network updates load in background
    const base = {
      ...product,
      stock: Number(product.stock) || 0,
      available: (Number(product.stock) || 0) > 0,
    };
    setSelectedProduct(base);
    setSelectedSize(base.sizes?.[0] ?? null);
    setSheetTab(base.glbUrl ? "3d" : base.imageUrl ? "2d" : "2d");
    // keep sheet closed; reveal via 'More Informations' action
    setSheetVisible(false);
    setQuantity(1);

    try {
      const res = await fetch(`${API_BASE}/api/products/${product.id}`);
      if (res.ok) {
        const latestRaw = await res.json();
        const latest = {
          ...latestRaw,
          stock: Number(latestRaw.stock) || 0,
          available: (Number(latestRaw.stock) || 0) > 0,
        };
        setSelectedProduct((prev) => ({ ...prev, ...latest }));
      }
    } catch (e) {
      // ignore and keep immediate details
    }
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

  if (loading) {
    return null;
  }

  return (
    <div className="app">
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
            {process.env.NODE_ENV !== "production" && shopifyError && (
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, opacity: 0.65, textTransform: "none", letterSpacing: 0 }}>
                {shopifyError}
              </div>
            )}
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
        <nav
          className={`expanding-menu ${menuOpen ? "open" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="menu-tabs">
            <button className="menu-tab active">SHOP</button>
            <button className="menu-tab" onClick={() => {
              window.history.pushState({}, "", "/world");
              setMenuOpen(false);
              window.location.href = "/world";
            }}>WORLD</button>
            <button
              className="menu-tab cart-tab"
              onClick={() => {
                setCartOpen(true);
                setMenuOpen(false);
              }}
            >
              <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
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
                      position: 'absolute',
                      top: -8,
                      right: -10,
                      minWidth: 18,
                      height: 18,
                      padding: '0 5px',
                      borderRadius: 999,
                      background: '#ff2d55',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 800,
                      lineHeight: '18px',
                      textAlign: 'center',
                      border: '2px solid rgba(0,0,0,0.75)',
                      boxSizing: 'border-box',
                      pointerEvents: 'none',
                    }}
                  >
                    {cartItemCount > 99 ? '99+' : cartItemCount}
                  </span>
                )}
              </span>
            </button>
          </div>
        </nav>
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
           opacity: selectedProduct ? (sheetTab === '3d' ? 1 : 0) : 1,
           transition: 'opacity 0.3s'
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
          padding: '20px'
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
          padding: '20px'
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

                       {/* Dedicated Space for 3D model */}
                       <div style={{ flex: 1, pointerEvents: 'none' }} />

                        {/* Size + Add to Cart Area */}
                        <div style={{ marginTop: 'auto', padding: '0 30px 55px 30px', pointerEvents: 'auto', animationDelay: isClosingHero ? '0s' : '0.1s' }} className={isClosingHero ? 'damso-pop-down' : 'damso-pop-up'}>
                           {selectedProduct.sizes?.length > 0 && (
                              <div style={{ position: "relative", marginBottom: 14 }}>
                                 <div
                                    onClick={() => setSizeDropdownOpen(!sizeDropdownOpen)}
                                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.08)" }}
                                 >
                                    <span style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#333" }}>SIZE</span>
                                    <span style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#111", display: "flex", alignItems: "center", gap: 6 }}>
                                       {selectedSize || selectedProduct.sizes[0]}
                                       <span style={{ fontSize: 7, opacity: 0.5, transition: "transform 0.2s ease", transform: sizeDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
                                    </span>
                                 </div>
                                 {sizeDropdownOpen && (
                                    <div style={{ position: "absolute", bottom: "100%", right: 0, minWidth: 120, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", padding: "4px", zIndex: 50, animation: "sizeDropIn 0.18s ease" }}>
                                       {selectedProduct.sizes.map((s) => (
                                          <div
                                             key={s}
                                             onClick={() => { setSelectedSize(s); setSizeDropdownOpen(false); }}
                                             style={{
                                                padding: "9px 16px",
                                                fontSize: 11,
                                                fontWeight: (selectedSize || selectedProduct.sizes[0]) === s ? 800 : 500,
                                                textTransform: "uppercase",
                                                letterSpacing: 0.5,
                                                color: (selectedSize || selectedProduct.sizes[0]) === s ? "#111" : "#666",
                                                cursor: "pointer",
                                                borderRadius: 8,
                                                transition: "background 0.12s ease, color 0.12s ease",
                                                background: (selectedSize || selectedProduct.sizes[0]) === s ? "rgba(0,0,0,0.06)" : "transparent",
                                             }}
                                             onMouseEnter={(e) => { if ((selectedSize || selectedProduct.sizes[0]) !== s) e.currentTarget.style.background = "rgba(0,0,0,0.03)"; }}
                                             onMouseLeave={(e) => { if ((selectedSize || selectedProduct.sizes[0]) !== s) e.currentTarget.style.background = "transparent"; }}
                                          >
                                             {s}
                                          </div>
                                       ))}
                                    </div>
                                 )}
                              </div>
                           )}
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

                           <div style={{ marginTop: 'auto', padding: '0 30px 40px 30px' }}>
                              {selectedProduct.sizes?.length > 0 && (
                                 <div style={{ position: "relative", marginBottom: 15 }}>
                                    <div
                                       onClick={() => setSizeDropdownOpen(!sizeDropdownOpen)}
                                       style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.08)" }}
                                    >
                                       <span style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#333" }}>SIZE</span>
                                       <span style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#111", display: "flex", alignItems: "center", gap: 6 }}>
                                          {selectedSize || selectedProduct.sizes[0]}
                                          <span style={{ fontSize: 7, opacity: 0.5, transition: "transform 0.2s ease", transform: sizeDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
                                       </span>
                                    </div>
                                    {sizeDropdownOpen && (
                                       <div style={{ position: "absolute", bottom: "100%", right: 0, minWidth: 120, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", padding: "4px", zIndex: 50, animation: "sizeDropIn 0.18s ease" }}>
                                          {selectedProduct.sizes.map((s) => (
                                             <div
                                                key={s}
                                                onClick={() => { setSelectedSize(s); setSizeDropdownOpen(false); }}
                                                style={{
                                                   padding: "9px 16px",
                                                   fontSize: 11,
                                                   fontWeight: (selectedSize || selectedProduct.sizes[0]) === s ? 800 : 500,
                                                   textTransform: "uppercase",
                                                   letterSpacing: 0.5,
                                                   color: (selectedSize || selectedProduct.sizes[0]) === s ? "#111" : "#666",
                                                   cursor: "pointer",
                                                   borderRadius: 8,
                                                   transition: "background 0.12s ease, color 0.12s ease",
                                                   background: (selectedSize || selectedProduct.sizes[0]) === s ? "rgba(0,0,0,0.06)" : "transparent",
                                                }}
                                                onMouseEnter={(e) => { if ((selectedSize || selectedProduct.sizes[0]) !== s) e.currentTarget.style.background = "rgba(0,0,0,0.03)"; }}
                                                onMouseLeave={(e) => { if ((selectedSize || selectedProduct.sizes[0]) !== s) e.currentTarget.style.background = "transparent"; }}
                                             >
                                                {s}
                                             </div>
                                          ))}
                                       </div>
                                    )}
                                 </div>
                              )}
                              
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
              <div style={{ position: 'absolute', top: 'calc(100% + 16px)', left: 0, width: '100%', display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 1000 }}>
                 <div className={`damso-pill-controller ${isClosingHero ? 'damso-pop-down' : 'damso-pop-up'}`} style={{ pointerEvents: 'auto', animationDelay: isClosingHero ? '0s' : '0.2s' }}>
                    <button className="pill-btn" onClick={() => {
                      setSlideDir('prev');
                      const w = getCurrentItemWidth();
                      const raw = Math.round(offsetRef.current / w);
                      setSnapTarget(raw - 1);
                      const newIdx = (((raw - 1) % products.length) + products.length) % products.length;
                      if (products[newIdx]) openProductView(products[newIdx]);
                    }}>◀◀</button>
                    
                    <button className="pill-btn pill-close-btn" onClick={handleCloseHero}>✕</button>

                    <button className="pill-btn" onClick={() => {
                      setSlideDir('next');
                      const w = getCurrentItemWidth();
                      const raw = Math.round(offsetRef.current / w);
                      setSnapTarget(raw + 1);
                      const newIdx = (((raw + 1) % products.length) + products.length) % products.length;
                      if (products[newIdx]) openProductView(products[newIdx]);
                    }}>▶▶</button>
                 </div>
              </div>

           </div>
        </div>
      )}


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

  if (currentPage === "/checkout") {
    return <CheckoutPage />;
  }
  if (currentPage === "/admin") {
    return <AdminPanel />;
  }
  if (currentPage === "/world") {
    return <WorldApp />;
  }

  return <MainApp />;
}

function WorldApp() {
  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [offset, setOffset] = useState(0); // used for UI/label and selection logic
  // activeIndex not needed now that the bottom sheet is removed
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [worldGalleryOpen, setWorldGalleryOpen] = useState(false);

  useEffect(() => {
    const onGalleryState = (e) => {
      setWorldGalleryOpen(!!e?.detail?.open);
    };
    window.addEventListener('worldGalleryState', onGalleryState);
    return () => window.removeEventListener('worldGalleryState', onGalleryState);
  }, []);

  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem("cart");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const cartItemCount = (cart || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

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
    try {
      window.dispatchEvent(
        new CustomEvent('worldCarouselStep', { detail: { dir: direction } })
      );
    } catch {}

    stepBy(direction);
  }, [stepBy]);

  // (activeIndex tracking removed)

  useEffect(() => {
    try {
      localStorage.setItem("cart", JSON.stringify(cart));
    } catch {}
  }, [cart]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/products`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        const normalized = (
          Array.isArray(data) && data.length ? data : DEFAULT_PRODUCTS
        ).map((p) => ({
          ...p,
          stock: Number(p.stock) || 0,
          available: (Number(p.stock) || 0) > 0,
        }));
        setProducts(normalized);
      } catch (e) {
        setProducts(DEFAULT_PRODUCTS);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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
    } catch {}
  };

  if (loading) {
    return null;
  }

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

      {/* Expanding Menu */}
      <nav
        className={`expanding-menu ${menuOpen ? "open" : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={{ opacity: worldGalleryOpen ? 0 : 1, pointerEvents: worldGalleryOpen ? 'none' : 'auto', transition: 'opacity 0.3s ease' }}
      >
        <div className="menu-tabs">
          <button className="menu-tab" onClick={() => {
            window.location.href = "/";
          }}>SHOP</button>
          <button className="menu-tab active">WORLD</button>
          <button
            className="menu-tab cart-tab"
            onClick={() => {
              setCartOpen(true);
              setMenuOpen(false);
            }}
          >
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
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
                    position: 'absolute',
                    top: -8,
                    right: -10,
                    minWidth: 18,
                    height: 18,
                    padding: '0 5px',
                    borderRadius: 999,
                    background: '#ff2d55',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 800,
                    lineHeight: '18px',
                    textAlign: 'center',
                    border: '2px solid rgba(0,0,0,0.75)',
                    boxSizing: 'border-box',
                    pointerEvents: 'none',
                  }}
                >
                  {cartItemCount > 99 ? '99+' : cartItemCount}
                </span>
              )}
            </span>
          </button>
        </div>
      </nav>

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
      <div style={{ opacity: worldGalleryOpen ? 0 : 1, pointerEvents: worldGalleryOpen ? 'none' : 'auto', transition: 'opacity 0.3s ease' }}>
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
