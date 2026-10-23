import { normalizeDownloadRequest } from '@server/services/downloads/download-options.js'
import { buildDownloadArguments } from '@server/services/ytdlp/download-arguments.js'

export const PARTIAL_FOLDER = '/downloads/.yt-downloader-partial/job-1'

export const valueAfter = (commandArguments: string[], flag: string) =>
  commandArguments[commandArguments.indexOf(flag) + 1]

export const argumentsFor = (request: Parameters<typeof normalizeDownloadRequest>[0]) =>
  buildDownloadArguments(normalizeDownloadRequest(request), {
    downloadFolder: '/downloads',
    partialFolder: PARTIAL_FOLDER,
  })
