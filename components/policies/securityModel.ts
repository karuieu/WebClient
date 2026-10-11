export const securityModel = `# The Karui security model

This page describes, precisely, what happens to your words. It matches the code that ships — where a claim has a boundary, the boundary is stated.

## The short version

Everything Karui stores is encrypted in your browser before it is sent. The server holds ciphertext it cannot read. Your conversation is also encrypted in your browser directly to the enclave that answers it, so it does not exist in the clear on our infrastructure either. One derived thing does, and only if you use the feature that produces it: the query a web search sends out. It lives in memory for one request and is written down nowhere.

## Sealing at rest

When you create an account, your browser generates a random 256-bit AES data key. That key is immediately *wrapped* — encrypted with a second key derived from your password using PBKDF2-SHA-256 with 600,000 iterations and a 32-byte random salt. Only the wrapped blob ever reaches the server. The wrapping key, and the unwrapped data key, exist solely in your browser's memory.

Every chat message, chat title, project name, project content, memory entry and stored image is encrypted with AES-256-GCM using that same unwrapped data key before upload — no per-item salt needed, since it's one key for everything you own. The stored format is \`[nonce | ciphertext]\`. Each ciphertext is also bound to its place: the kind of field, the IDs of the rows it belongs to and, for messages, the sender's role go into the encryption as associated data. Moved to another chat, another field or another role, it no longer opens.

Your browser can also wrap the same data key a second way, with a 12-word recovery phrase. The words never leave your device; the server keeps only a hash of a separate key derived from them.

## Signing in

Your password does two separate jobs, and neither sends it to us. To sign in, your browser derives a separate login key from it (PBKDF2-SHA-256, 600,000 iterations) and sends only that; the server stores an Argon2id hash of the login key. The login key cannot open your data key without cracking the password itself. For your data, the password is used locally, in the browser, to unwrap the data key returned at login. The unwrapped key never leaves your device. Two-factor sign-in with an authenticator app is available in Settings.

## The moment of inference

For a model to answer you, it has to read your prompt — but it is the only thing that does. Your browser decrypts the conversation context, re-encrypts it to the hardware enclave that will run the model, and sends that sealed request through our backend, which has no key for it. The reply comes back the same way and is sealed again before it is saved to history.

The model you pick decides where it runs: Light on NEAR AI, Heavy on Phala, and a model both offer on the provider you choose in Settings. Both run inference inside hardware enclaves, and Karui sends your words only to models a provider runs on its own hardware, never to a third party behind it. With both, your browser encrypts the message text but leaves the surrounding envelope readable — we see roles, the number of messages, the model name and token counts, though not what was said. With NEAR AI, before sending, your browser verifies that NEAR's gateway and the model's enclave run on genuine Intel TDX hardware — quotes that chain to Intel's root, bound to a fresh challenge — and encrypts each message to the model's own enclave key. With Phala, each encrypted message is also bound to its position, the model and that one request, so it cannot be moved or replayed; it is decrypted in Phala's enclave gateway, which passes it only to a model host whose enclave it has verified. Before sending, your browser verifies the gateway's attestation: a TDX quote that chains to Intel's root, Phala's production operating system, and an encryption key bound to that quote and to a fresh challenge. Neither check yet pins which release of the provider's code is running. Whenever a provider fails, you see the error; Karui never sends your message to another provider on its own. Phala is available on Pro.

Providers that offer neither of these mechanisms are not on the list. Supporting one would mean relaying your words to it in plaintext; we removed the two we had rather than keep that path open.

## Every path your plaintext takes

A single message can leave your device more than once, so here is the full list. Web search adds extra passes over the same context: a helper model, Qwen 3.8 27B, reads your message to decide what to search for, and only then does your chosen model write the answer. Those passes run at the same provider, sealed the same way. The search query the model produces does not: it goes to Brave, an ordinary third-party API with no enclave, and it reaches us readable on the way.

An image you attach goes to the model sealed like the text, and only to a model that reads images; our servers never see it. Memory stays sealed too, in both of its phases — deciding which memory files are relevant to a message, and reorganising those files from recent conversations. Summarising older turns of a long conversation works the same way. Every one of these features is optional, none of them is persisted, and in each case the work happens inside an enclave at the provider serving that conversation.

## Two limits of doing this in a browser

The attestation reports reach your browser through our server. It can withhold them but not forge them; because no code release is pinned yet, though, a dishonest server could hand out its own key only by running its own gateway or model deployment on genuine Intel TDX hardware. Separately, we serve the JavaScript that performs your encryption, so a server shipping altered code could weaken it.

Neither is a flaw in the cryptography; both are inherent to web apps that encrypt in the browser, and both come down to trusting the code we serve. That is precisely why we intend to open-source the encryption code after beta — so it can be checked rather than believed.

## If you forget your password

Your recovery phrase opens the same data key, so you can set a new password and keep everything. Without the phrase there is no recovery path for sealed data — that is a property of the design, not an oversight. Without your password or phrase the wrapped key cannot be opened, by you or by us. Resetting your password without the phrase starts a new sealed history, and the old ciphertext is deleted, since no one could read it again.

## What a breach or subpoena would yield

Ciphertext, wrapped keys, and Argon2id hashes. No readable conversations, titles, projects, memories or images — regardless of who is asking or how the data leaves the server.

## What we haven't done yet

Karui has not yet undergone a third-party security audit, and our legal documents are drafts under review. We'd rather state that than imply otherwise — the same honesty this page applies to the inference boundary.
`;
