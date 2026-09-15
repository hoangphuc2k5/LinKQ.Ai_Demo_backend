class CreatePaymentOrderDto {
  constructor(input = {}) {
    this.customerId = Number(input.customerId);
    this.paymentCode = String(input.paymentCode || '').trim();
    this.amount = Number(input.amount);
    this.currency = String(input.currency || 'VND').trim();
    this.description = String(input.description || '').trim() || null;
    this.dueDate = input.dueDate || null;
  }
}

class ListPaymentOrdersDto {
  constructor(input = {}) {
    this.customerId = input.customerId ? Number(input.customerId) : null;
  }
}

class UpdatePaymentOrderStatusDto {
  constructor(input = {}) {
    this.status = String(input.status || '').trim().toUpperCase();
  }
}

class SettlePaymentOrderDto {
  constructor(input = {}) {
    this.transactionId = Number(input.transactionId);
  }
}

module.exports = {
  CreatePaymentOrderDto,
  ListPaymentOrdersDto,
  UpdatePaymentOrderStatusDto,
  SettlePaymentOrderDto,
};