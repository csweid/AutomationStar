'use strict';

const path = require('node:path');
const dotenv = require('dotenv');
const request = require('supertest');
const app = require('../../server');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const api = request(app);

async function login() {
  const { TEST_USER_EMAIL: email, TEST_USER_PASSWORD: password } = process.env;
  if (!email || !password) {
    throw new Error('Set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env before running tests.');
  }

  const response = await api.post('/api/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(`Test user login failed with HTTP ${response.status}.`);
  }
  return response.body.token;
}

async function clearCart(token) {
  const response = await api.get('/api/cart').set('Authorization', `Bearer ${token}`);
  if (response.status !== 200) {
    throw new Error(`Could not read test cart: HTTP ${response.status}.`);
  }

  for (const item of response.body.items) {
    const removal = await api.delete(`/api/cart/${item.productId}`).set('Authorization', `Bearer ${token}`);
    if (removal.status !== 200) {
      throw new Error(`Could not remove ${item.productId} from test cart.`);
    }
  }
}

module.exports = { api, clearCart, login };
