const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/

export const parseVersion = (text: string): number[] | null => {
  const match = VERSION_PATTERN.exec(text.trim())

  return match ? match.slice(1).map(Number) : null
}

export const isNewerVersion = (candidate: string, current: string): boolean => {
  const candidateParts = parseVersion(candidate)
  const currentParts = parseVersion(current)

  if (!candidateParts || !currentParts) return false

  const differingIndex = candidateParts.findIndex((part, index) => part !== currentParts[index])

  return differingIndex !== -1 && candidateParts[differingIndex]! > currentParts[differingIndex]!
}
