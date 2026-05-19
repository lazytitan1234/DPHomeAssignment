require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');
const axios   = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ── Auth middleware ───────────────────────────────────────────────────────────
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

// ── Get fare estimate from RapidAPI ──────────────────────────────────────────
app.get('/fare/estimate', authMiddleware, async (req, res) => {
  try {
    const { startLocation, endLocation } = req.query;
    if (!startLocation || !endLocation)
      return res.status(400).json({ error: 'startLocation and endLocation are required' });

    const response = await axios.get('https://taxi-fare-calculator.p.rapidapi.com/v1/taxi-fare', {
      params: {
        source_addresses:      startLocation,
        destination_addresses: endLocation,
        language: 'en',
        region:   'MT'
      },
      headers: {
        'x-rapidapi-key':  process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': process.env.RAPIDAPI_FARE_HOST || 'taxi-fare-calculator.p.rapidapi.com'
      }
    });

    const data = response.data;

    // Parse fare from API response — adapt based on actual API structure
    let fare = 0;
    if (data?.fare)  fare = parseFloat(data.fare);
    else if (data?.total) fare = parseFloat(data.total);

    res.json({ startLocation, endLocation, fare, currency: 'EUR' });
  } catch (err) {
    console.error('Fare API error:', err.message);
    // Return 0 fare as fallback so the rest of the flow still works
    res.json({
      startLocation: req.query.startLocation,
      endLocation:   req.query.endLocation,
      fare: 0,
      currency: 'EUR',
      warning: 'Could not retrieve fare from external API'
    });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ service: 'fare-service', status: 'ok' }));

// ── Start (no DB needed) ──────────────────────────────────────────────────────
app.listen(3004, () => console.log('Fare Service running on port 3004'));
