// ============================================================================
//  Postie POS - Formatting helpers
// ----------------------------------------------------------------------------
//  All money is stored as INTEGER cents in the DB. These helpers convert to
//  human-readable VND strings for display. Timestamps are Unix seconds.
// ============================================================================

/** Format cents as Vietnamese đồng, e.g. 30800 -> "30.800 ₫". */
export function formatVnd(cents: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(cents / 100)
}

/** Format a Unix-seconds timestamp as a localized date+time. */
export function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString('vi-VN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

/** Format a Unix-seconds timestamp as date only. */
export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('vi-VN')
}

/** Format a Unix-seconds timestamp as time only. */
export function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit'
  })
}

/** Convert a per-mille tax rate to a percentage string, e.g. 1000 -> "10%". */
export function formatTaxRate(perMille: number): string {
  return `${perMille / 100}%`
}
