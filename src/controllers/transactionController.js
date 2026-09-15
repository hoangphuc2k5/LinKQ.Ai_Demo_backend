const transactionService = require('../services/transactionService');
const {
  AnalyzeTransactionDto,
  ConfirmTransactionCustomerDto,
} = require('../dtos/transactionDto');
const { ResourceIdDto } = require('../dtos/commonDto');

class TransactionController {
  analyze = async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Vui lòng tải lên 1 file ảnh (field "file")' });
      }
      res.status(201).json(await transactionService.analyze(new AnalyzeTransactionDto(req.file)));
    } catch (error) {
      next(error);
    }
  };

  list = async (req, res, next) => {
    try {
      res.json(await transactionService.list());
    } catch (error) {
      next(error);
    }
  };

  get = async (req, res, next) => {
    try {
      res.json(await transactionService.get(new ResourceIdDto(req.params.id).id));
    } catch (error) {
      next(error);
    }
  };

  confirm = async (req, res, next) => {
    try {
      const input = new ConfirmTransactionCustomerDto(new ResourceIdDto(req.params.id).id, req.body);
      res.json(await transactionService.confirm(input.transactionId, input.customerId));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = new TransactionController();
