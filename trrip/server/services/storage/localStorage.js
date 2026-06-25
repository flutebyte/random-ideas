const path = require('path');

const getLocalFileUrl = (localPath) => {
  const filename = path.basename(localPath);
  return `/uploads/${filename}`;
};

module.exports = { getLocalFileUrl };
