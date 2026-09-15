const { getPool, sql } = require('../config/db');

class CustomerRepository {
  async findAll() {
    const pool = await getPool();
    const result = await pool.request().query(
      'SELECT * FROM dbo.Customers ORDER BY CreatedAt DESC'
    );
    return result.recordset;
  }

  async findById(customerId) {
    const pool = await getPool();
    const result = await pool.request()
      .input('CustomerId', sql.Int, customerId)
      .query('SELECT * FROM dbo.Customers WHERE CustomerId = @CustomerId');
    return result.recordset[0] || null;
  }

  async create(input) {
    const pool = await getPool();
    const result = await pool.request()
      .input('FullName', sql.NVarChar(200), input.fullName)
      .input('Phone', sql.NVarChar(20), input.phone || null)
      .input('Email', sql.NVarChar(200), input.email || null)
      .input('BankAccountNumber', sql.NVarChar(50), input.bankAccountNumber || null)
      .input('BankName', sql.NVarChar(200), input.bankName || null)
      .input('AccountHolderName', sql.NVarChar(200), input.accountHolderName || null)
      .input('Note', sql.NVarChar(500), input.note || null)
      .query(`
        INSERT INTO dbo.Customers
          (FullName, Phone, Email, BankAccountNumber, BankName, AccountHolderName, Note)
        OUTPUT INSERTED.*
        VALUES (@FullName, @Phone, @Email, @BankAccountNumber, @BankName, @AccountHolderName, @Note)
      `);
    return result.recordset[0];
  }

  async update(customerId, input) {
    const pool = await getPool();
    const result = await pool.request()
      .input('CustomerId', sql.Int, customerId)
      .input('FullName', sql.NVarChar(200), input.fullName)
      .input('Phone', sql.NVarChar(20), input.phone || null)
      .input('Email', sql.NVarChar(200), input.email || null)
      .input('BankAccountNumber', sql.NVarChar(50), input.bankAccountNumber || null)
      .input('BankName', sql.NVarChar(200), input.bankName || null)
      .input('AccountHolderName', sql.NVarChar(200), input.accountHolderName || null)
      .input('Note', sql.NVarChar(500), input.note || null)
      .query(`
        UPDATE dbo.Customers SET
          FullName = @FullName,
          Phone = @Phone,
          Email = @Email,
          BankAccountNumber = @BankAccountNumber,
          BankName = @BankName,
          AccountHolderName = @AccountHolderName,
          Note = @Note,
          UpdatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE CustomerId = @CustomerId
      `);
    return result.recordset[0] || null;
  }

  async delete(customerId) {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      await new sql.Request(transaction)
        .input('CustomerId', sql.Int, customerId)
        .query(`
          UPDATE dbo.Transactions
          SET MatchedCustomerId = NULL,
              MatchStatus = N'NEEDS_REVIEW',
              Status = N'NEW',
              UpdatedAt = SYSUTCDATETIME()
          WHERE MatchedCustomerId = @CustomerId
        `);

      const result = await new sql.Request(transaction)
        .input('CustomerId', sql.Int, customerId)
        .query('DELETE FROM dbo.Customers WHERE CustomerId = @CustomerId');

      await transaction.commit();
      return result.rowsAffected[0] > 0;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = new CustomerRepository();
