# Heisenberg Poker

A multiplayer poker and casino-room application with a React client, Node.js API, real-time game sessions, BTCPay integration, and a Capacitor Android shell.

## Project status

This is a prototype. Game, account, payment, and wagering behavior needs independent security and legal review before any real-money use. The repository does not include production credentials or signing keys.

## Technology

- Node.js and Express API with Socket.IO.
- React and Vite client.
- PostgreSQL-backed accounts and game state.
- Capacitor-based Android application.
- Optional BTCPay and local support-service integrations.

## Run locally

Requirements: Node.js and npm, PostgreSQL, and Android Studio only if building the Android app.

```sh
cp server/.env.example server/.env
npm ci --prefix server
npm ci --prefix client
```

Set a local database and fresh development secrets in `server/.env`, then start the API and web client in separate terminals:

```sh
npm run dev --prefix server
npm run dev --prefix client
```

The Vite client proxies API and Socket.IO traffic to the local API. Android builds require a configured API base URL; see [the Android notes](client/android/README.md). Do not commit `.env`, logs, Android signing files, APKs, or production account data.

## Documentation

- [Architecture and local configuration](ARCHITECTURE.md)
- [Graphics and asset notes](GRAPHICS.md)
- [Android build notes](client/android/README.md)
- [Security reporting](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Responsible use

This code is not a gambling license, payment service, or legal opinion. Do not enable real-money wagering or payment flows without the appropriate legal, security, age-verification, and operational reviews.

## License

No license has been selected yet. Public visibility does not grant permission to reuse the code.

## Contact

Stephane Jacob <jacobstephane@outlook.com>
