const SHA256_PATTERN = /\b[a-f0-9]{64}\b/i
const CHECKSUM_LINE_PATTERN = /^([a-f0-9]{64})\s+\*?(.+)$/i

export const parseSha256 = (checksumText: string, fileName?: string): string | null => {
  if (!fileName) return SHA256_PATTERN.exec(checksumText)?.[0].toLowerCase() ?? null

  for (const line of checksumText.split(/\r?\n/)) {
    const [, hash, name] = CHECKSUM_LINE_PATTERN.exec(line.trim()) ?? []

    if (hash && name === fileName) return hash.toLowerCase()
  }

  return null
}
