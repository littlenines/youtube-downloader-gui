import type { DownloadOptions, JobGroup } from '@shared/types/downloads.js'
import type { PlaylistListing } from '@server/services/ytdlp/playlist-videos.js'
import { safePlaylistTitle } from './download-options.js'
import type { NewDownload } from './jobs.js'

export const playlistDownloads = (
  options: DownloadOptions,
  listing: PlaylistListing,
  groupId: string,
): NewDownload[] | null => {
  const pickedPositions = options.playlistItems ? new Set(options.playlistItems) : null
  const videos = listing.videos.filter((video) => !pickedPositions || pickedPositions.has(video.position))
  const linkedVideos = videos.flatMap(({ url, ...video }) => (url ? [{ ...video, url }] : []))

  if (!videos.length || linkedVideos.length !== videos.length) return null

  const group: JobGroup = { id: groupId, title: listing.title, size: videos.length, url: options.url }

  return linkedVideos.map((video) => ({
    options: {
      ...options,
      url: video.url,
      playlist: false,
      playlistItems: null,
      playlistNumber: video.position,
      playlistTitle: safePlaylistTitle(listing.title),
    },
    details: { title: video.title, thumbnailUrl: video.thumbnailUrl, group },
  }))
}
