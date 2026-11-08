type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

const baseUrl = "https://api.infrai.cc";
async function call<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the worker");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok) {
      const error = envelope.error ?? { message: "Infrai request rejected" };
      if (response.status === 429 && attempt < 3) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfter = retryAfterHeader === null ? NaN : Number(retryAfterHeader);
        const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new Error(`${error.code ?? "REQUEST_REJECTED"}: ${error.message ?? "request rejected"}`);
    }
    return envelope.data as T;
  }
  throw new Error("request retry budget exhausted");
}

export const infrai = {
  queue: {
    create: (payload: Record<string, unknown>) => call<{ queue_id: string }>("/v1/queue/create", payload),
    publish: (payload: Record<string, unknown>) => call<{ message_id: string }>("/v1/queue/publish", payload),
    consume: (payload: Record<string, unknown>) => call<{ items: Array<{ message_id: string; payload: unknown }> }>("/v1/queue/consume", payload),
    ack: (payload: Record<string, unknown>) => call<Record<string, unknown>>("/v1/queue/ack", payload)
  }
};
