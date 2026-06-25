const express = require('express');
const {
  listItineraries,
  createItinerary,
  getItinerary,
  getItineraryStatus,
  updateItinerary,
  deleteItinerary,
  toggleShare,
  regenerateItinerary,
} = require('../controllers/itinerary.controller');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/', listItineraries);
router.post('/', createItinerary);
router.get('/:id', getItinerary);
router.get('/:id/status', getItineraryStatus);
router.patch('/:id', updateItinerary);
router.delete('/:id', deleteItinerary);
router.post('/:id/share', toggleShare);
router.post('/:id/regenerate', regenerateItinerary);

module.exports = router;
