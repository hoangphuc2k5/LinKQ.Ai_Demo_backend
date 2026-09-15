const { getPool, sql } = require('../config/db');

class PaymentOrderRepository {
  async findAll(customerId = null) {
    const pool = await getPool();
    const request = pool.request();
    let filter = '';
    if (customerId) {
      request.input('CustomerId', sql.Int, customerId);
      filter = 'WHERE o.CustomerId = @CustomerId';
    }
    const result = await request.query(`
      SELECT o.*, c.FullName, c.BankAccountNumber,
             t.TransactionCode AS PaidTransactionCode
      FROM dbo.PaymentOrders o
      INNER JOIN dbo.Customers c ON c.CustomerId = o.CustomerId
      LEFT JOIN dbo.Transactions t ON t.TransactionId = o.PaidTransactionId
      ${filter}
      ORDER BY o.CreatedAt DESC
    `);
    return result.recordset;
  }

  async create(input) {
    const pool = await getPool();
    const result = await pool.request()
      .input('CustomerId', sql.Int, input.customerId)
      .input('PaymentCode', sql.NVarChar(100), input.paymentCode)
      .input('Amount', sql.Decimal(18, 2), input.amount)
      .input('Currency', sql.NVarChar(10), input.currency || 'VND')
      .input('Description', sql.NVarChar(500), input.description || null)
      .input('DueDate', sql.DateTime2, input.dueDate || null)
      .query(`
        INSERT INTO dbo.PaymentOrders (CustomerId, PaymentCode, Amount, Currency, Description, DueDate)
        OUTPUT INSERTED.*
        VALUES (@CustomerId, @PaymentCode, @Amount, @Currency, @Description, @DueDate)
      `);
    return result.recordset[0];
  }

  async updateStatus(orderId, status) {
    const pool = await getPool();
    const result = await pool.request()
      .input('PaymentOrderId', sql.Int, orderId)
      .input('Status', sql.NVarChar(20), status)
      .query(`
        UPDATE dbo.PaymentOrders
        SET Status = @Status, UpdatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE PaymentOrderId = @PaymentOrderId
      `);
    return result.recordset[0] || null;
  }

  async settle(orderId, transactionId) {
    const pool = await getPool();
    const result = await pool.request()
      .input('PaymentOrderId', sql.Int, orderId)
      .input('TransactionId', sql.Int, transactionId)
      .query(`
        UPDATE dbo.PaymentOrders
        SET Status = N'PAID',
            PaidTransactionId = @TransactionId,
            UpdatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE PaymentOrderId = @PaymentOrderId
          AND Status = N'PENDING'
      `);
    return result.recordset[0] || null;
  }
}

module.exports = new PaymentOrderRepository();
