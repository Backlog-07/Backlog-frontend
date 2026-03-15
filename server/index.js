// NOTE: This project can be started from the `server/` directory with `node index.js`.
// Some environments/scripts may expect that entrypoint name.
// If you have another server implementation (server.js) this file must be the canonical API.
//
// (No change needed here; keeping as the canonical server entry.)

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
const nodemailer = require('nodemailer');
const sharp = require('sharp');
const crypto = require('crypto');
const Razorpay = require('razorpay');

// Load environment variables from .env file
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const DB_PATH = path.join(__dirname, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Simple static config - replace with env/secure storage for production
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'password';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'admintoken12345';

// Configure email transporter
let transporter = null;

console.log('Checking email configuration...');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? 'Found' : 'Not found');
console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'Found' : 'Not found');

try {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
    console.log('✓ Email transporter configured successfully');
    
    // Test the connection
    transporter.verify(function(error, success) {
      if (error) {
        console.log('✗ Email connection test failed:', error.message);
      } else {
        console.log('✓ Email server is ready to send messages');
      }
    });
  } else {
    console.log('✗ Email credentials not found in .env - emails will be skipped');
  }
} catch (error) {
  console.error('✗ Failed to configure email transporter:', error.message);
}

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const razorpay = RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
  : null;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

// SSE clients for instant product pushes
const sseClients = [];

// SSE clients for admin notifications (new orders)
const adminSseClients = [];

function notifyAdminsNewOrder(order) {
  const payload = {
    orderId: order.id,
    customerName: order.name || order.customerName,
    total: order.total,
    itemCount: Array.isArray(order.items) ? order.items.length : 0,
    timestamp: order.createdAt,
  };

  adminSseClients.forEach((client) => {
    try {
      client.res.write(`event: newOrder\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch (e) {
      // ignore individual client errors
    }
  });
}

function broadcastProducts(products) {
  const payload = JSON.stringify(products || []);
  sseClients.forEach((client) => {
    try {
      client.res.write(`event: products\ndata: ${payload}\n\n`);
    } catch (e) {
      // ignore individual client errors
    }
  });
}

// SSE endpoint for product updates
app.get('/api/products/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const clientId = Date.now() + '-' + Math.floor(Math.random() * 10000);
  const client = { id: clientId, res };
  sseClients.push(client);

  // send initial products snapshot
  try {
    const db = readDB();
    const products = (db.products || []).map(p => ({ ...p, stock: Number(p.stock) || 0, available: (Number(p.stock) || 0) > 0 }));
    res.write(`event: products\ndata: ${JSON.stringify(products)}\n\n`);
  } catch (e) {}

  req.on('close', () => {
    const idx = sseClients.findIndex(c => c.id === clientId);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// SSE endpoint for admin notifications
app.get('/api/admin/notifications', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const clientId = Date.now() + '-' + Math.floor(Math.random() * 10000);
  const client = { id: clientId, res };
  adminSseClients.push(client);

  // initial handshake
  try {
    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to admin notifications' })}\n\n`);
  } catch (e) {}

  req.on('close', () => {
    const idx = adminSseClients.findIndex(c => c.id === clientId);
    if (idx !== -1) adminSseClients.splice(idx, 1);
  });
});

function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { products: [], admin: null };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Global settings helpers
function ensureSettings(db) {
  db.settings = db.settings || {};
  if (db.settings.shippingCharge == null) db.settings.shippingCharge = 99;
  return db;
}

// Require auth accepts either environment token or token stored in db admin
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const db = readDB();
  const dbToken = db.admin && db.admin.token;
  if (auth === `Bearer ${AUTH_TOKEN}`) return next();
  if (dbToken && auth === `Bearer ${dbToken}`) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Admin: get/update settings (shipping etc.)
app.get('/api/admin/settings', requireAuth, (req, res) => {
  const db = ensureSettings(readDB());
  try { writeDB(db); } catch {}
  return res.json({ ok: true, settings: db.settings });
});

app.put('/api/admin/settings', requireAuth, (req, res) => {
  const { shippingCharge } = req.body || {};
  const nextShipping = Number(shippingCharge);
  if (!Number.isFinite(nextShipping) || nextShipping < 0) {
    return res.status(400).json({ ok: false, error: 'shippingCharge must be a non-negative number' });
  }

  const db = ensureSettings(readDB());
  db.settings.shippingCharge = Math.round(nextShipping);
  writeDB(db);
  return res.json({ ok: true, settings: db.settings });
});

// Public: expose shipping charge for checkout UI
app.get('/api/settings/public', (req, res) => {
  const db = ensureSettings(readDB());
  return res.json({ ok: true, shippingCharge: Number(db.settings.shippingCharge) || 0 });
});

// Auth endpoint: check db-stored admin first; fallback to env defaults
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const db = readDB();

  // Debug logging to help diagnose auth failures
  console.debug('[AUTH] login attempt:', { username, password });
  console.debug('[AUTH] stored admin:', db.admin);

  if (db.admin && db.admin.username) {
    if (username === db.admin.username && password === db.admin.password) {
      return res.json({ token: db.admin.token });
    }
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Fallback to environment defaults
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ token: AUTH_TOKEN });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

// One-time setup endpoint to create admin credentials stored in db.json
app.post('/api/auth/setup', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const db = readDB();
  if (db.admin && db.admin.username) {
    return res.status(403).json({ error: 'Admin already configured' });
  }
  const token = 'admintoken-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  db.admin = { username, password, token };
  writeDB(db);
  return res.json({ ok: true, token });
});

// New endpoint: status of admin configuration (non-sensitive)
app.get('/api/auth/status', (req, res) => {
  const db = readDB();
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

// New endpoint: update/create admin credentials (requires authentication)
app.put('/api/auth/update', requireAuth, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const db = readDB();
  const token = 'admintoken-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  db.admin = { username, password, token };
  writeDB(db);

  return res.json({ ok: true, token });
});

// Products
app.get('/api/products', (req, res) => {
  const db = readDB();
  const products = (db.products || []).map(p => ({ ...p, stock: Number(p.stock) || 0, available: (Number(p.stock) || 0) > 0 }));
  res.json(products);
});

// Return single product by id
app.get('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const p = (db.products || []).find(x => x.id === id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const prod = Object.assign({}, p, { stock: Number(p.stock) || 0, available: (Number(p.stock) || 0) > 0 });
  return res.json(prod);
});

app.post('/api/products', requireAuth, (req, res) => {
  const db = readDB();
  const payload = req.body || {};
  const id = 'p' + Date.now() + Math.floor(Math.random() * 1000);
  const product = Object.assign({ id }, payload);
  // ensure stock numeric and availability derived from stock
  product.stock = Number(product.stock) || 0;
  product.available = product.stock > 0;
  db.products = db.products || [];
  db.products.unshift(product);
  writeDB(db);
  // broadcast to SSE clients immediately so frontends update
  try { broadcastProducts(db.products); } catch (e) {}
  res.status(201).json(product);
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const idx = (db.products || []).findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const updated = Object.assign({}, db.products[idx], req.body || {});
  // normalize stock and availability derived from stock
  updated.stock = Number(updated.stock) || 0;
  updated.available = updated.stock > 0;
  db.products[idx] = updated;
  writeDB(db);
  try { broadcastProducts(db.products); } catch (e) {}
  res.json(updated);
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const next = (db.products || []).filter(p => p.id !== id);
  db.products = next;
  writeDB(db);
  res.json({ ok: true });
});

// Checkout endpoint: accepts cart array [{id, qty}] and decrements stock if available
app.post('/api/checkout', requireAuth, async (req, res) => {
  const cart = req.body && Array.isArray(req.body.cart) ? req.body.cart : [];
  if (!cart.length) return res.status(400).json({ error: 'Cart empty' });

  const db = readDB();
  const products = db.products || [];
  const errors = [];

  // Validate availability
  for (const item of cart) {
    const p = products.find(x => x.id === item.id);
    if (!p) {
      errors.push({ id: item.id, error: 'Product not found' });
      continue;
    }
    const stock = Number(p.stock) || 0;
    if (stock < (item.qty || 1)) {
      errors.push({ id: item.id, error: 'Out of stock' });
    }
  }

  if (errors.length) return res.status(409).json({ error: 'Some items unavailable', details: errors });

  // All good: decrement stock and create order
  for (const item of cart) {
    const p = products.find(x => x.id === item.id);
    p.stock = Math.max(0, (Number(p.stock) || 0) - (item.qty || 1));
    p.available = (Number(p.stock) || 0) > 0;
  }

  // create order record
  const orderId = 'o' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  const total = cart.reduce((s, it) => {
    const prod = products.find(p => p.id === it.id);
    const price = prod ? Number(String(prod.price).replace(/[^0-9.]/g, '')) || 0 : 0;
    return s + price * (it.qty || 1);
  }, 0);
  db.orders = db.orders || [];
  db.orders.push({ id: orderId, items: cart, total, createdAt: new Date().toISOString() });

  db.products = products;
  writeDB(db);

  // notify SSE clients about updated stocks
  try { broadcastProducts(db.products); } catch (e) {}

  return res.json({ ok: true, orderId, products: db.products });
});

// Public checkout endpoint (no auth) for simple purchases
app.post('/api/checkout/public', async (req, res) => {
  const { cart, customer } = req.body || {};
  
  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: 'Cart empty' });
  }

  const db = readDB();
  const products = db.products || [];
  const errors = [];

  // Validate availability
  for (const item of cart) {
    const p = products.find(x => x.id === item.id);
    if (!p) {
      errors.push({ id: item.id, error: 'Product not found' });
      continue;
    }
    const stock = Number(p.stock) || 0;
    if (stock < (item.qty || 1)) {
      errors.push({ id: item.id, error: 'Out of stock' });
    }
  }

  if (errors.length) {
    return res.status(409).json({ error: 'Some items unavailable', details: errors });
  }

  // Decrement stock
  for (const item of cart) {
    const p = products.find(x => x.id === item.id);
    p.stock = Math.max(0, (Number(p.stock) || 0) - (item.qty || 1));
    p.available = (Number(p.stock) || 0) > 0;
  }

  // Calculate totals
  const subtotal = cart.reduce((s, it) => {
    const prod = products.find(p => p.id === it.id);
    const price = prod ? Number(String(prod.price).replace(/[^0-9.]/g, '')) || 0 : 0;
    return s + price * (it.qty || 1);
  }, 0);

  const shipping = subtotal > 500 ? 0 : 49;
  const tax = Math.round(subtotal * 0.05 * 100) / 100;
  const total = subtotal + shipping + tax;

  // Create order
  const orderId = 'o' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  db.orders = db.orders || [];
  db.orders.push({ 
    id: orderId, 
    items: cart, 
    customer: customer || {},
    total, 
    createdAt: new Date().toISOString() 
  });

  db.products = products;
  writeDB(db);

  // Send confirmation email
  if (customer && customer.email) {
    try {
      const itemsHTML = cart.map((item) => {
        const prod = products.find(p => p.id === item.id);
        const price = prod ? Number(String(prod.price).replace(/[^0-9.]/g, '')) || 0 : 0;
        return `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">${prod?.name || 'Unknown Product'}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.qty}x</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">₹${(price * item.qty).toFixed(2)}</td>
          </tr>
        `;
      }).join('');

      const emailHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000; color: #fff; padding: 24px; border-radius: 8px 8px 0 0; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; letter-spacing: 2px; }
            .content { background: #fff; padding: 32px; border: 1px solid #eee; border-radius: 0 0 8px 8px; }
            .order-id { background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #000; }
            .order-id-label { font-size: 12px; color: #666; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; }
            .order-id-value { font-size: 24px; font-weight: 800; letter-spacing: 2px; }
            .section { margin-bottom: 32px; }
            .section-title { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; color: #000; }
            table { width: 100%; border-collapse: collapse; }
            .summary { margin-top: 24px; padding-top: 24px; border-top: 2px solid #eee; }
            .summary-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
            .summary-row.total { font-weight: 800; font-size: 18px; color: #000; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #eee; }
            .btn { display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✓ ORDER CONFIRMED</h1>
            </div>
            <div class="content">
              <p>Hi ${customer.firstName || 'Customer'},</p>
              <p>Thank you for your purchase! Your order has been successfully placed and will be processed shortly.</p>

              <div class="order-id">
                <div class="order-id-label">Order ID</div>
                <div class="order-id-value">${orderId}</div>
              </div>

              <div class="section">
                <div class="section-title">Order Items</div>
                <table>
                  <thead>
                    <tr style="border-bottom: 2px solid #000;">
                      <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Product</th>
                      <th style="padding: 12px; text-align: center; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Qty</th>
                      <th style="padding: 12px; text-align: right; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsHTML}
                  </tbody>
                </table>
                <div class="summary">
                  <div class="summary-row">
                    <span>Subtotal:</span>
                    <span>₹${subtotal.toFixed(2)}</span>
                  </div>
                  <div class="summary-row">
                    <span>Shipping:</span>
                    <span>${shipping === 0 ? 'FREE' : '₹' + shipping.toFixed(2)}</span>
                  </div>
                  <div class="summary-row">
                    <span>Tax (5%):</span>
                    <span>₹${tax.toFixed(2)}</span>
                  </div>
                  <div class="summary-row total">
                    <span>TOTAL:</span>
                    <span>₹${total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">Delivery Address</div>
                <p style="margin: 0; line-height: 1.6;">
                  ${customer.firstName} ${customer.lastName}<br>
                  ${customer.address}<br>
                  ${customer.city}, ${customer.state} ${customer.pincode}<br>
                  ${customer.country}
                </p>
              </div>

              <div class="section">
                <div class="section-title">Contact Information</div>
                <p style="margin: 0; line-height: 1.6;">
                  Email: ${customer.email}<br>
                  Phone: ${customer.phone}
                </p>
              </div>

              <p style="margin-top: 32px; color: #666; line-height: 1.6;">
                We'll send you a shipping confirmation email as soon as your order is dispatched. You can track your order using your Order ID.
              </p>

              <p style="color: #666; margin-top: 24px;">
                If you have any questions, please reply to this email or contact our support team.
              </p>

              <div class="footer">
                <p>Thank you for shopping with BACKLOG!</p>
                <p style="margin-top: 12px;">© 2024 BACKLOG. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      if (transporter) {
        await transporter.sendMail({
          from: process.env.EMAIL_USER || 'noreply@backlog.com',
          to: customer.email,
          subject: `Order Confirmation - ${orderId}`,
          html: emailHTML,
        });

        console.log(`✓ Confirmation email sent to ${customer.email} for order ${orderId}`);
      } else {
        console.log('Email skipped (no transporter) for order #' + orderId);
      }
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError.message);
      // Don't fail the order if email fails - log and continue
    }
  }

  // Broadcast product updates to SSE clients
  try { broadcastProducts(db.products); } catch (e) {}

  return res.json({ ok: true, orderId, products: db.products });
});

// Upload handling
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const safe = file.originalname.replace(/\s+/g, '-');
    cb(null, Date.now() + '-' + safe);
  }
});
const upload = multer({ storage });

const IMAGE_TARGET_SIZE = Number(process.env.IMAGE_TARGET_SIZE) || 1024;
const IMAGE_MAX_SIZE = Number(process.env.IMAGE_MAX_SIZE) || 2048;

async function validateAndNormalizeSquareImage(filePath) {
  // Read metadata
  const img = sharp(filePath, { failOn: 'none' });
  const meta = await img.metadata();

  const w = Number(meta.width) || 0;
  const h = Number(meta.height) || 0;
  if (!w || !h) throw new Error('Invalid image');

  // Enforce square upload
  if (w !== h) {
    throw new Error('Image must be square (1:1).');
  }

  // Enforce maximum dimension
  if (w > IMAGE_MAX_SIZE || h > IMAGE_MAX_SIZE) {
    throw new Error(`Image too large. Max allowed is ${IMAGE_MAX_SIZE}x${IMAGE_MAX_SIZE}.`);
  }

  // Normalize to a single target size if needed (keeps transparency)
  if (w !== IMAGE_TARGET_SIZE) {
    const tmpPath = filePath + '.tmp';
    await img
      .resize(IMAGE_TARGET_SIZE, IMAGE_TARGET_SIZE, {
        fit: 'fill',
        withoutEnlargement: false,
      })
      // don't force any background; preserve alpha
      .toFile(tmpPath);

    await fs.promises.rename(tmpPath, filePath);
  }
}

// Upload handling (images + glb)
app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    // Validate it's an image
    if (!String(req.file.mimetype || '').startsWith('image/')) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({ error: 'Only image files are allowed' });
    }

    // Validate and normalize to standard square
    await validateAndNormalizeSquareImage(req.file.path);

    const url = '/uploads/' + req.file.filename;
    console.log('Image uploaded successfully:', url);
    return res.json({ url });
  } catch (e) {
    // cleanup
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch (err) {}
    return res.status(400).json({ error: e?.message || 'Upload failed' });
  }
});

// Upload GLB model for a product (admin)
app.post('/api/upload/glb', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const ext = String(path.extname(req.file.originalname || '')).toLowerCase();
  if (ext !== '.glb') {
    // delete wrong file
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(400).json({ error: 'Only .glb files are allowed' });
  }
  const url = '/uploads/' + req.file.filename;
  console.log('GLB uploaded successfully:', url);
  res.json({ url });
});

// World Images endpoints
app.post('/api/world-images/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  const db = readDB();
  db.worldImages = db.worldImages || [];
  
  const imageId = 'wi-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  const imageUrl = '/uploads/' + req.file.filename;
  
  const imageRecord = {
    id: imageId,
    imageUrl: imageUrl,
    createdAt: new Date().toISOString()
  };
  
  db.worldImages.unshift(imageRecord);
  writeDB(db);
  
  res.json({ success: true, url: imageUrl, id: imageId });
});

app.get('/api/world-images', (req, res) => {
  const db = readDB();
  const worldImages = db.worldImages || [];
  res.json(worldImages);
});

app.delete('/api/world-images/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const db = readDB();
  
  db.worldImages = db.worldImages || [];
  const imageToDelete = db.worldImages.find(img => img.id === id);
  
  if (!imageToDelete) {
    return res.status(404).json({ error: 'Image not found' });
  }
  
  // Try to delete the file from disk
  try {
    const filePath = path.join(UPLOAD_DIR, path.basename(imageToDelete.imageUrl));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error('Failed to delete file:', e);
  }
  
  // Remove from database
  db.worldImages = db.worldImages.filter(img => img.id !== id);
  writeDB(db);
  
  res.json({ ok: true });
});

// Get all orders
app.get('/api/orders', requireAuth, (req, res) => {
  const db = readDB();
  const orders = db.orders || [];
  res.json(orders);
});

// Admin: update order and payment status
app.patch('/api/orders/:orderId/status', requireAuth, (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderStatus, paymentStatus, partialPaidAmount, amountDue, paymentType } = req.body || {};

    const db = readDB();
    db.orders = db.orders || [];
    const idx = db.orders.findIndex((o) => String(o.id) === String(orderId));
    if (idx === -1) return res.status(404).json({ error: 'Order not found' });

    const next = Object.assign({}, db.orders[idx]);

    if (orderStatus != null && String(orderStatus).trim()) {
      // Keep compatibility: store in both keys
      next.orderStatus = String(orderStatus);
      next.status = String(orderStatus);
    }

    if (paymentStatus != null && String(paymentStatus).trim()) {
      next.paymentStatus = String(paymentStatus);
    }

    if (paymentType != null && String(paymentType).trim()) {
      next.paymentType = String(paymentType);
    }

    if (partialPaidAmount != null && String(partialPaidAmount).trim() !== '') {
      next.partialPaidAmount = Math.max(0, Number(partialPaidAmount) || 0);
    }

    if (amountDue != null && String(amountDue).trim() !== '') {
      next.amountDue = Math.max(0, Number(amountDue) || 0);
    }

    next.updatedAt = new Date().toISOString();

    db.orders[idx] = next;
    writeDB(db);

    return res.json({ ok: true, order: next });
  } catch (e) {
    console.error('Failed to update order status:', e);
    return res.status(500).json({ error: 'Failed to update status' });
  }
});

// Public order lookup (for customers)
// Query by orderId + email OR orderId + phone
app.get('/api/orders/lookup', (req, res) => {
  try {
    const db = readDB();
    const orders = db.orders || [];
    const orderId = req.query.orderId;
    const email = req.query.email;
    const phone = req.query.phone;

    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    if (!email && !phone) return res.status(400).json({ error: 'email or phone required' });

    const o = orders.find((x) => String(x.id) === String(orderId));
    if (!o) return res.status(404).json({ error: 'Order not found' });

    const matchEmail = email && String(o.email || '').toLowerCase() === String(email).toLowerCase();
    const matchPhone = phone && String(o.phone || '') === String(phone);
    if (!matchEmail && !matchPhone) return res.status(404).json({ error: 'Order not found' });

    return res.json({
      id: o.id,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      orderStatus: o.orderStatus || o.status || 'pending',
      paymentStatus: o.paymentStatus || 'Pending',
      paymentMethod: o.paymentMethod || 'COD',
      total: o.total,
      items: (o.items || []).map((it) => ({
        id: it.id,
        name: it.name,
        size: it.size,
        qty: it.qty,
        price: it.price,
        imageUrl: it.imageUrl,
      })),
      customerName: o.name || o.customerName,
      phoneLast4: o.phone ? String(o.phone).slice(-4) : null,
      email: o.email ? String(o.email).replace(/(.{2}).+(@.+)/, '$1***$2') : null,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Lookup failed' });
  }
});

// Public order list by contact (email or phone)
app.get('/api/orders/by-contact', (req, res) => {
  try {
    const db = readDB();
    const orders = db.orders || [];
    const email = req.query.email;
    const phone = req.query.phone;

    if (!email && !phone) return res.status(400).json({ error: 'email or phone required' });

    const filtered = orders.filter((o) => {
      if (email) return String(o.email || '').toLowerCase() === String(email).toLowerCase();
      return String(o.phone || '') === String(phone);
    });

    if (!filtered.length) return res.status(404).json({ error: 'No orders found' });

    const sanitized = filtered
      .slice()
      .reverse()
      .map((o) => ({
        id: o.id,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        orderStatus: o.orderStatus || o.status || 'pending',
        paymentStatus: o.paymentStatus || 'Pending',
        paymentMethod: o.paymentMethod || 'COD',
        total: o.total,
        items: (o.items || []).map((it) => ({
          id: it.id,
          name: it.name,
          size: it.size,
          qty: it.qty,
          price: it.price,
          imageUrl: it.imageUrl,
        })),
        customerName: o.name || o.customerName,
        phoneLast4: o.phone ? String(o.phone).slice(-4) : null,
        email: o.email ? String(o.email).replace(/(.{2}).+(@.+)/, '$1***$2') : null,
      }));

    return res.json({ orders: sanitized });
  } catch (e) {
    return res.status(500).json({ error: 'Lookup failed' });
  }
});

// Place order (public endpoint - no auth required)
app.post('/api/orders', async (req, res) => {
  console.log("Received order request:", req.body);
  try {
    const { items, total, name, email, phone, address, city, state, pincode, paymentMethod, paymentType, partialPaidAmount, amountDue, paymentStatus } = req.body;

    console.log("Order details:", { items, total, name, email });

    if (!items || items.length === 0) {
      console.log("Error: No items in order");
      return res.status(400).json({ error: "No items in order" });
    }

    const db = readDB();
    const products = db.products || [];

    // Validate stock availability for each item
    for (const item of items) {
      const product = products.find((p) => p.id === item.id);
      if (!product) {
        return res.status(400).json({ 
          error: `Product ${item.name} not found` 
        });
      }

      // Check size-specific stock
      const sizeStock = product.sizeStock?.[item.size];
      const availableStock = sizeStock !== undefined ? sizeStock : product.stock;

      if (availableStock < item.qty) {
        return res.status(400).json({ 
          error: `Insufficient stock for ${product.name} (Size: ${item.size}). Available: ${availableStock}, Requested: ${item.qty}` 
        });
      }
    }

    const orderId = Date.now();
    const normalizedTotal = Number(total) || 0;
    const normalizedPartialPaid = Number(partialPaidAmount) || 0;
    const computedDue = Math.max(0, normalizedTotal - normalizedPartialPaid);

    const newOrder = {
      id: orderId,
      items,
      total: normalizedTotal,
      name,
      email,
      phone,
      address,
      city,
      state,
      pincode,
      paymentMethod: paymentMethod || 'COD',
      paymentType: paymentType || ((paymentMethod || 'COD') === 'COD' ? 'PARTIAL' : 'FULL'),
      partialPaidAmount: normalizedPartialPaid,
      amountDue: Number.isFinite(Number(amountDue)) ? Math.max(0, Number(amountDue)) : computedDue,
      paymentStatus: paymentStatus || ((paymentMethod || 'COD') === 'COD' ? 'Partially Paid' : 'Paid'),
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    console.log("Saving order:", orderId);
    db.orders = db.orders || [];
    db.orders.push(newOrder);
    writeDB(db);
    console.log("Order saved successfully");

    // Notify admins of new order (SSE)
    try { notifyAdminsNewOrder(newOrder); } catch (e) {}

    // Send order confirmation email (skip if not configured)
    try {
      await sendOrderConfirmationEmail(newOrder);
    } catch (emailError) {
      console.error("Email error (non-fatal):", emailError);
    }

    // Deduct stock for each item (size-specific)
    for (const item of items) {
      const product = products.find((p) => p.id === item.id);
      if (product) {
        if (product.sizeStock && product.sizeStock[item.size] !== undefined) {
          // Deduct from size-specific stock
          product.sizeStock[item.size] = Math.max(0, product.sizeStock[item.size] - item.qty);
          
          // Recalculate total stock
          product.stock = Object.values(product.sizeStock).reduce((sum, val) => sum + val, 0);
        } else {
          // Fallback to general stock
          product.stock = Math.max(0, (product.stock || 0) - item.qty);
        }
        
        product.available = product.stock > 0;
      }
    }
    
    db.products = products;
    writeDB(db);
    broadcastProducts(db.products);

    console.log("Order placed successfully:", orderId);
    res.json({ success: true, orderId, message: "Order placed successfully!" });
  } catch (err) {
    console.error("Error placing order:", err);
    res.status(500).json({ error: "Failed to place order", details: err.message });
  }
});

// Email template for order confirmation
function generateOrderEmail(order) {
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
          <strong>₹${item.price * item.qty}</strong>
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
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">Thank You for Your Order!</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Order Confirmation</p>
        </div>
        
        <div class="content">
          <p>Hi ${order.name},</p>
          
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
            <p style="margin: 5px 0;"><strong>${order.name}</strong></p>
            <p style="margin: 5px 0;">${order.address}</p>
            <p style="margin: 5px 0;">${order.city}, ${order.state} - ${order.pincode}</p>
            <p style="margin: 5px 0;">Phone: ${order.phone}</p>
            <p style="margin: 5px 0;">Email: ${order.email}</p>
          </div>

          <p style="margin-top: 30px;">Your order is being processed and will be shipped soon.</p>
        </div>

        <div class="footer">
          <p><strong>Backlog</strong></p>
          <p>Thank you for shopping with us!</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Send order confirmation email
async function sendOrderConfirmationEmail(order) {
  // Skip email if transporter not configured
  if (!transporter) {
    console.log('Email skipped (no transporter) for order #' + order.id);
    return true;
  }

  try {
    const mailOptions = {
      from: `"Backlog" <${process.env.EMAIL_USER}>`,
      to: order.email,
      subject: `Order Confirmation - #${order.id} - Backlog`,
      html: generateOrderEmail(order),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.log('Email error (order still placed):', error.message);
    return false;
  }
}

// Admin: product leaderboard stats (units sold / revenue / orders count)
app.get('/api/admin/product-stats', requireAuth, (req, res) => {
  try {
    const daysRaw = req.query.days;
    const days = Number(daysRaw);
    const lookbackDays = Number.isFinite(days) && days > 0 ? days : 30;

    const db = readDB();
    const products = db.products || [];
    const orders = db.orders || [];

    const now = Date.now();
    const cutoffMs = lookbackDays >= 3650 ? 0 : now - lookbackDays * 24 * 60 * 60 * 1000;

    const productById = new Map(products.map((p) => [String(p.id), p]));

    // aggregate by product id
    const agg = new Map();

    for (const o of orders) {
      const createdAt = o.createdAt ? Date.parse(o.createdAt) : NaN;
      if (Number.isFinite(createdAt) && createdAt < cutoffMs) continue;

      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const pid = it && it.id != null ? String(it.id) : null;
        if (!pid) continue;

        const qty = Number(it.qty) || 0;
        const price = Number(String(it.price ?? '').replace(/[^0-9.]/g, '')) || 0;
        const revenue = qty * price;

        if (!agg.has(pid)) {
          const prod = productById.get(pid);
          agg.set(pid, {
            productId: pid,
            productKey: pid,
            name: prod?.name || it.name || 'Unknown Product',
            code: prod?.code || it.code || null,
            imageUrl: prod?.imageUrl || it.imageUrl || null,
            preOrder: !!prod?.preOrder,
            unitsSold: 0,
            revenue: 0,
            ordersCount: 0,
            lastSoldAt: null,
            _orderSet: new Set(),
          });
        }

        const row = agg.get(pid);
        row.unitsSold += qty;
        row.revenue += revenue;
        if (o.id != null) row._orderSet.add(String(o.id));

        // Last sold timestamp
        if (Number.isFinite(createdAt)) {
          if (!row.lastSoldAt || Date.parse(row.lastSoldAt) < createdAt) {
            row.lastSoldAt = new Date(createdAt).toISOString();
          }
        }
      }
    }

    for (const row of agg.values()) {
      row.ordersCount = row._orderSet.size;
      delete row._orderSet;
    }

    const leaderboard = Array.from(agg.values())
      .sort((a, b) => {
        // primary: units sold, secondary: revenue
        if ((b.unitsSold || 0) !== (a.unitsSold || 0)) return (b.unitsSold || 0) - (a.unitsSold || 0);
        return (b.revenue || 0) - (a.revenue || 0);
      });

    return res.json({
      days: lookbackDays,
      generatedAt: new Date().toISOString(),
      leaderboard,
    });
  } catch (e) {
    console.error('Failed to compute product stats:', e);
    return res.status(500).json({ error: 'Failed to compute stats' });
  }
});

// Pre-orders
// Public: create a pre-order for a product that has preOrder=true
app.post('/api/preorders', async (req, res) => {
  try {
    const { productId, email, size, qty } = req.body || {};

    if (!productId) return res.status(400).json({ error: 'productId required' });
    if (!email || !String(email).includes('@')) return res.status(400).json({ error: 'valid email required' });

    const db = readDB();
    db.preOrders = db.preOrders || [];

    const products = db.products || [];
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

    db.preOrders.unshift(preOrder);
    writeDB(db);

    // Best-effort email (skip if not configured)
    try {
      if (transporter) {
        const productName = product?.name || preOrder.productName || 'Item';
        const itemId = product?.code || product?.id || preOrder.productId;
        const html = `
          <!doctype html>
          <html><head><meta charset="utf-8" />
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
              .wrap { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background:#000; color:#fff; padding: 22px; border-radius: 10px 10px 0 0; text-align:center; }
              .card { border:1px solid #eee; border-top:0; padding: 22px; border-radius: 0 0 10px 10px; }
              .badge { display:inline-block; padding:6px 10px; border-radius: 999px; background:#fff7e6; border:1px solid #ffd591; color:#7a4b00; font-weight:800; font-size:12px; }
            </style>
          </head>
          <body>
            <div class="wrap">
              <div class="header"><h1 style="margin:0; font-size: 20px; letter-spacing: 1px;">Pre-order Confirmed</h1></div>
              <div class="card">
                <p><span class="badge">PRE-ORDER</span></p>
                <p>We’ve received your pre-order request for:</p>
                <p style="font-size:18px; font-weight:900; margin: 10px 0;">${productName}</p>
                <p><strong>Item ID:</strong> ${itemId}</p>
                <p><strong>Requested size:</strong> ${preOrder.size || 'N/A'}</p>
                <p><strong>Quantity:</strong> ${preOrder.qty || 1}</p>
                <p style="margin-top:16px; color:#666; font-size: 13px;">Reference: ${preOrder.id}</p>
              </div>
            </div>
          </body></html>
        `;

        await transporter.sendMail({
          from: process.env.EMAIL_USER || 'noreply@backlog.com',
          to: preOrder.email,
          subject: `Pre-order Confirmation - ${productName}`,
          html,
        });
      }
    } catch (e) {
      // non-fatal
      console.error('Pre-order email failed (non-fatal):', e?.message || e);
    }

    return res.json({ ok: true, preOrderId: preOrder.id });
  } catch (e) {
    console.error('Pre-order error:', e);
    return res.status(500).json({ error: 'Failed to create pre-order' });
  }
});

// Admin: list pre-orders
app.get('/api/preorders', requireAuth, (req, res) => {
  try {
    const db = readDB();
    const list = Array.isArray(db.preOrders) ? db.preOrders.slice() : [];
    // ensure latest first
    list.sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));
    return res.json({ ok: true, preOrders: list });
  } catch (e) {
    console.error('Failed to list pre-orders:', e);
    return res.status(500).json({ ok: false, error: 'Failed to list pre-orders' });
  }
});

// Admin: re-send pre-order confirmation email
app.post('/api/preorders/:id/resend', requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });

    const db = readDB();
    db.preOrders = db.preOrders || [];

    const po = (db.preOrders || []).find((x) => String(x.id) === id);
    if (!po) return res.status(404).json({ ok: false, error: 'Pre-order not found' });

    // Find product if possible
    const products = db.products || [];
    const product = products.find((p) => String(p.id) === String(po.productId) || String(p.code) === String(po.productId));

    let emailSent = false;
    if (transporter) {
      try {
        const productName = product?.name || po.productName || 'Item';
        const itemId = product?.code || product?.id || po.productId;
        const html = `
          <!doctype html>
          <html><head><meta charset="utf-8" />
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
              .wrap { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background:#000; color:#fff; padding: 22px; border-radius: 10px 10px 0 0; text-align:center; }
              .card { border:1px solid #eee; border-top:0; padding: 22px; border-radius: 0 0 10px 10px; }
              .badge { display:inline-block; padding:6px 10px; border-radius: 999px; background:#fff7e6; border:1px solid #ffd591; color:#7a4b00; font-weight:800; font-size:12px; }
            </style>
          </head>
          <body>
            <div class="wrap">
              <div class="header"><h1 style="margin:0; font-size: 20px; letter-spacing: 1px;">Pre-order Confirmed</h1></div>
              <div class="card">
                <p><span class="badge">PRE-ORDER</span></p>
                <p>We’ve received your pre-order request for:</p>
                <p style="font-size:18px; font-weight:900; margin: 10px 0;">${productName}</p>
                <p><strong>Item ID:</strong> ${itemId}</p>
                <p><strong>Requested size:</strong> ${po.size || 'N/A'}</p>
                <p><strong>Quantity:</strong> ${po.qty || 1}</p>
                <p style="margin-top:16px; color:#666; font-size: 13px;">Reference: ${po.id}</p>
              </div>
            </div>
          </body></html>
        `;

        await transporter.sendMail({
          from: process.env.EMAIL_USER || 'noreply@backlog.com',
          to: po.email,
          subject: `Pre-order Confirmation - ${productName}`,
          html,
        });

        emailSent = true;
      } catch (e) {
        emailSent = false;
      }
    }

    return res.json({ ok: true, emailSent });
  } catch (e) {
    console.error('Failed to resend pre-order email:', e);
    return res.status(500).json({ ok: false, error: 'Failed to resend pre-order email' });
  }
});

// Razorpay: expose public key for client
app.get('/api/payments/razorpay/key', (req, res) => {
  return res.json({ keyId: RAZORPAY_KEY_ID || null });
});

// Razorpay: create an order (amount in paise)
app.post('/api/payments/razorpay/order', async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(500).json({ error: 'Razorpay is not configured on server' });
    }

    const { amount, currency = 'INR', receipt, notes } = req.body || {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'amount (in paise) must be a positive number' });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amt),
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: notes || {},
    });

    return res.json({ order });
  } catch (e) {
    console.error('Razorpay order create failed:', e);
    return res.status(500).json({ error: 'Failed to create Razorpay order' });
  }
});

// Razorpay: verify signature
app.post('/api/payments/razorpay/verify', async (req, res) => {
  try {
    if (!RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ error: 'Razorpay is not configured on server' });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    const ok = expected === razorpay_signature;
    if (!ok) {
      return res.status(400).json({ verified: false, error: 'Invalid signature' });
    }

    return res.json({ verified: true });
  } catch (e) {
    console.error('Razorpay verify failed:', e);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// Serve frontend build if available, otherwise respond with a simple message at root
const BUILD_DIR = path.join(__dirname, '..', 'build');
if (fs.existsSync(BUILD_DIR)) {
  app.use(express.static(BUILD_DIR));
  // Let API and uploads routes take precedence; fallback to index.html for client-side routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(BUILD_DIR, 'index.html'));
  });
} else {
  // Serve a minimal page for root and admin routes when no SPA build is present
  app.get(['/', '/admin', /^\/admin(\/.*)?$/], (req, res) => {
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>API / Admin</title></head><body><h1>API server running</h1><p>This server exposes the API at <code>/api/</code>.</p><p>To use the admin UI in development, run the frontend dev server (usually at <code>http://localhost:3000</code>) and open <a href="http://localhost:3000/admin">http://localhost:3000/admin</a>.</p><p>If you built the frontend, place the build in <code>/build</code> and restart the server and the admin UI will be served from <code>/admin</code>.</p></body></html>`);
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
