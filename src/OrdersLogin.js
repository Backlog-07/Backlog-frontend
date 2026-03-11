import { useState, useEffect } from "react";

const API_BASE = (process.env.REACT_APP_API_URL || "http://localhost:4000").replace(/\/$/, "");

const fmt = (v) => {
  if (v == null) return "";
  return `₹${v}`;
};

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const getItemLineTotal = (it) => safeNum(it?.price) * safeNum(it?.qty);

const getOrderCounts = (o) => {
  const items = Array.isArray(o?.items) ? o.items : [];
  const itemTypes = items.length;
  const itemQty = items.reduce((sum, it) => sum + safeNum(it?.qty), 0);
  const computedSubtotal = items.reduce((sum, it) => sum + getItemLineTotal(it), 0);
  const total = o?.total != null ? safeNum(o.total) : computedSubtotal;
  return { itemTypes, itemQty, computedSubtotal, total };
};

const STATUS_STEPS = [
  { key: "placed", label: "Placed" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

const normalizeStatus = (s) => String(s || "").toLowerCase().trim();
const getStatusStepIndex = (status) => {
  const v = normalizeStatus(status);
  if (!v) return 0;
  if (v.includes("deliver")) return 3;
  if (v.includes("ship") || v.includes("dispatch") || v.includes("out")) return 2;
  if (v.includes("process") || v.includes("pack") || v.includes("confirm")) return 1;
  return 0;
};

export default function OrdersLoginPage() {
  const [mode, setMode] = useState("order"); // "order" | "email"
  const [loggedIn, setLoggedIn] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    // Restore "session"
    try {
      const s = localStorage.getItem("orderLoginSession");
      if (!s) return;
      const parsed = JSON.parse(s);

      if (parsed?.mode === "email" || parsed?.mode === "order") setMode(parsed.mode);
      if (parsed?.orderId && parsed?.emailOrPhone) {
        setOrderId(String(parsed.orderId));
        setEmailOrPhone(String(parsed.emailOrPhone));
        setLoggedIn(true);
      } else if (parsed?.emailOrPhone && parsed?.mode === "email") {
        setEmailOrPhone(String(parsed.emailOrPhone));
        setLoggedIn(true);
      }
    } catch {}
  }, []);

  // email/phone detection is handled inside runLookup

  const runLookup = async (oid, v) => {
    const qs = new URLSearchParams({ orderId: String(oid) });
    if (String(v).includes("@")) qs.set("email", String(v));
    else qs.set("phone", String(v));

    const res = await fetch(`${API_BASE}/api/orders/lookup?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Order not found");
    return data;
  };

  const runLookupByEmailOrPhone = async (v) => {
    const qs = new URLSearchParams();
    if (String(v).includes("@")) qs.set("email", String(v));
    else qs.set("phone", String(v));

    const res = await fetch(`${API_BASE}/api/orders/by-contact?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "No orders found");
    return Array.isArray(data?.orders) ? data.orders : [];
  };

  const handleLogin = async (e) => {
    e && e.preventDefault && e.preventDefault();
    setError("");
    setOrders([]);
    setOrder(null);
    setShowMore(false);

    const oid = String(orderId || "").trim();
    const v = String(emailOrPhone || "").trim();

    if (!v) return setError("Email or phone is required.");
    if (mode === "order" && !oid) return setError("Order number is required.");

    setLoading(true);
    try {
      if (mode === "order") {
        const data = await runLookup(oid, v);
        setOrder(data);
        setLoggedIn(true);
        try {
          localStorage.setItem("orderLoginSession", JSON.stringify({ mode, orderId: oid, emailOrPhone: v }));
        } catch {}
      } else {
        const list = await runLookupByEmailOrPhone(v);
        setOrders(list);
        setLoggedIn(true);
        try {
          localStorage.setItem("orderLoginSession", JSON.stringify({ mode, emailOrPhone: v }));
        } catch {}
      }
    } catch (err) {
      setError(err.message || "Login failed");
      setLoggedIn(false);
      setOrder(null);
      setOrders([]);
      try {
        localStorage.removeItem("orderLoginSession");
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    if (!loggedIn) return;
    setError("");
    setLoading(true);
    try {
      if (mode === "order") {
        const data = await runLookup(orderId, emailOrPhone);
        setOrder(data);
      } else {
        const list = await runLookupByEmailOrPhone(emailOrPhone);
        setOrders(list);
      }
    } catch (err) {
      setError(err.message || "Failed to refresh");
    } finally {
      setLoading(false);
    }
  };

  // If session restored, auto-fetch order once
  useEffect(() => {
    if (!loggedIn) return;
    if (mode === "order" && order) return;
    if (mode === "email" && orders.length) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  return (
    <div className="track-order-wrap orders-page orders-video-bg orders-video-right">
      <div className="orders-video-right-panel" aria-hidden="true">
        <video
          className="orders-bg-video"
          autoPlay
          loop
          muted
          playsInline
          src="/bg-vid.webm"
        />
      </div>

      <header className="header">
        <div className="logo">Backlog</div>
        <div className="nav">
          <span className="nav-text">ORDERS</span>
        </div>
      </header>

      <div className="track-order-container">
        <div className="orders-hero">
          <div>
            <h1 className="orders-title">{loggedIn ? "Your orders" : "Find your order"}</h1>
            <div className="orders-subtitle">
              {loggedIn
                ? "Status updates, items, and total in one place."
                : "Use your order number or the email/phone used at checkout."}
            </div>
          </div>
        </div>

        <div className="track-order-card">
          {!loggedIn ? (
            <>
              <div className="orders-hint">Choose a method:</div>

              <div className="track-order-segment" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className={mode === "order" ? "active" : ""}
                  onClick={() => {
                    setMode("order");
                    setError("");
                    setOrders([]);
                    setOrder(null);
                    setShowMore(false);
                  }}
                >
                  Order Number
                </button>
                <button
                  type="button"
                  className={mode === "email" ? "active" : ""}
                  onClick={() => {
                    setMode("email");
                    setError("");
                    setOrders([]);
                    setOrder(null);
                    setShowMore(false);
                  }}
                >
                  Email / Phone
                </button>
              </div>

              <form className="track-order-form" onSubmit={handleLogin}>
                {mode === "order" ? (
                  <div>
                    <div
                      className="track-order-muted"
                      style={{ marginBottom: 6, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase" }}
                    >
                      Order number
                    </div>
                    <input
                      value={orderId}
                      onChange={(e) => setOrderId(e.target.value)}
                      placeholder="e.g. 1769447374144"
                      inputMode="numeric"
                    />
                  </div>
                ) : null}

                <div>
                  <div
                    className="track-order-muted"
                    style={{ marginBottom: 6, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase" }}
                  >
                    Email or phone
                  </div>
                  <input
                    value={emailOrPhone}
                    onChange={(e) => setEmailOrPhone(e.target.value)}
                    placeholder="you@example.com or 9876543210"
                  />
                </div>

                <button type="submit" disabled={loading} className="orders-primary-btn">
                  {loading ? "Checking..." : "Continue"}
                </button>
              </form>

              {error ? <div style={{ marginTop: 12, color: "#ff5a7a", fontWeight: 800 }}>{error}</div> : null}
            </>
          ) : (
            <>
              {/* <div className="orders-actions">
                <button type="button" onClick={refresh} disabled={loading}>
                  {loading ? "Refreshing..." : "Refresh"}
                </button>
                <button type="button" onClick={logout}>
                  Logout
                </button>
              </div> */}

              {error ? <div style={{ marginBottom: 12, color: "#ff5a7a", fontWeight: 800 }}>{error}</div> : null}

              {mode === "email" && orders.length ? (
                <>
                  <div className="track-order-muted" style={{ marginBottom: 10 }}>
                    Select an order:
                  </div>
                  <div className="track-order-order-list">
                    {orders.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => {
                          setOrder(o);
                          setShowMore(false);
                        }}
                        className="track-order-order-btn"
                      >
                        <div style={{ fontWeight: 900 }}>#{o.id}</div>
                        <div className="track-order-muted">Status: {o.orderStatus}</div>
                        <div className="track-order-muted">Total: {fmt(o.total)}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {order ? (
                <>
                  {(() => {
                    const { itemTypes, itemQty, computedSubtotal, total } = getOrderCounts(order);
                    const stepIdx = getStatusStepIndex(order?.orderStatus);

                    return (
                      <>
                        <div className="orders-summary">
                          <div className="orders-summary-left">
                            <div className="orders-order-id">Order #{order.id}</div>
                            <div className="orders-summary-sub">
                              <span className="track-order-status-pill">{order.orderStatus || "Placed"}</span>
                              <span className="orders-dot" />
                              <span>{itemQty} items</span>
                              <span className="orders-dot" />
                              <span>Total: {fmt(total)}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="orders-more-btn"
                            onClick={() => setShowMore((s) => !s)}
                          >
                            {showMore ? "Less" : "More"}
                          </button>
                        </div>

                        <div className="orders-stepper" role="list" aria-label="Order progress">
                          {STATUS_STEPS.map((st, idx) => {
                            const state = idx < stepIdx ? "done" : idx === stepIdx ? "active" : "todo";
                            return (
                              <div key={st.key} className={`orders-step ${state}`} role="listitem">
                                <div className="orders-step-dot" aria-hidden="true" />
                                <div className="orders-step-label">{st.label}</div>
                              </div>
                            );
                          })}
                        </div>

                        {showMore ? (
                          <div className="orders-details">
                            <div className="orders-detail-row">
                              <div className="orders-detail-k">Payment</div>
                              <div className="orders-detail-v">
                                {order.paymentStatus || ""} {order.paymentMethod ? `• ${order.paymentMethod}` : ""}
                              </div>
                            </div>
                            <div className="orders-detail-row">
                              <div className="orders-detail-k">Placed</div>
                              <div className="orders-detail-v">
                                {order.createdAt ? new Date(order.createdAt).toLocaleString() : ""}
                              </div>
                            </div>
                            <div className="orders-detail-row">
                              <div className="orders-detail-k">Subtotal</div>
                              <div className="orders-detail-v">{fmt(computedSubtotal)}</div>
                            </div>
                            <div className="orders-detail-row">
                              <div className="orders-detail-k">Items</div>
                              <div className="orders-detail-v">{itemTypes} types • {itemQty} qty</div>
                            </div>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}

                  <div className="track-order-items">
                    {(order.items || []).map((it, idx) => {
                      const img = it.imageUrl
                        ? (String(it.imageUrl).startsWith("http") ? it.imageUrl : `${API_BASE}${it.imageUrl}`)
                        : null;

                      const lineTotal = getItemLineTotal(it);

                      return (
                        <div className="track-order-item" key={idx}>
                          {img ? (
                            <img src={img} alt={it.name || ""} />
                          ) : (
                            <div
                              style={{
                                width: 64,
                                height: 64,
                                borderRadius: 10,
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.12)",
                              }}
                            />
                          )}
                          <div>
                            <div style={{ fontWeight: 900 }}>{it.name || "Item"}</div>
                            <div className="track-order-muted">
                              Size: {it.size || "N/A"} • Qty: {it.qty}
                            </div>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ fontWeight: 800 }}>{fmt(lineTotal)}</div>
                              <div className="track-order-muted">({fmt(it.price)} each)</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="track-order-muted">No order selected.</div>
              )}
            </>
          )}

          {!loggedIn ? (
            <div className="track-order-muted" style={{ marginTop: 12 }}>
              Tip: after checkout, you can also use <a href="/track-order">/track-order</a>.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
