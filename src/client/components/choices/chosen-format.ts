import type { DownloadRequest } from '@shared/types/downloads.js'
import { state } from '@client/state.js'

export type ChosenFormat = Pick<
  DownloadRequest,
  'kind' | 'format' | 'resolution' | 'container' | 'coverArt' | 'squareCoverArt' | 'removeNonMusic' | 'subtitles'
>

export const chosenFormat = (videoResolution: number | null): ChosenFormat => {
  const { choices } = state

  return {
    kind: choices.kind,
    format: choices.format,
    resolution: choices.kind === 'video' ? videoResolution : null,
    container: choices.container,
    coverArt: choices.coverArt,
    squareCoverArt: true,
    removeNonMusic: choices.removeNonMusic,
    subtitles: choices.subtitles,
  }
}
