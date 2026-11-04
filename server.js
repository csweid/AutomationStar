'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const app = express();
const port = Number(process.env.PORT) || 3000;
const products = [
  { id: 'prod-001', name: 'Canvas Backpack', priceCents: 4599, currency: 'USD' },
  { id: 'prod-002', name: 'Insulated Bottle', priceCents: 1899, currency: 'USD' },
  { id: 'prod-003', name: 'Travel Organizer', priceCents: 2499, currency: 'USD' },
];
const users = [];
const carts = new Map();
const sessions = new Map();
const orders = [];
const openApiPath = path.join(__dirname, 'openapi.yaml');
const openApiDocument = YAML.load(openApiPath);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function addUser({ id, name, email, password }) {
  const credentials = hashPassword(password);
  const user = { id, name, email: email.toLowerCase(), ...credentials };
  users.push(user);
  carts.set(user.id, new Map());
  return user;
}

addUser({ id: 'user-001', name: 'Avery Chen', email: 'avery@example.com', password: 'AveryPass123!' });
addUser({ id: 'user-002', name: 'Jordan Lee', email: 'jordan@example.com', password: 'JordanPass123!' });
addUser({ id: 'user-003', name: 'Morgan Patel', email: 'morgan@example.com', password: 'MorganPass123!' });

app.use(express.json({ limit: '16kb' }));

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function findProduct(productId) {
  return products.find((product) => product.id === productId);
}

function cartItems(userId) {
  const cart = carts.get(userId);
  return [...cart.entries()].map(([productId, quantity]) => {
    const product = findProduct(productId);
    return {
      productId,
      name: product.name,
      unitPrice: product.priceCents / 100,
      quantity,
      lineTotal: (product.priceCents * quantity) / 100,
    };
  });
}

function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const userId = match && sessions.get(match[1]);
  if (!userId) {
    return res.status(401).json({ error: 'A valid bearer token is required.' });
  }
  req.user = users.find((user) => user.id === userId);
  next();
}

app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
    return res.status(400).json({ error: 'Name must contain 1 to 100 characters.' });
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (users.some((user) => user.email === normalizedEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const user = addUser({
    id: crypto.randomUUID(),
    name: name.trim(),
    email: normalizedEmail,
    password,
  });
  return res.status(201).json({ user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = users.find((candidate) => candidate.email === email.trim().toLowerCase());
  const candidateHash = user && hashPassword(password, user.salt).hash;
  if (!user || !crypto.timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(user.hash, 'hex'))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, user.id);
  return res.json({ token, tokenType: 'Bearer', user: publicUser(user) });
});

app.get('/api/cart', requireAuth, (req, res) => {
  return res.json({
    items: cartItems(req.user.id),
    availableProducts: products.map((product) => ({
      id: product.id,
      name: product.name,
      price: product.priceCents / 100,
      currency: product.currency,
    })),
  });
});

app.post('/api/cart', requireAuth, (req, res) => {
  const { productId, quantity } = req.body || {};
  if (typeof productId !== 'string' || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return res.status(400).json({ error: 'productId and a quantity from 1 to 99 are required.' });
  }
  if (!findProduct(productId)) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const cart = carts.get(req.user.id);
  const updatedQuantity = (cart.get(productId) || 0) + quantity;
  if (updatedQuantity > 99) {
    return res.status(400).json({ error: 'A cart item cannot exceed a quantity of 99.' });
  }
  cart.set(productId, updatedQuantity);
  return res.status(200).json({ items: cartItems(req.user.id) });
});

app.delete('/api/cart/:productId', requireAuth, (req, res) => {
  const cart = carts.get(req.user.id);
  if (!cart.has(req.params.productId)) {
    return res.status(404).json({ error: 'Product is not in the cart.' });
  }
  cart.delete(req.params.productId);
  return res.json({ items: cartItems(req.user.id) });
});

app.post('/api/checkout', requireAuth, (req, res) => {
  const { paymentMethod } = req.body || {};
  if (!['cash', 'credit_card'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'paymentMethod must be cash or credit_card.' });
  }

  const items = cartItems(req.user.id);
  if (items.length === 0) {
    return res.status(400).json({ error: 'Cannot checkout with an empty cart.' });
  }

  const subtotalCents = [...carts.get(req.user.id).entries()].reduce((total, [productId, quantity]) => {
    return total + findProduct(productId).priceCents * quantity;
  }, 0);
  const discountCents = paymentMethod === 'cash' ? Math.round(subtotalCents * 0.1) : 0;
  const order = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    items,
    paymentMethod,
    subtotal: subtotalCents / 100,
    discount: discountCents / 100,
    total: (subtotalCents - discountCents) / 100,
    currency: 'USD',
    createdAt: new Date().toISOString(),
  };

  orders.push(order);
  carts.set(req.user.id, new Map());
  return res.status(201).json({ order });
});

app.get('/openapi.yaml', (req, res) => {
  return res.type('application/yaml').sendFile(openApiPath);
});

app.get('/reports/discount-ep-report.html', (req, res) => {
  return res.sendFile(path.join(__dirname, 'reports', 'discount-ep-report.html'));
});

app.get('/', (req, res) => {
  return res.redirect('/docs');
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error.' });
});

app.listen(port, () => {
  console.log(`Checkout API listening at http://localhost:${port}`);
});
