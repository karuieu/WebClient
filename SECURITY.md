# Security policy

Karui's whole promise is that the server cannot read your conversations. If you
found a way to break that promise, we want to hear about it first.

## How to report

Email **admin@karui.eu**.

Please don't report vulnerabilities in public issues. If you have a working
exploit, leave the details out of the first message; we'll reply with a safe
channel for the rest.

Useful to include: steps to reproduce, what you achieved (reading another
user's data, bypassing a limit, running code…), and the commit, if you know it.

## What to expect

- confirmation within 3 business days,
- an assessment and a fix plan within 14 days,
- a reply once the fix is deployed.

There is no bug bounty. If you'd like, we'll credit you publicly in the fix.

## Scope

In scope:

- the encryption path in the browser (`lib/account/crypto.ts`, `lib/account/session.ts`, `lib/account/recovery.ts`),
- end-to-end inference to the enclaves (`lib/chat/inference.ts`, `lib/enclave/nearaiClient.ts`,
  `lib/enclave/phalaClient.ts`), including attestation checks,
- anything in this app that sends plaintext anywhere other than an attested enclave,
- the Karui API and server: reports are welcome by email, although that code is not public,
- anything that lets someone read or change another user's data.

Out of scope:

- the inference providers' own infrastructure (NEAR AI and Phala enclaves): report to them,
- attacks that need physical access to the user's device,
- automated scanner output without a confirmed impact,
- a missing header or flag without a shown abuse scenario,
- volumetric DoS.
