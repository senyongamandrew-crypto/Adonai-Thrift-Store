export function formatUGX(amount: number): string {
  try {
    return `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(Math.round(amount))}`
  } catch {
    return `UGX ${Math.round(amount).toLocaleString('en-US')}`
  }
}

export function formatDateKampala(ts: number): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Kampala',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts))
  } catch {
    return new Date(ts).toISOString()
  }
}

export function describeBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
