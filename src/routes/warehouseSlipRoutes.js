const express = require('express');
const multer = require('multer');
const warehouseSlipController = require('../controllers/warehouseSlipController');

const router = express.Router();
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024 },
	fileFilter: (req, file, cb) => {
		if (!file.mimetype.startsWith('image/')) return cb(new Error('Chỉ chấp nhận file ảnh'));
		cb(null, true);
	},
});

router.post('/analyze', upload.single('file'), warehouseSlipController.analyze);
router.get('/', warehouseSlipController.list);

module.exports = router;
