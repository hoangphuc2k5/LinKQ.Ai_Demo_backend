const express = require('express');
const paymentOrderController = require('../controllers/paymentOrderController');

const router = express.Router();

router.get('/', paymentOrderController.list);
router.post('/', paymentOrderController.create);
router.patch('/:id/status', paymentOrderController.updateStatus);
router.post('/:id/settle', paymentOrderController.settle);

module.exports = router;
