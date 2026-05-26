require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');
const axios    = require('axios');

const Location = require('./models/Location');

const app = express();
app.use(cors());
app.use(express.json());

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

// Get all favourite locations
app.get('/locations', authMiddleware, async (req, res) => {
  try {
    const locations = await Location.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a favourite location
app.post('/locations', authMiddleware, async (req, res) => {
  try {
    const { name, address } = req.body;
    if (!name || !address)
      return res.status(400).json({ error: 'name and address are required' });

    const location = await new Location({ userId: req.user.id, name, address }).save();
    res.status(201).json(location);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a favourite location
app.put('/locations/:id', authMiddleware, async (req, res) => {
  try {
    const { name, address } = req.body;
    const location = await Location.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { name, address },
      { new: true, runValidators: true }
    );
    if (!location) return res.status(404).json({ error: 'Location not found' });
    res.json(location);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a favourite location
app.delete('/locations/:id', authMiddleware, async (req, res) => {
  try {
    const location = await Location.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!location) return res.status(404).json({ error: 'Location not found' });
    res.json({ message: 'Location removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get weather forecast for a saved location
app.get('/locations/:id/weather', authMiddleware, async (req, res) => {
  try {
    const location = await Location.findOne({ _id: req.params.id, userId: req.user.id });
    if (!location) return res.status(404).json({ error: 'Location not found' });

    const response = await axios.get('https://weatherapi-com.p.rapidapi.com/forecast.json', {
      params: { q: location.address, days: '3', aqi: 'no', alerts: 'no' },
      headers: {
        'x-rapidapi-key':  process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': process.env.RAPIDAPI_WEATHER_HOST || 'weatherapi-com.p.rapidapi.com'
      }
    });

    const data = response.data;

    res.json({
      location: { id: location._id, name: location.name, address: location.address },
      weather: {
        current: {
          temp_c:    data.current?.temp_c,
          condition: data.current?.condition?.text,
          icon:      data.current?.condition?.icon,
          humidity:  data.current?.humidity,
          wind_kph:  data.current?.wind_kph
        },
        forecast: data.forecast?.forecastday?.map(day => ({
          date:             day.date,
          max_temp_c:       day.day?.maxtemp_c,
          min_temp_c:       day.day?.mintemp_c,
          condition:        day.day?.condition?.text,
          icon:             day.day?.condition?.icon,
          chance_of_rain:   day.day?.daily_chance_of_rain
        }))
      }
    });
  } catch (err) {
    console.error('Weather API error:', err.message);
    res.status(500).json({ error: 'Could not retrieve weather data' });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ service: 'location-service', status: 'ok' }));

// Start
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    app.listen(3005, () => console.log('Location Service running on port 3005'));
  })
  .catch(err => { console.error('MongoDB error:', err.message); process.exit(1); });
