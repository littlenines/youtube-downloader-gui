import type { AudioTags } from './types.js'

export interface TagSource {
  title: string
  artist: string | null
  track: string | null
  album: string | null
  uploader: string | null
}

const VIDEO_NOISE =
  /\s*[([]\s*(?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?(?:\s+video)?|visuali[sz]er|hd|hq|4k|video\s+oficial|clip\s+officiel)\s*[)\]]/gi
const ARTIST_SEPARATOR = /^(.+?)\s+[-–—]\s+(.+)$/

export const removeVideoNoise = (title: string): string => title.replace(VIDEO_NOISE, '').trim()

const cleanChannelName = (channel: string): string =>
  channel
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/, '')
    .trim()

export const suggestTags = (source: TagSource): AudioTags => {
  const album = source.album ?? ''
  const cleanedTitle = removeVideoNoise(source.track ?? source.title)
  const [, artistPart, titlePart] = ARTIST_SEPARATOR.exec(cleanedTitle) ?? []

  if (source.artist) {
    const titleWithoutArtist =
      artistPart?.toLowerCase() === source.artist.toLowerCase() && titlePart ? titlePart : cleanedTitle

    return { artist: source.artist, title: titleWithoutArtist, album }
  }

  if (artistPart && titlePart) return { artist: artistPart.trim(), title: titlePart.trim(), album }
  return { artist: cleanChannelName(source.uploader ?? ''), title: cleanedTitle, album }
}
