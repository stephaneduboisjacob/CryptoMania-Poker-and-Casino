package exchange.btcpay.poker.heisenberg;

import org.json.JSONObject;
import org.json.JSONArray;
import java.net.URI;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import io.socket.client.IO;
import io.socket.client.Socket;

/** Authenticated Socket.IO connection used by native live tables. */
final class NativeGameSocket {
    interface Listener { void event(String name, JSONObject payload); }
    private Socket socket;

    NativeGameSocket(String token, Listener listener) {
        try {
            IO.Options options = IO.Options.builder()
                    .setTransports(new String[]{"websocket", "polling"})
                    .setReconnection(true)
                    .setReconnectionAttempts(Integer.MAX_VALUE)
                    .setReconnectionDelay(700)
                    .setTimeout(10000)
                    .setAuth(Collections.singletonMap("token", token))
                    .build();
            socket = IO.socket(URI.create(NativeApi.BASE_URL), options);
            String[] events = {"connect", "disconnect", "connect_error", "houseInit", "houseState", "gameState", "tableInit", "myCards", "actionError", "casinoError", "crashCashed", "crashBusted", "balanceChanged", "tableSeats", "tableChat", "handResult", "tournamentInfo", "tournamentEnd", "buttonDraw", "showCard", "playerJoined", "playerDisconnected", "sitOutChanged", "timebankUsed", "chatMessage", "lobbyChatMessage", "onlinePlayers", "friendOnline", "friendChallenge", "error"};
            for (String event : events) {
                socket.on(event, args -> {
                    JSONObject payload = args != null && args.length > 0 && args[0] instanceof JSONObject
                            ? (JSONObject) args[0] : new JSONObject();
                    if (args != null && args.length > 0 && args[0] instanceof JSONArray) {
                        try { payload.put("data", args[0]); } catch (org.json.JSONException ignored) {}
                    }
                    listener.event(event, payload);
                });
            }
            socket.connect();
        } catch (Exception error) {
            listener.event("connect_error", new JSONObject());
        }
    }

    void emit(String event, JSONObject payload) {
        if (socket != null && socket.connected()) socket.emit(event, payload);
    }

    boolean connected() { return socket != null && socket.connected(); }

    void close() {
        if (socket != null) {
            socket.disconnect();
            socket.close();
            socket = null;
        }
    }
}
