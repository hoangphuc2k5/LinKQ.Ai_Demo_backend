const { getPool } = require('../config/db');
const PaymentOrder = require('../models/paymentOrderModel');

class PaymentOrderRepository {
  async findAll(customerId = null) {
    const pool = await getPool();
    const result = await pool.query(`
      SELECT o.*, c."FullName", c."BankAccountNumber",
             t."TransactionCode" AS "PaidTransactionCode"
      FROM "PaymentOrders" o
      INNER JOIN "Customers" c ON c."CustomerId" = o."CustomerId"
      LEFT JOIN "Transactions" t ON t."TransactionId" = o."PaidTransactionId"
      ${customerId ? 'WHERE o."CustomerId" = $1' : ''}
      ORDER BY o."CreatedAt" DESC
    `, customerId ? [customerId] : []);
    return result.rows.map(PaymentOrder.fromRow);
  }

  async create(input) {
    const pool = await getPool();
    const result = await pool.query(`
      INSERT INTO "PaymentOrders"
        ("CustomerId", "PaymentCode", "Amount", "Currency", "Description", "DueDate")
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [input.customerId, input.paymentCode, input.amount, input.currency || 'VND',
      input.description || null, input.dueDate || null]);
    return PaymentOrder.fromRow(result.rows[0]);
  }

  async findByPaymentCode(paymentCode) {
    const pool = await getPool();
    const result = await pool.query(
      'SELECT "PaymentOrderId" FROM "PaymentOrders" WHERE "PaymentCode" = $1 LIMIT 1',
      [paymentCode],
    );
    return result.rows[0] || null;
  }

  async updateStatus(orderId, status) {
    const pool = await getPool();
    const result = await pool.query(`
      UPDATE "PaymentOrders"
      SET "Status" = $1, "UpdatedAt" = NOW()
      WHERE "PaymentOrderId" = $2
      RETURNING *
    `, [status, orderId]);
    return PaymentOrder.fromRow(result.rows[0]);
  }

  async settle(orderId, transactionId) {
    const pool = await getPool();
    const result = await pool.query(`
      UPDATE "PaymentOrders"
      SET "Status" = 'PAID', "PaidTransactionId" = $1, "UpdatedAt" = NOW()
      WHERE "PaymentOrderId" = $2 AND "Status" = 'PENDING'
      RETURNING *
    `, [transactionId, orderId]);
    return PaymentOrder.fromRow(result.rows[0]);
  }
}

module.exports = new PaymentOrderRepository();
