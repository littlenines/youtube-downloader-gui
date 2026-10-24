import { isWebLink } from '@shared/links.js'
import { initializeBatchPanel } from './components/batch.js'
import { initializeClosingPanels } from './components/close-panels.js'
import { initializeDownloadsPanel } from './components/downloads/downloads-panel.js'
import { initializeMediaPanel } from './components/media/media-panel.js'
import { initializeSearchPanel } from './components/search.js'
import { initializeSettings } from './components/settings/settings.js'
import { initializeSubscriptions } from './components/subscriptions.js'
import { initializeSetup } from './components/setup/setup.js'
import { initializeUpdateNotice } from './components/update-notice.js'
import { desktopBridge } from './desktop.js'
import { initializeDragAndDrop } from './drag-and-drop.js'
import { handleEnteredText, initializeLinkInput } from './link-input.js'
import { state } from './state.js'

const openLinkFromAddress = (): void => {
  const parameters = new URLSearchParams(location.search)
  const sharedLink = parameters.get('url')
  const mode = parameters.get('mode')

  if (mode === 'audio' || mode === 'video') state.choices.kind = mode

  if (sharedLink && isWebLink(sharedLink)) {
    history.replaceState(null, '', location.pathname)
    handleEnteredText(sharedLink)
  }
}

document.documentElement.classList.toggle('desktop', Boolean(desktopBridge))
initializeSetup()
initializeSettings()
initializeMediaPanel()
initializeSearchPanel()
initializeBatchPanel()
initializeClosingPanels()
initializeDownloadsPanel()
initializeSubscriptions()
initializeUpdateNotice()
initializeLinkInput()
initializeDragAndDrop()
openLinkFromAddress()
