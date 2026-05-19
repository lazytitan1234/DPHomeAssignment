const EventEmitter = require('events');

// Shared event bus — imported by bookingService and listeners
const bookingBus = new EventEmitter();

module.exports = bookingBus;
