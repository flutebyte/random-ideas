const mongoose = require('mongoose');

const connectDB = async (retries = 5) => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
  } catch (err) {
    if (retries > 0) {
      console.warn(`MongoDB connection failed, retrying... (${retries} attempts left)`);
      await new Promise((r) => setTimeout(r, 3000));
      return connectDB(retries - 1);
    }
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
