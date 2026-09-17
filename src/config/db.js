const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || [
  'postgresql://',
  encodeURIComponent(process.env.DB_USER || ''),
  ':',
  encodeURIComponent(process.env.DB_PASSWORD || ''),
  '@',
  process.env.DB_SERVER || '',
  ':',
  process.env.DB_PORT || '5432',
  '/',
  process.env.DB_NAME || 'neondb',
  '?sslmode=require',
].join('');

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

let initialized;

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Customers" (
      "CustomerId" SERIAL PRIMARY KEY,
      "FullName" VARCHAR(200) NOT NULL,
      "Phone" VARCHAR(20),
      "Email" VARCHAR(200),
      "BankAccountNumber" VARCHAR(50),
      "BankName" VARCHAR(200),
      "AccountHolderName" VARCHAR(200),
      "Note" VARCHAR(500),
      "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "Transactions" (
      "TransactionId" SERIAL PRIMARY KEY,
      "OriginalFileName" VARCHAR(255),
      "RawExtractedJson" TEXT,
      "BankName" VARCHAR(200),
      "SenderAccountNumber" VARCHAR(50),
      "SenderAccountName" VARCHAR(200),
      "ReceiverAccountNumber" VARCHAR(50),
      "ReceiverAccountName" VARCHAR(200),
      "Amount" NUMERIC(18, 2),
      "Currency" VARCHAR(10),
      "TransactionCode" VARCHAR(100),
      "TransactionDate" TIMESTAMPTZ,
      "Content" VARCHAR(500),
      "MatchedCustomerId" INTEGER REFERENCES "Customers"("CustomerId"),
      "MatchConfidence" NUMERIC(5, 2) DEFAULT 0,
      "MatchStatus" VARCHAR(20),
      "Status" VARCHAR(20) DEFAULT 'NEW',
      "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "PaymentOrders" (
      "PaymentOrderId" SERIAL PRIMARY KEY,
      "CustomerId" INTEGER NOT NULL REFERENCES "Customers"("CustomerId"),
      "PaymentCode" VARCHAR(100) UNIQUE,
      "Amount" NUMERIC(18, 2) NOT NULL,
      "Currency" VARCHAR(10) DEFAULT 'VND',
      "Description" VARCHAR(500),
      "DueDate" TIMESTAMPTZ,
      "Status" VARCHAR(20) DEFAULT 'PENDING',
      "PaidTransactionId" INTEGER REFERENCES "Transactions"("TransactionId"),
      "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getPool() {
  if (!initialized) {
    initialized = initializeDatabase()
      .then(() => {
        console.log('✅ Đã kết nối Neon PostgreSQL');
        return pool;
      })
      .catch((err) => {
        initialized = null;
        console.error('❌ Lỗi kết nối Neon PostgreSQL:', err.message);
        throw err;
      });
  }
  return initialized;
}

module.exports = { getPool };
