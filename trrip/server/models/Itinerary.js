const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    time: String,
    type: {
      type: String,
      enum: ['flight', 'hotel_checkin', 'hotel_checkout', 'sightseeing', 'food', 'transport', 'free', 'other'],
    },
    title: String,
    description: String,
    location: String,
    durationMinutes: Number,
    bookingRef: String,
  },
  { _id: false }
);

const daySchema = new mongoose.Schema(
  {
    date: Date,
    dayNumber: Number,
    title: String,
    activities: [activitySchema],
  },
  { _id: false }
);

const flightSchema = new mongoose.Schema(
  {
    flightNumber: String,
    airline: String,
    from: String,
    to: String,
    departure: Date,
    arrival: Date,
    class: String,
    confirmationCode: String,
  },
  { _id: false }
);

const hotelSchema = new mongoose.Schema(
  {
    name: String,
    address: String,
    city: String,
    checkIn: Date,
    checkOut: Date,
    roomType: String,
    confirmationCode: String,
  },
  { _id: false }
);

const activityBookingSchema = new mongoose.Schema(
  {
    name: String,
    date: Date,
    location: String,
    bookingRef: String,
  },
  { _id: false }
);

const itinerarySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, index: true },
    isPublic: { type: Boolean, default: false, index: true },
    uploads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Upload' }],
    extractedData: {
      origin: String,
      destination: String,
      departureDate: Date,
      returnDate: Date,
      travelerName: String,
      flights: [flightSchema],
      hotels: [hotelSchema],
      activities: [activityBookingSchema],
      rawNotes: String,
    },
    itinerary: {
      status: {
        type: String,
        enum: ['pending', 'generating', 'done', 'failed'],
        default: 'pending',
      },
      error: String,
      days: [daySchema],
      generatedAt: Date,
    },
    tags: [String],
  },
  { timestamps: true }
);

itinerarySchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('Itinerary', itinerarySchema);
