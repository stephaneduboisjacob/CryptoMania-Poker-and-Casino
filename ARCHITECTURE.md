# Heisenberg Poker — Architecture

## Project status

This repository contains a multiplayer poker and casino-room prototype. Game, account, payment, and wagering behavior needs independent security and legal review before any real-money use.

## Components

- **API:** Node.js and Express routes for accounts, wallets, game state, administration, and BTCPay webhooks.
- **Realtime:** Socket.IO sessions for poker rooms, tournaments, and game updates.
- **Client:** React and Vite user interface with poker and casino game views.
- **Android:** Capacitor shell with a small native API client and locally generated app assets.
- **Data:** PostgreSQL-backed application records, configured through `server/.env`.

## Local configuration

Copy `server/.env.example` to `server/.env`, set a dedicated development database and fresh random secrets, and leave payment variables empty unless using a provider sandbox. The Vite client proxies `/api` and `/socket.io` to the local API on port `3001`.

For Android emulator builds, the API endpoint defaults to `http://10.0.2.2:3001`. Override it with a Gradle property when building for a deployment:

```sh
cd client/android
./gradlew assembleDebug -PapiBaseUrl=https://your-api.example
```

Release signing is optional and uses `client/android/signing.properties` plus a keystore stored outside Git. Never put signing passwords or keystore files in the Gradle build script.

## Payment and responsible use

BTCPay settings are optional and must be configured with operator-owned credentials. Use sandbox or test infrastructure during development. This code is not a gambling license, payment service, or legal opinion; do not enable real-money wagering without the required legal, security, age-verification, and operational reviews.

## Contact

Stephane Jacob <jacobstephane@outlook.com>
