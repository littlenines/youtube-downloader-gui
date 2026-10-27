import { ignoreFailure } from './ignore-failure.js'

export interface SaveOptions {
  immediately?: boolean
}

export type ThrottledSave<Value> = (value: Value, options?: SaveOptions) => Promise<void>

export const throttleSaves = <Value>(
  write: (value: Value) => Promise<void>,
  quietMilliseconds: number,
): ThrottledSave<Value> => {
  let pendingValue: { value: Value } | null = null
  let quietTimer: ReturnType<typeof setTimeout> | null = null

  const startQuietTime = (): void => {
    quietTimer = setTimeout(() => {
      quietTimer = null

      if (!pendingValue) return

      const { value } = pendingValue

      pendingValue = null
      write(value).catch(ignoreFailure)
      startQuietTime()
    }, quietMilliseconds)
    quietTimer.unref?.()
  }

  return (value, { immediately = false } = {}) => {
    if (quietTimer && !immediately) {
      pendingValue = { value }

      return Promise.resolve()
    }

    if (quietTimer) clearTimeout(quietTimer)

    pendingValue = null
    startQuietTime()

    return write(value)
  }
}
