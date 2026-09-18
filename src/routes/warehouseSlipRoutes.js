const express = require('express');
const multer = require('multer');
const warehouseSlipController = require('../controllers/warehouseSlipController');

const router = express.Router();
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024 },
	fileFilter: (req, file, cb) => {
		if (file.originalname.toLowerCase().endsWith('.rar')
			|| ['application/x-rar-compressed', 'application/vnd.rar'].includes(file.mimetype)) {
			const error = new Error('Không hỗ trợ file RAR. Vui lòng upload PDF, DOCX, XLSX, XML hoặc hình ảnh.');
			error.statusCode = 400;
			return cb(error);
		}
		cb(null, true);
	},
});

router.post('/analyze', upload.single('file'), warehouseSlipController.analyze);
router.get('/', warehouseSlipController.list);

module.exports = router;
