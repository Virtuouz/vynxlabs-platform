// Sends a payment notification as PayFern would, signed with the shared secret.
//
//   node stand-ins/payfern.mjs <webhook url> <invoice number> <amount in pence> [--bad-signature]
//
// The webhook's address is shown in the console under Operate → Triggers.
import { createHmac } from "node:crypto";

const [url, invoice, amount, flag] = process.argv.slice(2);
if (!url || !invoice || !amount) {
  console.error(
    "Usage: node stand-ins/payfern.mjs <webhook url> <invoice number> <amount in pence> [--bad-signature]",
  );
  process.exit(2);
}
const secret = process.env.PAYFERN_SIGNING_SECRET ?? "whsec_fernhill_demo";
const body = JSON.stringify({
  type: "payment.succeeded",
  invoice,
  amount: Number(amount),
  reference: `pf_${Math.random().toString(36).slice(2, 12)}`,
});
const signature = createHmac("sha256", flag === "--bad-signature" ? "not-the-secret" : secret)
  .update(body)
  .digest("hex");
const response = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "x-payfern-signature": `sha256=${signature}` },
  body,
});
console.log(response.status, await response.text());
