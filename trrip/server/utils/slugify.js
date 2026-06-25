const { nanoid } = require('nanoid');

const generateSlug = () => nanoid(10);

module.exports = { generateSlug };
