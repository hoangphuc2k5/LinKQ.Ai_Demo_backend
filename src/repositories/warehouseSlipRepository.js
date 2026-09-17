const { getPool } = require('../config/db');
const WarehouseSlip = require('../models/warehouseSlipModel');

class WarehouseSlipRepository {
	async findAll() {
		const pool = await getPool();
		const slipsResult = await pool.query(`
			SELECT * FROM "WarehouseSlips"
			ORDER BY "CreatedAt" DESC
		`);
		const slips = slipsResult.rows.map((row) => {
			let slip;
			try {
				slip = JSON.parse(row.RawExtractedJson || '{}');
			} catch (error) {
				slip = {};
			}
			return { row, slip };
		});

		if (slips.length === 0) return [];

		const ids = slips.map(({ row }) => row.WarehouseSlipId);
		const itemsResult = await pool.query(`
			SELECT * FROM "WarehouseSlipItems"
			WHERE "WarehouseSlipId" = ANY($1::int[])
			ORDER BY "WarehouseSlipId", "Stt"
		`, [ids]);
		const itemsBySlipId = new Map();

		for (const row of itemsResult.rows) {
			const items = itemsBySlipId.get(row.WarehouseSlipId) || [];
			items.push({
				stt: row.Stt,
				ma_so: row.MaSo,
				ten_san_pham: row.TenSanPham,
				dvt: row.Dvt,
				sl: Number(row.Sl) || 0,
				don_gia: Number(row.DonGia) || 0,
				thanh_tien: Number(row.ThanhTien) || 0,
				lo_lot: row.LoLot,
				khuyen_mai: row.KhuyenMai,
			});
			itemsBySlipId.set(row.WarehouseSlipId, items);
		}

		return slips.map(({ row, slip }) => ({
			...slip,
			warehouse_slip_id: row.WarehouseSlipId,
			ngay_lap: slip.ngay_lap || row.NgayLap,
			chi_tiet_hang_hoa: itemsBySlipId.get(row.WarehouseSlipId) || [],
			original_file_name: row.OriginalFileName,
			created_at: row.CreatedAt,
		}));
	}

	async create(slip, originalFileName) {
		const pool = await getPool();
		const client = await pool.connect();

		try {
			await client.query('BEGIN');
			const result = await client.query(`
				INSERT INTO "WarehouseSlips" (
					"OriginalFileName", "RawExtractedJson", "KyHieu", "NgayLap",
					"NhaCungCapTen", "NhaCungCapMaSoThue", "NhaCungCapSoTaiKhoan",
					"NhaCungCapNganHang", "NhaCungCapDiaChi", "NhaCungCapHotline",
					"NhanVienBanHangTen", "NhanVienBanHangSdt", "SoPo", "KhachHangTen",
					"KhachHangDiaChi", "DiaChiGiaoHang", "DiaChiGiaoHangSdt", "GhiChu",
					"CongTienHang", "ChietKhau", "ThueSuatGtgt", "TienThueGtgt", "TongTienThanhToan"
				)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
								$16, $17, $18, $19, $20, $21, $22, $23)
				RETURNING *
			`, [
				originalFileName || null,
				JSON.stringify(slip),
				slip.ky_hieu,
				slip.ngay_lap,
				slip.nha_cung_cap.ten,
				slip.nha_cung_cap.ma_so_thue,
				slip.nha_cung_cap.so_tai_khoan,
				slip.nha_cung_cap.ngan_hang,
				slip.nha_cung_cap.dia_chi,
				slip.nha_cung_cap.hotline,
				slip.nhan_vien_ban_hang.ten,
				slip.nhan_vien_ban_hang.sdt,
				slip.so_po,
				slip.khach_hang.ten,
				slip.khach_hang.dia_chi,
				slip.dia_chi_giao_hang.dia_chi,
				slip.dia_chi_giao_hang.sdt,
				slip.ghi_chu,
				slip.tong_ket.cong_tien_hang,
				slip.tong_ket.chiet_khau,
				slip.tong_ket.thue_suat_gtgt,
				slip.tong_ket.tien_thue_gtgt,
				slip.tong_ket.tong_tien_thanh_toan,
			]);

			const warehouseSlipId = result.rows[0].WarehouseSlipId;
			for (const item of slip.chi_tiet_hang_hoa) {
				await client.query(`
					INSERT INTO "WarehouseSlipItems" (
						"WarehouseSlipId", "Stt", "MaSo", "TenSanPham", "Dvt", "Sl",
						"DonGia", "ThanhTien", "LoLot", "KhuyenMai"
					) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
				`, [
					warehouseSlipId,
					item.stt,
					item.ma_so,
					item.ten_san_pham,
					item.dvt,
					item.sl,
					item.don_gia,
					item.thanh_tien,
					item.lo_lot,
					item.khuyen_mai,
				]);
			}

			await client.query('COMMIT');
			return WarehouseSlip.fromRow(result.rows[0]);
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}
}

module.exports = new WarehouseSlipRepository();
