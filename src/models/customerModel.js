class Customer {
  constructor(data = {}) {
    this.CustomerId = data.CustomerId ?? null;
    this.FullName = data.FullName || '';
    this.Phone = data.Phone || null;
    this.Email = data.Email || null;
    this.BankAccountNumber = data.BankAccountNumber || null;
    this.BankName = data.BankName || null;
    this.AccountHolderName = data.AccountHolderName || null;
    this.Note = data.Note || null;
    this.CreatedAt = data.CreatedAt || null;
    this.UpdatedAt = data.UpdatedAt || null;
  }

  static fromRow(row) {
    return row ? new Customer(row) : null;
  }
}

module.exports = Customer;
