import type { MediaInfo } from '@shared/types/media.js'
import { escapeHtml, formatCount, formatDuration } from '@client/utils/format.js'

const thumbnailHtml = (info: MediaInfo): string => {
  const image = info.thumbnailUrl
    ? `<img class="thumbnail" src="${escapeHtml(info.thumbnailUrl)}" alt="" referrerpolicy="no-referrer">`
    : '<div class="thumbnail"></div>'

  if (info.kind !== 'video' || !info.preview) return image

  return `<div class="preview-frame">${image}
    <button class="play-button" data-action="preview" title="Preview" aria-label="Preview">▶</button></div>`
}

const detailsHtml = (info: MediaInfo): string =>
  [
    info.uploader ? escapeHtml(info.uploader) : '',
    info.durationSeconds ? formatDuration(info.durationSeconds) : '',
    info.kind === 'video' && info.viewCount ? `${formatCount(info.viewCount)} views` : '',
    info.kind === 'playlist' && !info.isChannel ? `${info.videoCount} videos` : '',
  ]
    .filter(Boolean)
    .map((detail) => `<span>${detail}</span>`)
    .join('')

const chipsHtml = (info: MediaInfo): string => {
  const bestQuality = info.kind === 'video' ? info.qualities[0] : undefined
  const bestQualityTag = bestQuality?.tag ? ` · ${bestQuality.tag}` : ''

  return [
    info.kind === 'playlist' ? `<span class="chip accent">${info.isChannel ? 'Channel' : 'Playlist'}</span>` : '',
    info.kind === 'video' && info.isLive ? '<span class="chip accent">LIVE</span>' : '',
    bestQuality ? `<span class="chip">up to ${escapeHtml(bestQuality.label)}${bestQualityTag}</span>` : '',
  ].join(' ')
}

const coverButtonsHtml = (info: MediaInfo): string => {
  if (info.kind !== 'video' || !info.thumbnailUrl) return ''

  return `<div class="cover-buttons">
      <button class="button small" data-action="save-cover" title="Save the thumbnail in full size as a JPG">🖼 Save cover</button>
      <button class="button small" data-action="save-square-cover" title="Save the thumbnail cropped square, like album art">Save square</button></div>`
}

export const mediaHeaderHtml = (info: MediaInfo): string => `<div class="media-header">${thumbnailHtml(info)}
    <div><h2>${escapeHtml(info.title)}</h2>
      <div class="media-details">${detailsHtml(info)}</div>
      <div class="media-chips">${chipsHtml(info)}</div>${coverButtonsHtml(info)}</div></div>`

export const playlistLinkNoteHtml = (info: MediaInfo): string => {
  if (info.kind !== 'video' || !info.playlistId) return ''

  return `<div class="playlist-note"><span>This video is part of a playlist.</span>
      <button class="button small" data-action="load-playlist">Open the playlist to pick videos</button></div>`
}

export const channelNoteHtml = (): string =>
  `<p class="note channel-note">This is a channel. Subscribe to download its new videos automatically with the settings below, or open one of its videos or playlists to download it now.</p>`
