const paymentOrderService = require('../services/paymentOrderService');
const {
  CreatePaymentOrderDto,
  ListPaymentOrdersDto,
  UpdatePaymentOrderStatusDto,
  SettlePaymentOrderDto,
} = require('../dtos/paymentOrderDto');
const { ResourceIdDto } = require('../dtos/commonDto');

class PaymentOrderController {
  list = async (req, res, next) => {
    try {
      res.json(await paymentOrderService.list(new ListPaymentOrdersDto(req.query).customerId));
    } catch (error) {
      next(error);
    }
  };

  create = async (req, res, next) => {
    try {
      res.status(201).json(await paymentOrderService.create(new CreatePaymentOrderDto(req.body)));
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req, res, next) => {
    try {
      const input = new UpdatePaymentOrderStatusDto(req.body);
      res.json(await paymentOrderService.updateStatus(new ResourceIdDto(req.params.id).id, input.status));
    } catch (error) {
      next(error);
    }
  };

  settle = async (req, res, next) => {
    try {
      const input = new SettlePaymentOrderDto(req.body);
      res.json(await paymentOrderService.settle(new ResourceIdDto(req.params.id).id, input.transactionId));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = new PaymentOrderController();
