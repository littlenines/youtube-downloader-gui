export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))
