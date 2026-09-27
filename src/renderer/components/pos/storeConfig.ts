// ============================================================================
//  Cấu hình cửa hàng + tài khoản nhận QR (in hóa đơn 80mm P0.3 / VietQR P1.6)
// ----------------------------------------------------------------------------
//  STUB: app chưa có IPC app_settings (electron/ipc.ts không đăng ký namespace
//  settings — đã grep xác nhận ngày 2026-09-27), nên cấu hình lưu tạm ở
//  localStorage của máy quầy. Phase tích hợp sẽ chuyển sang bảng app_settings
//  (types.ts AppSetting) khi có IPC đọc/ghi.
// ============================================================================

export interface StoreConfig {
  /** Tên cửa hàng in đầu hóa đơn 80mm. */
  store_name: string
  store_address: string
  store_phone: string
  /** Dòng chân hóa đơn. */
  receipt_footer: string
  /** Mã BIN ngân hàng 6 chữ số (VD '970422' = Vietcombank) cho QR VietQR tĩnh. */
  qr_bank_bin: string
  /** Số tài khoản nhận tiền. */
  qr_account_no: string
}

const KEY = 'postie.storeConfig.v1'

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  store_name: 'Postie POS',
  store_address: '',
  store_phone: '',
  receipt_footer: 'Cảm ơn quý khách — hẹn gặp lại!',
  qr_bank_bin: '',
  qr_account_no: ''
}

export function loadStoreConfig(): StoreConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_STORE_CONFIG }
    return { ...DEFAULT_STORE_CONFIG, ...(JSON.parse(raw) as Partial<StoreConfig>) }
  } catch {
    return { ...DEFAULT_STORE_CONFIG }
  }
}

export function saveStoreConfig(cfg: StoreConfig): void {
  localStorage.setItem(KEY, JSON.stringify(cfg))
}

/** Đủ điều kiện để sinh QR VietQR (trùng rule validate của orders repo). */
export function isQrConfigured(cfg: StoreConfig): boolean {
  return (
    /^\d{6}$/.test(cfg.qr_bank_bin.trim()) &&
    /^[A-Za-z0-9]{6,19}$/.test(cfg.qr_account_no.replace(/\s+/g, ''))
  )
}
