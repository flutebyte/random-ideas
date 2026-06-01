const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  text:   { type: String, required: true, trim: true, maxlength: 500 },
  sender: { type: String, required: true, trim: true },
  avatar: { type: String, default: '👦' },
}, { timestamps: true }); // createdAt used for ordering

module.exports = mongoose.model('Message', messageSchema);
