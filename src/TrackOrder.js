import { useEffect, useMemo, useState } from "react";

const API_BASE = (process.env.REACT_APP_API_URL || "http://localhost:4000").replace(/\/$/, "");

const fmt = (v) => {
  if (v == null) return "";
  return `₹${v}`;
};

export default function TrackOrderPage() {
  const [orderId, setOrderId] = useState("");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);

  useEffect(() => {
    // Pre-fill from last checkout for convenience
    try {
      const lastId = localStorage.getItem("lastOrderId") || "";
      const lastEmail = localStorage.getItem("lastOrderEmail") || "";
      const lastPhone = localStorage.getItem("lastOrderPhone") || "";
      if (lastId) setOrderId(lastId);
      if (lastEmail) setEmailOrPhone(lastEmail);
      else if (lastPhone) setEmailOrPhone(lastPhone);
    } catch {}
  }, []);

  // Auto-lookup when values are prefilled
  useEffect(() => {
    if (!orderId || !emailOrPhone) return;
    // avoid infinite loops: only auto-run once when empty order + no error
    if (order || error || loading) return;
    const t = setTimeout(() => {
      lookup();
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, emailOrPhone]);

  const isEmail = useMemo(() => String(emailOrPhone).includes("@"), [emailOrPhone]);

  const lookup = async (e) => {
    e && e.preventDefault && e.preventDefault();
    setError("");
    setOrder(null);

    const trimmedId = String(orderId || "").trim();
    const v = String(emailOrPhone || "").trim();

    if (!trimmedId) return setError("Order number is required.");
    if (!v) return setError("Email or phone is required.");

    setLoading(true);
    try {
      const qs = new URLSearchParams({ orderId: trimmedId });
      if (isEmail) qs.set("email", v);
      else qs.set("phone", v);

      const res = await fetch(`${API_BASE}/api/orders/lookup?${qs.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) throw new Error(data?.error || "Order not found. Please check order number and email/phone.");
        if (res.status === 400) throw new Error(data?.error || "Missing details.");
        if (res.status === 500) throw new Error(data?.error || "Server error while looking up order.");
        throw new Error(data?.error || "Order not found");
      }
      setOrder(data);
    } catch (err) {
      const msg = String(err?.message || "Failed to lookup order");
      // Helpful hint for the common case where server/index.js was running without lookup endpoint
      if (msg.toLowerCase().includes('unexpected token') || msg.toLowerCase().includes('failed to fetch')) {
        setError("Could not reach order lookup API. Ensure the backend is running and supports /api/orders/lookup.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="track-order-wrap">
      <header className="track-order-header">
        <div className="track-order-logo">Backlog</div>
        <a href="/" className="track-order-muted" style={{ textDecoration: "none" }}>
          ← Back to shop
        </a>
      </header>

      <div className="track-order-container">
        <h1 style={{ margin: "10px 0 14px", fontSize: 26, letterSpacing: 0.3 }}>Track your order</h1>

        <div className="track-order-card">
          <form className="track-order-form" onSubmit={lookup}>
            <div>
              <div className="track-order-muted" style={{ marginBottom: 6, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase" }}>
                Order number
              </div>
              <input
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="e.g. 1769447374144"
                inputMode="numeric"
              />
            </div>

            <div>
              <div className="track-order-muted" style={{ marginBottom: 6, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase" }}>
                Email or phone
              </div>
              <input
                value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
                placeholder="you@example.com or 9876543210"
              />
            </div>

            <button type="submit" disabled={loading}>
              {loading ? "Checking..." : "Check status"}
            </button>
          </form>

          {error ? (
            <div style={{ marginTop: 12, color: "#b00020", fontWeight: 700 }}>{error}</div>
          ) : null}

          {order ? (
            <>
              <div className="track-order-meta">
                <div><strong>Order:</strong> #{order.id}</div>
                <div><strong>Status:</strong> <span className="track-order-status-pill">{order.orderStatus}</span></div>
                <div><strong>Payment:</strong> {order.paymentStatus} ({order.paymentMethod})</div>
                <div><strong>Total:</strong> {fmt(order.total)}</div>
                <div className="track-order-muted">Placed: {order.createdAt ? new Date(order.createdAt).toLocaleString() : ""}</div>
              </div>

              <div className="track-order-items">
                {(order.items || []).map((it, idx) => {
                  const img = it.imageUrl
                    ? (String(it.imageUrl).startsWith("http") ? it.imageUrl : `${API_BASE}${it.imageUrl}`)
                    : null;

                  return (
                    <div className="track-order-item" key={idx}>
                      {img ? <img src={img} alt={it.name || ""} /> : <div style={{ width: 64, height: 64, borderRadius: 10, background: "#f2f2f2" }} />}
                      <div>
                        <div style={{ fontWeight: 900 }}>{it.name || "Item"}</div>
                        <div className="track-order-muted">Size: {it.size || "N/A"} • Qty: {it.qty}</div>
                        <div style={{ fontWeight: 800 }}>{fmt((Number(it.price) || 0) * (Number(it.qty) || 0))}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {!order && !error ? (
            <div className="track-order-muted" style={{ marginTop: 12 }}>
              Enter your order number and the email/phone used at checkout.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
