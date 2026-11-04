'use strict';

const { expect } = require('chai');
const cases = require('../data/checkout-cases.json');
const { api, clearCart, login } = require('../helpers/auth');

describe('Checkout discount equivalence partitions', function () {
  let token;

  beforeEach(async function () {
    token = await login();
    await clearCart(token);
  });

  afterEach(async function () {
    if (token) {
      await clearCart(token);
    }
  });

  for (const [partition, testCase] of Object.entries(cases)) {
    it(`${partition}: ${testCase.description}`, async function () {
      const authorization = `Bearer ${token}`;
      const addToCart = await api.post('/api/cart')
        .set('Authorization', authorization)
        .send({ productId: testCase.productId, quantity: testCase.quantity });

      expect(addToCart.status).to.equal(200);

      const checkout = await api.post('/api/checkout')
        .set('Authorization', authorization)
        .send({ paymentMethod: testCase.paymentMethod });

      expect(checkout.status).to.equal(testCase.expectedStatus);

      if (testCase.expectedStatus === 201) {
        expect(checkout.body.order).to.include({
          paymentMethod: testCase.paymentMethod,
          subtotal: testCase.expectedSubtotal,
          discount: testCase.expectedDiscount,
          total: testCase.expectedTotal,
          currency: 'USD',
        });
      } else {
        expect(checkout.body).to.deep.equal({ error: testCase.expectedError });
        const cart = await api.get('/api/cart').set('Authorization', authorization);
        expect(cart.status).to.equal(200);
        expect(cart.body.items).to.have.lengthOf(1);
        expect(cart.body.items[0]).to.include({ productId: testCase.productId, quantity: testCase.quantity });
      }
    });
  }
});
