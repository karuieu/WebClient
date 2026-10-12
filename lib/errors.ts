export class RateLimitError extends Error {
  resetAt?: string;
  code?: string;

  constructor(message: string, resetAt?: string, code?: string) {
    super(message);
    this.name = "RateLimitError";
    this.resetAt = resetAt;
    this.code = code;
  }
}

/**
 * The limit an error reports, from wherever it carries it: our RateLimitError,
 * or the headers of the OpenAI SDK's APIError on the NEAR AI path (that SDK
 * keeps a failed response's status and headers but not the body's fields).
 */
export function limitOf(error: unknown): { code?: string; resetAt?: string } {
  if (error instanceof RateLimitError) return { code: error.code, resetAt: error.resetAt };
  const headers = (error as { headers?: unknown } | null)?.headers;
  if (headers instanceof Headers) {
    return { code: headers.get("x-karui-error") ?? undefined, resetAt: headers.get("x-karui-reset-at") ?? undefined };
  }
  return {};
}

export function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

export class StoppedError extends Error {
  constructor() {
    super("Stopped");
    this.name = "StoppedError";
  }
}

export function throwIfStopped(signal?: AbortSignal): void {
  if (signal?.aborted) throw new StoppedError();
}
