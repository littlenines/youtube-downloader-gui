import type { VideoInfo } from '@shared/types/media.js'
import { api } from '@client/api.js'
import { showToast } from '@client/utils/dom.js'
import { escapeHtml } from '@client/utils/format.js'

export const startPreview = (panel: HTMLElement, info: VideoInfo): void => {
  const frame = panel.querySelector('.preview-frame')

  if (!frame || !info.preview) return

  const streamUrl = api.previewUrl(info.preview.token)

  if (info.preview.kind === 'video') {
    const posterAttribute = info.thumbnailUrl ? `poster="${escapeHtml(info.thumbnailUrl)}"` : ''

    frame.innerHTML = `<video class="thumbnail" src="${streamUrl}" ${posterAttribute} controls autoplay></video>`
  } else {
    frame.querySelector('.play-button')?.remove()
    frame.insertAdjacentHTML('beforeend', `<audio class="preview-audio" src="${streamUrl}" controls autoplay></audio>`)
  }

  frame
    .querySelector('video, audio')
    ?.addEventListener('error', () => showToast('The preview could not be played. Read the link again.'))
}
