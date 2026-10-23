export type StoredRecord = Record<string, unknown>

export const asRecord = (value: unknown): StoredRecord =>
  value && typeof value === 'object' ? (value as StoredRecord) : {}

export const stringOrDefault = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback

export const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null)

export const numberOrNull = (value: unknown): number | null => (typeof value === 'number' ? value : null)

export const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
