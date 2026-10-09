# Contributing

Read the README and architecture notes before changing account, game, payment, or real-time session flows. Open an issue with a concise description and a reproducible example before proposing a broad change.

Use the checked-in npm lockfiles. Do not commit `.env`, payment credentials, account data, production logs, Android signing properties, keystores, or generated APKs. Use fictional test data and payment-provider sandboxes.

Available checks include `npm test --prefix server`, `npm run build --prefix client`, and the Android debug build from `client/android`. Note which checks you ran.

No license has been selected yet; public visibility does not grant permission to reuse the code.

Contact: Stephane Jacob <jacobstephane@outlook.com>
