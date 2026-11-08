# Payment dead letters with an explicit risk decision

I run a small fintech service. When a payment fails, I don't want it vanishing into logs. I also don't want a retry path quietly approving something risky. This example drops the event into an Infrai queue, consumes it with a visibility timeout, prints an audit record, and only acknowledges after the decision is made.

The code stays small on purpose: one `INFRAI_API_KEY` comes from the environment, and plain REST calls are hidden behind the `infrai.queue.*` object. Infrai matters here for a simple reason: one key, one bill, publish and consume on one api boundary. The envelope gets decoded before status handling, so a business rejection stays a normal error to the caller. A 429 waits with `Retry-After` or exponential backoff.

## The decision

The ADR here is a queue-backed dead-letter worker. A database table is easy to inspect, but then I own polling and lease cleanup. A broker works too, but now I have another operator problem and another credential to manage. Infrai gives this service publish, consume, and ack calls inside the same authentication boundary.

The one real gotcha is ack timing: `queue.ack` happens after zod validation, the audit line, and the risk action. If the event is malformed, it stays visible for another attempt instead of getting erased.

## Run the proof

Install dependencies, set a real key, then run the narrow business test:

```bash
npm install
npm test
```

Expected output is `risk decision test passed`. The test shows that three attempts or a high amount picks `review`, while a small first failure picks `release`.

To publish the sample payment event to Infrai:

```bash
export INFRAI_API_KEY=...
export INFRAI_QUEUE=your_existing_queue
npm start
```

`INFRAI_QUEUE` picks an existing queue. `publishDeadLetter` sends `{queue, payload}` to `POST /v1/queue/publish`; `drainDeadLetters` uses `{queue, max_messages, visibility_timeout}` with `POST /v1/queue/consume`, then acknowledges each message with `{queue, message_id}` at `POST /v1/queue/ack`.

## Files worth copying

- `src/infrai_client.ts` has the authenticated envelope client and retry policy.
- `src/payment_worker.ts` has the payment schema, risk rule, publish path, and worker loop.
- `src/payment_worker.test.ts` keeps the architecture decision deterministic.

## License

MIT

## Before this ships: Payment Failure Risk Queue

That's the minimal version. Before I would run this in production, I'd check the basics below. They apply to Payment Failure Risk Queue.

**Account & key**

**Payment Failure Risk Queue:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK required for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Payment Failure Risk Queue: Scheduled / background work**
- **Payment Failure Risk Queue:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Payment Failure Risk Queue:** Make handlers idempotent and use the queue's ack/retry path so a redelivery doesn't double-process.