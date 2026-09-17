const { getPool } = require('../config/db');

/**
 * Chuẩn hoá số tài khoản: chỉ giữ chữ số
 */
function normalizeAccountNumber(value) {
  if (!value) return '';
  return String(value).replace(/\D/g, '');
}

/**
 * Chuẩn hoá tên: bỏ dấu, viết hoa, bỏ khoảng trắng thừa
 */
function normalizeName(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tính điểm tương đồng đơn giản giữa 2 chuỗi (0-100) dựa trên số từ trùng nhau
 */
function nameSimilarityScore(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;

  const wordsA = new Set(na.split(' '));
  const wordsB = new Set(nb.split(' '));
  let common = 0;
  wordsA.forEach((w) => {
    if (wordsB.has(w)) common += 1;
  });
  const maxLen = Math.max(wordsA.size, wordsB.size);
  return maxLen === 0 ? 0 : Math.round((common / maxLen) * 100);
}

/**
 * Đối chiếu dữ liệu trích xuất với danh mục khách hàng trong DB
 * Chiến lược chấm điểm:
 *  - Trùng khớp số tài khoản người nhận tuyệt đối => +70 điểm
 *  - Trùng khớp tên người nhận (fuzzy)            => +0..30 điểm
 * @param {object} extracted - dữ liệu từ Gemini (đã chuẩn hoá)
 * @returns {Promise<{customer: object|null, confidence: number, candidates: object[]}>}
 */
async function matchCustomer(extracted) {
  const pool = await getPool();
  const result = await pool.query(
    `SELECT "CustomerId", "FullName", "Phone", "Email", "BankAccountNumber", "BankName", "AccountHolderName"
     FROM "Customers"`
  );
  const customers = result.rows;

  // Khách hàng trong hệ thống là người nhận tiền, không phải người chuyển.
  const receiverAccount = normalizeAccountNumber(extracted.receiverAccountNumber);
  const receiverName = extracted.receiverAccountName || '';

  // Không có dữ liệu người nhận thì không đủ cơ sở để ghép khách hàng.
  if (!receiverAccount && !receiverName) {
    return { customer: null, confidence: 0, candidates: [] };
  }

  const scored = customers.map((c) => {
    let score = 0;
    const custAccount = normalizeAccountNumber(c.BankAccountNumber);

    if (receiverAccount && custAccount && receiverAccount === custAccount) {
      score += 70;
    }

    const nameToCompare = c.AccountHolderName || c.FullName;
    const nameScore = nameSimilarityScore(receiverName, nameToCompare);
    score += Math.round((nameScore / 100) * 30);

    return { customer: c, confidence: Math.min(score, 100) };
  });

  scored.sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  const threshold = parseInt(process.env.MATCH_THRESHOLD || '70', 10);

  return {
    customer: best && best.confidence >= threshold ? best.customer : null,
    confidence: best ? best.confidence : 0,
    candidates: scored.slice(0, 5), // top 5 để hiển thị cho người dùng xem xét thủ công nếu cần
  };
}

module.exports = { matchCustomer, normalizeAccountNumber, normalizeName };
