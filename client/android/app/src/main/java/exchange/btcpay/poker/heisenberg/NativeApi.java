package exchange.btcpay.poker.heisenberg;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Small bearer-token API client for the native Android app. */
final class NativeApi {
    static final String BASE_URL = BuildConfig.API_BASE_URL;
    private static final String PREFS = "cryptomania_native";
    private static final String TOKEN_DATA = "jwt_ciphertext";
    private static final String TOKEN_IV = "jwt_iv";
    private static final String KEY_ALIAS = "cryptomania.native.session";
    private final Context context;
    private final ExecutorService io = Executors.newFixedThreadPool(3);
    private final Handler main = new Handler(Looper.getMainLooper());

    interface Callback {
        void done(JSONObject body, String error);
    }

    NativeApi(Context context) { this.context = context.getApplicationContext(); }

    String token() {
        try {
            android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String encoded = prefs.getString(TOKEN_DATA, null);
            String iv = prefs.getString(TOKEN_IV, null);
            if (encoded == null || iv == null) return null;
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            byte[] plaintext = cipher.doFinal(Base64.decode(encoded, Base64.NO_WRAP));
            return new String(plaintext, StandardCharsets.UTF_8);
        } catch (Exception error) {
            clearToken();
            return null;
        }
    }

    void saveToken(String token) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey());
            byte[] ciphertext = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString(TOKEN_DATA, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                    .putString(TOKEN_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                    .apply();
        } catch (Exception error) {
            throw new IllegalStateException("Secure sign-in storage is unavailable", error);
        }
    }

    void clearToken() {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(TOKEN_DATA).remove(TOKEN_IV).apply();
    }

    private SecretKey secretKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        java.security.Key existing = store.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    void get(String path, Callback callback) { request("GET", path, null, callback); }
    void post(String path, JSONObject data, Callback callback) { request("POST", path, data, callback); }
    void put(String path, JSONObject data, Callback callback) { request("PUT", path, data, callback); }
    void delete(String path, Callback callback) { request("DELETE", path, null, callback); }

    private void request(String method, String path, JSONObject data, Callback callback) {
        io.execute(() -> {
            JSONObject body = null;
            String error = null;
            HttpURLConnection connection = null;
            try {
                URL url = new URL(BASE_URL + path);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod(method);
                connection.setConnectTimeout(12000);
                connection.setReadTimeout(18000);
                connection.setRequestProperty("Accept", "application/json");
                String token = token();
                if (token != null && !token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
                if (data != null) {
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    byte[] bytes = data.toString().getBytes(StandardCharsets.UTF_8);
                    try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
                }
                int status = connection.getResponseCode();
                InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                StringBuilder text = new StringBuilder();
                if (stream != null) {
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) text.append(line);
                    }
                }
                if (text.length() > 0) body = new JSONObject(text.toString());
                if (status < 200 || status >= 300) {
                    error = body == null ? "Request failed (" + status + ")" : body.optString("error", "Request failed (" + status + ")");
                }
            } catch (Exception exception) {
                error = exception.getMessage() == null ? "Could not reach the casino" : exception.getMessage();
            } finally {
                if (connection != null) connection.disconnect();
            }
            JSONObject result = body;
            String failure = error;
            main.post(() -> callback.done(result, failure));
        });
    }

    void close() { io.shutdownNow(); }
}
