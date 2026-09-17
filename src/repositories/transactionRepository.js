const { getPool } = require('../config/db');
const Transaction = require('../models/transactionModel');

class TransactionRepository {
  async create(data) {
    const pool = await getPool();
    const result = await pool.query(`
      INSERT INTO "Transactions"
        ("OriginalFileName", "RawExtractedJson", "BankName", "SenderAccountNumber", "SenderAccountName",
         "ReceiverAccountNumber", "ReceiverAccountName", "Amount", "Currency", "TransactionCode",
         "TransactionDate", "Content", "MatchedCustomerId", "MatchConfidence", "MatchStatus")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [data.originalFileName, data.rawExtractedJson, data.bankName || null,
      data.senderAccountNumber || null, data.senderAccountName || null,
      data.receiverAccountNumber || null, data.receiverAccountName || null,
      data.amount || null, data.currency || 'VND', data.transactionCode || null,
      data.transactionDate || null, data.content || null,
      data.matchedCustomerId || null, data.matchConfidence || 0, data.matchStatus]);
    return Transaction.fromRow(result.rows[0]);
  }

  async findAll() {
    const pool = await getPool();
    const result = await pool.query(`
      SELECT t.*, c."FullName" AS "MatchedCustomerName"
      FROM "Transactions" t
      LEFT JOIN "Customers" c ON c."CustomerId" = t."MatchedCustomerId"
      ORDER BY t."CreatedAt" DESC
    `);
    return result.rows.map(Transaction.fromRow);
  }

  async findById(transactionId) {
    const pool = await getPool();
    const result = await pool.query(`
      SELECT t.*, c."FullName" AS "MatchedCustomerName"
      FROM "Transactions" t
      LEFT JOIN "Customers" c ON c."CustomerId" = t."MatchedCustomerId"
      WHERE t."TransactionId" = $1
    `, [transactionId]);
    return Transaction.fromRow(result.rows[0]);
  }

  async confirmCustomer(transactionId, customerId) {
    const pool = await getPool();
    const result = await pool.query(`
      UPDATE "Transactions" SET
        "MatchedCustomerId" = $1, "MatchStatus" = 'MATCHED',
        "Status" = 'CONFIRMED', "UpdatedAt" = NOW()
      WHERE "TransactionId" = $2
      RETURNING *
    `, [customerId, transactionId]);
    return Transaction.fromRow(result.rows[0]);
  }
}

module.exports = new TransactionRepository();
