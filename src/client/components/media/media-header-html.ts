import type { MediaInfo } from '@shared/types.js'
import { escapeHtml, formatCount, formatDuration } from '@client/utils/format.js'

const PLAYLIST_TITLES_SHOWN = 5

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
    info.kind === 'playlist' ? `${info.videoCount} videos` : '',
  ]
    .filter(Boolean)
    .map((detail) => `<span>${detail}</span>`)
    .join('')

const chipsHtml = (info: MediaInfo): string => {
  const bestQuality = info.kind === 'video' ? info.qualities[0] : undefined
  const bestQualityTag = bestQuality?.tag ? ` · ${bestQuality.tag}` : ''

  return [
    info.kind === 'playlist' ? '<span class="chip accent">Playlist</span>' : '',
    info.kind === 'video' && info.isLive ? '<span class="chip accent">LIVE</span>' : '',
    bestQuality ? `<span class="chip">up to ${escapeHtml(bestQuality.label)}${bestQualityTag}</span>` : '',
  ].join(' ')
}

export const mediaHeaderHtml = (info: MediaInfo): string => `<div class="media-header">${thumbnailHtml(info)}
    <div><h2>${escapeHtml(info.title)}</h2>
      <div class="media-details">${detailsHtml(info)}</div>
      <div class="media-chips">${chipsHtml(info)}</div></div></div>`

export const playlistNoteHtml = (info: MediaInfo): string => {
  if (info.kind === 'video' && info.playlistId) {
    return `<div class="playlist-note"><span>This video is part of a playlist.</span>
      <button class="button small" data-action="load-playlist">Download the whole playlist instead</button></div>`
  }

  if (info.kind === 'playlist') {
    const firstTitles = info.entries
      .slice(0, PLAYLIST_TITLES_SHOWN)
      .map((entry) => escapeHtml(entry.title))
      .join(' · ')
    const remainingCount = info.videoCount - PLAYLIST_TITLES_SHOWN
    const moreText = remainingCount > 0 ? ` · and ${remainingCount} more` : ''

    return `<div class="playlist-note"><span class="small-text">${firstTitles}${moreText}</span></div>`
  }

  return ''
}
