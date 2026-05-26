require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');
const axios    = require('axios');

const Payment = require('./models/Payment');

const app = express();
app.use(cors());
app.use(express.json());

const FARE_URL = process.env.FARE_SERVICE_URL || 'http://localhost:3004';

const CAB_MULTIPLIERS = { Economic: 1, Premium: 1.2, Executive: 1.4 };

function getDaytimeMultiplier(dateTime) {
  const hour = new Date(dateTime).getHours();
  return hour >= 8 ? 1 : 1.2; // night surcharge between 12am and 8am
}

function getPassengersMultiplier(passengers) {
  if (passengers <= 4) return 1;
  if (passengers <= 8) return 2;
  return null; // > 8 not allowed
}

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Process payment
app.post('/payments/pay', authMiddleware, async (req, res) => {
  try {
    const { bookingId, startLocation, endLocation, cabType, dateTime, passengers, applyDiscount } = req.body;

    if (!bookingId || !startLocation || !endLocation || !cabType || !dateTime || !passengers)
      return res.status(400).json({ error: 'All payment fields are required' });

    if (await Payment.findOne({ bookingId }))
      return res.status(409).json({ error: 'Payment already processed for this booking' });

    const passengersMultiplier = getPassengersMultiplier(Number(passengers));
    if (!passengersMultiplier)
      return res.status(400).json({ error: 'More than 8 passengers not allowed' });

    const cabMultiplier     = CAB_MULTIPLIERS[cabType] || 1;
    const daytimeMultiplier = getDaytimeMultiplier(dateTime);
    const discountMultiplier = applyDiscount ? 0.9 : 1;

    // Retrieve base fare from fare estimation service
    let cabFare = 0;
    try {
      const fareRes = await axios.get(`${FARE_URL}/fare/estimate`, {
        params: { startLocation, endLocation },
        headers: { authorization: req.headers['authorization'] }
      });
      cabFare = fareRes.data.fare || 0;
    } catch (e) {
      console.warn('Fare service unavailable:', e.message);
    }

    // Total price formula from assignment
    const totalPrice = parseFloat(
      (cabFare * cabMultiplier * daytimeMultiplier * passengersMultiplier * discountMultiplier).toFixed(2)
    );

    const payment = await new Payment({
      userId: req.user.id, bookingId,
      cabFare, cabMultiplier, daytimeMultiplier, passengersMultiplier, discountMultiplier,
      totalPrice, status: 'paid'
    }).save();

    res.status(201).json({
      message: 'Payment processed successfully',
      payment: {
        id: payment._id, bookingId,
        breakdown: { cabFare, cabMultiplier, daytimeMultiplier, passengersMultiplier, discountMultiplier },
        totalPrice, status: 'paid'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Estimate price (no payment saved)
app.post('/payments/estimate', authMiddleware, async (req, res) => {
  try {
    const { startLocation, endLocation, cabType, dateTime, passengers, applyDiscount } = req.body;

    const passengersMultiplier = getPassengersMultiplier(Number(passengers));
    if (!passengersMultiplier)
      return res.status(400).json({ error: 'More than 8 passengers not allowed' });

    const cabMultiplier      = CAB_MULTIPLIERS[cabType] || 1;
    const daytimeMultiplier  = getDaytimeMultiplier(dateTime);
    const discountMultiplier = applyDiscount ? 0.9 : 1;

    let cabFare = 0;
    try {
      const fareRes = await axios.get(`${FARE_URL}/fare/estimate`, {
        params: { startLocation, endLocation },
        headers: { authorization: req.headers['authorization'] }
      });
      cabFare = fareRes.data.fare || 0;
    } catch (e) {
      console.warn('Fare service unavailable:', e.message);
    }

    const totalPrice = parseFloat(
      (cabFare * cabMultiplier * daytimeMultiplier * passengersMultiplier * discountMultiplier).toFixed(2)
    );

    res.json({
      breakdown: { cabFare, cabMultiplier, daytimeMultiplier, passengersMultiplier, discountMultiplier },
      totalPrice
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all payments for user
app.get('/payments', authMiddleware, async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get payment for a specific booking
app.get('/payments/:bookingId', authMiddleware, async (req, res) => {
  try {
    const payment = await Payment.findOne({ bookingId: req.params.bookingId, userId: req.user.id });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ service: 'payment-service', status: 'ok' }));

// Start
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    app.listen(3003, () => console.log('Payment Service running on port 3003'));
  })
  .catch(err => { console.error('MongoDB error:', err.message); process.exit(1); });
