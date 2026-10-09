# Android build notes

The Android application is a Capacitor shell around the React client. Build the web client before syncing native assets; generated `app/src/main/assets/public/` files are ignored by Git.

## Debug build

From the project root:

```sh
npm ci --prefix client
npm run build --prefix client
cd client/android
./gradlew assembleDebug -PapiBaseUrl=http://10.0.2.2:3001
```

The emulator reaches a development API on the host through `10.0.2.2`. Set `-PapiBaseUrl` to an HTTPS endpoint you control for a deployment build. Do not point development builds at production by default.

## Release signing

Release signing is optional. Create `client/android/signing.properties` locally with `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`, and keep the keystore outside the repository. The properties file and keystore are ignored by Git. Back up the key securely; do not publish either file.

## Contact

Stephane Jacob <jacobstephane@outlook.com>
