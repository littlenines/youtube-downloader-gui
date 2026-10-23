export const resolutionTag = (resolution: number): string => {
  if (resolution >= 4320) return '8K'
  if (resolution >= 2160) return '4K'
  if (resolution >= 1440) return '2K'
  if (resolution >= 720) return 'HD'

  return ''
}
