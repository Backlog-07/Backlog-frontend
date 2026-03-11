import cartImage from "./cart.jpeg";

const API_BASE = (process.env.REACT_APP_API_URL || "http://localhost:4000").replace(/\/$/, "");

export default function CartPanel({ open, onClose, cart, setCart, setProducts }) {
  const isCheckingOut = false;

  const persistCart = (nextCart) => {
    try {
      localStorage.setItem("cart", JSON.stringify(nextCart || []));
    } catch {}
  };

  const removeItem = (id, size, color) => {
    setCart((prev) => {
      const next = prev.filter((item) => !(item.id === id && item.size === size && item.color === color));
      persistCart(next);
      return next;
    });
  };

  const updateQty = (id, size, color, newQty) => {
    if (newQty <= 0) {
      removeItem(id, size, color);
      return;
    }
    setCart((prev) => {
      const next = prev.map((item) =>
        item.id === id && item.size === size && item.color === color
          ? { ...item, qty: Math.min(99, newQty) }
          : item
      );
      persistCart(next);
      return next;
    });
  };

  const totalPrice = cart.reduce((sum, item) => {
    const priceNum = parseFloat(item.price?.replace(/[^\d.]/g, "") || "0");
    return sum + priceNum * item.qty;
  }, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert("Your cart is empty!");
      return;
    }

    // Ensure cart is stored before navigation
    persistCart(cart);

    // Navigate to checkout page instead of direct API call
    window.location.href = '/checkout';
  };

  const handleClearCart = () => {
    if (window.confirm("Clear all items from cart?")) {
      setCart(() => {
        const next = [];
        persistCart(next);
        return next;
      });
    }
  };

  return (
    <>
      {/* Backdrop */}
      {open && <div className="backdrop" onClick={onClose} />}

      {/* Cart Panel */}
      <div className={`cart-panel ${open ? "open" : ""}`}>
        <div className="cart-panel-inner">
          {/* Header */}
          <div className="cart-panel-header">
            <div className="cart-header-content">
              <img src={cartImage} alt="Cart" className="cart-header-image" />
              <h3>YOUR BASKET</h3>
            </div>
            <button className="cart-panel-close" onClick={onClose}>
              ×
            </button>
          </div>

          {/* Content */}
          <div className="cart-panel-body">
            {cart.length === 0 ? (
              <div className="cart-empty-state">
                <div style={{ fontSize: 32, marginBottom: 8 }}>🛍️</div>
                <p>Your basket is empty</p>
                <p style={{ fontSize: 12, marginTop: 8, color: "#666" }}>
                  Add some items to get started
                </p>
              </div>
            ) : (
              <div className="cart-items-list">
                {cart.map((item, idx) => {
                  const imgSrc = item.imageUrl
                    ? (item.imageUrl.startsWith("http")
                        ? item.imageUrl
                        : `${API_BASE}${item.imageUrl}`)
                    : null;

                  return (
                    <div key={idx} className="cart-panel-item">
                      {/* Item Image */}
                      <div className="cart-panel-item-3d">
                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={item.name}
                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }}
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              borderRadius: 10,
                              background: "#f0f0f0",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#999",
                              fontSize: 12,
                              fontWeight: 700,
                              letterSpacing: 0.5,
                              textTransform: "uppercase",
                            }}
                          >
                            No photo
                          </div>
                        )}
                      </div>

                      {/* Item Info */}
                      <div className="cart-panel-item-info">
                        <div className="cart-panel-item-name">{item.name}</div>
                        <div className="cart-panel-item-meta">
                          {item.size && <span>{item.size}</span>}
                          {item.size && item.color && <span> • </span>}
                          {item.color && (
                            <span>
                              <div
                                style={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: "50%",
                                  backgroundColor: item.color,
                                  border: "1px solid #ddd",
                                  display: "inline-block",
                                  marginLeft: 4,
                                }}
                              />
                            </span>
                          )}
                        </div>
                        <div className="cart-panel-item-price">{item.price}</div>

                        {/* Quantity Controls */}
                        <div className="cart-panel-item-qty">
                          <button
                            className="qty-mini-btn"
                            onClick={() => updateQty(item.id, item.size, item.color, item.qty - 1)}
                          >
                            −
                          </button>
                          <span>{item.qty}</span>
                          <button
                            className="qty-mini-btn"
                            onClick={() => updateQty(item.id, item.size, item.color, item.qty + 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Remove Button */}
                      <button
                        className="remove-item-btn"
                        onClick={() => removeItem(item.id, item.size, item.color)}
                        title="Remove item"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {cart.length > 0 && (
            <div className="cart-panel-footer">
              <div className="cart-panel-total">
                <span>TOTAL</span>
                <span>₹{totalPrice.toFixed(2)}</span>
              </div>
              <div className="cart-panel-actions">
                <button
                  className="cart-panel-checkout"
                  onClick={handleCheckout}
                  disabled={isCheckingOut}
                >
                  {isCheckingOut ? "Processing..." : "CHECKOUT"}
                </button>
                <button
                  className="cart-panel-clear"
                  onClick={handleClearCart}
                  disabled={isCheckingOut}
                >
                  CLEAR
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
