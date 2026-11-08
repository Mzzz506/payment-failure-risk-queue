import assert from "node:assert/strict";
import { paymentEvent, riskAction } from "./payment_worker.js";

const event = paymentEvent.parse({ payment_id: "pay_1", amount_cents: 125000, currency: "USD", attempts: 3, failure_reason: "issuer_declined" });
assert.equal(riskAction(event), "review");
assert.equal(riskAction({ ...event, amount_cents: 500, attempts: 1 }), "release");
console.log("risk decision test passed");
