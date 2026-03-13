import { useState, useEffect } from "react";
import "./checkout.css";

const API_BASE = (process.env.REACT_APP_API_URL || "http://localhost:4000").replace(/\/$/, "");
const SHIPPING_CHARGE = 99; // ₹99 shipping charge

const formatPrice = (value) => {
  if (value == null) return "₹0";
  return `₹${value}`;
};

export default function CheckoutPage() {
  const [cart, setCart] = useState([]);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
  });
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cod"); // "cod" or "online"
  const [codConfirmed, setCodConfirmed] = useState(false);
  const [partialModalOpen, setPartialModalOpen] = useState(false);
  const [partialPaid, setPartialPaid] = useState(false);
  const PARTIAL_PAY_AMOUNT = SHIPPING_CHARGE; // pay now (advance/shipping)
  const [submitting, setSubmitting] = useState(false);
  const [outOfStockItems, setOutOfStockItems] = useState([]);

  useEffect(() => {
    // Show premium loader while checkout reads cart + validates stock
    try { window.__ensureBootLoader && window.__ensureBootLoader(); } catch {}

    try {
      const raw = localStorage.getItem("cart");
      const parsed = raw ? JSON.parse(raw) : [];
      setCart(parsed);
      validateStock(parsed);
    } catch (e) {
      setCart([]);
    } finally {
      // Hide after a frame so the page can paint smoothly
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try { window.__hideBootLoader && window.__hideBootLoader(); } catch {}
        });
      });
    }
  }, []);

  const validateStock = async (cartItems) => {
    try {
      const res = await fetch(`${API_BASE}/api/products`);
      if (res.ok) {
        const products = await res.json();
        const outOfStock = [];

        cartItems.forEach(item => {
          const product = products.find(p => p.id === item.id);
          if (product) {
            const sizeStock = product.sizeStock?.[item.size];
            const availableStock = sizeStock !== undefined ? sizeStock : product.stock;
            
            if (availableStock <= 0 || item.qty > availableStock) {
              outOfStock.push({
                ...item,
                availableStock: availableStock
              });
            }
          } else {
            outOfStock.push(item);
          }
        });

        setOutOfStockItems(outOfStock);
      }
    } catch (e) {
      console.error("Failed to validate stock:", e);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const getTotalPrice = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.qty || 0), 0);
  };

  const getTotalWithShipping = () => {
    return getTotalPrice() + SHIPPING_CHARGE;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (paymentMethod === "cod") {
      if (!codConfirmed) {
        alert("Please confirm the partial payment before placing the order.");
        return;
      }
      if (!partialPaid) {
        setPartialModalOpen(true);
        return;
      }
    }
    setSubmitting(true);
    try { window.__ensureBootLoader && window.__ensureBootLoader(); } catch {}

    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 1500));

      const total = getTotalWithShipping();
      const partialPaidAmount = paymentMethod === 'cod' ? PARTIAL_PAY_AMOUNT : total;
      const amountDue = Math.max(0, total - partialPaidAmount);

      const orderData = {
        items: cart,
        total,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        pincode: formData.zip,
        paymentMethod: paymentMethod === "online" ? "ONLINE" : "COD",
        paymentType: paymentMethod === 'cod' ? 'PARTIAL' : 'FULL',
        partialPaidAmount,
        amountDue,
        paymentStatus: paymentMethod === 'cod' ? 'Partially Paid' : 'Paid',
      };

      const res = await fetch(`${API_BASE}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      if (!res.ok) throw new Error("Failed to place order");

      const placed = await res.json();
      try {
        if (placed?.orderId) localStorage.setItem("lastOrderId", String(placed.orderId));
        if (formData.email) localStorage.setItem("lastOrderEmail", String(formData.email));
        if (formData.phone) localStorage.setItem("lastOrderPhone", String(formData.phone));
      } catch {}
      
      // Clear cart
      localStorage.removeItem("cart");
      
      // Show success animation
      setOrderPlaced(true);
      
      // Redirect after 3 seconds
      setTimeout(() => {
        window.location.href = "/";
      }, 3000);
    } catch (err) {
      console.error("Order error:", err);
      alert("Failed to place order. Please try again.");
    } finally {
      setSubmitting(false);
      try { window.__hideBootLoader && window.__hideBootLoader(); } catch {}
    }
  };

  const handleRemoveItem = (index) => {
    const newCart = cart.filter((_, i) => i !== index);
    setCart(newCart);
    localStorage.setItem("cart", JSON.stringify(newCart));
  };

  const isCheckoutDisabled = () => {
    if (cart.length === 0 || outOfStockItems.length > 0 || submitting) return true;
    if (paymentMethod === "cod" && !codConfirmed) return true;
    return false;
  };

  if (orderPlaced) {
    return (
      <div className="success-overlay">
        <div className="success-animation">
          <div className="checkmark-circle">
            <div className="checkmark"></div>
          </div>
          <h1 className="success-title">Order Confirmed!</h1>
          <p className="success-message">
            Thank you for your purchase
          </p>
          <p className="success-email">
            Confirmation email sent to {formData.email}
          </p>
          <div className="success-loader">
            <div className="loader-bar"></div>
          </div>
          <p className="redirect-text">Redirecting to home...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-wrapper">
      {partialModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setPartialModalOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#fff',
              borderRadius: 16,
              padding: 20,
              boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase' }}>
              Pay now (Partial Payment)
            </div>
            <div style={{ marginTop: 10, color: '#666', fontSize: 13, lineHeight: 1.5 }}>
              You will pay <strong>{formatPrice(PARTIAL_PAY_AMOUNT)}</strong> now.
              Remaining amount will be collected at your doorstep.
            </div>

            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: '#f9f9f9', border: '1px solid #eee', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Total</span>
                <strong>{formatPrice(getTotalWithShipping())}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Pay now</span>
                <strong>{formatPrice(PARTIAL_PAY_AMOUNT)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Due on delivery</span>
                <strong>{formatPrice(Math.max(0, getTotalWithShipping() - PARTIAL_PAY_AMOUNT))}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                className="action-btn secondary"
                style={{ flex: 1, padding: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}
                onClick={() => setPartialModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="action-btn primary"
                style={{ flex: 1, padding: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}
                onClick={() => {
                  // Test-mode: mark as paid and continue
                  setPartialPaid(true);
                  setPartialModalOpen(false);
                  // continue checkout flow
                  setTimeout(() => {
                    const fakeEvt = { preventDefault: () => {} };
                    handleSubmit(fakeEvt);
                  }, 0);
                }}
              >
                Pay {formatPrice(PARTIAL_PAY_AMOUNT)}
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: '#999' }}>
              Test mode: this simulates payment success.
            </div>
          </div>
        </div>
      )}
      <header className="checkout-header">
        <div className="checkout-logo">Backlog</div>
        <h1 className="checkout-title">CHECKOUT</h1>
      </header>

      <div className="checkout-container">
        {/* Left side: Cart Items */}
        <div className="checkout-section order-summary">
          <h2 className="section-heading">ORDER SUMMARY</h2>
          
          {cart.length === 0 ? (
            <div className="empty-cart">
              <p>Your cart is empty</p>
              <a href="/" className="back-link">← Back to Shop</a>
            </div>
          ) : (
            <>
              {outOfStockItems.length > 0 && (
                <div className="stock-warning">
                  <p>⚠️ Some items are out of stock or quantity exceeds available stock. Please remove them to continue.</p>
                </div>
              )}

              <div className="items-list">
                {cart.map((item, idx) => {
                  const isOutOfStock = outOfStockItems.some(
                    oos => oos.id === item.id && oos.size === item.size
                  );

                  return (
                    <div key={idx} className={`checkout-item ${isOutOfStock ? 'out-of-stock' : ''}`}>
                      <div className="item-image">
                        {item.imageUrl ? (
                          <img 
                            src={item.imageUrl.startsWith('/')
                              ? `${API_BASE}${item.imageUrl}`
                              : item.imageUrl
                            }
                            alt={item.name}
                          />
                        ) : (
                          <div className="image-placeholder" style={{ backgroundColor: item.color || '#ddd' }}>
                            {item.name.charAt(0)}
                          </div>
                        )}
                      </div>

                      <div className="item-details">
                        <h3 className="item-name">{item.name}</h3>
                        <div className="item-meta">
                          {item.color && (
                            <span className="meta-tag">
                              <span className="color-dot" style={{ backgroundColor: item.color }} />
                              {item.color}
                            </span>
                          )}
                          {item.size && <span className="meta-tag">Size: {item.size}</span>}
                        </div>
                        <div className="item-price-row">
                          <span className="item-price">{formatPrice(item.price)}</span>
                          <span className="item-qty">x {item.qty}</span>
                        </div>
                      </div>

                      <div className="item-total">
                        <span>{formatPrice(item.price * item.qty)}</span>
                        <button 
                          className="remove-btn"
                          onClick={() => handleRemoveItem(idx)}
                          title="Remove item"
                        >
                          ×
                        </button>
                      </div>

                      {isOutOfStock && (
                        <div className="stock-badge">Out of Stock</div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="checkout-divider" />

              <div className="price-breakdown">
                <div className="price-row">
                  <span>Subtotal</span>
                  <span>{formatPrice(getTotalPrice())}</span>
                </div>
                <div className="price-row">
                  <span>Shipping</span>
                  <span>{formatPrice(SHIPPING_CHARGE)}</span>
                </div>
                <div className="price-row total">
                  <span>TOTAL</span>
                  <span>{formatPrice(getTotalWithShipping())}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right side: Delivery Form & Payment */}
        <div className="checkout-section delivery-form">
          <h2 className="section-heading">DELIVERY DETAILS</h2>

          <form onSubmit={handleSubmit} className="form">
            <div className="form-group">
              <label htmlFor="name">Full Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="John Doe"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email *</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="john@example.com"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone">Phone Number *</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="+91 98765 43210"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="address">Street Address *</label>
              <input
                type="text"
                id="address"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                placeholder="123 Main Street"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="city">City *</label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  placeholder="New York"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="state">State *</label>
                <input
                  type="text"
                  id="state"
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  placeholder="NY"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="zip">Postal Code *</label>
              <input
                type="text"
                id="zip"
                name="zip"
                value={formData.zip}
                onChange={handleInputChange}
                placeholder="10001"
                required
              />
            </div>

            {/* Payment Method Section */}
            <div className="payment-section">
              <h3 className="section-heading">PAYMENT METHOD</h3>

              <div className="payment-methods">
                <label className="payment-option">
                  <input
                    type="radio"
                    name="payment"
                    value="cod"
                    checked={paymentMethod === "cod"}
                    onChange={(e) => {
                      setPaymentMethod(e.target.value);
                      setCodConfirmed(false);
                    }}
                  />
                  <span className="payment-label">
                    <span className="payment-name">Cash on Delivery (COD)</span>
                    <span className="payment-desc">Pay {formatPrice(SHIPPING_CHARGE)} now, rest on delivery</span>
                  </span>
                </label>

                <label className="payment-option">
                  <input
                    type="radio"
                    name="payment"
                    value="online"
                    checked={paymentMethod === "online"}
                    onChange={(e) => {
                      setPaymentMethod(e.target.value);
                      setCodConfirmed(false);
                    }}
                  />
                  <span className="payment-label">
                    <span className="payment-name">Pay Online</span>
                    <span className="payment-desc">Pay full amount now via card/UPI</span>
                  </span>
                </label>
              </div>

              {/* COD Confirmation */}
              {paymentMethod === "cod" && (
                <div className="cod-confirmation">
                  <label className="cod-checkbox">
                    <input
                      type="checkbox"
                      checked={codConfirmed}
                      onChange={(e) => setCodConfirmed(e.target.checked)}
                    />
                    <span>
                      I confirm to pay shipping charge of {formatPrice(SHIPPING_CHARGE)} now via UPI/Card and rest amount on delivery
                    </span>
                  </label>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isCheckoutDisabled()}
              style={{
                width: "100%",
                padding: "16px",
                background: isCheckoutDisabled() ? "#999" : "#000",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "16px",
                fontWeight: "600",
                cursor: isCheckoutDisabled() ? "not-allowed" : "pointer",
                transition: "all 0.3s ease",
              }}
            >
              {submitting ? "Processing Order..." : 
               outOfStockItems.length > 0 ? "Remove Out of Stock Items" :
               "Place Order (Test Mode - No Payment)"}
            </button>

            {outOfStockItems.length > 0 ? (
              <p style={{ 
                textAlign: "center", 
                fontSize: "14px", 
                color: "#b00020", 
                marginTop: "16px",
                fontWeight: "600"
              }}>
                ⚠️ Cannot checkout with out of stock items
              </p>
            ) : (
              <p style={{ 
                textAlign: "center", 
                fontSize: "14px", 
                color: "#666", 
                marginTop: "16px" 
              }}>
                🧪 Test Mode: No payment required. Order will be placed immediately.
              </p>
            )}

            <p className="secure-note">✓ Secure & encrypted transaction</p>
          </form>
        </div>
      </div>
    </div>
  );
}
