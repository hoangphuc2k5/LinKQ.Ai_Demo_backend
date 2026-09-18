const express = require('express');
const multer = require('multer');
const transactionController = require('../controllers/transactionController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  },
});

router.post('/analyze', upload.single('file'), transactionController.analyze);
router.get('/', transactionController.list);
router.get('/:id', transactionController.get);
router.put('/:id/confirm', transactionController.confirm);

module.exports = router;
