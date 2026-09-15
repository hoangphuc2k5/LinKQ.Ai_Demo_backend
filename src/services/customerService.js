const customerRepository = require('../repositories/customerRepository');

class CustomerService {
  async list() {
    return customerRepository.findAll();
  }

  async get(customerId) {
    const customer = await customerRepository.findById(customerId);
    if (!customer) throw this.notFoundError();
    return customer;
  }

  async create(input) {
    this.validate(input);
    return customerRepository.create(input);
  }

  async update(customerId, input) {
    this.validate(input);
    const customer = await customerRepository.update(customerId, input);
    if (!customer) throw this.notFoundError();
    return customer;
  }

  async remove(customerId) {
    const deleted = await customerRepository.delete(customerId);
    if (!deleted) throw this.notFoundError();
  }

  validate(input) {
    if (!input || !String(input.fullName || '').trim()) {
      const error = new Error('fullName là bắt buộc');
      error.statusCode = 400;
      throw error;
    }
  }

  notFoundError() {
    const error = new Error('Không tìm thấy khách hàng');
    error.statusCode = 404;
    return error;
  }
}

module.exports = new CustomerService();
