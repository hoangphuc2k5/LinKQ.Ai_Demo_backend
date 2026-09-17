class Transaction {
  constructor(data = {}) {
    this.TransactionId = data.TransactionId ?? null;
    this.OriginalFileName = data.OriginalFileName || null;
    this.RawExtractedJson = data.RawExtractedJson || null;
    this.BankName = data.BankName || null;
    this.SenderAccountNumber = data.SenderAccountNumber || null;
    this.SenderAccountName = data.SenderAccountName || null;
    this.ReceiverAccountNumber = data.ReceiverAccountNumber || null;
    this.ReceiverAccountName = data.ReceiverAccountName || null;
    this.Amount = data.Amount ?? null;
    this.Currency = data.Currency || null;
    this.TransactionCode = data.TransactionCode || null;
    this.TransactionDate = data.TransactionDate || null;
    this.Content = data.Content || null;
    this.MatchedCustomerId = data.MatchedCustomerId ?? null;
    this.MatchedCustomerName = data.MatchedCustomerName || null;
    this.MatchConfidence = data.MatchConfidence ?? 0;
    this.MatchStatus = data.MatchStatus || null;
    this.Status = data.Status || 'NEW';
    this.CreatedAt = data.CreatedAt || null;
    this.UpdatedAt = data.UpdatedAt || null;
  }

  static fromRow(row) {
    return row ? new Transaction(row) : null;
  }
}

module.exports = Transaction;
