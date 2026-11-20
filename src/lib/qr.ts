// QR holds the raw token, but a shared link may contain a full URL.
export function extractToken(scanned: string): string {
  const segments = scanned.trim().split('/').filter(Boolean)
  return segments.length > 0 ? segments[segments.length - 1].trim() : ''
}
