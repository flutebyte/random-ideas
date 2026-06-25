const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.id).select('-passwordHash');
      if (user) req.user = user;
    }
  } catch {
    // Silently ignore — auth is optional on this route
  }
  next();
};

module.exports = optionalAuth;
