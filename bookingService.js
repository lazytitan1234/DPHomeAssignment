require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');
const axios    = require('axios');

const Booking   = require('./models/Booking');
const bookingBus = require('./events');
require('./listeners'); // Register Task 5 & 6 event listeners

const app = express();
app.use(cors());
app.use(express.json());

const FARE_URL = process.env.FARE_SERVICE_URL || 'http://localhost:3004';

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

// Create booking
app.post('/bookings', authMiddleware, async (req, res) => {
  try {
    const { startLocation, endLocation, dateTime, passengers, cabType } = req.body;

    if (!startLocation || !endLocation || !dateTime || !passengers || !cabType)
      return res.status(400).json({ error: 'All booking fields are required' });

    if (passengers > 8)
      return res.status(400).json({ error: 'Maximum 8 passengers allowed' });

    if (!['Economic', 'Premium', 'Executive'].includes(cabType))
      return res.status(400).json({ error: 'Invalid cab type' });

    // Get estimated fare from fare service
    let estimatedFare = 0;
    try {
      const fareRes = await axios.get(`${FARE_URL}/fare/estimate`, {
        params: { startLocation, endLocation },
        headers: { authorization: req.headers['authorization'] }
      });
      estimatedFare = fareRes.data.fare || 0;
    } catch (e) {
      console.warn('Fare service unavailable:', e.message);
    }

    const booking = await new Booking({
      userId: req.user.id, startLocation, endLocation,
      dateTime: new Date(dateTime), passengers: Number(passengers),
      cabType, estimatedFare, status: 'confirmed'
    }).save();

    // Task 6 — emit event: cab ready notification fires after 3 minutes
    bookingBus.emit('booking.created', { booking, userId: req.user.id });

    // Task 5 — discount is emitted only after 3 COMPLETED bookings (see /complete endpoint)

    res.status(201).json({ message: 'Booking confirmed', booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all bookings for user
app.get('/bookings', authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current (upcoming) bookings
app.get('/bookings/current', authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find({
      userId: req.user.id,
      dateTime: { $gte: new Date() },
      status: { $in: ['pending', 'confirmed'] }
    }).sort({ dateTime: 1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Past bookings
app.get('/bookings/past', authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find({
      userId: req.user.id,
      $or: [
        { dateTime: { $lt: new Date() } },
        { status: { $in: ['completed', 'cancelled'] } }
      ]
    }).sort({ dateTime: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single booking
app.get('/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user.id });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Complete a booking — Task 5: triggers discount after 3rd completed booking
app.patch('/bookings/:id/complete', authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, status: 'confirmed' },
      { status: 'completed' },
      { new: true }
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found or cannot be completed' });

    // Count how many bookings this user has completed
    const completedCount = await Booking.countDocuments({
      userId: req.user.id,
      status: 'completed'
    });

    // Emit discount event exactly when the 3rd booking is completed
    if (completedCount === 3) {
      bookingBus.emit('discount.available', { userId: req.user.id });
    }

    res.json({ message: 'Booking completed', booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel booking
app.patch('/bookings/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, status: 'confirmed' },
      { status: 'cancelled' },
      { new: true }
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found or cannot be cancelled' });
    res.json({ message: 'Booking cancelled', booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ service: 'booking-service', status: 'ok' }));

// Start
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    app.listen(3002, () => console.log('Booking Service running on port 3002'));
  })
  .catch(err => { console.error('MongoDB error:', err.message); process.exit(1); });
