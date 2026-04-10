import React, { useEffect, useState, useRef, useCallback } from "react";

const API_BASE = (process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000')).replace(/\/$/, "");

// Predefined sizes
const AVAILABLE_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

const getProductDisplayId = (p) => p?.code || p?.id || "";

// Order status options
const ORDER_STATUSES = [
  "Order Placed",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Delivered",
  "Cancelled"
];

const PAYMENT_STATUSES = [
  "Pending",
  "Partially Paid",
  "Paid",
  "Completed",
  "Refunded",
  "Failed",
];

function authFetch(url, options = {}) {
  const token = localStorage.getItem("authToken");
  const headers = Object.assign({}, options.headers || {});
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const full = url.startsWith('http') ? url : API_BASE + url;
  return fetch(full, Object.assign({}, options, { headers }));
}

function validateProduct(p) {
  const errors = [];
  if (!p.name || !p.name.trim()) errors.push("Name is required");
  if (!p.price || !/^\d+(\.\d{1,2})?$/.test(p.price)) errors.push("Price must be a valid number");
  if (!Array.isArray(p.sizes) || p.sizes.length === 0) errors.push("At least one size is required");
  return errors;
}

export default function AdminPanel() {
  const [tokenValid, setTokenValid] = useState(!!localStorage.getItem("authToken"));
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [worldImages, setWorldImages] = useState([]);
  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("inventory"); // "inventory", "create", "world-images", "orders", "preorders", or "stats"
  const [editing, setEditing] = useState(null);
  const emptyForm = { name: "", price: "", desc: "", sizes: [], stock: 0, preOrder: false, imageUrl: null, glbUrl: null, sizeStock: {}, code: "" };
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState([]);
  const fileRef = useRef();
  const worldImageFileRef = useRef();
  const glbRef = useRef();
  const [uploadingWorldImage, setUploadingWorldImage] = useState(false);

  const [adminConfigured, setAdminConfigured] = useState(null);
  const [setupUser, setSetupUser] = useState("");
  const [setupPass, setSetupPass] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [expandedOrders, setExpandedOrders] = useState({}); // Track which orders are expanded
  const eventSourceRef = useRef(null);

  const [productStats, setProductStats] = useState([]);
  const [statsDays, setStatsDays] = useState(30);
  const [statsLoading, setStatsLoading] = useState(false);

  // Pre-orders
  const [preOrders, setPreOrders] = useState([]);
  const [preOrdersLoading, setPreOrdersLoading] = useState(false);
  const [preOrdersError, setPreOrdersError] = useState("");

  const [ordersSubTab, setOrdersSubTab] = useState('partial'); // 'partial' | 'full'

  // Settings (shipping charge)
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [shippingCharge, setShippingCharge] = useState(99);
  const [shippingSaving, setShippingSaving] = useState(false);
  const [shippingError, setShippingError] = useState('');

  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setShippingError('');
    try {
      const res = await authFetch('/api/admin/settings');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load settings');
      const sc = Number(data?.settings?.shippingCharge);
      if (Number.isFinite(sc)) setShippingCharge(sc);
    } catch (e) {
      setShippingError(e?.message || 'Failed to load settings');
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const saveShippingCharge = useCallback(async () => {
    setShippingSaving(true);
    setShippingError('');
    try {
      const res = await authFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shippingCharge: Number(shippingCharge) || 0 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');
      const sc = Number(data?.settings?.shippingCharge);
      if (Number.isFinite(sc)) setShippingCharge(sc);
    } catch (e) {
      setShippingError(e?.message || 'Failed to save');
    } finally {
      setShippingSaving(false);
    }
  }, [shippingCharge]);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch((API_BASE || '') + '/api/auth/status');
        if (!res.ok) throw new Error('status failed');
        const data = await res.json();
        setAdminConfigured(!!data.adminConfigured);
      } catch (e) {
        setAdminConfigured(true);
      }
    };
    check();
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/products");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setProducts(data || []);
    } catch (e) {
      console.error(e);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWorldImages = useCallback(async () => {
    try {
      const res = await authFetch("/api/world-images");
      if (res.ok) {
        const data = await res.json();
        setWorldImages(data || []);
      }
    } catch (e) {
      console.error("Failed to load world images", e);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/orders");
      if (!res.ok) throw new Error("Failed to load orders");
      const data = await res.json();
      setOrders(data || []);
    } catch (e) {
      console.error(e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPreOrders = useCallback(async () => {
    setPreOrdersError("");
    setPreOrdersLoading(true);
    try {
      const res = await authFetch('/api/preorders');
      if (!res.ok) throw new Error('Failed to load pre-orders');
      const data = await res.json();
      setPreOrders((data && data.preOrders) || []);
    } catch (e) {
      console.error(e);
      setPreOrders([]);
      setPreOrdersError(e?.message || 'Failed to load pre-orders');
    } finally {
      setPreOrdersLoading(false);
    }
  }, []);

  const resendPreOrderEmail = useCallback(async (preOrderId) => {
    try {
      const res = await authFetch(`/api/preorders/${encodeURIComponent(preOrderId)}/resend`, { method: 'POST' });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const data = await res.json().catch(() => ({}));
      if (data && data.emailSent) {
        alert('✓ Confirmation email sent');
      } else {
        alert('Email not sent (email service not configured or failed).');
      }
    } catch (e) {
      alert('Failed to send email: ' + (e?.message || String(e)));
    }
  }, []);

  const loadProductStats = useCallback(async (days = statsDays) => {
    setStatsLoading(true);
    try {
      const res = await authFetch(`/api/admin/product-stats?days=${encodeURIComponent(days)}`);
      if (!res.ok) throw new Error("Failed to load stats");
      const data = await res.json();
      setProductStats((data && data.leaderboard) || []);
    } catch (e) {
      console.error(e);
      setProductStats([]);
    } finally {
      setStatsLoading(false);
    }
  }, [statsDays]);

  useEffect(() => {
    if (tokenValid) {
      loadProducts();
      loadWorldImages();
      loadOrders();
      loadPreOrders();
      loadProductStats();
      loadSettings();
    }
  }, [tokenValid, loadProducts, loadWorldImages, loadOrders, loadPreOrders, loadProductStats, loadSettings]);

  // Connect to SSE for real-time order notifications
  useEffect(() => {
    if (!tokenValid) return;

    console.log("Connecting to admin notifications...");
    
    const eventSource = new EventSource(`${API_BASE}/api/admin/notifications`);
    
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('connected', (e) => {
      console.log("Connected to admin notifications:", e.data);
    });

    eventSource.addEventListener('newOrder', (e) => {
      const orderData = JSON.parse(e.data);
      console.log("New order received:", orderData);
      
      // Add notification
      const notification = {
        id: Date.now(),
        orderId: orderData.orderId,
        customerName: orderData.customerName,
        total: orderData.total,
        itemCount: orderData.itemCount,
        timestamp: orderData.timestamp,
      };
      
      setNotifications(prev => [notification, ...prev]);
      
      // Play notification sound
      playNotificationSound();
      
      // Auto-remove notification after 10 seconds
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
      }, 10000);
      
      // Reload orders to show the new one
      loadOrders();
    });

    eventSource.onerror = (error) => {
      console.error("SSE Error:", error);
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [tokenValid, loadOrders]);

  // Play notification sound using Web Audio API
  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext();
      
      // First beep
      const oscillator1 = audioContext.createOscillator();
      const gainNode1 = audioContext.createGain();
      oscillator1.connect(gainNode1);
      gainNode1.connect(audioContext.destination);
      oscillator1.frequency.value = 800;
      oscillator1.type = 'sine';
      gainNode1.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator1.start(audioContext.currentTime);
      oscillator1.stop(audioContext.currentTime + 0.3);

      // Second beep
      const oscillator2 = audioContext.createOscillator();
      const gainNode2 = audioContext.createGain();
      oscillator2.connect(gainNode2);
      gainNode2.connect(audioContext.destination);
      oscillator2.frequency.value = 1000;
      oscillator2.type = 'sine';
      gainNode2.gain.setValueAtTime(0.3, audioContext.currentTime + 0.35);
      gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.65);
      oscillator2.start(audioContext.currentTime + 0.35);
      oscillator2.stop(audioContext.currentTime + 0.65);

      console.log("✓ Notification sound played successfully");
    } catch (err) {
      console.error("❌ Error playing sound:", err);
    }
  };

  const toggleOrderExpansion = (orderId) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const body = { username: formData.get("username"), password: formData.get("password") };
    try {
      const loginUrl = API_BASE + "/api/auth/login";
      const res = await fetch(loginUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Invalid credentials");
      const data = await res.json();
      localStorage.setItem("authToken", data.token);
      setTokenValid(true);
    } catch (err) {
      alert("Login failed: " + err.message);
    }
  };

  const handleSetup = async (e) => {
    e && e.preventDefault && e.preventDefault();
    if (!setupUser || !setupPass) return alert('Username and password required');
    try {
      setSetupBusy(true);
      const res = await fetch((API_BASE || '') + '/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: setupUser, password: setupPass }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Setup failed');
      }
      const data = await res.json();
      localStorage.setItem('authToken', data.token);
      setTokenValid(true);
      setAdminConfigured(true);
      setSetupBusy(false);
    } catch (err) {
      setSetupBusy(false);
      alert('Setup failed: ' + err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    setTokenValid(false);
  };

  const beginEdit = (p) => {
    setEditing(p.id);
    setForm({
      ...p,
      sizes: p.sizes || [],
      stock: p.stock || 0,
      preOrder: !!p.preOrder,
      imageUrl: p.imageUrl || null,
      glbUrl: p.glbUrl || null,
      sizeStock: p.sizeStock || {},
      code: p.code || "",
    });
    setActiveTab("create");
  };

  const beginCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    if (fileRef.current) fileRef.current.value = null;
    if (glbRef.current) fileRef.current.value = null;
  };

  const formatPrice = (val) => {
    const num = val.replace(/\D/g, '');
    return num;
  };

  const handlePriceChange = (e) => {
    const formatted = formatPrice(e.target.value);
    setForm({ ...form, price: formatted });
  };

  const toggleSize = (size) => {
    const nextSizes = form.sizes.includes(size)
      ? form.sizes.filter((s) => s !== size)
      : [...form.sizes, size];

    const nextSizeStock = { ...(form.sizeStock || {}) };

    // Remove stock entries for removed sizes
    for (const k of Object.keys(nextSizeStock)) {
      if (!nextSizes.includes(k)) delete nextSizeStock[k];
    }

    // Add stock entries for newly selected sizes
    for (const s of nextSizes) {
      if (nextSizeStock[s] == null) nextSizeStock[s] = 0;
    }

    const total = Object.values(nextSizeStock).reduce((sum, v) => sum + (Number(v) || 0), 0);

    setForm({ ...form, sizes: nextSizes, sizeStock: nextSizeStock, stock: total });
  };

  const setSizeStockValue = (size, value) => {
    const nextSizeStock = { ...(form.sizeStock || {}) };
    nextSizeStock[size] = Math.max(0, Number(value) || 0);
    const total = Object.values(nextSizeStock).reduce((sum, v) => sum + (Number(v) || 0), 0);
    setForm((prev) => ({ ...prev, sizeStock: nextSizeStock, stock: total }));
  };

  const handleUploadImage = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return null;
    
    try {
      const fd = new FormData();
      fd.append("file", file);
      
      const token = localStorage.getItem("authToken");
      const headers = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      
      const uploadUrl = API_BASE ? `${API_BASE}/api/upload` : '/api/upload';
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: headers,
        body: fd,
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || `Upload failed: ${res.status}`);
      }
      
      const data = await res.json();
      if (!data.url) throw new Error('No URL returned from upload');
      return data.url;
    } catch (err) {
      console.error('Upload error:', err);
      throw err;
    }
  };

  const handleUploadGlb = async () => {
    const file = glbRef.current?.files?.[0];
    if (!file) return null;

    const fd = new FormData();
    fd.append("file", file);

    const res = await authFetch("/api/upload/glb", {
      method: "POST",
      body: fd,
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || "GLB upload failed");
    }

    const data = await res.json();
    return data.url;
  };

  const handleUploadWorldImage = async () => {
    const file = worldImageFileRef.current?.files?.[0];
    if (!file) return alert("Please select an image");

    setUploadingWorldImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      
      const token = localStorage.getItem("authToken");
      const headers = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      
      const uploadUrl = API_BASE ? `${API_BASE}/api/world-images/upload` : '/api/world-images/upload';
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: headers,
        body: fd,
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || `Upload failed: ${res.status}`);
      }
      
      const data = await res.json();
      if (!data.url && !data.success) {
        throw new Error('No URL returned from upload');
      }
      
      await loadWorldImages();
      if (worldImageFileRef.current) worldImageFileRef.current.value = null;
      alert('✓ Image uploaded successfully!');
    } catch (err) {
      console.error('World image upload error:', err);
      alert("Upload failed: " + err.message);
    } finally {
      setUploadingWorldImage(false);
    }
  };

  const handleSave = async () => {
    setErrors([]);
    
    // Upload image first if a new file is selected
    let imageUrl = form.imageUrl;
    if (fileRef.current?.files?.length) {
      try {
        imageUrl = await handleUploadImage();
        if (!imageUrl) {
          setErrors(["Image upload failed"]);
          return;
        }
      } catch (err) {
        setErrors(["Image upload failed: " + err.message]);
        return;
      }
    }

    // Upload GLB if selected
    let glbUrl = form.glbUrl;
    if (glbRef.current?.files?.length) {
      try {
        glbUrl = await handleUploadGlb();
      } catch (e) {
        alert("GLB upload failed: " + e.message);
        return;
      }
    }

    const payload = { 
      code: (form.code || '').trim() || undefined,
      name: form.name, 
      price: form.price, 
      desc: form.desc, 
      sizes: form.sizes, 
      stock: Number(form.stock) || 0, 
      available: (Number(form.stock) || 0) > 0, 
      preOrder: !!form.preOrder,
      imageUrl: imageUrl, // Use the uploaded or existing imageUrl
      glbUrl: glbUrl, // Use the uploaded or existing glbUrl
      sizeStock: form.sizeStock || {},
    };
    
    const v = validateProduct(payload);
    if (v.length) return setErrors(v);

    try {
      setLoading(true);
      const body = { ...payload };

      let res;
      if (editing) {
        res = await authFetch(`/api/products/${editing}`, { 
          method: "PUT", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify(body) 
        });
      } else {
        res = await authFetch(`/api/products`, { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify(body) 
        });
      }

      if (!res.ok) throw new Error("Save failed");
      await loadProducts();
      beginCreate();
      setActiveTab("inventory");
      if (fileRef.current) fileRef.current.value = null;
      if (glbRef.current) fileRef.current.value = null;
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product? This action cannot be undone.")) return;
    try {
      setLoading(true);
      const res = await authFetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await loadProducts();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWorldImage = async (id) => {
    if (!window.confirm("Delete this image? This action cannot be undone.")) return;
    try {
      const res = await authFetch(`/api/world-images/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await loadWorldImages();
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  };

  const downloadOrdersExcelAdvanced = () => {
    if (orders.length === 0) return alert("No orders to download");

    try {
      // Prepare worksheet data
      const headers = [
        "Order ID",
        "Customer Name",
        "Email",
        "Phone",
        "Address",
        "City",
        "Pincode",
        "Payment Method",
        "Total Amount",
        "Items",
        "Order Date",
      ];

      const rows = orders.map((order) => {
        const items = order.items
          .map((item) => `${item.name} (Size: ${item.size}, Qty: ${item.qty})`)
          .join(" | ");
        const date = new Date(order.createdAt).toLocaleString();

        return [
          order.id,
          order.customerName || "N/A",
          order.email || "N/A",
          order.phone || "N/A",
          order.address || "N/A",
          order.city || "N/A",
          order.pincode || "N/A",
          order.paymentMethod || "N/A",
          order.total || 0,
          items,
          date,
        ];
      });

      // Create simple Excel-like CSV with better formatting
      let csvContent = headers.map((h) => `"${h}"`).join(",") + "\n";
      rows.forEach((row) => {
        csvContent += row.map((cell) => `"${cell}"`).join(",") + "\n";
      });

      const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `orders-${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert("✓ Orders downloaded successfully!");
    } catch (err) {
      alert("Download failed: " + err.message);
    }
  };

  const handleUpdateOrderStatus = async (orderId, orderStatus, paymentStatus, paymentMeta = {}) => {
    try {
      const res = await authFetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus, paymentStatus, ...paymentMeta }),
      });

      if (!res.ok) {
        const ct = res.headers.get('content-type') || '';
        const payload = ct.includes('application/json')
          ? await res.json().catch(() => ({}))
          : await res.text().catch(() => '');
        const message = typeof payload === 'string'
          ? payload
          : (payload && (payload.error || payload.message)) || `HTTP ${res.status}`;
        throw new Error(message || "Failed to update status");
      }

      await loadOrders();
      alert("✓ Order status updated successfully!");
    } catch (err) {
      alert("Failed to update status: " + (err?.message || String(err)));
    }
  };

  const dismissNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (adminConfigured === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9f9f9' }}>
        <div style={{ padding: 40, background: '#fff', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>⏳ Checking admin status...</div>
        </div>
      </div>
    );
  }

  if (!adminConfigured) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f9f9f9 0%, #e0e0e0 100%)' }}>
        <form onSubmit={handleSetup} style={{ width: 420, padding: 40, background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: 28, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Setup Admin</h2>
          <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>Create your admin account to get started</p>
          
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Username</label>
            <input value={setupUser} onChange={(e) => setSetupUser(e.target.value)} placeholder="Enter username" required style={{ width: '100%', padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Password</label>
            <input value={setupPass} onChange={(e) => setSetupPass(e.target.value)} placeholder="Enter password" type="password" required style={{ width: '100%', padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          </div>

          <button className="action-btn primary" type="submit" disabled={setupBusy} style={{ width: '100%', padding: 14, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>{setupBusy ? '⏳ Creating...' : '✓ Create Admin'}</button>
        </form>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f9f9f9 0%, #e0e0e0 100%)' }}>
        <form onSubmit={handleLogin} style={{ width: 420, padding: 40, background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: 28, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Admin Sign In</h2>
          <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>Enter your credentials to access the dashboard</p>
          
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Username</label>
            <input name="username" placeholder="Enter username" required style={{ width: '100%', padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Password</label>
            <input name="password" placeholder="Enter password" type="password" required style={{ width: '100%', padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          </div>

          <button className="action-btn primary" type="submit" style={{ width: '100%', padding: 14, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Sign In</button>
        </form>
      </div>
    );
  }

  return (
<div
  style={{
    minHeight: '100vh',
    background: '#f9f9f9',
    paddingBottom: 40,
    overflowY: 'auto',
    overflowX: 'hidden',
    maxHeight: '100vh'  
  }}
>
      {/* Side Settings Tab */}
      <div
        style={{
          position: 'fixed',
          top: 140,
          right: 0,
          zIndex: 9998,
          display: 'flex',
          alignItems: 'stretch',
          pointerEvents: 'auto',
        }}
      >
        {/* handle */}
        <button
          type="button"
          onClick={() => setSettingsOpen((s) => !s)}
          style={{
            width: 44,
            border: 'none',
            background: '#000',
            color: '#fff',
            cursor: 'pointer',
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: 1,
            textTransform: 'uppercase',
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
          }}
          title="Checkout settings"
        >
          {settingsOpen ? 'Close' : 'Settings'}
        </button>

        {/* panel */}
        <div
          style={{
            width: settingsOpen ? 320 : 0,
            overflow: 'hidden',
            transition: 'width 220ms ease',
            background: '#fff',
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
            boxShadow: '0 10px 40px rgba(0,0,0,0.18)',
            border: '1px solid #eee',
            borderRight: 'none',
          }}
        >
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase' }}>
              Checkout Settings
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#666', lineHeight: 1.4 }}>
              Controls the shipping amount shown on checkout and used for COD partial payment.
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 900, color: '#666', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Shipping (₹)
              </label>
              <input
                type="number"
                min={0}
                value={shippingCharge}
                onChange={(e) => setShippingCharge(e.target.value)}
                style={{ width: '100%', marginTop: 8, padding: '12px 12px', border: '1px solid #e0e0e0', borderRadius: 10, fontSize: 14, fontWeight: 900 }}
                disabled={settingsLoading || shippingSaving}
              />

              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={saveShippingCharge}
                  disabled={settingsLoading || shippingSaving}
                  style={{
                    flex: 1,
                    padding: '12px 12px',
                    background: '#000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    cursor: settingsLoading || shippingSaving ? 'not-allowed' : 'pointer',
                    opacity: settingsLoading || shippingSaving ? 0.7 : 1,
                  }}
                >
                  {shippingSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={loadSettings}
                  disabled={settingsLoading || shippingSaving}
                  style={{
                    padding: '12px 12px',
                    background: 'transparent',
                    color: '#111',
                    border: '1px solid #e0e0e0',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    cursor: settingsLoading || shippingSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  Refresh
                </button>
              </div>
            </div>

            {shippingError ? (
              <div style={{ marginTop: 10, color: '#b00020', fontSize: 12, fontWeight: 900 }}>
                {shippingError}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Floating Notifications */}
      <div style={{
        position: 'fixed',
        top: 80,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxWidth: 400,
      }}>
        {notifications.map((notif) => (
          <div
            key={notif.id}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#fff',
              padding: 20,
              borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              animation: 'slideIn 0.3s ease-out',
              position: 'relative',
            }}
          >
            <button
              onClick={() => dismissNotification(notif.id)}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: '#fff',
                borderRadius: '50%',
                width: 24,
                height: 24,
                cursor: 'pointer',
                fontSize: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, letterSpacing: 0.5 }}>
              🎉 NEW ORDER!
            </div>
            <div style={{ fontSize: 14, marginBottom: 4 }}>
              <strong>{notif.customerName}</strong>
            </div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>
              Order ID: #{notif.orderId}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>
              ₹{notif.total} • {notif.itemCount} item{notif.itemCount > 1 ? 's' : ''}
            </div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '16px 40px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' }}>BACKLOG ADMIN</h1>
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: '1px solid #ddd',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              cursor: 'pointer',
              color: '#333'
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 40px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 32, borderBottom: '2px solid #e0e0e0', paddingBottom: 16, overflowX: 'auto' }}>
          <button
            onClick={() => {
              setActiveTab("inventory");
              setSearchQuery("");
            }}
            style={{
              padding: '12px 24px',
              background: activeTab === "inventory" ? '#000' : 'transparent',
              color: activeTab === "inventory" ? '#fff' : '#666',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 1,
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.3s',
              whiteSpace: 'nowrap'
            }}
          >
            📦 Inventory ({products.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("create");
              beginCreate();
            }}
            style={{
              padding: '12px 24px',
              background: activeTab === "create" ? '#000' : 'transparent',
              color: activeTab === "create" ? '#fff' : '#666',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 1,
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.3s',
              whiteSpace: 'nowrap'
            }}
          >
            {editing ? '✏️ Edit Product' : '➕ New Product'}
          </button>
          <button
            onClick={() => setActiveTab("world-images")}
            style={{
              padding: '12px 24px',
              background: activeTab === "world-images" ? '#000' : 'transparent',
              color: activeTab === "world-images" ? '#fff' : '#666',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 1,
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.3s',
              whiteSpace: 'nowrap'
            }}
          >
            🌍 World Images ({worldImages.length})
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            style={{
              padding: '12px 24px',
              background: activeTab === "orders" ? '#000' : 'transparent',
              color: activeTab === "orders" ? '#fff' : '#666',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 1,
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.3s',
              whiteSpace: 'nowrap'
            }}
          >
            📋 Orders ({orders.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("stats");
              loadProductStats();
            }}
            style={{
              padding: '12px 24px',
              background: activeTab === "stats" ? '#000' : 'transparent',
              color: activeTab === "stats" ? '#fff' : '#666',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 1,
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.3s',
              whiteSpace: 'nowrap'
            }}
          >
            📈 Stats
          </button>
          <button
            onClick={() => {
              setActiveTab('preorders');
              loadPreOrders();
            }}
            style={{
              padding: '12px 24px',
              background: activeTab === 'preorders' ? '#000' : 'transparent',
              color: activeTab === 'preorders' ? '#fff' : '#666',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 1,
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.3s',
              whiteSpace: 'nowrap'
            }}
          >
            🧾 Pre-orders ({preOrders.length})
          </button>
        </div>

        {/* INVENTORY TAB */}
        {activeTab === "inventory" && (
          <div style={{ background: '#fff', padding: 32, borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>All Products</h2>
              <input placeholder="🔍 Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: '100%', maxWidth: 300, padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, marginLeft: 24 }} />
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>⏳ Loading products...</div>
            ) : filteredProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>No products found</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {filteredProducts.map((p) => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 20, alignItems: 'center', padding: 16, background: '#f9f9f9', borderRadius: 12, border: '1px solid #f0f0f0', transition: 'all 0.2s' }}>
                    {/* Image */}
                    <div>
                      {p.imageUrl ? (
                        <img 
                          src={p.imageUrl.startsWith('http') ? p.imageUrl : `${API_BASE}${p.imageUrl}`} 
                          alt={p.name} 
                          style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8 }} 
                          onError={(e) => {
                            console.error("Image load error:", p.name, p.imageUrl);
                            e.target.onerror = null;
                            e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect fill='%23e0e0e0' width='120' height='120'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%23999' style='font-size:12px'%3ENo Image%3C/text%3E%3C/svg%3E";
                          }}
                        />
                      ) : (
                        <div style={{ width: 120, height: 120, background: '#e0e0e0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 12 }}>No Image</div>
                      )}
                    </div>

                    {/* Details */}
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6, textTransform: 'uppercase' }}>{p.name}</div>
                      <div style={{ color: '#666', fontSize: 12, marginBottom: 6 }}>
                        <span style={{ fontWeight: 800 }}>Item ID:</span> {getProductDisplayId(p)}
                      </div>
                      <div style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>{p.desc}</div>
                      <div style={{ display: 'flex', gap: 20, fontSize: 12, marginBottom: 10 }}>
                        <div><span style={{ fontWeight: 700 }}>Price:</span> ₹{p.price}</div>
                        <div><span style={{ fontWeight: 700 }}>Stock:</span> {p.stock || 0}</div>
                        <div><span style={{ fontWeight: 700 }}>Status:</span> <span style={{ color: p.stock > 0 ? '#0a7a0a' : '#b00020', fontWeight: 600 }}>{p.stock > 0 ? '✓ In Stock' : '✕ Out of Stock'}</span></div>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div><span style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>SIZES:</span> <span style={{ fontSize: 12, fontWeight: 600 }}>{(p.sizes || []).join(', ')}</span></div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                      <button className="action-btn secondary" onClick={() => beginEdit(p)} style={{ fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: 10, fontSize: 12 }}>Edit</button>
                      <button className="action-btn" onClick={() => handleDelete(p.id)} style={{ background: '#ff6b6b', color: '#fff', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: 10, border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CREATE/EDIT TAB */}
        {activeTab === "create" && (
          <div style={{ background: '#fff', padding: 32, borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h2 style={{ margin: '0 0 24px 0', fontSize: 20, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>
              {editing ? '✏️ Edit Product' : '➕ Create New Product'}
            </h2>

            {/* Basic Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' }}>Product Name</label>
                <input placeholder="e.g. Premium Backpack" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: '100%', padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' }}>Price</label>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', background: '#fff' }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#000', marginRight: 8 }}>₹</span>
                  <input placeholder="999" value={form.price} onChange={handlePriceChange} style={{ flex: 1, padding: 12, border: 'none', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} type="number" min="0" />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' }}>Stock Quantity</label>
                <input placeholder="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) || 0 })} style={{ width: '100%', padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} type="number" min="0" />
              </div>
            </div>

            {/* Pre-order Toggle */}
            <div style={{ marginBottom: 24, padding: 16, borderRadius: 12, background: '#f9f9f9', border: '1px solid #eee' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, color: '#666', marginBottom: 6 }}>Pre-order</div>
                  <div style={{ fontSize: 13, color: '#333', fontWeight: 600 }}>
                    If enabled, users will see a “Pre-order” button instead of Add to cart / Buy now.
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={!!form.preOrder}
                    onChange={(e) => setForm((prev) => ({ ...prev, preOrder: e.target.checked }))}
                    style={{ width: 20, height: 20, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                    {form.preOrder ? 'On' : 'Off'}
                  </span>
                </label>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' }}>Description</label>
              <input placeholder="Brief product description" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} style={{ width: '100%', padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
            </div>

            {/* Item ID */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' }}>Item ID (Code)</label>
              <input placeholder="e.g. SKU12345" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={{ width: '100%', padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
            </div>

            {/* Sizes */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' }}>Available Sizes</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {AVAILABLE_SIZES.map(size => (
                  <label key={size} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 10, border: form.sizes.includes(size) ? '2px solid #000' : '2px solid #e0e0e0', borderRadius: 8, background: form.sizes.includes(size) ? '#f9f9f9' : '#fff', transition: 'all 0.2s' }}>
                    <input
                      type="checkbox"
                      checked={form.sizes.includes(size)}
                      onChange={() => toggleSize(size)}
                      style={{ cursor: 'pointer', width: 18, height: 18 }}
                    />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{size}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Size Stock */}
            {form.sizes.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' }}>Stock per Size</label>
                <div style={{ display: 'grid', gap: 12 }}>
                  {form.sizes.map((size) => (
                    <div key={size} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, width: 50 }}>{size}</div>
                      <input
                        type="number"
                        min="0"
                        value={form.sizeStock[size] || 0}
                        onChange={(e) => setSizeStockValue(size, e.target.value)}
                        style={{ flex: 1, padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Image Upload */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' }}>Product Image</label>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <input type="file" ref={fileRef} accept="image/*" style={{ display: 'block', width: '100%', padding: 12, border: '2px dashed #e0e0e0', borderRadius: 8, cursor: 'pointer' }} />
                </div>
                {form.imageUrl && (
                  <img src={form.imageUrl} alt="preview" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid #e0e0e0' }} />
                )}
              </div>
            </div>

            {/* Product 3D Model (GLB) */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' }}>
                Product 3D Model (.glb) <span style={{ color: '#b00020' }}>* IMPORTANT</span>
              </label>

              <div style={{
                background: '#fff7e6',
                border: '1px solid #ffd591',
                borderLeft: '4px solid #fa8c16',
                padding: 12,
                borderRadius: 10,
                marginBottom: 12,
                color: '#7a4b00',
                fontSize: 12,
                lineHeight: 1.4,
              }}>
                Uploading a GLB is highly recommended for best 3D experience on the Shop page.
                If you skip this, the Shop will show the default legacy 3D tile.
              </div>

              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <input
                    type="file"
                    ref={glbRef}
                    accept=".glb,model/gltf-binary"
                    style={{ display: 'block', width: '100%', padding: 12, border: '2px dashed #e0e0e0', borderRadius: 8, cursor: 'pointer' }}
                  />
                  <div style={{ marginTop: 8, fontSize: 12, color: '#777' }}>
                    Optional. If empty, the legacy 3D tile will be used.
                  </div>

                  {form.glbUrl && (
                    <button
                      type="button"
                      className="action-btn secondary"
                      onClick={() => {
                        if (!window.confirm('Remove the attached model and revert to legacy 3D tile?')) return;
                        setForm((prev) => ({ ...prev, glbUrl: null }));
                        if (glbRef.current) glbRef.current.value = null;
                      }}
                      style={{ marginTop: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', padding: 10 }}
                    >
                      Clear Model
                    </button>
                  )}
                </div>
                <div style={{ width: 240 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 6 }}>Current Model</div>
                  <div style={{ fontSize: 12, color: form.glbUrl ? '#0a7a0a' : '#999' }}>
                    {form.glbUrl ? '✓ Custom GLB attached' : '— Legacy 3D tile'}
                  </div>
                  {form.glbUrl && (
                    <a
                      href={form.glbUrl.startsWith('http') ? form.glbUrl : `${API_BASE}${form.glbUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'inline-block', marginTop: 8, fontSize: 12 }}
                    >
                      Preview file
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div style={{ background: '#ffe0e0', padding: 16, borderRadius: 8, marginBottom: 20, borderLeft: '4px solid #b00020' }}>
                {errors.map((e, i) => <div key={i} style={{ color: '#b00020', fontSize: 13, marginBottom: i < errors.length - 1 ? 6 : 0 }}>• {e}</div>)}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="action-btn primary" onClick={handleSave} type="button" style={{ flex: 1, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', padding: 14 }}>{editing ? '✓ Update' : '✓ Create'}</button>
              <button className="action-btn secondary" onClick={() => { setActiveTab("inventory"); beginCreate(); }} type="button" style={{ fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', padding: 14 }}>Cancel</button>
            </div>
          </div>
        )}

        {/* WORLD IMAGES TAB */}
        {activeTab === "world-images" && (
          <div style={{ background: '#fff', padding: 32, borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h2 style={{ margin: '0 0 24px 0', fontSize: 20, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>World Page Images</h2>
            
            {/* Upload Section */}
            <div style={{ background: '#f9f9f9', padding: 24, borderRadius: 12, marginBottom: 32, border: '2px dashed #e0e0e0' }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' }}>Upload Image for World Page</label>
                <input type="file" ref={worldImageFileRef} accept="image/*" style={{ display: 'block', width: '100%', padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, cursor: 'pointer', marginBottom: 12 }} />
              </div>
              <button 
                onClick={handleUploadWorldImage} 
                disabled={uploadingWorldImage}
                className="action-btn primary" 
                style={{ fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', padding: 12, width: '100%' }}
              >
                {uploadingWorldImage ? '⏳ Uploading...' : '✓ Upload Image'}
              </button>
            </div>

            {/* Images Grid */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>⏳ Loading images...</div>
            ) : worldImages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🌍</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>No world images uploaded yet</div>
                <p style={{ color: '#999', marginTop: 8 }}>Upload images above to display them on the World page</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
                {worldImages.map((img) => {
                  const imageUrl = img.imageUrl && img.imageUrl.startsWith('/')
                    ? `${API_BASE}${img.imageUrl}`
                    : img.imageUrl;
                  
                  return (
                    <div key={img.id} style={{ borderRadius: 12, overflow: 'hidden', background: '#f9f9f9', border: '1px solid #f0f0f0' }}>
                      <div style={{ width: '100%', height: 200, background: '#e0e0e0', overflow: 'hidden' }}>
                        <img 
                          src={imageUrl} 
                          alt={img.id} 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#999;fontSize:12px;">Image failed to load</div>';
                          }}
                        />
                      </div>
                      <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 4 }}>Uploaded</div>
                          <div style={{ fontSize: 11, color: '#999' }}>{new Date(img.createdAt).toLocaleDateString()}</div>
                        </div>
                        <button
                          onClick={() => handleDeleteWorldImage(img.id)}
                          style={{ background: '#ff6b6b', color: '#fff', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '8px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ORDERS TAB */}
        {activeTab === "orders" && (
          <div style={{ background: '#fff', padding: 32, borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Customer Orders</h2>
              <button
                onClick={downloadOrdersExcelAdvanced}
                style={{
                  padding: '12px 20px',
                  background: '#000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.3s'
                }}
              >
                📥 Download Excel
              </button>
            </div>

            {/* Orders sub-tabs */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setOrdersSubTab('partial')}
                style={{
                  padding: '10px 14px',
                  background: ordersSubTab === 'partial' ? '#000' : 'transparent',
                  color: ordersSubTab === 'partial' ? '#fff' : '#666',
                  border: '1px solid #e0e0e0',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Partial Paid
              </button>
              <button
                type="button"
                onClick={() => setOrdersSubTab('full')}
                style={{
                  padding: '10px 14px',
                  background: ordersSubTab === 'full' ? '#000' : 'transparent',
                  color: ordersSubTab === 'full' ? '#fff' : '#666',
                  border: '1px solid #e0e0e0',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Fully Paid
              </button>
            </div>
            
            {(() => {
              const isPartial = (o) => {
                const type = String(o.paymentType || '').toUpperCase();
                const status = String(o.paymentStatus || '').toLowerCase();
                const due = Number(o.amountDue || 0) || 0;
                return type === 'PARTIAL' || status.includes('partially') || due > 0;
              };
              const isFull = (o) => {
                const type = String(o.paymentType || '').toUpperCase();
                const status = String(o.paymentStatus || '').toLowerCase();
                const due = Number(o.amountDue || 0) || 0;
                return type === 'FULL' || status === 'paid' || status === 'completed' || due <= 0;
              };

              const filteredOrders = (orders || []).filter((o) => (ordersSubTab === 'partial' ? isPartial(o) : isFull(o)));

              const list = filteredOrders.slice().reverse();

              if (loading) {
                return <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>⏳ Loading orders...</div>;
              }

              if (!list.length) {
                return (
                  <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>No orders in this view</div>
                    <p style={{ color: '#999', marginTop: 8 }}>Switch tabs to see other orders.</p>
                  </div>
                );
              }

              return (
                <div style={{ display: 'grid', gap: 16 }}>
                  {list.map((order) => {
                    const isExpanded = expandedOrders[order.id];

                    return (
                      <div key={order.id} style={{ padding: 24, background: '#f9f9f9', borderRadius: 16, border: '2px solid #f0f0f0', transition: 'all 0.2s' }}>
                        {/* Collapsed View - Clickable Header */}
                        <div 
                          onClick={() => toggleOrderExpansion(order.id)}
                          style={{ 
                            display: 'grid', 
                            gridTemplateColumns: '1fr 1fr 1fr auto', 
                            gap: 20, 
                            alignItems: 'center',
                            cursor: 'pointer',
                            padding: isExpanded ? '0 0 20px 0' : 0,
                            marginBottom: isExpanded ? 20 : 0,
                            borderBottom: isExpanded ? '2px solid #e0e0e0' : 'none'
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Order ID</div>
                            <div style={{ fontSize: 15, fontWeight: 800 }}>#{order.id}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Amount</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#0a7a0a' }}>₹{order.total || 0}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Customer</div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{order.customerName || 'N/A'}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              {isExpanded ? '▼ Collapse' : '▶ Expand'}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{new Date(order.createdAt).toLocaleDateString()}</div>
                          </div>
                        </div>

                        {/* Expanded View - Show full details */}
                        {isExpanded && (
                          <div>
                            {/* Status Management */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, padding: 16, background: '#fff', borderRadius: 12 }}>
                              <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Order Status</label>
                                <select
                                  value={order.orderStatus || "Order Placed"}
                                  onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value, order.paymentStatus)}
                                  style={{
                                    width: '100%',
                                    padding: 12,
                                    border: '2px solid #e0e0e0',
                                    borderRadius: 8,
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: '#fff',
                                  }}
                                >
                                  {ORDER_STATUSES.map(status => (
                                    <option key={status} value={status}>{status}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Payment Status</label>
                                <select
                                  value={order.paymentStatus || "Pending"}
                                  onChange={(e) => handleUpdateOrderStatus(order.id, order.orderStatus, e.target.value, {
                                    paymentType: order.paymentType,
                                    partialPaidAmount: order.partialPaidAmount,
                                    amountDue: order.amountDue,
                                  })}
                                  style={{
                                    width: '100%',
                                    padding: 12,
                                    border: '2px solid #e0e0e0',
                                    borderRadius: 8,
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: '#fff',
                                  }}
                                >
                                  {PAYMENT_STATUSES.map(status => (
                                    <option key={status} value={status}>{status}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Payment Method */}
                            <div style={{ marginBottom: 20, padding: 16, background: '#fff', borderRadius: 12 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Payment</div>
                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, background: '#e8f5e9', padding: '6px 12px', borderRadius: 6, display: 'inline-block' }}>
                                  {order.paymentMethod || 'COD'}
                                </div>
                                {order.paymentType && (
                                  <div style={{ fontSize: 12, fontWeight: 800, background: '#f4f4f4', padding: '6px 10px', borderRadius: 6, display: 'inline-block' }}>
                                    {String(order.paymentType).toUpperCase()}
                                  </div>
                                )}
                                {order.paymentType === 'PARTIAL' && (
                                  <div style={{ fontSize: 12, color: '#333' }}>
                                    Paid: <strong>₹{Number(order.partialPaidAmount || 0)}</strong> • Due: <strong>₹{Number(order.amountDue || 0)}</strong>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Customer Details */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Name</div>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>{order.customerName || 'N/A'}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</div>
                                <div style={{ fontSize: 13 }}>{order.email || 'N/A'}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</div>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>{order.phone || 'N/A'}</div>
                              </div>
                            </div>

                            {/* Address */}
                            <div style={{ marginBottom: 20 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Delivery Address</div>
                              <div style={{ fontSize: 14, background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e0e0e0' }}>
                                {order.address || 'N/A'}, {order.city || ''}, {order.state || ''} - {order.pincode || ''}
                              </div>
                            </div>

                            {/* Items */}
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Items Ordered</div>
                              <div style={{ display: 'grid', gap: 10 }}>
                                {(order.items || []).map((item, idx) => (
                                  <div key={idx} style={{ padding: 12, background: '#fff', borderRadius: 8, fontSize: 13, border: '1px solid #e0e0e0', display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 12, alignItems: 'center' }}>
                                    {item.imageUrl && (
                                      <img 
                                        src={item.imageUrl.startsWith('http') ? item.imageUrl : `${API_BASE}${item.imageUrl}`}
                                        alt={item.name}
                                        style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }}
                                      />
                                    )}
                                    <div>
                                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.name}</div>
                                      <div style={{ color: '#666', fontSize: 12 }}>
                                        Item ID: <strong>{item.code || item.id}</strong> • Size: <strong>{item.size}</strong> • Qty: <strong>{item.qty}</strong>
                                      </div>
                                    </div>
                                    <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 15 }}>
                                      ₹{item.price * item.qty}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* PRE-ORDERS TAB */}
        {activeTab === 'preorders' && (
          <div style={{ background: '#fff', padding: 32, borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Pre-orders</h2>
                <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>Shows customer email + product they requested (pre-booked)</div>
              </div>
              <button
                onClick={() => loadPreOrders()}
                style={{
                  padding: '10px 14px',
                  background: '#000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
                disabled={preOrdersLoading}
              >
                {preOrdersLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {preOrdersError ? (
              <div style={{ background: '#ffe0e0', padding: 16, borderRadius: 8, marginBottom: 20, borderLeft: '4px solid #b00020', color: '#b00020', fontSize: 13 }}>
                {preOrdersError}
              </div>
            ) : null}

            {preOrdersLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>⏳ Loading pre-orders...</div>
            ) : preOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>No pre-orders yet</div>
                <p style={{ color: '#999', marginTop: 8 }}>When customers pre-book an item, it will appear here.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {preOrders.map((po) => (
                  <div
                    key={po.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 1fr 120px 90px 150px',
                      gap: 12,
                      alignItems: 'center',
                      padding: 14,
                      background: '#f9f9f9',
                      borderRadius: 12,
                      border: '1px solid #f0f0f0',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{po.email}</div>
                      <div style={{ marginTop: 6, fontSize: 11, color: '#999' }}>{po.id}</div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>Product</div>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{po.productName || '—'}</div>
                      <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>Item ID: <strong>{po.productId}</strong></div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>Size</div>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{po.size || '—'}</div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>Qty</div>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{po.qty || 1}</div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>Created</div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{po.createdAt ? new Date(po.createdAt).toLocaleString() : '—'}</div>
                      <button
                        onClick={() => resendPreOrderEmail(po.id)}
                        className="action-btn secondary"
                        style={{ marginTop: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', padding: '10px 12px', fontSize: 11 }}
                        type="button"
                      >
                        Re-send Email
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STATS TAB */}
        {activeTab === "stats" && (
          <div style={{ background: '#fff', padding: 32, borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Product Leaderboard</h2>
                <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>Based on orders in the last {statsDays} day(s)</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: 0.6 }}>Range</label>
                <select
                  value={statsDays}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 30;
                    setStatsDays(v);
                    loadProductStats(v);
                  }}
                  style={{ padding: '10px 12px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, fontWeight: 700, background: '#fff', cursor: 'pointer' }}
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                  <option value={365}>Last 365 days</option>
                  <option value={3650}>All time</option>
                </select>

                <button
                  onClick={() => loadProductStats()}
                  style={{
                    padding: '10px 14px',
                    background: '#000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                  disabled={statsLoading}
                >
                  {statsLoading ? 'Loading…' : 'Refresh'}
                </button>
              </div>
            </div>

            {statsLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>⏳ Loading stats...</div>
            ) : productStats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📈</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>No stats yet</div>
                <p style={{ color: '#999', marginTop: 8 }}>Place a few orders to see a leaderboard here.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {productStats.map((row, idx) => {
                  const imageUrl = row.imageUrl
                    ? (row.imageUrl.startsWith('http') ? row.imageUrl : `${API_BASE}${row.imageUrl}`)
                    : null;

                  return (
                    <div
                      key={row.productKey || idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '60px 1fr 140px 140px 140px',
                        gap: 16,
                        alignItems: 'center',
                        padding: 14,
                        borderRadius: 12,
                        border: '1px solid #f0f0f0',
                        background: idx < 3 ? '#fff7e6' : '#f9f9f9',
                      }}
                    >
                      <div style={{ width: 60, height: 60, borderRadius: 10, overflow: 'hidden', background: '#e0e0e0' }}>
                        {imageUrl ? (
                          <img src={imageUrl} alt={row.name || 'product'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 11 }}>No Image</div>
                        )}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 14, fontWeight: 900, textTransform: 'uppercase' }}>
                            #{idx + 1} {row.name || 'Unnamed product'}
                          </div>
                          {(row.code || row.productId) && (
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#666' }}>
                              ID: {row.code || row.productId}
                            </div>
                          )}
                          {row.preOrder ? (
                            <div style={{ fontSize: 11, fontWeight: 900, color: '#7a4b00', background: '#fff7e6', border: '1px solid #ffd591', padding: '2px 8px', borderRadius: 999 }}>
                              PRE-ORDER
                            </div>
                          ) : null}
                        </div>
                        {row.lastSoldAt && (
                          <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
                            Last sold: {new Date(row.lastSoldAt).toLocaleString()}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>Units</div>
                        <div style={{ fontSize: 18, fontWeight: 900 }}>{row.unitsSold || 0}</div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>Revenue</div>
                        <div style={{ fontSize: 18, fontWeight: 900 }}>₹{Math.round((row.revenue || 0) * 100) / 100}</div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>Orders</div>
                        <div style={{ fontSize: 18, fontWeight: 900 }}>{row.ordersCount || 0}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ...existing inventory and create tabs... */}
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @media (max-width: 1024px) {
          div[style*="gridTemplateColumns: '120px"] {
            grid-template-columns: 100px 1fr auto !important;
          }
        }

        @media (max-width: 768px) {
          div[style*="gridTemplateColumns: '120px"] {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          
          div[style*="maxWidth: 1400px"] {
            padding: 20px !important;
          }

          div[style*="display: 'flex', gap: 12, marginBottom: 32"] {
            overflow-x: auto !important;
          }
        }
      `}</style>
    </div>
  );
}
