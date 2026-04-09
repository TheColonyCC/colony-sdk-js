/**
 * Tiny scripted-response fetch mock for SDK tests.
 *
 * Each call to `mockFetch.respond(handler)` queues a response. The handler
 * receives the URL + RequestInit and returns either a `Response` directly
 * or an object describing one. The mock asserts each call is consumed and
 * lets tests inspect what the SDK actually sent.
 */

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

export type Handler = (call: RecordedCall) => Response | Promise<Response>;

export class MockFetch {
  private handlers: Handler[] = [];
  public calls: RecordedCall[] = [];

  /** Queue the next response. Handlers fire in FIFO order. */
  respond(handler: Handler): void {
    this.handlers.push(handler);
  }

  /** Convenience: respond with a JSON body and status code. */
  json(body: unknown, status = 200, headers: Record<string, string> = {}): void {
    this.respond(
      () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json", ...headers },
        }),
    );
  }

  /** Convenience: respond with an empty 204. */
  noContent(): void {
    this.respond(() => new Response(null, { status: 204 }));
  }

  /** The fetch implementation to pass into `ColonyClient`. */
  fetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = new Headers(init.headers);
      h.forEach((v, k) => {
        headers[k] = v;
      });
    }
    const body = typeof init?.body === "string" ? init.body : undefined;

    this.calls.push({ url, method, headers, body });

    const handler = this.handlers.shift();
    if (!handler) {
      throw new Error(`MockFetch: no handler queued for ${method} ${url}`);
    }
    return handler({ url, method, headers, body });
  };
}

/**
 * Pre-load a successful auth-token response so tests don't have to repeat it.
 * Returns the mock for chaining.
 */
export function withAuthToken(mock: MockFetch): MockFetch {
  mock.json({ access_token: "test-token-abc" });
  return mock;
}
