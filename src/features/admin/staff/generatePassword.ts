// Generates a secure random 14-character password.
// Alphabet excludes 0 O 1 I l to avoid visual ambiguity.
// Always includes upper, lower, and digit characters.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

export function generatePassword(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)

  let result = ''
  let i = 0
  while (result.length < 14 && i < bytes.length) {
    const idx = bytes[i] % ALPHABET.length
    result += ALPHABET[idx]
    i++
  }

  // Guarantee at least one uppercase, lowercase, digit
  const hasUpper = /[A-Z]/.test(result)
  const hasLower = /[a-z]/.test(result)
  const hasDigit = /[2-9]/.test(result)

  if (hasUpper && hasLower && hasDigit) return result
  // shortcut: very rare failure path, retry
  return generatePassword()
}
