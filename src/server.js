require('dotenv').config();
const express = require('express');
const cors = require('cors');

const customersRouter = require('./routes/customers');
const transactionsRouter = require('./routes/transactions');
const paymentOrdersRouter = require('./routes/paymentOrders');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/customers', customersRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/payment-orders', paymentOrdersRouter);

// Xử lý lỗi chung
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || 'Lỗi máy chủ' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend đang chạy tại http://localhost:${PORT}`);
});
