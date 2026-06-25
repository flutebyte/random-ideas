const express = require('express');
const authRoutes = require('./auth.routes');
const uploadRoutes = require('./upload.routes');
const itineraryRoutes = require('./itinerary.routes');
const shareRoutes = require('./share.routes');
const { apiLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(apiLimiter);
router.use('/auth', authRoutes);
router.use('/uploads', uploadRoutes);
router.use('/itineraries', itineraryRoutes);
router.use('/share', shareRoutes);

module.exports = router;
