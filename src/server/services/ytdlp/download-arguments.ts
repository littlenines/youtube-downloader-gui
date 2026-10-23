import { clipFileSuffix } from '@shared/clip-range.js'
import type { AudioTags, Container, DownloadOptions } from '@shared/types.js'
import { AUDIO_PRESETS } from './audio-presets.js'
import { OUTPUT_MARKERS } from './download-events.js'
import type { DownloadFolders } from './download-process.js'

const CODEC_PREFERENCE: Record<Container, string> = {
  mp4: 'vcodec:h264,acodec:m4a',
  webm: 'vcodec:vp9,acodec:opus',
  mkv: 'vcodec,acodec',
}

const UNLIMITED_RESOLUTION = 100_000

const PROGRESS_TEMPLATE = [
  '%(info.vcodec)s',
  '%(info.acodec)s',
  '%(progress.downloaded_bytes)s',
  '%(progress.total_bytes,progress.total_bytes_estimate)s',
  '%(progress.speed)s',
  '%(progress.eta)s',
].join('|')

const SQUARE_COVER_ART_FILTER = 'ThumbnailsConvertor+FFmpeg_o:-c:v mjpeg -qmin 1 -q:v 1 -vf crop=ih:ih'

const EMPTY_TEMPLATE = '%(id&|)s'

const setTagArguments = (field: keyof AudioTags, value: string): string[] => {
  if (!value) return []

  const escapedValue = value.replace(/%/g, '%%').replace(/:/g, '\\:')

  return ['--parse-metadata', `${EMPTY_TEMPLATE}${escapedValue}${EMPTY_TEMPLATE}:(?P<meta_${field}>[\\s\\S]+)`]
}

export const playlistItemsArgument = (positions: number[]): string => {
  const ranges: [number, number][] = []

  for (const position of positions) {
    const lastRange = ranges.at(-1)

    if (lastRange && position === lastRange[1] + 1) lastRange[1] = position
    else ranges.push([position, position])
  }

  return ranges.map(([first, last]) => (first === last ? String(first) : `${first}-${last}`)).join(',')
}

const playlistArguments = ({ playlist, playlistItems }: DownloadOptions): string[] => {
  if (!playlist) return ['--no-playlist']
  if (!playlistItems) return ['--yes-playlist']

  return ['--yes-playlist', '--playlist-items', playlistItemsArgument(playlistItems)]
}

const clipArguments = ({ clip, kind }: DownloadOptions): string[] => {
  if (!clip) return []

  const sectionArguments = ['--download-sections', `*${clip.startSeconds}-${clip.endSeconds}`]

  return kind === 'video' ? [...sectionArguments, '--force-keyframes-at-cuts'] : sectionArguments
}

const reportingArguments = ({ downloadFolder, partialFolder }: DownloadFolders): string[] => [
  '--newline',
  '--progress',
  '--windows-filenames',
  '--no-mtime',
  '-P',
  downloadFolder,
  '-P',
  `temp:${partialFolder}`,
  '--progress-template',
  `download:${OUTPUT_MARKERS.progress}${PROGRESS_TEMPLATE}`,
  '--print',
  `before_dl:${OUTPUT_MARKERS.item}%(playlist_index|)s|%(n_entries|)s|%(title)s`,
  '--print',
  `after_move:${OUTPUT_MARKERS.file}%(filepath)s`,
]

const audioArguments = (options: DownloadOptions, playlistFolder: string): string[] => {
  const preset = AUDIO_PRESETS[options.format]
  const clipSuffix = options.clip ? clipFileSuffix(options.clip) : ''
  const commandArguments = [...preset.ytdlpArguments, '--embed-metadata']

  if (options.tags) {
    const { artist, title, album } = options.tags

    commandArguments.push(
      ...setTagArguments('artist', artist),
      ...setTagArguments('title', title),
      ...setTagArguments('album', album),
      '-o',
      `%(meta_artist,artist&{} - |)s%(meta_title,track,title)s${clipSuffix}.%(ext)s`,
    )
  } else {
    commandArguments.push('-o', `${playlistFolder}%(artist&{} - |)s%(track,title)s${clipSuffix}.%(ext)s`)
  }

  if (options.coverArt && preset.supportsCoverArt) {
    commandArguments.push('--embed-thumbnail', '--convert-thumbnails', 'jpg')

    if (options.squareCoverArt) commandArguments.push('--ppa', SQUARE_COVER_ART_FILTER)
  }

  if (options.removeNonMusic) commandArguments.push('--sponsorblock-remove', 'music_offtopic')

  return commandArguments
}

const videoArguments = (options: DownloadOptions, playlistFolder: string): string[] => {
  const canEmbedExtras = options.container !== 'webm'
  const maximumResolution = options.resolution ?? UNLIMITED_RESOLUTION
  const resolutionLabel = options.resolution ? ` [${options.resolution}p]` : ''
  const clipSuffix = options.clip ? clipFileSuffix(options.clip) : ''
  const commandArguments = [
    '-f',
    'bv*+ba/b',
    '-S',
    `res:${maximumResolution},fps,${CODEC_PREFERENCE[options.container]}`,
    '--merge-output-format',
    options.container,
    '--embed-metadata',
  ]

  if (canEmbedExtras) commandArguments.push('--embed-thumbnail', '--embed-chapters')

  if (options.subtitles && canEmbedExtras) {
    commandArguments.push('--embed-subs', '--sub-langs', 'en', '--write-auto-subs')
  }

  commandArguments.push('-o', `${playlistFolder}%(title)s${resolutionLabel}${clipSuffix}.%(ext)s`)

  return commandArguments
}

export const buildDownloadArguments = (options: DownloadOptions, folders: DownloadFolders): string[] => {
  const playlistFolder = options.playlist ? '%(playlist_title)s/%(playlist_index)03d - ' : ''
  const formatArguments =
    options.kind === 'audio' ? audioArguments(options, playlistFolder) : videoArguments(options, playlistFolder)

  return [
    ...reportingArguments(folders),
    ...playlistArguments(options),
    ...clipArguments(options),
    ...formatArguments,
    '--',
    options.url,
  ]
}
