# AutomationStar Checkout API

## What is this API?

A small Express REST API for registering and logging in users, managing a shopping cart, and checking out. All users, sessions, products, carts, and orders are stored in memory; restarting the server resets them. Passwords are hashed with Node.js `scrypt`, and authenticated routes use bearer tokens.

## How to install

Requirements: Node.js 18 or newer and npm.

```bash
npm install
```

## How to run

```bash
npm start
```

The server listens on port `3000` by default. Set `PORT` to use another port.

## Test data

Three products are loaded at startup:

| Product ID | Name | Price |
| --- | --- | ---: |
| `prod-001` | Canvas Backpack | $45.99 |
| `prod-002` | Insulated Bottle | $18.99 |
| `prod-003` | Travel Organizer | $24.99 |

Three users are loaded at startup. Use these credentials to log in:

| Email | Password |
| --- | --- |
| `avery@example.com` | `AveryPass123!` |
| `jordan@example.com` | `JordanPass123!` |
| `morgan@example.com` | `MorganPass123!` |

## Business rules

- Checkout accepts `cash` or `credit_card` as the payment method.
- Cash payment receives a 10% discount on the cart subtotal. The discount is rounded to the nearest cent.
- Credit card payment receives no discount.
- Successful checkout creates an in-memory order and empties that user's cart.
- A cart item quantity must be between 1 and 99; adding to an item cannot bring its total quantity above 99.
- Registration requires a unique email address and a password of at least 8 characters.

## Important URLs

| URL | Purpose |
| --- | --- |
| `http://localhost:3000/` | Redirects to Swagger UI |
| `http://localhost:3000/api/register` | Register a user (`POST`) |
| `http://localhost:3000/api/login` | Log in (`POST`) |
| `http://localhost:3000/api/cart` | View or add cart items (`GET`, `POST`) |
| `http://localhost:3000/api/cart/{productId}` | Remove an item (`DELETE`) |
| `http://localhost:3000/api/checkout` | Place an order (`POST`) |
| `http://localhost:3000/docs` | Interactive Swagger UI |
| `http://localhost:3000/openapi.yaml` | Raw OpenAPI YAML specification |
| `http://localhost:3000/reports/discount-ep-report.html` | Equivalence-partitioning test report |

Cart and checkout requests require the bearer token returned by login. For example, send `Authorization: Bearer <token>`.

## Example checkout flow

Log in and copy the returned token:

```bash
curl -X POST http://localhost:3000/api/login \
	-H 'Content-Type: application/json' \
	-d '{"email":"avery@example.com","password":"AveryPass123!"}'
```

Add an item, replacing `<token>` with the login token:

```bash
curl -X POST http://localhost:3000/api/cart \
	-H 'Authorization: Bearer <token>' \
	-H 'Content-Type: application/json' \
	-d '{"productId":"prod-001","quantity":1}'
```

Check out with cash to apply the discount:

```bash
curl -X POST http://localhost:3000/api/checkout \
	-H 'Authorization: Bearer <token>' \
	-H 'Content-Type: application/json' \
	-d '{"paymentMethod":"cash"}'
```