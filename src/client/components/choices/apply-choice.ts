import type { AudioFormat, Container } from '@shared/types.js'
import { saveChoices, state, type Choices } from '@client/state.js'
import { CHECKBOX_CHOICES } from './choice-options.js'

const updateChoices = (changes: Partial<Choices>): void => {
  Object.assign(state.choices, changes)
  saveChoices()
}

export const applyChoiceButton = (button: HTMLButtonElement): boolean => {
  const { kind, format, resolution, container } = button.dataset

  if (kind) updateChoices({ kind: kind === 'video' ? 'video' : 'audio' })
  else if (format) updateChoices({ format: format as AudioFormat })
  else if (resolution !== undefined) updateChoices({ resolution: resolution ? Number(resolution) : null })
  else if (container) updateChoices({ container: container as Container })
  else return false

  return true
}

export const applyChoiceCheckbox = (element: HTMLElement): boolean => {
  const choice = CHECKBOX_CHOICES.find((name) => name === element.dataset.choice)

  if (!choice || !(element instanceof HTMLInputElement)) return false

  updateChoices({ [choice]: element.checked })

  return true
}
