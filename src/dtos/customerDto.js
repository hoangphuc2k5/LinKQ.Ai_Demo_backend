class CustomerDto {
  constructor(input = {}) {
    this.fullName = String(input.fullName || '').trim();
    this.phone = String(input.phone || '').trim() || null;
    this.email = String(input.email || '').trim() || null;
    this.bankAccountNumber = String(input.bankAccountNumber || '').trim() || null;
    this.bankName = String(input.bankName || '').trim() || null;
    this.accountHolderName = String(input.accountHolderName || '').trim() || null;
    this.note = String(input.note || '').trim() || null;
  }
}

module.exports = CustomerDto;