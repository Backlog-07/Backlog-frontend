import { useState } from "react";
import cartImage from "./cart.jpeg";
import { updateCartLine, removeCartLine } from "./shopifyApi";

// Shopify cart object passed via App.js
export default function CartPanel({ open, onClose, cart, setCart }) {
  const [isLoading, setIsLoading] = useState(false);

  // Safely grab the shopify edges
  const edges = cart?.lines?.edges || [];

  const updateQty = async (lineId, newQty) => {
    if (!cart?.id) return;
    if (newQty <= 0) {
      return removeItem(lineId);
    }
    setIsLoading(true);
    try {
      const updatedCart = await updateCartLine(cart.id, lineId, newQty);
      setCart(updatedCart);
    } catch (e) {
      console.error(e);
      alert("Failed to update quantity");
    } finally {
      setIsLoading(false);
    }
  };

  const removeItem = async (lineId) => {
    if (!cart?.id) return;
    setIsLoading(true);
    try {
      const updatedCart = await removeCartLine(cart.id, lineId);
      setCart(updatedCart);
    } catch (e) {
      console.error(e);
      alert("Failed to remove item");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckout = () => {
    if (!cart?.checkoutUrl) {
      alert("No checkout url available");
      return;
    }
    window.location.href = cart.checkoutUrl;
  };

  const formatPrice = (amount) => {
    const num = parseFloat(amount || "0");
    return isNaN(num) ? "0.00" : num.toFixed(2);
  };

  const totalAmount = cart?.cost?.subtotalAmount?.amount || "0";

  return (
    <>
      {/* Backdrop */}
      {open && <div className="backdrop" onClick={onClose} />}

      {/* Cart Panel */}
      <div className={`cart-panel ${open ? "open" : ""}`}>
        <div className="cart-panel-inner" style={{ position: "relative" }}>
          
          {/* Loading Overlay */}
          {isLoading && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 10,
              background: "rgba(255,255,255,0.7)", display: "flex",
              alignItems: "center", justifyContent: "center"
            }}>
              <span style={{ fontWeight: "bold", background: "#000", color: "#fff", padding: "8px 16px", borderRadius: 20 }}>
                Updating...
              </span>
            </div>
          )}

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
            {edges.length === 0 ? (
              <div className="cart-empty-state">
                <div style={{ fontSize: 32, marginBottom: 8 }}>🛍️</div>
                <p>Your basket is empty</p>
                <p style={{ fontSize: 12, marginTop: 8, color: "#666" }}>
                  Add some items to get started
                </p>
              </div>
            ) : (
              <div className="cart-items-list">
                {edges.map(({ node }) => {
                  const product = node.merchandise?.product;
                  const variantTitle = node.merchandise?.title;
                  const price = node.merchandise?.price?.amount;
                  const imgSrc = product?.images?.edges?.[0]?.node?.url || null;
                  
                  // Shopify variant title is often "Default Title" if no dimensions selected
                  const showVariant = variantTitle && variantTitle !== "Default Title";

                  return (
                    <div key={node.id} className="cart-panel-item">
                      {/* Item Image */}
                      <div className="cart-panel-item-3d">
                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={product?.title || "Product"}
                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }}
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%", height: "100%", borderRadius: 10, background: "#f0f0f0",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: "#999", fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
                              textTransform: "uppercase",
                            }}
                          >
                            No photo
                          </div>
                        )}
                      </div>

                      {/* Item Info */}
                      <div className="cart-panel-item-info">
                        <div className="cart-panel-item-name">{product?.title || "Item"}</div>
                        <div className="cart-panel-item-meta">
                          {showVariant && <span>{variantTitle}</span>}
                        </div>
                        <div className="cart-panel-item-price">₹{formatPrice(price)}</div>

                        {/* Quantity Controls */}
                        <div className="cart-panel-item-qty">
                          <button
                            className="qty-mini-btn"
                            onClick={() => updateQty(node.id, node.quantity - 1)}
                            disabled={isLoading}
                          >
                            −
                          </button>
                          <span>{node.quantity}</span>
                          <button
                            className="qty-mini-btn"
                            onClick={() => updateQty(node.id, node.quantity + 1)}
                            disabled={isLoading}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Remove Button */}
                      <button
                        className="remove-item-btn"
                        onClick={() => removeItem(node.id)}
                        title="Remove item"
                        disabled={isLoading}
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
          {edges.length > 0 && (
            <div className="cart-panel-footer">
              <div className="cart-panel-total">
                <span>TOTAL</span>
                <span>₹{formatPrice(totalAmount)}</span>
              </div>
              <div className="cart-panel-actions">
                <button
                  className="cart-panel-checkout"
                  onClick={handleCheckout}
                  disabled={isLoading}
                  style={{ width: "100%" }}
                >
                  CHECKOUT WITH SHOPIFY
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
