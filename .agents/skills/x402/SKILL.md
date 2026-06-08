---
name: x402
description: Implement x402 (HTTP 402) payment flows for digital goods and services using the 1Shot API. Use when the user wants to set up an x402 facilitator for pay-per-request API access, integrate x402 buyer-side (pay-as-you-go) for consuming paid APIs, or build a seller-side x402 endpoint with wallet-based micropayments. Trigger on mentions of x402, HTTP 402, pay-per-request, facilitator, 1ShotPay, micropayments, or 402 Payment Required.
---

# x402 (HTTP 402 Payment)

This skill teaches a coding agent how to implement **x402** — an HTTP 402-based payment flow for digital goods and services using the 1Shot API x402 facilitator. x402 enables pay-per-request access to APIs and digital content without subscriptions or pre-payment.

## When to use this skill

- Setting up an **x402 facilitator** (server-side) to accept payments for API endpoints
- Integrating **buyer-side** x402 to consume paid APIs with pay-as-you-go micropayments
- Building a **seller** x402 endpoint that charges per request in stablecoins
- Using 1ShotPay or custom payment flows with x402

## How it works

x402 uses the HTTP `402 Payment Required` status code to trigger a payment flow:

1. **Buyer** makes a request to a protected resource
2. **Seller** responds with `402 Payment Required` including payment details (amount, token, chain)
3. **Buyer** constructs and signs a payment transaction
4. **Buyer** retries the request with the payment proof attached
5. **Seller** verifies the payment and serves the resource

The 1Shot API provides an **x402 facilitator** service that handles the payment verification and settlement.

## Guides

### Overview

The x402 flow enables seamless micropayments for digital goods:

```
Buyer                  Seller/Facilitator
  |                           |
  |-- GET /api/resource ----->|
  |                           |
  |<-- 402 Payment Required --|
  |    { amount, token,       |
  |      chain, payee }       |
  |                           |
  |-- Construct & sign tx --->|
  |                           |
  |<-- 200 OK + resource -----|
```

### Seller integration

Set up a seller endpoint that returns 402 with payment parameters:

```ts
// Seller-side: protected endpoint returns 402 with payment requirements
async function handleRequest(req: Request): Promise<Response> {
  // Check if request includes valid payment proof
  const paymentProof = req.headers.get('x-payment-proof')
  if (!paymentProof || !(await verifyPayment(paymentProof))) {
    return Response.json(
      {
        status: 402,
        title: 'Payment Required',
        amount: '0.01',         // USDC amount
        token: '0x...',         // USDC token address
        chainId: 8453,          // Base chain ID
        payee: '0x...',         // seller's address
        description: 'API call',
      },
      { status: 402 }
    )
  }
  // Serve the resource
  return new Response('Resource content')
}
```

### Buyer integration

Make requests that handle 402 responses by constructing payments:

```ts
// Buyer-side: handle 402 responses by paying
async function fetchWithPayment(url: string): Promise<Response> {
  let response = await fetch(url)

  if (response.status === 402) {
    const payment = await response.json()

    // Construct and send payment using 1Shot API
    const txHash = await sendPayment({
      amount: payment.amount,
      token: payment.token,
      chainId: payment.chainId,
      to: payment.payee,
    })

    // Retry with payment proof
    response = await fetch(url, {
      headers: { 'x-payment-proof': txHash },
    })
  }

  return response
}
```

### x402 Facilitator

The 1Shot API x402 facilitator handles the full payment lifecycle. Use the 1Shot API Node SDK to integrate:

```ts
import { OneShotClient } from '@1shot/api'

const client = new OneShotClient({
  apiKey: process.env.ONESHOT_API_KEY,
})

// Facilitator handles payment verification, settlement, and proof validation
const payment = await client.x402.createPayment({
  amount: '0.01',
  token: '0x...',
  chainId: 8453,
  payer: buyerAddress,
  payee: sellerAddress,
})
```

## Resources

- [x402 overview](overview.md) — detailed flow explanation
- [Seller integration](seller.md) — setting up seller-side endpoints
- [Buyer integration](buyer.md) — consuming x402 APIs
- [1Shot API x402 facilitator guide](https://docs.1shotapi.com/x402/facilitator)
