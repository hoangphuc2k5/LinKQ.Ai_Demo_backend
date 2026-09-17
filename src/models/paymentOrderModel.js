class PaymentOrder {
  constructor(data = {}) {
    this.PaymentOrderId = data.PaymentOrderId ?? null;
    this.CustomerId = data.CustomerId ?? null;
    this.PaymentCode = data.PaymentCode || null;
    this.FullName = data.FullName || null;
    this.BankAccountNumber = data.BankAccountNumber || null;
    this.Amount = data.Amount ?? null;
    this.Currency = data.Currency || 'VND';
    this.Description = data.Description || null;
    this.DueDate = data.DueDate || null;
    this.Status = data.Status || 'PENDING';
    this.PaidTransactionId = data.PaidTransactionId ?? null;
    this.PaidTransactionCode = data.PaidTransactionCode || null;
    this.CreatedAt = data.CreatedAt || null;
    this.UpdatedAt = data.UpdatedAt || null;
  }

  static fromRow(row) {
    return row ? new PaymentOrder(row) : null;
  }
}

module.exports = PaymentOrder;
