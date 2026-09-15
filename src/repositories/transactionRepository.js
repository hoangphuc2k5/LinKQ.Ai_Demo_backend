const { getPool, sql } = require('../config/db');

class TransactionRepository {
  async create(data) {
    const pool = await getPool();
    const result = await pool.request()
      .input('OriginalFileName', sql.NVarChar(255), data.originalFileName)
      .input('RawExtractedJson', sql.NVarChar(sql.MAX), data.rawExtractedJson)
      .input('BankName', sql.NVarChar(200), data.bankName || null)
      .input('SenderAccountNumber', sql.NVarChar(50), data.senderAccountNumber || null)
      .input('SenderAccountName', sql.NVarChar(200), data.senderAccountName || null)
      .input('ReceiverAccountNumber', sql.NVarChar(50), data.receiverAccountNumber || null)
      .input('ReceiverAccountName', sql.NVarChar(200), data.receiverAccountName || null)
      .input('Amount', sql.Decimal(18, 2), data.amount || null)
      .input('Currency', sql.NVarChar(10), data.currency || 'VND')
      .input('TransactionCode', sql.NVarChar(100), data.transactionCode || null)
      .input('TransactionDate', sql.DateTime2, data.transactionDate || null)
      .input('Content', sql.NVarChar(500), data.content || null)
      .input('MatchedCustomerId', sql.Int, data.matchedCustomerId || null)
      .input('MatchConfidence', sql.Decimal(5, 2), data.matchConfidence || 0)
      .input('MatchStatus', sql.NVarChar(20), data.matchStatus)
      .query(`
        INSERT INTO dbo.Transactions
          (OriginalFileName, RawExtractedJson, BankName, SenderAccountNumber, SenderAccountName,
           ReceiverAccountNumber, ReceiverAccountName, Amount, Currency, TransactionCode,
           TransactionDate, Content, MatchedCustomerId, MatchConfidence, MatchStatus)
        OUTPUT INSERTED.*
        VALUES
          (@OriginalFileName, @RawExtractedJson, @BankName, @SenderAccountNumber, @SenderAccountName,
           @ReceiverAccountNumber, @ReceiverAccountName, @Amount, @Currency, @TransactionCode,
           @TransactionDate, @Content, @MatchedCustomerId, @MatchConfidence, @MatchStatus)
      `);
    return result.recordset[0];
  }

  async findAll() {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT t.*, c.FullName AS MatchedCustomerName
      FROM dbo.Transactions t
      LEFT JOIN dbo.Customers c ON c.CustomerId = t.MatchedCustomerId
      ORDER BY t.CreatedAt DESC
    `);
    return result.recordset;
  }

  async findById(transactionId) {
    const pool = await getPool();
    const result = await pool.request()
      .input('TransactionId', sql.Int, transactionId)
      .query(`
        SELECT t.*, c.FullName AS MatchedCustomerName
        FROM dbo.Transactions t
        LEFT JOIN dbo.Customers c ON c.CustomerId = t.MatchedCustomerId
        WHERE t.TransactionId = @TransactionId
      `);
    return result.recordset[0] || null;
  }

  async confirmCustomer(transactionId, customerId) {
    const pool = await getPool();
    const result = await pool.request()
      .input('TransactionId', sql.Int, transactionId)
      .input('CustomerId', sql.Int, customerId)
      .query(`
        UPDATE dbo.Transactions SET
          MatchedCustomerId = @CustomerId,
          MatchStatus = N'MATCHED',
          Status = N'CONFIRMED',
          UpdatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE TransactionId = @TransactionId
      `);
    return result.recordset[0] || null;
  }
}

module.exports = new TransactionRepository();
