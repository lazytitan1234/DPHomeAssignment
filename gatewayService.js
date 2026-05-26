require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const proxy   = require('express-http-proxy');
const axios   = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const CUSTOMER_URL = process.env.CUSTOMER_SERVICE_URL || 'http://localhost:3001';
const BOOKING_URL  = process.env.BOOKING_SERVICE_URL  || 'http://localhost:3002';
const PAYMENT_URL  = process.env.PAYMENT_SERVICE_URL  || 'http://localhost:3003';
const FARE_URL     = process.env.FARE_SERVICE_URL     || 'http://localhost:3004';
const LOCATION_URL = process.env.LOCATION_SERVICE_URL || 'http://localhost:3005';

// Log every incoming request
app.use((req, _res, next) => {
  console.log(`[Gateway] ${req.method} ${req.path}`);
  next();
});

// Route all /api/* requests to the correct microservice
app.use('/api/auth',          proxy(CUSTOMER_URL,  { proxyReqPathResolver: req => `/auth${req.url}` }));
app.use('/api/notifications', proxy(CUSTOMER_URL,  { proxyReqPathResolver: req => `/notifications${req.url}` }));
app.use('/api/bookings',      proxy(BOOKING_URL,   { proxyReqPathResolver: req => `/bookings${req.url}` }));
app.use('/api/payments',      proxy(PAYMENT_URL,   { proxyReqPathResolver: req => `/payments${req.url}` }));
app.use('/api/fare',          proxy(FARE_URL,      { proxyReqPathResolver: req => `/fare${req.url}` }));
app.use('/api/locations',     proxy(LOCATION_URL,  { proxyReqPathResolver: req => `/locations${req.url}` }));

// Health check — polls all services
app.get('/health', async (req, res) => {
  const services = [
    { name: 'customer-service',  url: `${CUSTOMER_URL}/health` },
    { name: 'booking-service',   url: `${BOOKING_URL}/health` },
    { name: 'payment-service',   url: `${PAYMENT_URL}/health` },
    { name: 'fare-service',      url: `${FARE_URL}/health` },
    { name: 'location-service',  url: `${LOCATION_URL}/health` }
  ];

  const results = await Promise.allSettled(
    services.map(s => axios.get(s.url).then(r => ({ name: s.name, status: r.data.status || 'ok' })))
  );

  const statuses = results.map((r, i) =>
    r.status === 'fulfilled'
      ? { name: services[i].name, status: r.value.status }
      : { name: services[i].name, status: 'unreachable' }
  );

  res.json({ gateway: 'ok', services: statuses });
});

// Start
app.listen(3000, () => console.log('Gateway Service running on port 3000'));
