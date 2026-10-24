interface ExpiringEntry<Value> {
  value: Value
  expiresAt: number
}

export interface ExpiringMapOptions {
  lifetimeMilliseconds: number
  maximumEntries: number
  now?: () => number
}

export class ExpiringMap<Value> {
  private readonly entries = new Map<string, ExpiringEntry<Value>>()
  private readonly lifetimeMilliseconds: number
  private readonly maximumEntries: number
  private readonly now: () => number

  constructor({ lifetimeMilliseconds, maximumEntries, now = Date.now }: ExpiringMapOptions) {
    this.lifetimeMilliseconds = lifetimeMilliseconds
    this.maximumEntries = maximumEntries
    this.now = now
  }

  set(key: string, value: Value): void {
    const now = this.now()

    for (const [storedKey, entry] of this.entries) if (entry.expiresAt < now) this.entries.delete(storedKey)

    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt: now + this.lifetimeMilliseconds })

    for (const oldestKey of this.entries.keys()) {
      if (this.entries.size <= this.maximumEntries) break

      this.entries.delete(oldestKey)
    }
  }

  get(key: string): Value | null {
    const entry = this.entries.get(key)

    if (!entry) return null

    if (entry.expiresAt < this.now()) {
      this.entries.delete(key)

      return null
    }

    return entry.value
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }
}
