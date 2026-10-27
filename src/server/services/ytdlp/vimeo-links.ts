const VIMEO_VIDEO_PAGE = /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)(?:\/([\da-f]+))?\/?(?:[?#].*)?$/i

export const isVimeoVideoPage = (url: string): boolean => VIMEO_VIDEO_PAGE.test(url)

export const vimeoPlayerLink = (url: string): string => {
  const match = VIMEO_VIDEO_PAGE.exec(url)

  if (!match) return url

  const [, videoId, unlistedHash] = match

  return `https://player.vimeo.com/video/${videoId}${unlistedHash ? `?h=${unlistedHash}` : ''}`
}
