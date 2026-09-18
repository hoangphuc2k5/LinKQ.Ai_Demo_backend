const paymentOrderRepository = require('../repositories/paymentOrderRepository');
const customerRepository = require('../repositories/customerRepository');

const VALID_STATUSES = new Set(['PENDING', 'PAID', 'EXPIRED', 'CANCELLED']);

class PaymentOrderService {
  async list(customerId) {
    return paymentOrderRepository.findAll(customerId ? Number(customerId) : null);
  }

  async create(input) {
    const customerId = Number(input.customerId);
    const paymentCode = typeof input.paymentCode === 'string' ? input.paymentCode.trim() : '';
    const amount = Number(input.amount);
    if (!paymentCode || paymentCode.length > 100 || !Number.isInteger(customerId) || amount <= 0) {
      const error = new Error('paymentCode, customerId và amount hợp lệ là bắt buộc');
      error.statusCode = 400;
      throw error;
    }
    if (!(await customerRepository.findById(customerId))) {
      const error = new Error('Khách hàng không tồn tại');
      error.statusCode = 404;
      throw error;
    }
    if (await paymentOrderRepository.findByPaymentCode(paymentCode)) {
      const error = new Error(`Mã thanh toán "${paymentCode}" đã tồn tại`);
      error.statusCode = 409;
      throw error;
    }
    const dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      const error = new Error('dueDate không hợp lệ');
      error.statusCode = 400;
      throw error;
    }
    try {
      return await paymentOrderRepository.create({ ...input, paymentCode, customerId, amount, dueDate });
    } catch (cause) {
      if (cause.code === '23505' && cause.constraint === 'PaymentOrders_PaymentCode_key') {
        const error = new Error(`Mã thanh toán "${paymentCode}" đã tồn tại`);
        error.statusCode = 409;
        throw error;
      }
      throw cause;
    }
  }

  async updateStatus(orderId, status) {
    if (!VALID_STATUSES.has(status)) {
      const error = new Error('Trạng thái đơn không hợp lệ');
      error.statusCode = 400;
      throw error;
    }
    const order = await paymentOrderRepository.updateStatus(Number(orderId), status);
    if (!order) {
      const error = new Error('Không tìm thấy đơn thanh toán');
      error.statusCode = 404;
      throw error;
    }
    return order;
  }

  async settle(orderId, transactionId) {
    if (!Number.isInteger(Number(transactionId))) {
      const error = new Error('transactionId không hợp lệ');
      error.statusCode = 400;
      throw error;
    }
    const order = await paymentOrderRepository.settle(Number(orderId), Number(transactionId));
    if (!order) {
      const error = new Error('Đơn không tồn tại hoặc không còn ở trạng thái chờ thanh toán');
      error.statusCode = 409;
      throw error;
    }
    return order;
  }
}

module.exports = new PaymentOrderService();
