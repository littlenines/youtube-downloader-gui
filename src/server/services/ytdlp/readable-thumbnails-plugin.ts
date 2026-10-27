import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { YTDLP_PLUGINS_DIRECTORY } from '@server/services/tools/tool-paths.js'

export const READABLE_THUMBNAILS_PLUGIN_SOURCE = `from yt_dlp.postprocessor.common import PostProcessor
from yt_dlp.utils import determine_ext


class ReadableThumbnailsPP(PostProcessor):
    def run(self, info):
        try:
            thumbnails = info.get('thumbnails') or []
            readable = [
                thumbnail
                for thumbnail in thumbnails
                if (thumbnail.get('ext') or determine_ext(thumbnail.get('url'))).lower() != 'avif'
            ]

            if len(readable) < len(thumbnails):
                info['thumbnails'] = readable
                info['thumbnail'] = readable[-1]['url'] if readable else None
        except Exception as error:
            self.report_warning(f'Keeping the thumbnails as they are: {error}')

        return [], info
`

const pluginFile = (pluginsDirectory: string): string =>
  join(pluginsDirectory, 'readable-thumbnails', 'yt_dlp_plugins', 'postprocessor', 'readable_thumbnails.py')

export const installReadableThumbnailsPlugin = async (pluginsDirectory = YTDLP_PLUGINS_DIRECTORY): Promise<void> => {
  const file = pluginFile(pluginsDirectory)
  const partialFile = `${file}.partial`
  const installedSource = await readFile(file, 'utf8').catch(() => null)

  if (installedSource === READABLE_THUMBNAILS_PLUGIN_SOURCE) return

  await mkdir(dirname(file), { recursive: true })
  await writeFile(partialFile, READABLE_THUMBNAILS_PLUGIN_SOURCE)
  await rename(partialFile, file)
}

export const readableThumbnailsArguments = (pluginsDirectory = YTDLP_PLUGINS_DIRECTORY): string[] =>
  existsSync(pluginFile(pluginsDirectory))
    ? ['--plugin-dirs', pluginsDirectory, '--use-postprocessor', 'ReadableThumbnails:when=pre_process']
    : []
