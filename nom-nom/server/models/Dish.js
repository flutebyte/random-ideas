const mongoose = require('mongoose');

const dishSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  emoji:         { type: String, required: true },
  done:          { type: Boolean, default: false },
  addedBy:       { type: String, required: true, trim: true },
  addedByAvatar: { type: String, default: '👦' },
}, { timestamps: true }); // createdAt used for sort

module.exports = mongoose.model('Dish', dishSchema);
