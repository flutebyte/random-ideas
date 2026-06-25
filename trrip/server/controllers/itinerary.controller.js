const Itinerary = require('../models/Itinerary');
const Upload = require('../models/Upload');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { generateSlug } = require('../utils/slugify');
const { mergeDocuments } = require('../services/ai/mergeDocuments');
const { generateItinerary } = require('../services/ai/generateItinerary');

exports.listItineraries = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Itinerary.find({ owner: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-itinerary.days -extractedData'),
    Itinerary.countDocuments({ owner: req.user._id }),
  ]);

  res.json({ success: true, data, total, page, pages: Math.ceil(total / limit) });
});

exports.createItinerary = asyncHandler(async (req, res) => {
  const { uploadIds, title } = req.body;
  if (!Array.isArray(uploadIds) || uploadIds.length === 0) {
    throw new AppError('uploadIds array is required', 400);
  }

  const uploads = await Upload.find({
    _id: { $in: uploadIds },
    owner: req.user._id,
    'extracted.status': 'done',
  });

  if (uploads.length === 0) {
    throw new AppError('No successfully processed uploads found. Please wait for extraction to complete.', 400);
  }

  const extractedData = mergeDocuments(uploads.map((u) => u.extracted.data));
  const tripTitle = title || (extractedData.destination
    ? `Trip to ${extractedData.destination}`
    : 'My Trip');

  const itinerary = await Itinerary.create({
    owner: req.user._id,
    title: tripTitle,
    slug: generateSlug(),
    uploads: uploads.map((u) => u._id),
    extractedData,
    itinerary: { status: 'pending' },
  });

  // Fire async generation — do not await
  generateItinerary(itinerary).catch((err) =>
    console.error(`Generation failed for itinerary ${itinerary._id}:`, err.message)
  );

  res.status(201).json({ success: true, itinerary });
});

exports.getItinerary = asyncHandler(async (req, res) => {
  const itinerary = await Itinerary.findOne({ _id: req.params.id, owner: req.user._id })
    .populate('owner', 'name');
  if (!itinerary) throw new AppError('Itinerary not found', 404);
  res.json({ success: true, itinerary });
});

exports.getItineraryStatus = asyncHandler(async (req, res) => {
  const itinerary = await Itinerary.findOne({ _id: req.params.id, owner: req.user._id })
    .select('itinerary.status itinerary.error');
  if (!itinerary) throw new AppError('Itinerary not found', 404);
  res.json({
    success: true,
    status: itinerary.itinerary.status,
    error: itinerary.itinerary.error,
  });
});

exports.updateItinerary = asyncHandler(async (req, res) => {
  const { title, isPublic, tags } = req.body;
  const update = {};
  if (title !== undefined) update.title = title;
  if (isPublic !== undefined) update.isPublic = isPublic;
  if (tags !== undefined) update.tags = tags;

  const itinerary = await Itinerary.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    update,
    { new: true, runValidators: true }
  );
  if (!itinerary) throw new AppError('Itinerary not found', 404);
  res.json({ success: true, itinerary });
});

exports.deleteItinerary = asyncHandler(async (req, res) => {
  const itinerary = await Itinerary.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
  if (!itinerary) throw new AppError('Itinerary not found', 404);
  res.json({ success: true, message: 'Itinerary deleted' });
});

exports.toggleShare = asyncHandler(async (req, res) => {
  const { isPublic } = req.body;
  if (typeof isPublic !== 'boolean') throw new AppError('isPublic must be a boolean', 400);

  const itinerary = await Itinerary.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { isPublic },
    { new: true }
  );
  if (!itinerary) throw new AppError('Itinerary not found', 404);

  const shareUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/share/${itinerary.slug}`;
  res.json({ success: true, slug: itinerary.slug, shareUrl, isPublic: itinerary.isPublic });
});

exports.regenerateItinerary = asyncHandler(async (req, res) => {
  const itinerary = await Itinerary.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { 'itinerary.status': 'pending', 'itinerary.error': null, 'itinerary.days': [] },
    { new: true }
  );
  if (!itinerary) throw new AppError('Itinerary not found', 404);

  generateItinerary(itinerary, req.body.customNotes).catch((err) =>
    console.error(`Regeneration failed for itinerary ${itinerary._id}:`, err.message)
  );

  res.json({ success: true, itinerary });
});
