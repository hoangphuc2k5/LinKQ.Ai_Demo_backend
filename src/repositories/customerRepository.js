const { getPool } = require('../config/db');
const Customer = require('../models/customerModel');

class CustomerRepository {
  async findAll() {
    const pool = await getPool();
    const result = await pool.query('SELECT * FROM "Customers" ORDER BY "CreatedAt" DESC');
    return result.rows.map(Customer.fromRow);
  }

  async findById(customerId) {
    const pool = await getPool();
    const result = await pool.query('SELECT * FROM "Customers" WHERE "CustomerId" = $1', [customerId]);
    return Customer.fromRow(result.rows[0]);
  }

  async create(input) {
    const pool = await getPool();
    const result = await pool.query(`
      INSERT INTO "Customers"
        ("FullName", "Phone", "Email", "BankAccountNumber", "BankName", "AccountHolderName", "Note")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [input.fullName, input.phone || null, input.email || null,
      input.bankAccountNumber || null, input.bankName || null,
      input.accountHolderName || null, input.note || null]);
    return Customer.fromRow(result.rows[0]);
  }

  async update(customerId, input) {
    const pool = await getPool();
    const result = await pool.query(`
      UPDATE "Customers" SET
        "FullName" = $1, "Phone" = $2, "Email" = $3,
        "BankAccountNumber" = $4, "BankName" = $5,
        "AccountHolderName" = $6, "Note" = $7, "UpdatedAt" = NOW()
      WHERE "CustomerId" = $8
      RETURNING *
    `, [input.fullName, input.phone || null, input.email || null,
      input.bankAccountNumber || null, input.bankName || null,
      input.accountHolderName || null, input.note || null, customerId]);
    return Customer.fromRow(result.rows[0]);
  }

  async delete(customerId) {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE "Transactions"
        SET "MatchedCustomerId" = NULL, "MatchStatus" = 'NEEDS_REVIEW',
            "Status" = 'NEW', "UpdatedAt" = NOW()
        WHERE "MatchedCustomerId" = $1
      `, [customerId]);
      const result = await client.query('DELETE FROM "Customers" WHERE "CustomerId" = $1', [customerId]);
      await client.query('COMMIT');
      return result.rowCount > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new CustomerRepository();
