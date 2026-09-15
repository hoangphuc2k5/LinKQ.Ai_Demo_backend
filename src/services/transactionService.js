const { extractPaymentInfo } = require('./geminiService');
const { matchCustomer } = require('./matchService');
const transactionRepository = require('../repositories/transactionRepository');

class TransactionService {
  async analyze(file) {
    const { parsed, raw } = await extractPaymentInfo(file.buffer, file.mimetype);
    const matchResult = await matchCustomer(parsed);
    const matchStatus = matchResult.customer
      ? 'MATCHED'
      : matchResult.confidence > 0 ? 'NEEDS_REVIEW' : 'UNMATCHED';

    const parsedDate = parsed.transactionDate ? new Date(parsed.transactionDate) : null;
    const transaction = await transactionRepository.create({
      originalFileName: file.originalname,
      rawExtractedJson: raw,
      ...parsed,
      transactionDate: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
      matchedCustomerId: matchResult.customer?.CustomerId,
      matchConfidence: matchResult.confidence,
      matchStatus,
    });

    return { transaction, extracted: parsed, matchCandidates: matchResult.candidates };
  }

  async list() {
    return transactionRepository.findAll();
  }

  async get(transactionId) {
    const transaction = await transactionRepository.findById(transactionId);
    if (!transaction) throw this.notFoundError('Không tìm thấy giao dịch');
    return transaction;
  }

  async confirm(transactionId, customerId) {
    if (!Number.isInteger(customerId)) {
      const error = new Error('customerId không hợp lệ');
      error.statusCode = 400;
      throw error;
    }
    const transaction = await transactionRepository.confirmCustomer(transactionId, customerId);
    if (!transaction) throw this.notFoundError('Không tìm thấy giao dịch');
    return transaction;
  }

  notFoundError(message) {
    const error = new Error(message);
    error.statusCode = 404;
    return error;
  }
}

module.exports = new TransactionService();
