<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 1Shot API Agent Rules

Use the public-relayer skill to implement a TypeScript client that discovers capabilities, quotes fees, submits relayer_send7710Transaction (single-chain + multichain), and tracks status via webhooks or relayer_getStatus polling.
Use the 1shot-api skill to implement server wallet creation plus execution endpoint in TypeScript. Return: Plan, Code, Config, Validation, Risks.
Use the webauthn-prf-wallet skill to implement a PRF-first embedded wallet in Next.js with iframe isolation, LongBlob fallback, and recovery hooks.
Apply webauthn-prf-wallet first, then 1shot-api. Keep each phase in separate commits and include integration test checkpoints.

