class WarehouseSlip {
  static fromRow(row) {
    return {
      warehouse_slip_id: row.WarehouseSlipId,
      ky_hieu: row.KyHieu,
      ngay_lap: row.NgayLap,
      so_po: row.SoPo,
      created_at: row.CreatedAt,
    };
  }
}

module.exports = WarehouseSlip;