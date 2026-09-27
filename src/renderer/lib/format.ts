const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0
})

const dongFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0
})

export function formatVnd(cents: number): string {
  return vndFormatter.format(cents / 100)
}

export function formatDong(dong: number): string {
  return dongFormatter.format(dong)
}

export function parseDong(raw: string): number {
  const n = Number(raw.replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function dongToCents(raw: string): number {
  return Math.round(parseDong(raw) * 100)
}

export function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString('vi-VN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('vi-VN')
}

export function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit'
  })
}

export function formatTaxRate(perMille: number): string {
  return `${perMille / 100}%`
}
