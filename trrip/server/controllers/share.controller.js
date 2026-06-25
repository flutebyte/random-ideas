const Itinerary = require('../models/Itinerary');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

exports.getSharedItinerary = asyncHandler(async (req, res) => {
  const itinerary = await Itinerary.findOne({ slug: req.params.slug })
    .populate('owner', 'name');

  if (!itinerary) throw new AppError('Itinerary not found', 404);

  const isOwner = req.user && req.user._id.toString() === itinerary.owner._id.toString();

  // Return 404 for private itineraries to prevent enumeration
  if (!itinerary.isPublic && !isOwner) {
    throw new AppError('Itinerary not found', 404);
  }

  res.json({ success: true, itinerary });
});
