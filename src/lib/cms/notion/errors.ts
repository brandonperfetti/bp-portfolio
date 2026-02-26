export class NotionConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotionConfigError'
  }
}

export class NotionHttpError extends Error {
  readonly status: number
  readonly retryAfterSeconds: number | null
  readonly body: unknown

  constructor(
    message: string,
    status: number,
    options?: { retryAfterSeconds?: number | null; body?: unknown },
  ) {
    super(message)
    this.name = 'NotionHttpError'
    this.status = status
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null
    this.body = options?.body
  }
}

export class NotionSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotionSchemaError'
  }
}
