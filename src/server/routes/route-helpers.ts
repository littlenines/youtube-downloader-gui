import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { basename, dirname } from 'node:path'
import { isWebLink } from '@shared/links.js'
import { openWithDefaultApp, revealInFileManager } from '@server/lib/desktop-shell.js'
import { isExistingFile } from '@server/lib/existing-file.js'
import { errorText, HttpError } from '@server/lib/http/http-error.js'
import { ToolsMissingError } from '@server/services/tools/tool-setup.js'

export const isLinkValue = (value: unknown): value is string => typeof value === 'string' && isWebLink(value)

export const toHttpError = (error: unknown): HttpError => {
  if (error instanceof ToolsMissingError) return new HttpError(409, error.message)

  return new HttpError(400, errorText(error))
}

export const abortWhenClientLeaves = (response: ServerResponse): AbortSignal => {
  const controller = new AbortController()

  response.on('close', () => {
    if (!response.writableFinished) controller.abort()
  })

  return controller.signal
}

export const showInFileManager = async (file: string | undefined, downloadFolder: string): Promise<void> => {
  if (file && existsSync(file)) return revealInFileManager(file)

  const folder = file && existsSync(dirname(file)) ? dirname(file) : downloadFolder

  await mkdir(folder, { recursive: true })
  revealInFileManager(folder)
}

export const playFile = async (file: string | null): Promise<void> => {
  if (!file) throw new HttpError(404, 'This download has no song or video to play.')
  if (!isExistingFile(file)) throw new HttpError(404, 'The file is no longer there. Use Show in folder to find it.')

  await openWithDefaultApp(file).catch(() => {
    throw new HttpError(400, `No app could open ${basename(file)}. Use Show in folder and open it from there.`)
  })
}
