const express = require('express');
const { uploadFiles, getUploadStatus } = require('../controllers/upload.controller');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.post('/', auth, upload.array('files', 5), uploadFiles);
router.get('/:id/status', auth, getUploadStatus);

module.exports = router;
