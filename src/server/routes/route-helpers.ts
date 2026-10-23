import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { dirname } from 'node:path'
import { isWebLink } from '@shared/links.js'
import { revealInFileManager } from '@server/lib/desktop-shell.js'
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
