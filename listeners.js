require('dotenv').config();
const axios = require('axios');
const bookingBus = require('./events');

const CUSTOMER_URL = process.env.CUSTOMER_SERVICE_URL || 'http://localhost:3001';

// Task 6: 3 minutes after a booking is created, notify the user their cab is ready
bookingBus.on('booking.created', ({ booking, userId }) => {
  console.log(`[Event] booking.created — starting 3-min cab timer for booking ${booking._id}`);

  setTimeout(async () => {
    try {
      await axios.post(`${CUSTOMER_URL}/notifications`, {
        userId,
        type: 'cab_ready',
        message: `Your cab is ready! Driver is heading to "${booking.startLocation}". Destination: "${booking.endLocation}".`,
        data: {
          bookingId:     booking._id,
          startLocation: booking.startLocation,
          endLocation:   booking.endLocation,
          cabType:       booking.cabType,
          dateTime:      booking.dateTime
        }
      });
      console.log(`[Event] cab_ready notification sent for booking ${booking._id}`);
    } catch (err) {
      console.error('[Event] cab_ready notification failed:', err.message);
    }
  }, 3 * 60 * 1000); // 3 minutes
});

// Task 5: When a user completes their 3rd booking, send a one-time discount notification
bookingBus.on('discount.available', async ({ userId }) => {
  console.log(`[Event] discount.available — sending discount notification to user ${userId}`);
  try {
    await axios.post(`${CUSTOMER_URL}/notifications`, {
      userId,
      type: 'discount',
      message: 'Congratulations! You have completed 3 bookings and earned a 10% discount on your next ride.',
      data: { discountMultiplier: 0.9 }
    });
    console.log(`[Event] discount notification sent for user ${userId}`);
  } catch (err) {
    console.error('[Event] discount notification failed:', err.message);
  }
});
