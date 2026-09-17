// backend/src/services/warehouseSlipService.js
//
// Service trích xuất dữ liệu đơn hàng thành "Phiếu xuất kho / Kiêm lệnh giao hàng" từ ảnh
// bằng Gemini, theo đúng pattern của geminiService.js đã có trong dự án.
//
// Cần cài: @google/generative-ai (npm install @google/generative-ai)

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.0-flash";

// -----------------------------------------------------------------------
// 1) PROMPT: yêu cầu Gemini trả JSON đúng schema, tiếng Việt, không kèm giải thích
// -----------------------------------------------------------------------
const WAREHOUSE_SLIP_PROMPT = `
Bạn là hệ thống OCR + lập phiếu xuất kho của Việt Nam. Hãy đọc kỹ ảnh đơn hàng, đơn bán hàng,
phiếu đặt hàng hoặc phiếu xuất kho được cung cấp và chuyển toàn bộ thông tin đọc được thành
một phiếu xuất kho (kiêm lệnh giao hàng). Trả về DUY NHẤT một object JSON hợp lệ theo schema
bên dưới. KHÔNG thêm markdown, không thêm giải thích, không thêm dấu backtick.

Schema JSON bắt buộc:
{
  "ky_hieu": string | null,
  "ngay_lap": string | null,        // định dạng YYYY-MM-DD
  "nha_cung_cap": {
    "ten": string | null,
    "ma_so_thue": string | null,
    "so_tai_khoan": string | null,
    "ngan_hang": string | null,
    "dia_chi": string | null,
    "hotline": string | null
  },
  "nhan_vien_ban_hang": { "ten": string | null, "sdt": string | null },
  "so_po": string | null,
  "khach_hang": { "ten": string | null, "dia_chi": string | null },
  "dia_chi_giao_hang": { "dia_chi": string | null, "sdt": string | null },
  "ghi_chu": string | null,
  "chi_tiet_hang_hoa": [
    {
      "stt": number,
      "ma_so": string | null,
      "ten_san_pham": string,
      "dvt": string | null,
      "sl": number,
      "don_gia": number,
      "thanh_tien": number,
      "lo_lot": string | null,
      "khuyen_mai": boolean
    }
  ],
  "tong_ket": {
    "cong_tien_hang": number | null,
    "chiet_khau": number | null,
    "thue_suat_gtgt": string | null,
    "tien_thue_gtgt": number | null,
    "tong_tien_thanh_toan": number | null
  }
}

Quy tắc bắt buộc:
- ngay_lap: LẤY DUY NHẤT ngày ghi ngay dưới tiêu đề "PHIẾU XUẤT KHO" (dạng "Ngày ... Tháng ... Năm ...").
  TUYỆT ĐỐI KHÔNG lấy ngày ký nhận của người nhận/người giao hàng, và KHÔNG lấy ngày/giờ in phiếu
  ở góc dưới cùng (nếu có) — đó là các mốc thời gian khác, không phải ngày lập phiếu.
- chi_tiet_hang_hoa CHỈ chứa các dòng hàng hóa THỰC SỰ có tên sản phẩm cụ thể (ví dụ có mã số,
  đơn vị tính, số lượng). TUYỆT ĐỐI KHÔNG đưa vào đây các dòng tổng hợp/dòng phụ như:
  "Chiết khấu", "Cộng tiền hàng", "Tiền thuế GTGT", "Tổng tiền thanh toán", hoặc các dòng trống
  chỉ có STT "0" và không có tên sản phẩm. Những dòng này phải được đưa vào đúng trường tương ứng
  trong "tong_ket" (ví dụ dòng "Chiết Khấu" có số tiền → đưa vào tong_ket.chiet_khau).
- Nếu một dòng hàng không có đơn giá/thành tiền (hàng khuyến mãi, ghi "HÀNG KHUYẾN MÃI KHÔNG THU TIỀN"),
  đặt don_gia=0, thanh_tien=0, khuyen_mai=true — nhưng dòng này vẫn LÀ một sản phẩm thật (có tên,
  mã số, sl) nên vẫn được đưa vào chi_tiet_hang_hoa, khác với các dòng tổng hợp nêu trên.
- Số tiền trả về là number thuần (không có dấu chấm/phẩy phân cách nghìn), ví dụ "9.831.072" -> 9831072.
- tong_ket.chiet_khau luôn là số dương thể hiện số tiền được giảm trừ (không phải số âm).
- Nếu không đọc được trường nào, trả về null cho trường đó, KHÔNG được bịa dữ liệu.
`.trim();

// Các từ khóa nhận diện dòng "tổng hợp" (không phải sản phẩm thật) lỡ bị model
// đưa nhầm vào chi_tiet_hang_hoa — dùng làm lưới lọc an toàn ở tầng code.
const NON_PRODUCT_KEYWORDS = [
  "chiết khấu",
  "chiet khau",
  "cộng tiền hàng",
  "cong tien hang",
  "tổng tiền hàng",
  "tổng cộng",
  "tong cong",
  "tiền thuế",
  "tien thue",
  "thuế gtgt",
  "thue gtgt",
  "tổng tiền thanh toán",
  "tong tien thanh toan",
];

function isNonProductRow(tenSanPham) {
  if (!tenSanPham) return false;
  const normalized = tenSanPham.toLowerCase();
  return NON_PRODUCT_KEYWORDS.some((kw) => normalized.includes(kw));
}

/**
 * Gọi Gemini để phân tích ảnh đơn hàng và tạo dữ liệu phiếu xuất kho.
 * @param {Buffer} imageBuffer - buffer ảnh (từ multer req.file.buffer)
 * @param {string} mimeType - ví dụ "image/png", "image/jpeg"
 * @returns {Promise<object>} dữ liệu đã parse + đã validate
 */
async function analyzeWarehouseSlipImage(imageBuffer, mimeType) {
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const result = await model.generateContent([
    { text: WAREHOUSE_SLIP_PROMPT },
    {
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType: mimeType || "image/jpeg",
      },
    },
  ]);

  const rawText = result.response.text();
  const parsed = safeParseJson(rawText);

  return validateAndEnrich(parsed);
}

/**
 * Gemini đôi khi bọc JSON trong ```json ... ```; hàm này làm sạch trước khi parse.
 */
function safeParseJson(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Không thể parse JSON từ Gemini: ${err.message}. Raw: ${cleaned.slice(0, 500)}`
    );
  }
}

/**
 * Sai số cho phép khi so khớp số liệu tiền tệ, để tránh cảnh báo giả do làm tròn
 * (VND không có phần thập phân nên chỉ cần dung sai nhỏ, cố định).
 */
const AMOUNT_TOLERANCE = 2;

/**
 * Kiểm tra chéo số liệu:
 * - Tổng thành_tien các dòng hàng thật (không tính dòng tổng hợp) phải khớp với cong_tien_hang
 * - cong_tien_hang - chiet_khau + tien_thue_gtgt phải khớp tong_tien_thanh_toan
 * Trả kèm cờ canh_bao nếu lệch, để frontend hiển thị cảnh báo cho người dùng xác nhận thủ công.
 */
function validateAndEnrich(data) {
  const normalized = normalizeWarehouseSlip(data);
  const items = normalized.chi_tiet_hang_hoa;
  const tong = normalized.tong_ket;

  const sumThanhTien = items.reduce((acc, item) => acc + (Number(item.thanh_tien) || 0), 0);

  const canh_bao = [];

  if (
    tong.cong_tien_hang != null &&
    Math.abs(sumThanhTien - tong.cong_tien_hang) > AMOUNT_TOLERANCE
  ) {
    canh_bao.push(
      `Tổng thành tiền các dòng hàng (${sumThanhTien.toLocaleString(
        "vi-VN"
      )}) không khớp Cộng tiền hàng (${Number(tong.cong_tien_hang).toLocaleString("vi-VN")}).`
    );
  }

  if (
    tong.cong_tien_hang != null &&
    tong.tien_thue_gtgt != null &&
    tong.tong_tien_thanh_toan != null
  ) {
    const chietKhau = Number(tong.chiet_khau) || 0;
    const tinhLai = Number(tong.cong_tien_hang) - chietKhau + Number(tong.tien_thue_gtgt);
    if (Math.abs(tinhLai - Number(tong.tong_tien_thanh_toan)) > AMOUNT_TOLERANCE) {
      canh_bao.push(
        `Tổng tiền thanh toán tính lại (${tinhLai.toLocaleString(
          "vi-VN"
        )}) không khớp số trên phiếu (${Number(tong.tong_tien_thanh_toan).toLocaleString(
          "vi-VN"
        )}).`
      );
    }
  }

  return {
    ...normalized,
    _meta: {
      can_xac_nhan_thu_cong: canh_bao.length > 0,
      canh_bao,
    },
  };
}

function normalizeWarehouseSlip(data) {
  const source = data || {};
  const supplier = source.nha_cung_cap || {};
  const salesPerson = source.nhan_vien_ban_hang || {};
  const customer = source.khach_hang || {};
  const delivery = source.dia_chi_giao_hang || {};
  const total = { ...(source.tong_ket || {}) };

  const rawItems = Array.isArray(source.chi_tiet_hang_hoa) ? source.chi_tiet_hang_hoa : [];

  // Lọc an toàn: tách các dòng "tổng hợp" (chiết khấu, cộng tiền hàng...) lỡ bị
  // model đưa nhầm vào danh sách hàng hóa, dồn giá trị của chúng vào tong_ket
  // thay vì để lẫn trong chi_tiet_hang_hoa.
  const realItems = [];
  rawItems.forEach((item) => {
    const ten = item.ten_san_pham || "";
    if (isNonProductRow(ten)) {
      const normalizedKey = ten.toLowerCase();
      const amount = Number(item.thanh_tien) || 0;
      if (
        (normalizedKey.includes("chiết khấu") || normalizedKey.includes("chiet khau")) &&
        (total.chiet_khau == null || Number(total.chiet_khau) === 0) &&
        amount !== 0
      ) {
        total.chiet_khau = Math.abs(amount);
      }
      // Các dòng tổng hợp khác (cộng tiền hàng, thuế, tổng thanh toán...) bị bỏ qua
      // vì đã có sẵn trường riêng trong tong_ket.
      return;
    }
    realItems.push(item);
  });

  return {
    ky_hieu: source.ky_hieu ?? null,
    ngay_lap: source.ngay_lap ?? null,
    nha_cung_cap: {
      ten: supplier.ten ?? null,
      ma_so_thue: supplier.ma_so_thue ?? null,
      so_tai_khoan: supplier.so_tai_khoan ?? null,
      ngan_hang: supplier.ngan_hang ?? null,
      dia_chi: supplier.dia_chi ?? null,
      hotline: supplier.hotline ?? null,
    },
    nhan_vien_ban_hang: { ten: salesPerson.ten ?? null, sdt: salesPerson.sdt ?? null },
    so_po: source.so_po ?? null,
    khach_hang: { ten: customer.ten ?? null, dia_chi: customer.dia_chi ?? null },
    dia_chi_giao_hang: { dia_chi: delivery.dia_chi ?? null, sdt: delivery.sdt ?? null },
    ghi_chu: source.ghi_chu ?? null,
    chi_tiet_hang_hoa: realItems.map((item, index) => ({
      stt: item.stt ?? index + 1,
      ma_so: item.ma_so ?? null,
      ten_san_pham: item.ten_san_pham || "Chưa đọc được tên sản phẩm",
      dvt: item.dvt ?? null,
      sl: Number(item.sl) || 0,
      don_gia: Number(item.don_gia) || 0,
      thanh_tien: Number(item.thanh_tien) || 0,
      lo_lot: item.lo_lot ?? null,
      khuyen_mai: Boolean(item.khuyen_mai),
    })),
    tong_ket: {
      cong_tien_hang: total.cong_tien_hang ?? null,
      chiet_khau: total.chiet_khau ?? 0,
      thue_suat_gtgt: total.thue_suat_gtgt ?? null,
      tien_thue_gtgt: total.tien_thue_gtgt ?? null,
      tong_tien_thanh_toan: total.tong_tien_thanh_toan ?? null,
    },
  };
}

module.exports = {
  analyzeWarehouseSlipImage,
  WAREHOUSE_SLIP_PROMPT,
  validateAndEnrich,
};