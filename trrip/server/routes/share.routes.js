const express = require('express');
const { getSharedItinerary } = require('../controllers/share.controller');
const optionalAuth = require('../middleware/optionalAuth');

const router = express.Router();

router.get('/:slug', optionalAuth, getSharedItinerary);

module.exports = router;
