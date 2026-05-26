require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');
const axios   = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Malta locations coordinate lookup table
// The Taxi Fare Calculator API requires lat/lng, not text addresses.
// This table maps common Malta location names to their coordinates.
const MALTA_LOCATIONS = {
  'valletta':       { lat: 35.8997, lng: 14.5147 },
  'sliema':         { lat: 35.9122, lng: 14.5017 },
  'st julians':     { lat: 35.9186, lng: 14.4891 },
  'st. julians':    { lat: 35.9186, lng: 14.4891 },
  'san giljan':     { lat: 35.9186, lng: 14.4891 },
  'mdina':          { lat: 35.8858, lng: 14.4025 },
  'rabat':          { lat: 35.8833, lng: 14.3997 },
  'mosta':          { lat: 35.9097, lng: 14.4256 },
  'birkirkara':     { lat: 35.8972, lng: 14.4617 },
  'qormi':          { lat: 35.8761, lng: 14.4697 },
  'hamrun':         { lat: 35.8844, lng: 14.4886 },
  'msida':          { lat: 35.9003, lng: 14.4878 },
  'gzira':          { lat: 35.9069, lng: 14.4958 },
  'attard':         { lat: 35.8903, lng: 14.4344 },
  'balzan':         { lat: 35.8972, lng: 14.4417 },
  'lija':           { lat: 35.9011, lng: 14.4378 },
  'naxxar':         { lat: 35.9236, lng: 14.4456 },
  'san gwann':      { lat: 35.9086, lng: 14.4756 },
  'swieqi':         { lat: 35.9244, lng: 14.4878 },
  'pembroke':       { lat: 35.9283, lng: 14.4817 },
  'st pauls bay':   { lat: 35.9553, lng: 14.4022 },
  'st. pauls bay':  { lat: 35.9553, lng: 14.4022 },
  'bugibba':        { lat: 35.9525, lng: 14.4172 },
  'mellieha':       { lat: 35.9592, lng: 14.3614 },
  'marsaskala':     { lat: 35.8625, lng: 14.5503 },
  'marsaxlokk':     { lat: 35.8414, lng: 14.5436 },
  'birzebbuga':     { lat: 35.8233, lng: 14.5253 },
  'zurrieq':        { lat: 35.8358, lng: 14.4814 },
  'siggiewi':       { lat: 35.8556, lng: 14.4347 },
  'dingli':         { lat: 35.8636, lng: 14.3828 },
  'zejtun':         { lat: 35.8544, lng: 14.5328 },
  'fgura':          { lat: 35.8706, lng: 14.5131 },
  'tarxien':        { lat: 35.8675, lng: 14.5128 },
  'paola':          { lat: 35.8736, lng: 14.5014 },
  'marsa':          { lat: 35.8811, lng: 14.4981 },
  'floriana':       { lat: 35.8942, lng: 14.5047 },
  'pieta':          { lat: 35.8958, lng: 14.4961 },
  'ta xbiex':       { lat: 35.9022, lng: 14.4972 },
  'zebbug':         { lat: 35.8728, lng: 14.4406 },
  'luqa':           { lat: 35.8583, lng: 14.4872 },
  'gudja':          { lat: 35.8483, lng: 14.4994 },
  'airport':        { lat: 35.8575, lng: 14.4775 },
  'malta airport':  { lat: 35.8575, lng: 14.4775 },
  'kirkop':         { lat: 35.8433, lng: 14.4847 },
  'zabbar':         { lat: 35.8728, lng: 14.5328 },
  'zabbar':         { lat: 35.8728, lng: 14.5328 },
  'birgu':          { lat: 35.8881, lng: 14.5233 },
  'vittoriosa':     { lat: 35.8881, lng: 14.5233 },
  'cospicua':       { lat: 35.8833, lng: 14.5197 },
  'senglea':        { lat: 35.8869, lng: 14.5161 },
  'kalkara':        { lat: 35.8942, lng: 14.5364 },
  'xgħajra':        { lat: 35.8858, lng: 14.5547 },
  'san pawl il-baħar': { lat: 35.9553, lng: 14.4022 }
};

// Convert a location string to coordinates
function getCoords(locationStr) {
  // Normalise: lowercase, remove ", malta" suffix, trim
  const key = locationStr.toLowerCase()
    .replace(/,?\s*malta$/i, '')
    .replace(/[^\w\s.]/g, '')
    .trim();

  // Direct match
  if (MALTA_LOCATIONS[key]) return MALTA_LOCATIONS[key];

  // Partial match — check if any key is contained in the input
  for (const [name, coords] of Object.entries(MALTA_LOCATIONS)) {
    if (key.includes(name) || name.includes(key)) return coords;
  }

  // Default to Valletta if not found
  console.warn(`Location not found in lookup: "${locationStr}" — defaulting to Valletta`);
  return MALTA_LOCATIONS['valletta'];
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

// Haversine formula — calculates distance in km between two coordinates
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Malta taxi fare calculation fallback
// Based on Malta taxi official rates: €3 base + €1.50/km
function calculateMaltaFare(distanceKm) {
  const baseFare  = 3.00;
  const perKmRate = 1.50;
  return parseFloat((baseFare + distanceKm * perKmRate).toFixed(2));
}

// Get fare estimate from RapidAPI
app.get('/fare/estimate', authMiddleware, async (req, res) => {
  const { startLocation, endLocation } = req.query;
  if (!startLocation || !endLocation)
    return res.status(400).json({ error: 'startLocation and endLocation are required' });

  // Convert location names to coordinates using lookup table
  const start = getCoords(startLocation);
  const end   = getCoords(endLocation);

  // Try RapidAPI first
  try {
    const response = await axios.get('https://taxi-fare-calculator.p.rapidapi.com/search_geo', {
      params: { dep_lat: start.lat, dep_lng: start.lng, arr_lat: end.lat, arr_lng: end.lng },
      headers: {
        'x-rapidapi-key':  process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': process.env.RAPIDAPI_FARE_HOST || 'taxi-fare-calculator.p.rapidapi.com'
      },
      timeout: 5000
    });

    const data = response.data;
    console.log('Fare API response:', JSON.stringify(data));

    let fare = 0;
    if (data?.fare)        fare = parseFloat(data.fare);
    else if (data?.total)  fare = parseFloat(data.total);
    else if (data?.price)  fare = parseFloat(data.price);
    else if (data?.amount) fare = parseFloat(data.amount);
    else if (Array.isArray(data) && data[0]?.fare) fare = parseFloat(data[0].fare);

    // If API returned a valid fare, use it
    if (fare > 0) {
      return res.json({ startLocation, endLocation, fare, currency: 'EUR', source: 'rapidapi' });
    }

    // API responded but fare was 0 — fall through to local calculation
    throw new Error('API returned zero fare');

  } catch (err) {
    // Fallback: calculate fare using Haversine distance + Malta taxi rates
    console.warn('Fare API unavailable, using local calculation:', err.message);
    const distanceKm = getDistanceKm(start.lat, start.lng, end.lat, end.lng);
    const fare = calculateMaltaFare(distanceKm);
    console.log(`Calculated fare: €${fare} for ${distanceKm.toFixed(2)}km`);

    return res.json({
      startLocation,
      endLocation,
      fare,
      currency: 'EUR',
      source: 'calculated',
      distanceKm: parseFloat(distanceKm.toFixed(2))
    });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ service: 'fare-service', status: 'ok' }));

// Start (no DB needed)
app.listen(3004, () => console.log('Fare Service running on port 3004'));
