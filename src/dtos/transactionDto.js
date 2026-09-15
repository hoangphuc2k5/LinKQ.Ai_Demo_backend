class AnalyzeTransactionDto {
  constructor(file) {
    this.buffer = file.buffer;
    this.mimetype = file.mimetype;
    this.originalname = file.originalname;
  }
}

class ConfirmTransactionCustomerDto {
  constructor(transactionId, input = {}) {
    this.transactionId = Number(transactionId);
    this.customerId = Number(input.customerId);
  }
}

module.exports = {
  AnalyzeTransactionDto,
  ConfirmTransactionCustomerDto,
};