const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const EXTRACTION_PROMPT = `
Bạn là trợ lý trích xuất dữ liệu từ tài liệu giao dịch/chuyển khoản ngân hàng (biên lai, thông báo biến động số dư, sao kê...).
Đầu vào có thể là ảnh gốc hoặc nội dung Markdown đã được chuyển đổi từ tài liệu.

Hãy đọc đầu vào và trả về DUY NHẤT một đối tượng JSON hợp lệ (không kèm markdown, không giải thích thêm), theo đúng cấu trúc sau:

{
  "bankName": string | null,              // Tên ngân hàng chung nếu ảnh chỉ ghi một ngân hàng
  "senderBankName": string | null,        // Ngân hàng người gửi
  "receiverBankName": string | null,      // Ngân hàng người nhận
  "senderAccountNumber": string | null,   // Số tài khoản người chuyển
  "senderAccountName": string | null,     // Tên chủ tài khoản người chuyển
  "receiverAccountNumber": string | null, // Số tài khoản người nhận
  "receiverAccountName": string | null,   // Tên chủ tài khoản người nhận
  "amount": number | null,                // Số tiền giao dịch (chỉ số, không có ký tự tiền tệ)
  "currency": string | null,              // Ví dụ "VND", "USD"
  "transactionCode": string | null,       // Mã giao dịch / mã tham chiếu
  "transactionDate": string | null,       // Định dạng ISO 8601 nếu có thể (yyyy-MM-ddTHH:mm:ss), null nếu không đọc được
  "content": string | null,               // Nội dung/diễn giải chuyển khoản
  "confidence": number                    // 0-100, mức độ tự tin của việc đọc ảnh
}

Quy tắc:
- Phân biệt rõ người chuyển và người nhận. Tên/số tài khoản xuất hiện cạnh số tiền hoặc dòng chủ tài khoản là người chuyển chỉ được đưa vào sender.
- Tách riêng ngân hàng người gửi và ngân hàng người nhận nếu ảnh có hiển thị; không dùng bankName để thay thế khi hai bên khác nhau.
- Chỉ điền receiverAccountNumber/receiverAccountName khi ảnh có nhãn hoặc thông tin rõ ràng về người nhận (ví dụ: "Đến tài khoản", "Người nhận", "Số TK nhận").
- Nhiều ảnh xác nhận chuyển tiền chỉ hiển thị người chuyển, số tiền và nội dung; trong trường hợp đó receiverAccountNumber và receiverAccountName PHẢI là null.
- Không suy luận người nhận từ tên trong nội dung chuyển khoản. Nếu không chắc chắn hoặc không có thông tin, để giá trị là null, KHÔNG tự bịa dữ liệu.
- Số tài khoản chỉ giữ lại chữ số (bỏ khoảng trắng, dấu *, dấu gạch nếu đã che một phần thì giữ nguyên định dạng che (vd "0123****789")).
- amount là số thuần (loại bỏ dấu phẩy/chấm phân cách nghìn), ví dụ 1.500.000 VND => 1500000.
`.trim();

/**
 * Gọi Gemini để đọc & trích xuất thông tin thanh toán từ Markdown hoặc ảnh gốc.
 * @param {{ type: string, markdown?: string, buffer?: Buffer, mimeType?: string }} document
 * @returns {Promise<object>} dữ liệu đã trích xuất (đã parse JSON)
 */
async function extractPaymentInfo(document) {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  });

  const content = document.type === 'image'
    ? {
      inlineData: {
        data: document.buffer.toString('base64'),
        mimeType: document.mimeType,
      },
    }
    : { text: document.markdown };
  const result = await model.generateContent([EXTRACTION_PROMPT, content]);
  const responseText = result.response.text();

  const jsonText = extractJsonFromText(responseText);

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `Không parse được JSON từ phản hồi Gemini: ${err.message}\nRaw: ${responseText}`
    );
  }

  const normalized = {
    bankName: null,
    senderBankName: null,
    receiverBankName: null,
    senderAccountNumber: null,
    senderAccountName: null,
    receiverAccountNumber: null,
    receiverAccountName: null,
    amount: null,
    currency: null,
    transactionCode: null,
    transactionDate: null,
    content: null,
    confidence: 0,
    ...parsed,
  };

  return { parsed: normalized, raw: responseText };
}

/**
 * Gemini đôi khi bọc JSON trong ```json ... ``` - hàm này để bóc tách an toàn
 */
function extractJsonFromText(text) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) return fencedMatch[1].trim();

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

module.exports = { extractPaymentInfo, EXTRACTION_PROMPT };
