import { z } from "zod";
import { infrai } from "./infrai_client.js";

export const paymentEvent = z.object({
  payment_id: z.string().min(1),
  amount_cents: z.number().int().positive(),
  currency: z.string().length(3),
  attempts: z.number().int().nonnegative(),
  failure_reason: z.string().min(1)
});
export type PaymentEvent = z.infer<typeof paymentEvent>;

function queueName(): string {
  const queue = process.env.INFRAI_QUEUE;
  if (!queue) throw new Error("Set INFRAI_QUEUE to an existing queue before running the worker");
  return queue;
}

export function riskAction(event: PaymentEvent): "review" | "release" {
  return event.attempts >= 3 || event.amount_cents >= 100000 ? "review" : "release";
}

export async function publishDeadLetter(event: PaymentEvent): Promise<string> {
  const parsed = paymentEvent.parse(event);
  const decision = riskAction(parsed);
  const result = await infrai.queue.publish({ queue: queueName(), payload: { kind: "payment.dead_letter", event: parsed, decision } });
  return result.message_id;
}

export async function drainDeadLetters(): Promise<number> {
  const queue = queueName();
  const batch = await infrai.queue.consume({ queue, max_messages: 10, visibility_timeout: 30 });
  for (const message of batch.items ?? []) {
    const event = paymentEvent.parse((message.payload as { event: unknown }).event);
    const decision = riskAction(event);
    console.log(JSON.stringify({ message_id: message.message_id, payment_id: event.payment_id, audit: "dead-letter-reviewed", risk_action: decision }));
    await infrai.queue.ack({ queue, message_id: message.message_id });
  }
  return batch.items?.length ?? 0;
}

if (process.argv[1]?.endsWith("payment_worker.ts")) {
  const sample: PaymentEvent = { payment_id: "pay_demo_001", amount_cents: 125000, currency: "USD", attempts: 3, failure_reason: "issuer_declined" };
  publishDeadLetter(sample).then((id) => console.log(`queued ${id}`)).catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
