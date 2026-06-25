const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const auth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401);
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  const user = await User.findById(decoded.id).select('-passwordHash');
  if (!user) throw new AppError('User not found', 401);

  req.user = user;
  next();
});

module.exports = auth;
