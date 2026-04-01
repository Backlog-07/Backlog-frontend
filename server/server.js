const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = Number(process.env.PORT || 4000);

// Allow frontend to fetch images in a canvas-safe way
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

// IMPORTANT: set CORP so <img crossOrigin="anonymous"> can be drawn to canvas
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(__dirname, "uploads"))
);

// Legacy model URL support (e.g. "/models/t_shirt.glb")
app.get("/models/t_shirt.glb", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  return res.sendFile(path.join(__dirname, "..", "t_shirt.glb"));
});

// Ensure data directories exist
const dataDir = path.join(__dirname, "data");
const uploadsDir = path.join(__dirname, "uploads");
const worldImagesDir = path.join(__dirname, "uploads/world");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(worldImagesDir)) {
  fs.mkdirSync(worldImagesDir, { recursive: true });
}

// File paths
const dbFile = path.join(__dirname, "db.json");
const ordersFile = path.join(dataDir, "orders.json");
const worldImagesFile = path.join(dataDir, "worldImages.json");
const preOrdersFile = path.join(dataDir, "preOrders.json");

// In-memory data
let products = [];
let orders = [];
let worldImages = [];
let preOrders = [];

// Load data functions
function loadProducts() {
  try {
    if (fs.existsSync(dbFile)) {
      const data = fs.readFileSync(dbFile, "utf-8");
      const db = JSON.parse(data);
      products = Array.isArray(db.products) ? db.products : [];
    }
  } catch (err) {
    console.error("Error loading products from db.json:", err);
    products = [];
  }
}

function loadOrders() {
  try {
    if (fs.existsSync(ordersFile)) {
      const data = fs.readFileSync(ordersFile, "utf-8");
      orders = JSON.parse(data);
    }
  } catch (err) {
    console.error("Error loading orders:", err);
    orders = [];
  }
}

function loadWorldImages() {
  try {
    if (fs.existsSync(worldImagesFile)) {
      const data = fs.readFileSync(worldImagesFile, "utf-8");
      worldImages = JSON.parse(data);
    }
  } catch (err) {
    console.error("Error loading world images:", err);
    worldImages = [];
  }
}

function loadPreOrders() {
  try {
    if (fs.existsSync(preOrdersFile)) {
      const data = fs.readFileSync(preOrdersFile, "utf-8");
      preOrders = JSON.parse(data);
    }
  } catch (err) {
    console.error("Error loading pre-orders:", err);
    preOrders = [];
  }
}

// Save data functions
async function saveProducts() {
  try {
    await fs.promises.writeFile(productsFile, JSON.stringify(products, null, 2));
  } catch (err) {
    console.error("Error saving products:", err);
  }
}

async function saveOrders() {
  try {
    await fs.promises.writeFile(ordersFile, JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error("Error saving orders:", err);
  }
}

async function saveWorldImages() {
  try {
    await fs.promises.writeFile(worldImagesFile, JSON.stringify(worldImages, null, 2));
  } catch (err) {
    console.error("Error saving world images:", err);
  }
}

async function savePreOrders() {
  try {
    await fs.promises.writeFile(preOrdersFile, JSON.stringify(preOrders, null, 2));
  } catch (err) {
    console.error("Error saving pre-orders:", err);
  }
}

// SSE clients for real-time updates
let sseClients = [];
let adminSseClients = []; // Separate clients for admin notifications

function broadcastProducts() {
  sseClients.forEach((client) => {
    client.write(`event: products\n`);
    client.write(`data: ${JSON.stringify(products)}\n\n`);
  });
}

function notifyAdminsNewOrder(order) {
  console.log("Broadcasting new order to admins:", order.id);
  adminSseClients.forEach((client) => {
    try {
      client.write(`event: newOrder\n`);
      client.write(`data: ${JSON.stringify({
        orderId: order.id,
        customerName: order.customerName,
        total: order.total,
        itemCount: order.items.length,
        timestamp: order.createdAt
      })}\n\n`);
    } catch (err) {
      console.error("Error sending notification to admin:", err);
    }
  });
}

// Load initial data
loadProducts();
loadOrders();
loadWorldImages();
loadPreOrders();

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER, // your email
    pass: process.env.EMAIL_PASSWORD, // your email password or app password
  },
});

// Email template for order confirmation
function generateOrderEmail(order) {
  const customerName = order.customerName || order.name || "Customer";
  const shopUrl = process.env.SHOP_URL || process.env.PUBLIC_URL || "http://localhost:3000";

  const itemsList = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          <img src="${item.imageUrl || ''}" alt="${item.name}" style="width: 60px; height: 80px; object-fit: cover; border-radius: 4px;">
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          <strong>${item.name}</strong><br>
          <span style="color: #666; font-size: 14px;">Size: ${item.size || 'N/A'}</span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">
          ${item.qty}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
          ₹${item.price}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
          <strong>₹${Number(item.price || 0) * Number(item.qty || 0)}</strong>
        </td>
      </tr>
    `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #000; color: #fff; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #fff; padding: 30px; border: 1px solid #eee; }
        .order-details { margin: 20px 0; }
        .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .total { background: #f9f9f9; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        .button { display: inline-block; padding: 12px 30px; background: #000; color: #fff; text-decoration: none; border-radius: 6px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">Thank You for Your Order!</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Order Confirmation</p>
        </div>
        
        <div class="content">
          <p>Hi ${customerName},</p>
          
          <p>Thank you for shopping with <strong>Backlog</strong>! We're excited to confirm your order.</p>
          
          <div class="order-details">
            <h3>Order Details</h3>
            <p><strong>Order ID:</strong> #${order.id}</p>
            <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString('en-IN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</p>
          </div>

          <h3>Items Ordered</h3>
          <table class="items-table">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 12px; text-align: left;">Image</th>
                <th style="padding: 12px; text-align: left;">Product</th>
                <th style="padding: 12px; text-align: center;">Qty</th>
                <th style="padding: 12px; text-align: right;">Price</th>
                <th style="padding: 12px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsList}
            </tbody>
          </table>

          <div class="total">
            <table style="width: 100%;">
              <tr>
                <td><strong>Total Amount:</strong></td>
                <td style="text-align: right;"><h2 style="margin: 0; color: #000;">₹${order.total}</h2></td>
              </tr>
            </table>
          </div>

          <h3>Shipping Address</h3>
          <div style="background: #f9f9f9; padding: 15px; border-radius: 6px; margin: 10px 0;">
            <p style="margin: 5px 0;"><strong>${customerName}</strong></p>
            <p style="margin: 5px 0;">${order.address || ''}</p>
            <p style="margin: 5px 0;">${order.city || ''}, ${order.state || ''} - ${order.pincode || ''}</p>
            <p style="margin: 5px 0;">Phone: ${order.phone || ''}</p>
            <p style="margin: 5px 0;">Email: ${order.email || ''}</p>
          </div>

          <p style="margin-top: 30px;">Your order is being processed and will be shipped soon. We'll send you another email with tracking information once it's on its way.</p>

          <center>
            <a href="${shopUrl}" class="button">Continue Shopping</a>
          </center>
        </div>

        <div class="footer">
          <p><strong>Backlog</strong></p>
          <p>Thank you for shopping with us!</p>
          <p style="font-size: 12px; color: #999;">If you have any questions, please contact us.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Send order confirmation email
async function sendOrderConfirmationEmail(order) {
  try {
    // Skip email if credentials not configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.log('Email credentials not configured. Skipping email for order #' + order.id);
      return true;
    }

    const mailOptions = {
      from: `"Backlog" <${process.env.EMAIL_USER}>`,
      to: order.email,
      subject: `Order Confirmation - #${order.id} - Backlog`,
      html: generateOrderEmail(order),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

function generatePreOrderEmail(preOrder, product) {
  const productName = product?.name || preOrder.productName || "Item";
  const productId = product?.code || product?.id || preOrder.productId;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #000; color: #fff; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #fff; padding: 24px; border: 1px solid #eee; border-radius: 0 0 8px 8px; }
        .badge { display: inline-block; padding: 6px 10px; background: #fff7e6; border: 1px solid #ffd591; border-radius: 999px; font-size: 12px; font-weight: 700; color: #7a4b00; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">Pre-order Confirmed</h1>
        </div>
        <div class="content">
          <p><span class="badge">PRE-ORDER</span></p>
          <p>Hi,</p>
          <p>We’ve received your pre-order request for:</p>
          <p style="font-size: 18px; font-weight: 800; margin: 10px 0;">${productName}</p>
          <p><strong>Item ID:</strong> ${productId}</p>
          <p><strong>Requested size:</strong> ${preOrder.size || "N/A"}</p>
          <p><strong>Quantity:</strong> ${preOrder.qty || 1}</p>
          <p style="margin-top: 18px;">We’ll email you when it becomes available or when we’re ready to proceed.</p>
          <p style="color:#666; font-size: 13px;">Pre-order reference: ${preOrder.id}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function sendPreOrderConfirmationEmail(preOrder, product) {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.log('Email credentials not configured. Skipping pre-order email for ' + preOrder.id);
      return true;
    }

    const subjectName = product?.name || preOrder.productName || 'Item';
    const mailOptions = {
      from: `"Backlog" <${process.env.EMAIL_USER}>`,
      to: preOrder.email,
      subject: `Pre-order Confirmation - ${subjectName}`,
      html: generatePreOrderEmail(preOrder, product),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Pre-order email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending pre-order email:', error);
    return false;
  }
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = req.path.includes('world') ? worldImagesDir : uploadsDir;
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// Simple auth middleware for admin uploads (matches AdminPanel usage)
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";

  // Accept env token (legacy)
  const envToken = process.env.AUTH_TOKEN;
  if (envToken && auth === `Bearer ${envToken}`) return next();
  // Back-compat default only for local dev if AUTH_TOKEN not provided
  const fallbackToken = "admintoken12345";
  if (!envToken && auth === `Bearer ${fallbackToken}`) return next();

  // Accept db-stored admin token (used by AdminPanel login)
  try {
    const dbPath = path.join(__dirname, "db.json");
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, "utf8");
      const db = JSON.parse(raw);
      const dbToken = db && db.admin && db.admin.token;
      if (dbToken && auth === `Bearer ${dbToken}`) return next();
    }
  } catch (e) {
    // ignore
  }

  return res.status(401).json({ error: "Unauthorized" });
}

// Upload GLB model for a product
app.post("/api/upload/glb", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const ext = String(path.extname(req.file.originalname || "")).toLowerCase();
    if (ext !== ".glb") {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
      return res.status(400).json({ error: "Only .glb files are allowed" });
    }

    const url = `/uploads/${req.file.filename}`;
    return res.json({ url });
  } catch (e) {
    console.error("GLB upload failed:", e);
    return res.status(500).json({ error: "Upload failed" });
  }
});

// Get all products
app.get("/api/products", (req, res) => {
  res.json(products);
});

// Get single product
app.get("/api/products/:id", (req, res) => {
  const product = products.find(p => String(p.id) === String(req.params.id));
  if (product) {
    res.json(product);
  } else {
    res.status(404).json({ error: "Product not found" });
  }
});

// SSE endpoint for real-time product updates
app.get("/api/products/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  sseClients.push(res);

  res.write(`event: products\n`);
  res.write(`data: ${JSON.stringify(products)}\n\n`);

  req.on("close", () => {
    sseClients = sseClients.filter((client) => client !== res);
  });
});

// SSE endpoint for admin notifications
app.get("/api/admin/notifications", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  adminSseClients.push(res);
  console.log("Admin connected to notifications. Total admins:", adminSseClients.length);

  // Send initial connection confirmation
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ message: "Connected to admin notifications" })}\n\n`);

  req.on("close", () => {
    adminSseClients = adminSseClients.filter((client) => client !== res);
    console.log("Admin disconnected from notifications. Total admins:", adminSseClients.length);
  });
});

// Get all orders (ADMIN ONLY)
app.get("/api/orders", requireAuth, (req, res) => {
  res.json(orders);
});

// Public order lookup (for customers)
// Query by orderId + email OR orderId + phone
app.get("/api/orders/lookup", (req, res) => {
  const orderId = req.query.orderId;
  const email = req.query.email;
  const phone = req.query.phone;

  if (!orderId) return res.status(400).json({ error: "orderId required" });
  if (!email && !phone) return res.status(400).json({ error: "email or phone required" });

  const o = orders.find((x) => String(x.id) === String(orderId));
  if (!o) return res.status(404).json({ error: "Order not found" });

  const matchEmail = email && String(o.email || "").toLowerCase() === String(email).toLowerCase();
  const matchPhone = phone && String(o.phone || "") === String(phone);

  if (!matchEmail && !matchPhone) return res.status(404).json({ error: "Order not found" });

  // Return only safe customer-facing fields
  return res.json({
    id: o.id,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    orderStatus: o.orderStatus || o.status || "pending",
    paymentStatus: o.paymentStatus || "Pending",
    paymentMethod: o.paymentMethod || "COD",
    total: o.total,
    items: (o.items || []).map((it) => ({
      id: it.id,
      name: it.name,
      size: it.size,
      qty: it.qty,
      price: it.price,
      imageUrl: it.imageUrl,
    })),
    customerName: o.customerName || o.name,
    // show only last 4 digits of phone
    phoneLast4: o.phone ? String(o.phone).slice(-4) : null,
    email: o.email ? String(o.email).replace(/(.{2}).+(@.+)/, "$1***$2") : null,
  });
});

// Get world images
app.get("/api/world-images", (req, res) => {
  res.json(worldImages);
});

// Place order
app.post("/api/orders", async (req, res) => {
  console.log("Received order request:", req.body);
  try {
    const { items, total, name, email, phone, address, city, state, pincode, paymentMethod } = req.body;

    console.log("Order details:", { items, total, name, email });

    if (!items || items.length === 0) {
      console.log("Error: No items in order");
      return res.status(400).json({ error: "No items in order" });
    }

    // Validate stock BEFORE accepting order (supports sizeStock if present)
    const errors = [];
    for (const item of items) {
      const product = products.find((p) => String(p.id) === String(item.id));
      if (!product) {
        errors.push({ id: item.id, error: "Product not found" });
        continue;
      }

      const qty = Number(item.qty) || 0;
      if (qty <= 0) {
        errors.push({ id: item.id, error: "Invalid qty" });
        continue;
      }

      const size = item.size;
      if (product.sizeStock && size) {
        const available = Number(product.sizeStock?.[size]) || 0;
        if (available < qty) {
          errors.push({ id: item.id, size, error: "Out of stock" });
        }
      } else {
        const available = Number(product.stock) || 0;
        if (available < qty) {
          errors.push({ id: item.id, error: "Out of stock" });
        }
      }
    }

    if (errors.length) {
      return res.status(409).json({ error: "Some items unavailable", details: errors });
    }

    const orderId = Date.now();
    const newOrder = {
      id: orderId,
      items,
      total,
      customerName: name,
      email,
      phone,
      address,
      city,
      state,
      pincode,
      paymentMethod: paymentMethod || "COD",
      paymentStatus: (paymentMethod || "COD") === "COD" ? "Pending" : "Paid",
      status: "pending",
      orderStatus: "Order Placed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log("Saving order:", orderId);
    orders.push(newOrder);
    await saveOrders();
    console.log("Order saved successfully");

    // Notify admins of new order
    notifyAdminsNewOrder(newOrder);

    // Send order confirmation email (skip if not configured)
    try {
      await sendOrderConfirmationEmail(newOrder);
    } catch (emailError) {
      console.error("Email error (non-fatal):", emailError);
    }

    // Deduct stock for each item (supports sizeStock)
    for (const item of items) {
      const product = products.find((p) => String(p.id) === String(item.id));
      if (!product) continue;

      const qty = Number(item.qty) || 0;
      const size = item.size;

      if (product.sizeStock && size) {
        const current = Number(product.sizeStock?.[size]) || 0;
        product.sizeStock = Object.assign({}, product.sizeStock, {
          [size]: Math.max(0, current - qty),
        });

        // Keep a derived total stock for UI that relies on product.stock
        const sum = Object.values(product.sizeStock || {}).reduce((s, v) => s + (Number(v) || 0), 0);
        product.stock = sum;
        product.available = sum > 0;
      } else {
        product.stock = Math.max(0, (Number(product.stock) || 0) - qty);
        product.available = (Number(product.stock) || 0) > 0;
      }
    }

    await saveProducts();
    broadcastProducts();

    console.log("Order placed successfully:", orderId);
    res.json({ success: true, orderId, message: "Order placed successfully!" });
  } catch (err) {
    console.error("Error placing order:", err);
    res.status(500).json({ error: "Failed to place order", details: err.message });
  }
});

// Accept both :id and :orderId for status updates (compat route)
app.patch("/api/orders/:orderId/status", requireAuth, async (req, res) => {
  req.params.id = req.params.orderId;
  // Reuse the existing handler by delegating to the next matching route
  // (call next() so Express continues to the /api/orders/:id/status route below)
  return res.redirect(307, `/api/orders/${req.params.id}/status`);
});

// Update order status (ADMIN ONLY)
app.patch("/api/orders/:id/status", requireAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { orderStatus, paymentStatus } = req.body;

    const order = orders.find((o) => o.id === orderId);
    if (!order) {
      return res.status(404).send("Order not found");
    }

    if (orderStatus) order.orderStatus = orderStatus;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    order.updatedAt = new Date().toISOString();

    await saveOrders();
    console.log(`Order ${orderId} status updated:`, { orderStatus, paymentStatus });

    res.json({ success: true, order });
  } catch (err) {
    console.error("Error updating order status:", err);
    res.status(500).send("Failed to update order status");
  }
});

// Upload product (ADMIN ONLY)
app.post("/api/products", requireAuth, upload.single("image"), async (req, res) => {
  try {
    const { name, price, description, preOrder } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // Short, human-friendly product code (e.g., "BK-4F7Q2")
    // Keep this stable and unique for admin/order lookups.
    const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
    const makeCode = (len = 5) => {
      let out = "";
      for (let i = 0; i < len; i++) out += ALPH[Math.floor(Math.random() * ALPH.length)];
      return `BK-${out}`;
    };
    let productCode = makeCode(5);
    const existing = new Set((products || []).map((p) => String(p.code || p.id || "")));
    while (existing.has(productCode)) productCode = makeCode(5);

    const newProduct = {
      id: Date.now(),
      code: productCode,
      name,
      price: parseFloat(price),
      description: description || "",
      imageUrl,
      stock: 10,
      available: true,
      preOrder: String(preOrder).toLowerCase() === 'true',
    };

    products.push(newProduct);
    await saveProducts();
    broadcastProducts();

    console.log("Product created:", newProduct); // Debug log
    res.json(newProduct);
  } catch (err) {
    console.error("Error uploading product:", err);
    res.status(500).send("Failed to upload product");
  }
});

// Upload world image (ADMIN ONLY)
app.post("/api/world-images", requireAuth, upload.single("image"), async (req, res) => {
  try {
    const imageUrl = req.file ? `/uploads/world/${req.file.filename}` : null;

    const newImage = {
      id: Date.now(),
      imageUrl,
      createdAt: new Date().toISOString(),
    };

    worldImages.push(newImage);
    await saveWorldImages();

    console.log("World image created:", newImage); // Debug log
    res.json(newImage);
  } catch (err) {
    console.error("Error uploading world image:", err);
    res.status(500).send("Failed to upload world image");
  }
});

// Compat: AdminPanel uploads world images here (field name: "file")
app.post("/api/world-images/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const imageUrl = `/uploads/world/${req.file.filename}`;
    const newImage = {
      id: Date.now(),
      imageUrl,
      createdAt: new Date().toISOString(),
    };

    worldImages.push(newImage);
    await saveWorldImages();

    return res.json({ success: true, url: imageUrl, id: newImage.id, createdAt: newImage.createdAt });
  } catch (err) {
    console.error("Error uploading world image (compat):", err);
    return res.status(500).json({ error: "Failed to upload world image" });
  }
});

// Place pre-order (public)
app.post('/api/preorders', async (req, res) => {
  try {
    const { productId, email, size, qty } = req.body || {};
    if (!productId) return res.status(400).json({ error: 'productId required' });
    if (!email || !String(email).includes('@')) return res.status(400).json({ error: 'valid email required' });

    const product = products.find((p) => String(p.id) === String(productId) || String(p.code) === String(productId));
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (!product.preOrder) return res.status(400).json({ error: 'This product is not available for pre-order' });

    const preOrder = {
      id: 'po-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
      productId: product.code || product.id,
      productName: product.name,
      email: String(email).trim(),
      size: size || null,
      qty: Number(qty) || 1,
      createdAt: new Date().toISOString(),
    };

    preOrders.push(preOrder);
    await savePreOrders();

    // fire-and-forget email (non-fatal)
    try { await sendPreOrderConfirmationEmail(preOrder, product); } catch (e) {}

    return res.json({ ok: true, preOrderId: preOrder.id });
  } catch (e) {
    console.error('Pre-order error:', e);
    return res.status(500).json({ error: 'Failed to create pre-order' });
  }
});

// List pre-orders (ADMIN ONLY)
app.get('/api/preorders', requireAuth, (req, res) => {
  try {
    const list = Array.isArray(preOrders) ? preOrders.slice() : [];
    // latest first
    list.sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));
    return res.json({ ok: true, preOrders: list });
  } catch (e) {
    console.error('Failed to list pre-orders:', e);
    return res.status(500).json({ ok: false, error: 'Failed to list pre-orders' });
  }
});

// Re-send confirmation email for a pre-order (ADMIN ONLY)
app.post('/api/preorders/:id/resend', requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });

    const po = (preOrders || []).find((x) => String(x.id) === id);
    if (!po) return res.status(404).json({ ok: false, error: 'Pre-order not found' });

    const product = (products || []).find((p) => String(p.id) === String(po.productId) || String(p.code) === String(po.productId));

    const emailOk = await sendPreOrderConfirmationEmail(po, product).catch(() => false);
    return res.json({ ok: true, emailSent: !!emailOk });
  } catch (e) {
    console.error('Failed to resend pre-order email:', e);
    return res.status(500).json({ ok: false, error: 'Failed to resend pre-order email' });
  }
});

// Delete product
app.delete("/api/products/:id", requireAuth, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const productIndex = products.findIndex((p) => p.id === productId);

    if (productIndex === -1) {
      return res.status(404).send("Product not found");
    }

    // Delete the image file
    const product = products[productIndex];
    if (product.imageUrl) {
      const imagePath = path.join(__dirname, product.imageUrl);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    products.splice(productIndex, 1);
    await saveProducts();
    broadcastProducts();

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).send("Failed to delete product");
  }
});

// Delete world image
app.delete("/api/world-images/:id", requireAuth, async (req, res) => {
  try {
    const imageId = parseInt(req.params.id);
    const imageIndex = worldImages.findIndex((img) => img.id === imageId);

    if (imageIndex === -1) {
      return res.status(404).send("World image not found");
    }

    // Delete the image file
    const image = worldImages[imageIndex];
    if (image.imageUrl) {
      const imagePath = path.join(__dirname, image.imageUrl);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    worldImages.splice(imageIndex, 1);
    await saveWorldImages();

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting world image:", err);
    res.status(500).send("Failed to delete world image");
  }
});

// Product sales statistics (ADMIN ONLY)
app.get("/api/admin/product-stats", requireAuth, (req, res) => {
  try {
    const now = Date.now();
    const days = Math.max(1, parseInt(req.query.days || "3650", 10));
    const since = now - days * 24 * 60 * 60 * 1000;

    // Build quick lookup for product metadata
    const productById = new Map((products || []).map((p) => [String(p.id), p]));
    const productByCode = new Map((products || []).map((p) => [String(p.code || ""), p]));

    const agg = new Map();

    for (const o of orders || []) {
      const createdAtMs = Date.parse(o.createdAt || o.updatedAt || "") || 0;
      if (createdAtMs && createdAtMs < since) continue;

      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const key = String(it.id || it.productId || it.code || it.sku || "");
        if (!key) continue;

        const qty = Number(it.qty || it.quantity || 0) || 0;
        const price = Number(it.price || 0) || 0;
        const revenue = qty * price;

        const current = agg.get(key) || {
          productKey: key,
          productId: it.id || null,
          code: it.code || null,
          name: it.name || null,
          imageUrl: it.imageUrl || null,
          unitsSold: 0,
          revenue: 0,
          ordersCount: 0,
          lastSoldAt: null,
        };

        current.unitsSold += qty;
        current.revenue += revenue;
        current.ordersCount += 1;

        const last = createdAtMs ? new Date(createdAtMs).toISOString() : null;
        if (last && (!current.lastSoldAt || Date.parse(last) > Date.parse(current.lastSoldAt))) {
          current.lastSoldAt = last;
        }

        agg.set(key, current);
      }
    }

    // Enrich from products table when possible
    const enriched = Array.from(agg.values()).map((row) => {
      const p = productById.get(String(row.productId)) || (row.code ? productByCode.get(String(row.code)) : null);
      return {
        ...row,
        productId: row.productId || (p ? p.id : null),
        code: row.code || (p ? p.code : null),
        name: row.name || (p ? p.name : null),
        imageUrl: row.imageUrl || (p ? p.imageUrl : null),
        currentStock: p ? Number(p.stock || 0) : null,
        preOrder: p ? !!p.preOrder : null,
      };
    });

    enriched.sort((a, b) => (b.unitsSold - a.unitsSold) || (b.revenue - a.revenue));

    res.json({
      ok: true,
      days,
      generatedAt: new Date().toISOString(),
      leaderboard: enriched,
    });
  } catch (e) {
    console.error("product-stats error:", e);
    res.status(500).json({ ok: false, error: "Failed to generate stats" });
  }
});

// Simple admin auth endpoints (needed by AdminPanel)
// Stores admin credentials/token in server/db.json (same file requireAuth checks)
const DB_JSON_PATH = path.join(__dirname, 'db.json');

function readAdminDB() {
  try {
    if (!fs.existsSync(DB_JSON_PATH)) return { admin: null };
    const raw = fs.readFileSync(DB_JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!('admin' in parsed)) parsed.admin = null;
    return parsed;
  } catch (e) {
    return { admin: null };
  }
}

function writeAdminDB(next) {
  const current = readAdminDB();
  const merged = Object.assign({}, current, next);
  fs.writeFileSync(DB_JSON_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

// Non-sensitive auth status
app.get('/api/auth/status', (req, res) => {
  const db = readAdminDB();
  const adminConfigured = !!(db.admin && db.admin.username);
  const envCredentialsPresent = !!(process.env.ADMIN_USER || process.env.ADMIN_PASS || process.env.AUTH_TOKEN);
  const authSource = adminConfigured ? 'db' : 'env';
  return res.json({
    adminConfigured,
    adminUser: adminConfigured ? db.admin.username : null,
    envCredentialsPresent,
    authSource,
    serverTime: new Date().toISOString(),
  });
});

// Initial setup: create admin in db.json (only if not already configured)
app.post('/api/auth/setup', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const db = readAdminDB();
  if (db.admin && db.admin.username) {
    return res.status(403).json({ error: 'Admin already configured' });
  }

  const token = 'admintoken-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  writeAdminDB({ admin: { username, password, token } });

  return res.json({ ok: true, token });
});

// Login: check db admin first; fallback to env defaults
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const db = readAdminDB();

  if (db.admin && db.admin.username) {
    if (username === db.admin.username && password === db.admin.password) {
      return res.json({ token: db.admin.token });
    }
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const envUser = process.env.ADMIN_USER || 'admin';
  const envPass = process.env.ADMIN_PASS || 'password';
  const envToken = process.env.AUTH_TOKEN || 'admintoken12345';

  if (username === envUser && password === envPass) {
    return res.json({ token: envToken });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});