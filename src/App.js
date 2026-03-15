import { useState, useEffect, useRef, useCallback } from "react";
import Scene from "./Scene";
import EnhancedJoystick from "./EnhancedJoystick";
import "./styles.css";
import AdminPanel from "./AdminPanel";
import CartPanel from "./CartPanel";
import CheckoutPage from "./checkout";
import TrackOrderPage from "./TrackOrder";
import World from "./World";
import cartIcon from "./whitecart.png";
import OrdersLoginPage from "./OrdersLogin";

const API_BASE = (process.env.REACT_APP_API_URL || "http://localhost:4000").replace(/\/$/, "");
const ITEM_WIDTH = 2;
// Match Scene's dynamic spacing so snap-to-center stays correct on all screens.
const getItemWidth = () => {
  if (typeof window === 'undefined') return 1.75;
  const w = window.innerWidth || 1024;
  return Math.max(1.55, Math.min(1.85, 1.55 + (w / 1400) * 0.25));
};
const MAX_OFFSET_JUMP = ITEM_WIDTH * 1.5;
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
  const [selectedSize, setSelectedSize] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState("3d"); // "2d" or "3d"
  const [tabDotsDrag, setTabDotsDrag] = useState(false);
  const tabDotsRef = useRef(null);
  const tabDotsDragStartRef = useRef(0);

  const [preOrderEmail, setPreOrderEmail] = useState("");
  const [preOrderSubmitting, setPreOrderSubmitting] = useState(false);
  const [preOrderSuccess, setPreOrderSuccess] = useState(false);

  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem("cart");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const cartItemCount = cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  const scrollTimeoutRef = useRef(null);
  const offsetRef = useRef(0);

  const [show3DHint, setShow3DHint] = useState(false);
  const hintTimerRef = useRef(null);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const getActiveIndexFromOffset = useCallback((off) => {
    if (!products.length) return 0;
    const w = getCurrentItemWidth();
    const raw = Math.round(-off / w);
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
    a.target = -rawIndex * w;
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
    const raw = Math.round(-currentOffset / w);
    setSnapTarget(raw);
  }, [products.length, setSnapTarget]);

  const stepBy = useCallback((direction) => {
    if (!products.length) return;
    const currentOffset = offsetRef.current;
    const w = getCurrentItemWidth();
    const raw = Math.round(-currentOffset / w);
    const nextRaw = raw + direction;
    setSnapTarget(nextRaw);
  }, [products.length, setSnapTarget]);

  const handleArrowClick = useCallback((direction) => {
    stepBy(direction);
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

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/products`);
        if (!res.ok) return;
        const data = await res.json();
        const normalized = (Array.isArray(data) ? data : []).map((p) => ({
          ...p,
          stock: Number(p.stock) || 0,
          available: (Number(p.stock) || 0) > 0,
        }));
        setProducts((prev) => {
          const prevStr = JSON.stringify(prev);
          const newStr = JSON.stringify(normalized);
          return prevStr !== newStr ? normalized : prev;
        });
      } catch (e) {}
    }, 5000);
    return () => clearInterval(id);
  }, []);

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

  const openBottomSheet = async (product) => {
    try {
      const res = await fetch(`${API_BASE}/api/products/${product.id}`);
      if (res.ok) {
        const latestRaw = await res.json();
        const latest = {
          ...latestRaw,
          stock: Number(latestRaw.stock) || 0,
          available: (Number(latestRaw.stock) || 0) > 0,
        };
        setSelectedProduct(latest);
        setSelectedSize(latest.sizes?.[0] ?? null);
        // Prefer 3D if available, else fall back to 2D (prevents showing another product's 3D)
        setSheetTab(latest.glbUrl ? "3d" : latest.imageUrl ? "2d" : "2d");
      } else {
        const norm = {
          ...product,
          stock: Number(product.stock) || 0,
          available: (Number(product.stock) || 0) > 0,
        };
        setSelectedProduct(norm);
        setSelectedSize(norm.sizes?.[0] ?? null);
        setSheetTab(norm.glbUrl ? "3d" : norm.imageUrl ? "2d" : "2d");
      }
      setQuantity(1);
    } catch (e) {
      const norm = {
        ...product,
        stock: Number(product.stock) || 0,
        available: (Number(product.stock) || 0) > 0,
      };
      setSelectedProduct(norm);
      setSelectedSize(norm.sizes?.[0] ?? null);
      setSheetTab(norm.glbUrl ? "3d" : norm.imageUrl ? "2d" : "2d");
    } finally {
      setQuantity(1);
      setSheetVisible(true);
    }
  };

  // 1-second hint when sheet opens on 3D tab
  useEffect(() => {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }

    if (!sheetVisible || sheetTab !== "3d" || !selectedProduct?.glbUrl) {
      setShow3DHint(false);
      return;
    }

    setShow3DHint(true);
    hintTimerRef.current = setTimeout(() => {
      setShow3DHint(false);
      hintTimerRef.current = null;
    }, 1000);

    return () => {
      if (hintTimerRef.current) {
        clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
    };
  }, [sheetVisible, sheetTab, selectedProduct?.glbUrl]);

  const handleCenterButtonClick = () => {
    if (!products.length) return;
    // Derive active product at click-time to avoid using a stale activeIndex.
    const idx = getActiveIndexFromOffset(offsetRef.current);
    const activeProduct = products[idx];
    if (activeProduct) openBottomSheet(activeProduct);
  };

  const closeBottomSheet = () => {
    setSheetVisible(false);
    setTimeout(() => {
      setSelectedProduct(null);
      setSelectedSize(null);
      setQuantity(1);
      setPreOrderEmail("");
      setPreOrderSubmitting(false);
      setPreOrderSuccess(false);
    }, 300);
  };

  const handleAddToCart = async () => {
    if (!selectedProduct) return;
    
    // Check if size-specific stock is available
    const sizeStock = selectedProduct.sizeStock?.[selectedSize];
    const stockAvailable = sizeStock !== undefined ? sizeStock : selectedProduct.stock;
    
    if (stockAvailable <= 0) {
      alert(`Sorry, ${selectedProduct.name} in size ${selectedSize} is out of stock!`);
      return;
    }

    try {
      const item = {
        id: selectedProduct.id,
        name: selectedProduct.name,
        price: selectedProduct.price,
        size: selectedSize,
        imageUrl: selectedProduct.imageUrl,
        qty: Number(quantity) || 1,
        stockAvailable: stockAvailable, // Store available stock
      };

      setCart((prev) => {
        const foundIdx = prev.findIndex(
          (p) => p.id === item.id && p.size === item.size
        );
        if (foundIdx >= 0) {
          const next = prev.slice();
          const newQty = Math.min(stockAvailable, (Number(next[foundIdx].qty) || 0) + item.qty);
          next[foundIdx] = {
            ...next[foundIdx],
            qty: newQty,
            stockAvailable: stockAvailable,
          };
          return next;
        }
        return [item, ...prev];
      });
      closeBottomSheet();
      setCartOpen(true);
      console.debug("[CART] added", item);
    } catch (err) {
      alert("Error adding to cart");
    }
  };

  const handleBuyNow = () => {
    if (!selectedProduct) return;
    // Buy Now should go straight to checkout with ONLY this item
    const sizeStock = selectedProduct.sizeStock?.[selectedSize];
    const stockAvailable = sizeStock !== undefined ? sizeStock : selectedProduct.stock;
    const item = {
      id: selectedProduct.id,
      name: selectedProduct.name,
      price: selectedProduct.price,
      size: selectedSize,
      imageUrl: selectedProduct.imageUrl,
      qty: Number(quantity) || 1,
      stockAvailable: stockAvailable,
    };
    localStorage.setItem("cart", JSON.stringify([item]));
    window.location.href = "/checkout";
  };

  const handlePreOrder = async () => {
    if (!selectedProduct) return;
    if (!preOrderEmail || !String(preOrderEmail).includes('@')) {
      alert('Please enter a valid email');
      return;
    }
    try {
      setPreOrderSubmitting(true);
      const res = await fetch(`${API_BASE}/api/preorders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProduct.code || selectedProduct.id,
          email: preOrderEmail,
          size: selectedSize,
          qty: Number(quantity) || 1,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Pre-order failed');
      setPreOrderSuccess(true);
    } catch (e) {
      alert(e.message);
    } finally {
      setPreOrderSubmitting(false);
    }
  };

  const handleTabDotsDragStart = (e) => {
    setTabDotsDrag(true);
    const startX = e.clientX !== undefined ? e.clientX : e.touches?.[0]?.clientX || 0;
    tabDotsDragStartRef.current = startX;
  };

  const handleTabDotsDragMove = useCallback((e) => {
    if (!tabDotsDrag) return;
    const currentX = e.clientX !== undefined ? e.clientX : e.touches?.[0]?.clientX || 0;
    const delta = currentX - tabDotsDragStartRef.current;
    
    // Swipe left (negative delta) = switch to 3D
    // Swipe right (positive delta) = switch to 2D
    if (Math.abs(delta) > 30) {
      if (delta < 0) {
        setSheetTab("3d");
      } else {
        setSheetTab("2d");
      }
      setTabDotsDrag(false);
    }
  }, [tabDotsDrag]);

  const handleTabDotsDragEnd = () => {
    setTabDotsDrag(false);
  };

  useEffect(() => {
    if (!tabDotsDrag) return;
    
    window.addEventListener("mousemove", handleTabDotsDragMove);
    window.addEventListener("mouseup", handleTabDotsDragEnd);
    window.addEventListener("touchmove", handleTabDotsDragMove);
    window.addEventListener("touchend", handleTabDotsDragEnd);
    
    return () => {
      window.removeEventListener("mousemove", handleTabDotsDragMove);
      window.removeEventListener("mouseup", handleTabDotsDragEnd);
      window.removeEventListener("touchmove", handleTabDotsDragMove);
      window.removeEventListener("touchend", handleTabDotsDragEnd);
    };
  }, [tabDotsDrag, handleTabDotsDragMove]);

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
            {selectedProduct
              ? selectedProduct.name
              : products[getActiveIndexFromOffset(offsetRef.current)]?.name || ""}
          </span>
        </div>
      </header>

      {/* Expanding Menu */}
      <nav
        className={`expanding-menu ${menuOpen ? "open" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="menu-tabs">
          <button className="menu-tab active">SHOP</button>
          <button
            className="menu-tab"
            onClick={() => {
              setMenuOpen(false);
              window.history.pushState({}, "", "/orders");
              window.location.href = "/orders";
            }}
          >
            ORDERS
          </button>
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

      <CartPanel
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        setCart={setCart}
        setProducts={setProducts}
      />

      {/* 3D Scene */}
      <Scene offset={offset} products={products} onSelect={openBottomSheet} />

      {/* Enhanced Joystick */}
      <EnhancedJoystick
        onDrag={handleJoystickDrag}
        onDragEnd={handleJoystickDragEnd}
        onArrowClick={handleArrowClick}
        onCenterClick={handleCenterButtonClick}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />

      {/* Backdrop Overlay */}
      {(selectedProduct || sheetVisible) && (
        <div 
          className="backdrop" 
          onClick={closeBottomSheet}
          style={{
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            background: 'rgba(0, 0, 0, 0.5)',
          }}
        />
      )}

      {/* Enhanced Bottom Sheet */}
      <div
        className={`bottom-sheet ${sheetVisible ? "open" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            closeBottomSheet();
          }
        }}
      >
        <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()}>
          <button className="sheet-close" onClick={closeBottomSheet}>
            ×
          </button>

          {selectedProduct && (
            <>
              {/* 2D/3D View Container with Dots */}
              <div style={{ position: 'relative' }}>
                {sheetTab === "2d" ? (
                  <div className="sheet-2d-view">
                    {selectedProduct.imageUrl ? (
                      <img
                        src={
                          selectedProduct.imageUrl.startsWith('http') 
                            ? selectedProduct.imageUrl 
                            : `${API_BASE}${selectedProduct.imageUrl}`
                        }
                        alt={selectedProduct.name}
                        className="sheet-2d-image"
                        onError={(e) => {
                          console.error('Image failed to load:', selectedProduct.imageUrl);
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div style={{ 
                        width: '100%', 
                        height: '100%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        background: 'transparent',
                        color: '#999',
                        fontSize: 14
                      }}>
                        No Image Available
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="sheet-3d-view">
                    {/* Only render 3D preview if this product actually has a glbUrl */}
                    {selectedProduct.glbUrl ? (
                      <>
                        <Scene
                          offset={0}
                          products={[selectedProduct]}
                          onSelect={() => {}}
                          isPreview={true}
                          forceCentered={true}
                          interactive={true}
                          previewCamera={{ position: [0, 0, 3.2], fov: 60 }}
                        />

                        <div className={`sheet-3d-hint ${show3DHint ? "show" : ""}`}>
                          <div className="hint-card">
                            <div className="hint-icon">
                              <div className="hint-arrows" aria-hidden="true">
                                <span className="up">↑</span>
                                <span className="down">↓</span>
                                <span className="left">←</span>
                                <span className="right">→</span>
                              </div>
                            </div>
                            <div>
                              <div className="hint-text">Rotate 360°</div>
                              <div className="hint-sub">Drag to rotate • Scroll / pinch to zoom</div>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ 
                        width: '100%', 
                        height: '100%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        background: '#f0f0f0',
                        color: '#999',
                        fontSize: 14
                      }}>
                        No 3D Model Available
                      </div>
                    )}
                  </div>
                )}

                {(() => {
                  const has2d = !!selectedProduct?.imageUrl;
                  const has3d = !!selectedProduct?.glbUrl;
                  // Only show dots (switch option) if both media exist
                  if (!(has2d && has3d)) return null;
                  return (
                    <div
                      className="tab-dots"
                      ref={tabDotsRef}
                      onMouseDown={handleTabDotsDragStart}
                      onTouchStart={handleTabDotsDragStart}
                    >
                      <span 
                        className={`dot ${sheetTab === "2d" ? "active" : ""}`}
                        onClick={() => setSheetTab("2d")}
                        title="2D View"
                      />
                      <span 
                        className={`dot ${sheetTab === "3d" ? "active" : ""}`}
                        onClick={() => setSheetTab("3d")}
                        title="3D View"
                      />
                    </div>
                  );
                })()}
              </div>

              <div className="sheet-title">{selectedProduct.name}</div>
              <div className="sheet-desc">{selectedProduct.desc}</div>
              <div className="sheet-price">
                {formatPrice(selectedProduct.price)}
              </div>

              {/* Size Selector */}
              <div className="section-title">SELECT SIZE</div>
              <div className="size-selector">
                {(selectedProduct.sizes || []).map((size) => (
                  <button
                    key={size}
                    className={`size-btn ${
                      selectedSize === size ? "active" : ""
                    }`}
                    onClick={() => setSelectedSize(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>

              {/* Stock / Availability */}
              <div style={{ marginTop: 12 }}>
                {(() => {
                  const sizeStock = selectedProduct?.sizeStock?.[selectedSize];
                  const stockAvailable = sizeStock !== undefined ? Number(sizeStock) || 0 : Number(selectedProduct?.stock) || 0;
                  const inStock = stockAvailable > 0;

                  return (
                    <div
                      style={{
                        fontSize: 12,
                        color: inStock ? "#0a0" : "#b00020",
                      }}
                    >
                      {inStock ? `In stock (${selectedSize || "—"}): ${stockAvailable}` : `Out of stock (${selectedSize || "—"})`}
                    </div>
                  );
                })()}
              </div>

              {/* Quantity Section */}
              <div className="quantity-section">
                <div className="section-title">QUANTITY</div>
                <div className="quantity-controls" style={{ pointerEvents: 'auto' }}>
                  <button
                    type="button"
                    className="qty-btn"
                    style={{ pointerEvents: 'auto' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuantity(Math.max(1, quantity - 1));
                    }}
                    disabled={quantity <= 1}
                  >
                    −
                  </button>
                  <span className="qty-display">{quantity}</span>
                  <button
                    type="button"
                    className="qty-btn"
                    style={{ pointerEvents: 'auto' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuantity(Math.min(99, quantity + 1));
                    }}
                    disabled={(() => {
                      if (!selectedProduct) return true;
                      const sizeStock = selectedProduct.sizeStock?.[selectedSize];
                      const stockAvailable = sizeStock !== undefined ? Number(sizeStock) || 0 : Number(selectedProduct.stock) || 0;
                      return !selectedProduct.available || quantity >= stockAvailable;
                    })()}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="sheet-actions">
                {selectedProduct.preOrder ? (
                  <div style={{ width: '100%' }}>
                    {!preOrderSuccess ? (
                      <>
                        <div style={{ marginBottom: 10, fontSize: 12, color: '#666', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                          Pre-order email
                        </div>
                        <input
                          value={preOrderEmail}
                          onChange={(e) => setPreOrderEmail(e.target.value)}
                          placeholder="you@example.com"
                          type="email"
                          style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #e0e0e0', marginBottom: 12, boxSizing: 'border-box' }}
                        />
                        <button
                          type="button"
                          className="action-btn primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreOrder();
                          }}
                          disabled={preOrderSubmitting}
                          style={{ width: '100%' }}
                        >
                          {preOrderSubmitting ? 'SUBMITTING...' : 'PRE-ORDER'}
                        </button>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
                          You’ll receive a confirmation email for this item.
                        </div>
                      </>
                    ) : (
                      <div style={{ padding: 14, borderRadius: 12, background: '#e8f5e9', border: '1px solid #c8e6c9', color: '#1b5e20', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.7, textAlign: 'center' }}>
                        Pre-order confirmed
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="action-btn primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToCart();
                      }}
                    >
                      ADD TO CART
                    </button>
                    <button
                      type="button"
                      className="action-btn secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBuyNow();
                      }}
                    >
                      BUY NOW
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
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
  if (currentPage === "/track-order") {
    return <TrackOrderPage />;
  }
  if (currentPage === "/orders") {
    return <OrdersLoginPage />;
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
  const [offset, setOffset] = useState(0);
  // activeIndex not needed now that the bottom sheet is removed
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  // Bottom sheet removed on World page, so product selection state is not needed.

  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem("cart");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const cartItemCount = cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

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

    const animate = () => {
      setOffset((prev) => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.005) {
          snapAnimRef.current = null;
          isAnimatingRef.current = false;
          return target;
        }
        snapAnimRef.current = requestAnimationFrame(animate);
        return prev + diff * 0.15;
      });
    };
    snapAnimRef.current = requestAnimationFrame(animate);
  }, []);

  const snapToNearest = useCallback(() => {
    if (products.length === 0) return;
    const currentOffset = offsetRef.current;
    const currentRawIndex = Math.round(-currentOffset / ITEM_WIDTH);
    const targetOffset = -currentRawIndex * ITEM_WIDTH;
    animateToOffset(targetOffset);
  }, [products.length, animateToOffset]);

  const animateByDelta = useCallback((delta) => {
    const safeDelta = Math.max(-MAX_OFFSET_JUMP, Math.min(MAX_OFFSET_JUMP, delta));
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
    const currentRawIndex = Math.round(-currentOffset / ITEM_WIDTH);
    const nextRawIndex = currentRawIndex + direction;
    const targetOffset = -nextRawIndex * ITEM_WIDTH;
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
    const safeDelta = Math.max(-MAX_OFFSET_JUMP, Math.min(MAX_OFFSET_JUMP, delta));
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
          animateByDelta(-direction * ITEM_WIDTH);
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
    // no-op (bottom sheet removed)
    return;
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
      <EnhancedJoystick
        onDrag={handleJoystickDrag}
        onDragEnd={handleJoystickDragEnd}
        onArrowClick={handleArrowClick}
        onCenterClick={handleCenterButtonClick}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />

      {/* World page bottom sheet removed */}
    </div>
  );
}