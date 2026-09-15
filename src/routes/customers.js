const express = require('express');
const customerController = require('../controllers/customerController');

const router = express.Router();

router.get('/', customerController.list);
router.get('/:id', customerController.get);
router.post('/', customerController.create);
router.put('/:id', customerController.update);
router.delete('/:id', customerController.remove);

module.exports = router;
