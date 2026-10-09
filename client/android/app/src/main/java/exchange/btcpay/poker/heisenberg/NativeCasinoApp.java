package exchange.btcpay.poker.heisenberg;

import android.app.Activity;
import android.content.Context;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Native-only casino lobby and game surfaces. No WebView or website navigation is used. */
final class NativeCasinoApp {
    private static final int BG = Color.rgb(8, 9, 11);
    private static final int PANEL = Color.rgb(20, 21, 25);
    private static final int PANEL_ALT = Color.rgb(27, 27, 33);
    private static final int GOLD = Color.rgb(247, 173, 52);
    private static final int GOLD_BRIGHT = Color.rgb(255, 210, 112);
    private static final int MUTED = Color.rgb(157, 159, 170);
    private static final int WHITE = Color.rgb(246, 246, 248);
    private static final int GREEN = Color.rgb(52, 211, 153);
    private static final int RED = Color.rgb(248, 113, 113);
    private final Activity activity;
    private final NativeApi api;
    private final LinearLayout root;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable sessionReminderTask;
    private LinearLayout page;
    private JSONObject user;
    private JSONArray houseTables = new JSONArray();
    private JSONArray machines = new JSONArray();
    private JSONArray legacyTournaments = new JSONArray();
    private JSONObject pokerLobby = new JSONObject();
    private String currency = "play";
    private NativeGameSocket gameSocket;
    private String activeLiveTableId;
    private String activeLiveGame;
    private NativeGameSocket presenceSocket;
    private TextView clubOnlineView;
    private boolean pokerSittingOut;
    private int legacyPlayerPos;
    private String currentTitle;
    private TextView liveStateView;
    private TextView liveConnectionView;
    private JSONObject activeTable;
    private JSONObject minesRound;
    private final List<EditText> transientInputs = new ArrayList<>();
    private final Set<String> onlinePlayers = new HashSet<>();
    private JSONArray cachedBets = new JSONArray();
    private String betFilter = "all";
    private JSONObject cachedPreferences = new JSONObject();

    NativeCasinoApp(Activity activity) {
        this.activity = activity;
        api = new NativeApi(activity);
        root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setFitsSystemWindows(true);
    }

    View rootView() { return root; }

    void launch() {
        if (api.token() == null) { showAuth(false); return; }
        showLoading("Reopening your club");
        api.get("/api/auth/me", (body, error) -> {
            if (error == null && body != null && body.optJSONObject("user") != null) {
                user = body.optJSONObject("user");
                startSessionClock(false);
                showLobby();
            } else {
                api.clearToken();
                showAuth(false);
            }
        });
    }

    void destroy() {
        closeSocket();
        if (presenceSocket != null) { presenceSocket.close(); presenceSocket = null; }
        if (sessionReminderTask != null) mainHandler.removeCallbacks(sessionReminderTask);
        api.close();
    }

    boolean goBack() {
        if (currentTitle == null || currentTitle.equals("CASINO FLOOR")) return false;
        if (currentTitle.equals("HAND HISTORY") && activeTable != null && "poker".equals(activeLiveGame)) openPokerTable(activeTable);
        else if (currentTitle.equals("DEPOSIT INVOICE")) showWallet();
        else if (currentTitle.equals("TEXAS HOLD’EM") && activeTable != null && !activeTable.optBoolean("tournament")) leavePoker(activeTable);
        else showLobby();
        return true;
    }

    private void showLoading(String label) {
        currentTitle = null;
        root.removeAllViews();
        LinearLayout box = new LinearLayout(activity);
        box.setGravity(Gravity.CENTER);
        box.setOrientation(LinearLayout.VERTICAL);
        TextView mark = text("₿", 44, GOLD_BRIGHT, true);
        box.addView(mark);
        box.addView(text(label, 14, MUTED, false));
        root.addView(box, new LinearLayout.LayoutParams(-1, 0, 1));
    }

    private void showAuth(boolean register) {
        currentTitle = null;
        closeSocket();
        if (presenceSocket != null) { presenceSocket.close(); presenceSocket = null; }
        root.removeAllViews();
        ScrollView scroll = new ScrollView(activity);
        scroll.setFillViewport(true);
        LinearLayout column = new LinearLayout(activity);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);
        column.setPadding(dp(24), dp(30), dp(24), dp(28));
        scroll.addView(column);

        TextView crest = text("₿", 32, BG, true);
        crest.setGravity(Gravity.CENTER);
        crest.setBackground(rounded(GOLD, 20));
        LinearLayout.LayoutParams crestParams = new LinearLayout.LayoutParams(dp(72), dp(72));
        crestParams.bottomMargin = dp(18);
        column.addView(crest, crestParams);
        column.addView(text("CRYPTOMANIA", 25, WHITE, true));
        TextView tagline = text("YOUR PRIVATE CLUB ON THE DIGITAL FLOOR", 10, GOLD, true);
        tagline.setLetterSpacing(.13f);
        LinearLayout.LayoutParams taglineParams = new LinearLayout.LayoutParams(-2, -2);
        taglineParams.topMargin = dp(6);
        taglineParams.bottomMargin = dp(30);
        column.addView(tagline, taglineParams);

        LinearLayout panel = cardColumn();
        panel.setPadding(dp(20), dp(22), dp(20), dp(20));
        column.addView(panel, new LinearLayout.LayoutParams(-1, -2));
        panel.addView(text(register ? "Create your account" : "Welcome back", 22, WHITE, true));
        panel.addView(text(register ? "Join the floor in a few moments." : "Sign in and take your seat.", 13, MUTED, false), topSpace(5));
        EditText username = input("Username", false);
        EditText password = input("Password", true);
        panel.addView(username, topSpace(20));
        panel.addView(password, topSpace(12));
        if (register) {
            EditText confirm = input("Confirm password", true);
            panel.addView(confirm, topSpace(12));
            TextView info = text("Use 3–20 letters, numbers, or underscores. Passwords need at least 6 characters.", 11, MUTED, false);
            panel.addView(info, topSpace(14));
            panel.addView(button("CREATE ACCOUNT", true, () -> {
                String u = username.getText().toString().trim();
                String p = password.getText().toString();
                if (!p.equals(confirm.getText().toString())) { toast("Passwords do not match"); return; }
                authenticate("/api/auth/register", u, p);
            }), topSpace(20));
        } else {
            panel.addView(button("ENTER THE CASINO", true, () -> authenticate("/api/auth/login", username.getText().toString().trim(), password.getText().toString())), topSpace(20));
        }
        TextView switchMode = text(register ? "Already a member?  Sign in" : "New to the club?  Create an account", 14, GOLD_BRIGHT, true);
        switchMode.setGravity(Gravity.CENTER);
        switchMode.setPadding(0, dp(20), 0, dp(16));
        switchMode.setOnClickListener(v -> showAuth(!register));
        column.addView(switchMode);
        TextView terms = text("Play for entertainment. Set limits and keep your sessions in control.", 11, MUTED, false);
        terms.setGravity(Gravity.CENTER);
        column.addView(terms);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
    }

    private void authenticate(String path, String username, String password) {
        if (username.isEmpty() || password.isEmpty()) { toast("Enter your username and password"); return; }
        hideKeyboard();
        showLoading("Securing your entrance");
        api.post(path, json("username", username, "password", password), (body, error) -> {
            if (error != null || body == null) {
                showAuth(path.endsWith("register"));
                toast(error == null ? "Sign in failed" : error);
                return;
            }
            String token = body.optString("token", "");
            if (token.isEmpty()) { showAuth(false); toast("The server did not issue a session token"); return; }
            try { api.saveToken(token); }
            catch (RuntimeException storageError) { showAuth(false); toast("Secure session storage is unavailable. Please try signing in again."); return; }
            user = body.optJSONObject("user");
            startSessionClock(true);
            showLobby();
        });
    }

    private void showLobby() {
        closeSocket();
        ensurePresenceSocket();
        loadLobbyData(() -> renderLobby());
    }

    private void ensurePresenceSocket() {
        if (presenceSocket != null || api.token() == null) return;
        presenceSocket = new NativeGameSocket(api.token(), (event, payload) -> activity.runOnUiThread(() -> {
            if (event.equals("onlinePlayers")) {
                onlinePlayers.clear(); JSONArray list = payload.optJSONArray("data");
                if (list != null) for (int i = 0; i < list.length(); i++) { JSONObject p = list.optJSONObject(i); if (p != null) onlinePlayers.add(p.optString("username")); }
                if (clubOnlineView != null) clubOnlineView.setText(onlinePlayers.size() + " players online now · green dot marks a live friend");
            } else if (event.equals("friendChallenge")) showFriendChallenge(payload);
        }));
    }

    private void showFriendChallenge(JSONObject payload) {
        String from = payload.optString("from", "A friend"); String tournamentId = payload.optString("tournamentId", "");
        if (activity.isFinishing() || activity.isDestroyed()) return;
        new androidx.appcompat.app.AlertDialog.Builder(activity).setTitle("Poker challenge")
                .setMessage(from + " invited you to a free heads-up table.")
                .setNegativeButton("Later", (dialog, which) -> {})
                .setPositiveButton("Join table", (dialog, which) -> openLegacyPokerTournament(tournamentId)).show();
    }

    private void loadLobbyData(Runnable done) {
        showLoading("Opening the gaming floor");
        api.get("/api/house/tables", (house, houseError) -> {
            if (house != null) {
                houseTables = house.optJSONArray("tables") == null ? new JSONArray() : house.optJSONArray("tables");
                machines = house.optJSONArray("instant") == null ? new JSONArray() : house.optJSONArray("instant");
            }
            api.get("/api/poker/lobby", (poker, pokerError) -> {
                if (poker != null) pokerLobby = poker;
                api.get("/api/tournament/lobbies", (legacy, legacyError) -> {
                    if (legacy != null) legacyTournaments = legacy.optJSONArray("lobbies") == null ? new JSONArray() : legacy.optJSONArray("lobbies");
                    refreshUser(() -> done.run());
                    if (houseError != null) toast("Some tables could not load: " + houseError);
                });
            });
        });
    }

    private void renderLobby() {
        showPage("CASINO FLOOR", "A native casino experience, built for your phone.", false);
        FrameLayout heroFrame = new FrameLayout(activity);
        heroFrame.setBackground(roundedGradient(new int[]{Color.rgb(51, 33, 15), Color.rgb(25, 19, 15)}, 24));
        heroFrame.setClipToOutline(true);
        ImageView heroArt = new ImageView(activity);
        heroArt.setImageResource(R.drawable.cryptomania_hero);
        heroArt.setScaleType(ImageView.ScaleType.CENTER_CROP);
        heroArt.setAlpha(.65f);
        heroFrame.addView(heroArt, new FrameLayout.LayoutParams(-1, -1));
        View heroShade = new View(activity);
        heroShade.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0x36313D55, 0xA808090B, 0xF008090B}));
        heroFrame.addView(heroShade, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout hero = new LinearLayout(activity);
        hero.setOrientation(LinearLayout.VERTICAL);
        hero.setBackgroundColor(Color.TRANSPARENT);
        hero.setPadding(dp(20), dp(22), dp(20), dp(22));
        FrameLayout.LayoutParams heroContent = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        heroFrame.addView(hero, heroContent);
        LinearLayout.LayoutParams heroFrameParams = new LinearLayout.LayoutParams(-1, dp(254));
        heroFrameParams.topMargin = dp(8);
        page.addView(heroFrame, heroFrameParams);
        TextView eyebrow = text("CRYPTOMANIA  ·  EST. ON CHAIN", 10, GOLD_BRIGHT, true);
        eyebrow.setLetterSpacing(.14f);
        hero.addView(eyebrow);
        hero.addView(text("The floor is yours.", 28, WHITE, true), topSpace(8));
        hero.addView(text("Choose your game, set your pace, and enjoy the table with a clear view of every round.", 13, Color.rgb(220, 210, 195), false), topSpace(7));
        LinearLayout balances = row();
        balances.addView(balancePill("PLAY CHIPS", formatNumber(user == null ? 0 : user.optDouble("balancePlay", 0))), new LinearLayout.LayoutParams(0, -2, 1));
        balances.addView(balancePill("BTC", formatBtc(user == null ? 0 : user.optDouble("balanceBtc", 0))), leftSpace(8, new LinearLayout.LayoutParams(0, -2, 1)));
        hero.addView(balances, topSpace(18));

        LinearLayout currencyRow = row();
        currencyRow.addView(text("PLAY MODE", 11, MUTED, true), new LinearLayout.LayoutParams(0, -2, 1));
        currencyRow.addView(chip("PLAY", currency.equals("play"), () -> { currency = "play"; renderLobby(); }));
        currencyRow.addView(chip("BTC", currency.equals("btc"), () -> { currency = "btc"; renderLobby(); }), leftSpace(8, null));
        page.addView(currencyRow, topSpace(24));

        addSectionHeader("THE POKER ROOM", "Heads-up duels · cash tables · scheduled events");
        addNativeGameCard("🤖", "Practice against the house", "Free play · learn the rhythm at your own pace", this::joinAiTournament);
        addNativeGameCard("♠", "Find a free heads-up match", "Play-chip matchmaking · one opponent across the felt", () -> joinTournament("play"));
        addNativeGameCard("♛", "Explore every poker table", "Choose stakes, table size, Sit & Go speed, and events", this::showPokerRoom);
        boolean hasLegacy = false;
        for (int i = 0; i < legacyTournaments.length(); i++) {
            JSONObject tournament = legacyTournaments.optJSONObject(i); if (tournament == null || user == null) continue;
            String myId = user.optString("id");
            if (myId.equals(tournament.optString("player1_id")) || myId.equals(tournament.optString("player2_id"))) {
                if (!hasLegacy) { addSectionHeader("YOUR HEADS-UP MATCHES", "Resume a live game or wait for your opponent"); hasLegacy = true; }
                String status = tournament.optString("status", "waiting").toUpperCase();
                String opponent = tournament.optString("player1_id").equals(myId) ? tournament.optString("player2_name", "Waiting for opponent") : tournament.optString("player1_name", "Opponent");
                String tournamentId = tournament.optString("id");
                addNativeGameCard("♠", "" + status + " · " + opponent, "Heads-up Hold’em · tap to open your match", () -> openLegacyPokerTournament(tournamentId));
            }
        }

        addDailyBonusCard();
        addJackpotPreview();

        addSectionHeader("INSTANT GAMES", "Quick rounds · instant results");
        addNativeGameCard("🎲", "Dice", "Choose a number, pick a side, and roll.", () -> openMachine("dice-" + currency));
        addNativeGameCard("🔺", "Plinko", "Drop a ball through the pegs and discover its multiplier.", () -> openMachine("plinko-" + currency));
        addNativeGameCard("🎰", "Video slots", "Explore the reel collection and spin with a chosen stake.", () -> openSlots());
        addNativeGameCard("🂡", "Video poker", "Draw five cards and hold the strongest combination.", () -> openMachine("videopoker-" + currency));
        addNativeGameCard("💎", "Mines", "Reveal gems, watch the multiplier rise, and cash out in time.", () -> openMines());

        addSectionHeader("LIVE TABLES", "Join a live round from the floor");
        List<JSONObject> shownTables = new ArrayList<>();
        for (int i = 0; i < houseTables.length(); i++) {
            JSONObject table = houseTables.optJSONObject(i);
            if (table != null && currency.equals(table.optString("currency"))) shownTables.add(table);
        }
        if (shownTables.isEmpty()) page.addView(text("No live tables are available right now.", 13, MUTED, false), topSpace(10));
        for (JSONObject table : shownTables) {
            String icon = gameIcon(table.optString("game"));
            String details = table.optString("currency").toUpperCase() + " · " + formatStake(table.optLong("minBet"), table.optString("currency")) + " min · " + table.optInt("players") + " seated";
            addNativeGameCard(icon, table.optString("name"), details, () -> openLiveTable(table));
        }

        addSectionHeader("POKER ROOM", "Sit down for Texas Hold’em");
        JSONArray cashFormats = pokerLobby.optJSONArray("cash");
        if (cashFormats != null) {
            int shown = 0;
            for (int i = 0; i < cashFormats.length(); i++) {
                JSONObject format = cashFormats.optJSONObject(i);
                if (format == null || !currency.equals(format.optString("currency"))) continue;
                addNativeGameCard("♠", format.optString("name"), format.optString("players") + " at the tables · blinds " + formatStake(format.optLong("sb"), format.optString("currency")) + "/" + formatStake(format.optLong("bb"), format.optString("currency")), () -> joinPoker(format));
                if (++shown >= 8) break;
            }
        }
        if (cashFormats == null || filteredCashCount(cashFormats) == 0) page.addView(text("Poker cash tables are preparing for the next hand.", 13, MUTED, false), topSpace(8));
        addSectionHeader("SIT & GO", "Register for a compact tournament");
        JSONObject featuredSng = null;
        JSONArray sngFormats = pokerLobby.optJSONArray("sngs");
        if (sngFormats != null) for (int i = 0; i < sngFormats.length(); i++) {
            JSONObject format = sngFormats.optJSONObject(i);
            if (format != null && currency.equals(format.optString("currency")) && format.optInt("seats") == 6 && format.optString("speed").equals("regular")) { featuredSng = format; break; }
        }
        if (featuredSng != null) {
            JSONObject sng = featuredSng;
            String entry = currency.equals("btc") ? "$" + sng.optInt("buyin") : formatNumber(sng.optInt("buyin")) + " play chips";
            addNativeGameCard("♟", "Six-max Sit & Go", entry + " · regular speed · " + sng.optInt("open") + " waiting", () -> joinSng(sng));
        } else page.addView(text("Sit & Go formats are unavailable.", 12, MUTED, false), topSpace(8));

        JSONArray myGames = pokerLobby.optJSONArray("mine");
        if (myGames != null && myGames.length() > 0) {
            addSectionHeader("YOUR TOURNAMENTS", "Pick up where you left off");
            for (int i = 0; i < myGames.length(); i++) {
                JSONObject mine = myGames.optJSONObject(i); if (mine == null) continue;
                String tableId = mine.optString("tableId", "");
                if (tableId.isEmpty() || tableId.equals("null")) {
                    addNativeGameCard("♟", mine.optString("name"), "Registration · " + mine.optInt("registered") + " players · " + mine.optString("status"), () -> toast("You are registered. The table opens when the event starts."));
                } else {
                    JSONObject tournament = json("id", tableId, "game", "poker", "gameId", mine.optString("gameId"), "name", mine.optString("name"), "currency", mine.optString("currency"), "tournament", true);
                    addNativeGameCard("♟", mine.optString("name"), "LIVE · " + mine.optInt("registered") + " registered · tap to return", () -> openPokerTable(tournament));
                }
            }
        }

        JSONArray tournaments = pokerLobby.optJSONArray("mtts");
        if (tournaments != null && tournaments.length() > 0) {
            addSectionHeader("SCHEDULED EVENTS", "Live multi-table tournaments");
            for (int i = 0; i < tournaments.length(); i++) {
                JSONObject event = tournaments.optJSONObject(i);
                if (event == null || !currency.equals(event.optString("currency"))) continue;
                String entry = currency.equals("btc") ? "$" + event.optInt("entryUsd") : formatNumber(event.optLong("entryFee")) + " chips";
                String details = entry + " entry · " + event.optInt("registered") + " registered · " + event.optString("status");
                addNativeGameCard("🏆", event.optString("name"), details, () -> registerTournament(event));
            }
        }
        page.addView(button("MY BETS & ROUND HISTORY", false, this::showMyBets), topSpace(18));
        page.addView(button("FAIR PLAY VERIFIER", false, () -> showFair(null)), topSpace(9));
        page.addView(button("REFRESH THE FLOOR", false, this::showLobby), topSpace(14));
        addBottomNav("floor");
    }

    private void joinAiTournament() {
        showLoading("Preparing a practice table");
        api.post("/api/tournament/join-ai", new JSONObject(), (body, error) -> {
            if (error != null || body == null) { showLobby(); toast(error == null ? "Practice table could not be opened" : error); return; }
            JSONObject tournament = body.optJSONObject("tournament");
            if (tournament == null) { showLobby(); toast("Practice table could not be opened"); return; }
            openLegacyPokerTournament(tournament.optString("id"));
        });
    }

    private void joinTournament(String tier) {
        showLoading("Finding your opponent");
        api.post("/api/tournament/join", json("tier", tier), (body, error) -> {
            if (error != null || body == null) { showLobby(); toast(error == null ? "Could not join a match" : error); return; }
            JSONObject tournament = body.optJSONObject("tournament");
            if (tournament == null) { showLobby(); toast("Could not join a match"); return; }
            openLegacyPokerTournament(tournament.optString("id"));
        });
    }

    private void addDailyBonusCard() {
        LinearLayout card = cardColumn();
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        LinearLayout top = row(); top.setGravity(Gravity.CENTER_VERTICAL);
        TextView crest = text("✦", 22, GOLD_BRIGHT, true); crest.setGravity(Gravity.CENTER);
        crest.setBackground(rounded(Color.rgb(54, 37, 20), 14));
        top.addView(crest, new LinearLayout.LayoutParams(dp(44), dp(44)));
        LinearLayout copy = new LinearLayout(activity); copy.setOrientation(LinearLayout.VERTICAL);
        copy.addView(text("DAILY CLUB BONUS", 11, GOLD_BRIGHT, true));
        TextView status = text("Checking your next reward…", 12, MUTED, false);
        copy.addView(status, topSpace(4));
        top.addView(copy, leftSpace(11, new LinearLayout.LayoutParams(0, -2, 1)));
        card.addView(top);
        Button claim = button("CLAIM 1,000 PLAY CHIPS", true, () -> {});
        claim.setEnabled(false);
        card.addView(claim, topSpace(12));
        page.addView(card, topSpace(16));
        api.get("/api/house/bonus/status", (body, error) -> {
            if (body == null || page == null || !card.isAttachedToWindow()) return;
            boolean available = body.optBoolean("claimable");
            int amount = body.optInt("amount", 1000) + Math.max(0, body.optInt("streak", 0)) * 100;
            status.setText(available ? "Streak " + (body.optInt("streak", 0) + 1) + " · ready to collect" : "Streak " + body.optInt("streak", 0) + " · next drop in " + formatDuration(body.optLong("canClaimIn")));
            claim.setText(available ? "CLAIM " + formatNumber(amount) + " PLAY CHIPS" : "CLAIMED · COME BACK TOMORROW");
            claim.setEnabled(available);
            claim.setOnClickListener(v -> {
                claim.setEnabled(false); claim.setText("COLLECTING…");
                api.post("/api/house/bonus/claim", new JSONObject(), (result, claimError) -> {
                    if (claimError != null || result == null) { toast(claimError == null ? "Bonus could not be claimed" : claimError); showLobby(); return; }
                    toast("Collected " + formatNumber(result.optDouble("amount")) + " play chips");
                    refreshUser(null); showLobby();
                });
            });
        });
    }

    private void addJackpotPreview() {
        LinearLayout card = cardColumn(); card.setPadding(dp(15), dp(14), dp(15), dp(14));
        LinearLayout row = row(); row.setGravity(Gravity.CENTER_VERTICAL);
        row.addView(text("PROGRESSIVE JACKPOTS", 11, GOLD, true), new LinearLayout.LayoutParams(0, -2, 1));
        row.addView(text("PLAY", 9, BG, true), null);
        card.addView(row);
        TextView amounts = text("Loading live pools…", 13, WHITE, true); card.addView(amounts, topSpace(8));
        TextView lastWinner = text("Every slot spin feeds the shared pools.", 10, MUTED, false); card.addView(lastWinner, topSpace(4));
        page.addView(card, topSpace(10));
        card.setOnClickListener(v -> openSlots());
        api.get("/api/house/jackpots", (body, error) -> {
            if (body == null || !card.isAttachedToWindow()) return;
            JSONArray jackpots = body.optJSONArray("jackpots");
            if (jackpots == null || jackpots.length() == 0) { amounts.setText("Jackpot pools are warming up"); return; }
            StringBuilder values = new StringBuilder();
            String winner = null;
            for (int i = 0; i < jackpots.length(); i++) {
                JSONObject jackpot = jackpots.optJSONObject(i); if (jackpot == null) continue;
                if (values.length() > 0) values.append("     ·     ");
                values.append(jackpot.optString("tier").toUpperCase()).append("  ").append(formatNumber(jackpot.optDouble("pool")));
                if (winner == null && !jackpot.optString("lastWinner", "").isEmpty()) winner = jackpot.optString("lastWinner") + " last hit " + jackpot.optString("tier") + " · " + formatNumber(jackpot.optDouble("lastAmount"));
            }
            amounts.setText(values.toString());
            if (winner != null) lastWinner.setText(winner);
        });
    }

    private String formatDuration(long millis) {
        long totalMinutes = Math.max(0, millis) / 60000;
        long hours = totalMinutes / 60;
        long minutes = totalMinutes % 60;
        return hours > 0 ? hours + "h " + minutes + "m" : minutes + "m";
    }

    private int filteredCashCount(JSONArray data) {
        int count = 0;
        for (int i = 0; i < data.length(); i++) if (currency.equals(data.optJSONObject(i).optString("currency"))) count++;
        return count;
    }

    private void addSectionHeader(String title, String subtitle) {
        LinearLayout header = new LinearLayout(activity);
        header.setOrientation(LinearLayout.VERTICAL);
        header.addView(text(title, 12, GOLD, true));
        header.addView(text(subtitle, 12, MUTED, false), topSpace(4));
        page.addView(header, topSpace(26));
    }

    private void addNativeGameCard(String icon, String title, String subtitle, Runnable click) {
        LinearLayout item = row();
        item.setGravity(Gravity.CENTER_VERTICAL);
        item.setBackground(rounded(PANEL, 18));
        item.setPadding(dp(14), dp(13), dp(14), dp(13));
        FrameLayout artwork = new FrameLayout(activity);
        artwork.setBackground(rounded(PANEL_ALT, 12));
        artwork.setClipToOutline(true);
        int art = artworkFor(title);
        if (art != 0) {
            ImageView image = new ImageView(activity);
            image.setImageResource(art);
            image.setScaleType(ImageView.ScaleType.CENTER_CROP);
            image.setAlpha(.82f);
            artwork.addView(image, new FrameLayout.LayoutParams(-1, -1));
            View shade = new View(activity);
            shade.setBackgroundColor(0x55000000);
            artwork.addView(shade, new FrameLayout.LayoutParams(-1, -1));
        }
        TextView symbol = text(icon, 21, GOLD_BRIGHT, true);
        symbol.setGravity(Gravity.CENTER);
        artwork.addView(symbol, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout.LayoutParams artworkParams = new LinearLayout.LayoutParams(dp(55), dp(49));
        artworkParams.rightMargin = dp(12);
        item.addView(artwork, artworkParams);
        LinearLayout words = new LinearLayout(activity);
        words.setOrientation(LinearLayout.VERTICAL);
        words.addView(text(title, 15, WHITE, true));
        words.addView(text(subtitle, 11, MUTED, false), topSpace(4));
        item.addView(words, new LinearLayout.LayoutParams(0, -2, 1));
        item.addView(text("›", 25, GOLD, true));
        item.setOnClickListener(v -> click.run());
        page.addView(item, topSpace(9));
    }

    private int artworkFor(String title) {
        String key = title == null ? "" : title.toLowerCase(java.util.Locale.ROOT);
        if (key.contains("slot") || "SLOTS GALLERY".equals(currentTitle)) return R.drawable.artwork_slots;
        if (key.contains("plinko")) return R.drawable.artwork_plinko;
        if (key.contains("mines")) return R.drawable.artwork_mines;
        if (key.contains("dice")) return R.drawable.artwork_dice;
        if (key.contains("video poker")) return R.drawable.artwork_videopoker;
        if (key.contains("poker") || key.contains("hold’em") || key.contains("tournament") || key.contains("sit & go")) return R.drawable.artwork_poker;
        return R.drawable.artwork_tables;
    }

    private void openSlots() {
        JSONArray slots = new JSONArray();
        for (int i = 0; i < machines.length(); i++) {
            JSONObject m = machines.optJSONObject(i);
            if (m != null && m.optString("game").equals("slots") && currency.equals(m.optString("currency"))) slots.put(m);
        }
        showPage("SLOTS GALLERY", "Pick a cabinet, review the stake range, then spin.", true);
        if (slots.length() == 0) { page.addView(text("The slot gallery is currently unavailable.", 14, MUTED, false)); return; }
        for (int i = 0; i < slots.length(); i++) {
            JSONObject m = slots.optJSONObject(i);
            double rtp = m.optDouble("rtp", 0) * 100;
            addNativeGameCard("🎰", m.optString("label"), (rtp > 0 ? String.format("%.2f%% RTP", rtp) + " · " : "") + formatStake(m.optLong("min"), currency) + "–" + formatStake(m.optLong("max"), currency) + " per spin", () -> renderInstantGame(m));
        }
        addBottomNav("floor");
    }

    private void openMachine(String id) {
        JSONObject selected = null;
        for (int i = 0; i < machines.length(); i++) {
            JSONObject m = machines.optJSONObject(i);
            if (m != null && id.equals(m.optString("id"))) { selected = m; break; }
        }
        if (selected == null) { toast("This game is currently unavailable"); return; }
        renderInstantGame(selected);
    }

    private void renderInstantGame(JSONObject machine) {
        closeSocket();
        String game = machine.optString("game");
        String machineId = machine.optString("id");
        String label = machine.optString("label", game);
        showPage(label.toUpperCase(), gameDescription(game), true);
        LinearLayout gameCard = cardColumn();
        gameCard.setPadding(dp(18), dp(18), dp(18), dp(18));
        page.addView(gameCard, topSpace(8));
        TextView result = text("Ready when you are", game.equals("slots") ? 21 : 24, WHITE, true);
        result.setGravity(Gravity.CENTER);
        result.setPadding(0, dp(16), 0, dp(16));
        gameCard.addView(result);
        TextView detail = text("Outcomes are returned by the casino server and your account balance refreshes after each round.", 12, MUTED, false);
        detail.setGravity(Gravity.CENTER);
        gameCard.addView(detail);
        EditText bet = input("Bet · min " + formatStake(machine.optLong("min"), machine.optString("currency")), false);
        bet.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        bet.setText(String.valueOf(Math.max(1, machine.optLong("min", 1))));
        gameCard.addView(bet, topSpace(18));

        JSONObject params = new JSONObject();
        final int[] target = {50};
        final String[] direction = {"under"};
        final String[] risk = {"medium"};
        final int[] minesCount = {3};
        final String roundId = null;
        final JSONObject[] vpRound = {null};
        final boolean[] busy = {false};
        final boolean[] under = {true};
        final List<Integer> held = new ArrayList<>();
        final int[] chosenMines = {3};
        final boolean[] mineInRound = {false};
        final boolean[] mineBusy = {false};
        final boolean[] vpInRound = {false};
        final JSONArray[] currentHand = {null};
        final GridLayout[] mineGrid = {null};
        Spinner[] mineSpinner = {null};
        Button[] gameActionRef = {null};

        if (game.equals("dice")) {
            LinearLayout dir = row();
            Button underButton = button("ROLL UNDER", true, () -> {});
            Button overButton = button("ROLL OVER", false, () -> {});
            underButton.setOnClickListener(v -> { under[0] = true; direction[0] = "under"; styleToggle(underButton, true); styleToggle(overButton, false); });
            overButton.setOnClickListener(v -> { under[0] = false; direction[0] = "over"; styleToggle(underButton, false); styleToggle(overButton, true); });
            dir.addView(underButton, new LinearLayout.LayoutParams(0, dp(48), 1));
            dir.addView(overButton, leftSpace(8, new LinearLayout.LayoutParams(0, dp(48), 1)));
            gameCard.addView(dir, topSpace(16));
            TextView targetLabel = text("Target: 50 · chance 50% · multiplier 1.98×", 13, GOLD_BRIGHT, true);
            gameCard.addView(targetLabel, topSpace(10));
            SeekBar slider = new SeekBar(activity);
            slider.setMax(96); slider.setProgress(48); slider.setProgressTintList(android.content.res.ColorStateList.valueOf(GOLD));
            slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                    target[0] = progress + 2;
                    double chance = under[0] ? target[0] : 100 - target[0];
                    double mult = Math.floor((99 / chance) * 10000) / 10000;
                    targetLabel.setText("Target: " + target[0] + " · chance " + String.format("%.0f", chance) + "% · multiplier " + mult + "×");
                }
                @Override public void onStartTrackingTouch(SeekBar bar) {}
                @Override public void onStopTrackingTouch(SeekBar bar) {}
            });
            gameCard.addView(slider, topSpace(5));
        } else if (game.equals("plinko")) {
            Spinner riskPicker = spinner(new String[]{"Low risk", "Medium risk", "High risk"});
            riskPicker.setSelection(1);
            riskPicker.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
                @Override public void onItemSelected(android.widget.AdapterView<?> p, View v, int position, long id) { risk[0] = position == 0 ? "low" : position == 2 ? "high" : "medium"; }
                @Override public void onNothingSelected(android.widget.AdapterView<?> p) {}
            });
            gameCard.addView(label("RISK PROFILE"), topSpace(16));
            gameCard.addView(riskPicker, topSpace(5));
        } else if (game.equals("videopoker")) {
            LinearLayout cards = row();
            cards.setGravity(Gravity.CENTER);
            cards.setTag("vp-cards");
            gameCard.addView(cards, topSpace(20));
            for (int i = 0; i < 5; i++) {
                final int index = i;
                TextView card = text("·", 19, WHITE, true);
                card.setGravity(Gravity.CENTER);
                card.setBackground(rounded(PANEL_ALT, 10));
                LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(0, dp(64), 1);
                if (i > 0) cp.leftMargin = dp(5);
                cards.addView(card, cp);
                card.setTag("vp-card-" + i);
                card.setOnClickListener(v -> {
                    if (!vpInRound[0]) return;
                    if (held.contains(index)) held.remove((Integer) index); else held.add(index);
                    card.setTextColor(held.contains(index) ? GOLD_BRIGHT : WHITE);
                    card.setBackground(rounded(held.contains(index) ? Color.rgb(72, 51, 25) : PANEL_ALT, 10));
                });
            }
        } else if (game.equals("mines")) {
            mineSpinner[0] = spinner(new String[]{"1 mine", "3 mines", "5 mines", "10 mines", "15 mines", "20 mines", "24 mines"});
            int[] mineValues = {1, 3, 5, 10, 15, 20, 24};
            mineSpinner[0].setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
                @Override public void onItemSelected(android.widget.AdapterView<?> p, View v, int position, long id) { chosenMines[0] = mineValues[position]; }
                @Override public void onNothingSelected(android.widget.AdapterView<?> p) {}
            });
            gameCard.addView(label("NUMBER OF MINES"), topSpace(15));
            gameCard.addView(mineSpinner[0], topSpace(4));
            GridLayout grid = new GridLayout(activity);
            grid.setColumnCount(5);
            grid.setUseDefaultMargins(false);
            gameCard.addView(grid, topSpace(14));
            mineGrid[0] = grid;
            for (int i = 0; i < 25; i++) {
                final int tile = i;
                Button cell = button("✦", false, () -> {});
                cell.setTextSize(15);
                cell.setOnClickListener(v -> revealMine(tile, vpRound, mineInRound, mineBusy, mineGrid[0], result, gameActionRef, mineSpinner));
                GridLayout.LayoutParams gp = new GridLayout.LayoutParams();
                gp.width = 0; gp.height = dp(45); gp.columnSpec = GridLayout.spec(i % 5, 1f); gp.setMargins(dp(3), dp(3), dp(3), dp(3));
                grid.addView(cell, gp);
            }
            api.get("/api/house/mines/current", (body, error) -> {
                if (body == null || body.optJSONObject("round") == null) return;
                JSONObject r = body.optJSONObject("round");
                vpRound[0] = r;
                mineInRound[0] = true;
                bet.setText(String.valueOf(r.optInt("bet", 1)));
                if (mineSpinner[0] != null) mineSpinner[0].setEnabled(false);
                int mineCount = r.optInt("minesCount", 3);
                int[] mineOptions = {1, 3, 5, 10, 15, 20, 24};
                for (int i = 0; i < mineOptions.length; i++) if (mineOptions[i] == mineCount && mineSpinner[0] != null) mineSpinner[0].setSelection(i);
                JSONArray safe = r.optJSONArray("revealed");
                if (safe != null) for (int i = 0; i < safe.length(); i++) {
                    int tile = safe.optInt(i, -1);
                    if (tile >= 0 && tile < mineGrid[0].getChildCount()) {
                        Button cell = (Button) mineGrid[0].getChildAt(tile); cell.setText("✦"); cell.setTextColor(GREEN); cell.setBackground(rounded(Color.rgb(19, 54, 43), 10)); cell.setEnabled(false);
                    }
                }
                result.setText("Active round · " + r.optInt("revealed", 0) + " gems · " + r.optDouble("mult", 1) + "×");
                if (gameActionRef[0] != null) gameActionRef[0].setText("CASH OUT");
            });
        }

        Button action = button(game.equals("videopoker") ? "DEAL" : game.equals("mines") ? "START ROUND" : game.equals("slots") ? "SPIN" : game.equals("plinko") ? "DROP BALL" : "ROLL DICE", true, () -> {});
        gameActionRef[0] = action;
        gameCard.addView(action, topSpace(18));

        if (game.equals("videopoker")) {
            api.get("/api/house/vp/" + machineId + "/current", (body, error) -> {
                JSONObject round = body == null ? null : body.optJSONObject("round");
                if (round == null) return;
                vpRound[0] = round; vpInRound[0] = true; currentHand[0] = round.optJSONArray("hand");
                if (round.has("bet")) bet.setText(String.valueOf(round.optInt("bet")));
                paintVideoPokerCards(gameCard, currentHand[0], held);
                action.setText("DRAW HELD HAND"); result.setText("Your previous hand is ready. Choose cards to hold.");
            });
        }

        if (game.equals("videopoker")) {
            action.setOnClickListener(v -> {
                if (busy[0]) return;
                busy[0] = true;
                if (!vpInRound[0]) {
                    api.post("/api/house/vp/" + machineId + "/deal", json("bet", number(bet, 1)), (body, error) -> {
                        busy[0] = false;
                        if (error != null || body == null) { toast(error == null ? "Deal failed" : error); return; }
                        vpRound[0] = body; vpInRound[0] = true; currentHand[0] = body.optJSONArray("hand");
                        paintVideoPokerCards(gameCard, currentHand[0], held);
                        action.setText("DRAW HELD HAND"); result.setText("Choose the cards to hold."); refreshUser(null);
                    });
                } else {
                    JSONArray hold = new JSONArray(); for (Integer index : held) hold.put(index);
                    api.post("/api/house/vp/" + machineId + "/draw", json("roundId", vpRound[0].optString("roundId"), "hold", hold), (body, error) -> {
                        busy[0] = false;
                        if (error != null || body == null) { toast(error == null ? "Draw failed" : error); return; }
                        vpInRound[0] = false; held.clear();
                        paintVideoPokerCards(gameCard, body.optJSONArray("finalCards"), held);
                        result.setText(body.optString("result", "Hand complete") + " · payout " + formatStake(body.optLong("payout"), machine.optString("currency")));
                        action.setText("DEAL AGAIN"); refreshUser(null);
                    });
                }
            });
        } else if (game.equals("mines")) {
            action.setOnClickListener(v -> {
                if (busy[0]) return;
                if (mineInRound[0]) {
                    if (busy[0]) return;
                    busy[0] = true; action.setEnabled(false);
                    api.post("/api/house/mines/cashout", json("roundId", vpRound[0].optString("roundId")), (body, error) -> {
                        busy[0] = false; action.setEnabled(true);
                        if (error != null || body == null) { toast(error == null ? "Cash out failed" : error); return; }
                        mineInRound[0] = false; paintMineEnd(mineGrid[0], body.optJSONArray("mines"));
                        result.setText("Cashed out " + body.optDouble("mult", 1) + "× · " + formatNumber(body.optLong("payout")) + " returned");
                        action.setText("START ANOTHER ROUND"); if (mineSpinner[0] != null) mineSpinner[0].setEnabled(true); refreshUser(null);
                    });
                } else {
                    busy[0] = true;
                    api.post("/api/house/mines/start", json("bet", number(bet, 1), "mines", chosenMines[0]), (body, error) -> {
                        busy[0] = false;
                        if (error != null || body == null) { toast(error == null ? "Could not start round" : error); return; }
                        vpRound[0] = body; mineInRound[0] = true; result.setText("Round active · avoid " + chosenMines[0] + " mines");
                        action.setText("CASH OUT"); if (mineSpinner[0] != null) mineSpinner[0].setEnabled(false); clearMineGrid(mineGrid[0]); refreshUser(null);
                    });
                }
            });
        } else {
            action.setOnClickListener(v -> {
                if (busy[0]) return;
                busy[0] = true; action.setEnabled(false); action.setText("PLAYING…");
                JSONObject payload = json("bet", number(bet, (int) machine.optLong("min", 1)));
                if (game.equals("dice")) payload = json("bet", number(bet, 1), "params", json("target", target[0], "direction", direction[0]));
                if (game.equals("plinko")) payload = json("bet", number(bet, 1), "params", json("risk", risk[0]));
                JSONObject finalPayload = payload;
                api.post("/api/house/play/" + machineId, finalPayload, (body, error) -> {
                    busy[0] = false; action.setEnabled(true); action.setText(game.equals("slots") ? "SPIN" : game.equals("plinko") ? "DROP BALL" : "ROLL DICE");
                    if (error != null || body == null) { toast(error == null ? "Play failed" : error); return; }
                    String summary = formatOutcome(game, body, machine.optString("currency"));
                    result.setText(summary);
                    result.setTextColor(body.optDouble("payout", 0) > 0 || body.optBoolean("win") ? GREEN : WHITE);
                    refreshUser(null);
                });
            });
        }

        TextView footer = text("Fair play tools and round history are available in your account.", 11, MUTED, false);
        footer.setGravity(Gravity.CENTER);
        page.addView(footer, topSpace(14));
        addBottomNav("floor");
    }

    private String formatOutcome(String game, JSONObject outcome, String currency) {
        if (game.equals("dice")) return (outcome.optBoolean("win") ? "WIN" : "NO WIN") + " · rolled " + String.format("%.2f", outcome.optDouble("roll")) + " · payout " + formatStake(outcome.optLong("payout"), currency);
        if (game.equals("plinko")) return outcome.optDouble("multiplier", 0) + "× · bucket " + outcome.optInt("bucket") + " · net " + formatStake(outcome.optLong("net"), currency);
        JSONArray reels = outcome.optJSONArray("reels");
        StringBuilder symbols = new StringBuilder();
        if (reels != null) for (int i = 0; i < reels.length(); i++) { if (i > 0) symbols.append("   ·   "); symbols.append(reels.optString(i)); }
        if (outcome.optDouble("payout", 0) > 0) return "✦  " + symbols + "\nWIN · " + formatStake(outcome.optLong("payout"), currency) + " returned";
        return symbols.length() == 0 ? "Round complete · " + formatStake(outcome.optLong("payout"), currency) : symbols + "\nRound complete · no payout";
    }

    private String gameDescription(String game) {
        switch (game) {
            case "dice": return "Set your target and choose a side. Each roll is verified on the server.";
            case "plinko": return "Choose a risk level and drop a ball through the 16-row board.";
            case "slots": return "A reel cabinet from the Cryptomania slot collection.";
            case "videopoker": return "Jacks or Better · hold the cards you want to keep.";
            default: return "Mines · reveal gems and choose when to cash out.";
        }
    }

    private void revealMine(int tile, JSONObject[] roundRef, boolean[] active, boolean[] busy, GridLayout grid, TextView result, Button[] action, Spinner[] mineSpinner) {
        if (!active[0] || busy[0] || roundRef[0] == null) return;
        busy[0] = true;
        api.post("/api/house/mines/reveal", json("roundId", roundRef[0].optString("roundId"), "tile", tile), (body, error) -> {
            busy[0] = false;
            if (error != null || body == null) { toast(error == null ? "Tile could not be revealed" : error); return; }
            Button cell = (Button) grid.getChildAt(tile);
            if (body.optBoolean("bust")) {
                active[0] = false; cell.setText("💣"); cell.setTextColor(RED); paintMineEnd(grid, body.optJSONArray("mines"));
                result.setText("Mine hit · round settled"); result.setTextColor(RED); if (action[0] != null) action[0].setText("START ANOTHER ROUND"); if (mineSpinner[0] != null) mineSpinner[0].setEnabled(true); refreshUser(null);
            } else {
                cell.setText("✦"); cell.setTextColor(GREEN); cell.setBackground(rounded(Color.rgb(19, 54, 43), 10)); cell.setEnabled(false);
                result.setText("Gem secured · " + body.optDouble("mult", 1) + "× · cash out when ready");
                if (body.optBoolean("finished")) { active[0] = false; paintMineEnd(grid, body.optJSONArray("mines")); result.setText("Board cleared · payout " + formatNumber(body.optLong("payout"))); if (action[0] != null) action[0].setText("START ANOTHER ROUND"); if (mineSpinner[0] != null) mineSpinner[0].setEnabled(true); refreshUser(null); }
            }
        });
    }

    private void clearMineGrid(GridLayout grid) {
        if (grid == null) return;
        for (int i = 0; i < grid.getChildCount(); i++) {
            Button tile = (Button) grid.getChildAt(i); tile.setText("✦"); tile.setTextColor(GOLD_BRIGHT); tile.setBackground(rounded(PANEL_ALT, 10)); tile.setEnabled(true);
        }
    }

    private void paintMineEnd(GridLayout grid, JSONArray mines) {
        if (grid == null || mines == null) return;
        for (int i = 0; i < grid.getChildCount(); i++) grid.getChildAt(i).setEnabled(false);
        for (int i = 0; i < mines.length(); i++) {
            int index = mines.optInt(i, -1);
            if (index >= 0 && index < grid.getChildCount()) {
                Button tile = (Button) grid.getChildAt(index); tile.setText("💣"); tile.setTextColor(RED); tile.setBackground(rounded(Color.rgb(65, 28, 31), 10));
            }
        }
    }

    private void paintVideoPokerCards(LinearLayout card, JSONArray cards, List<Integer> held) {
        if (cards == null) return;
        LinearLayout row = null;
        for (int i = 0; i < card.getChildCount(); i++) if (card.getChildAt(i) instanceof LinearLayout && "vp-cards".equals(card.getChildAt(i).getTag())) row = (LinearLayout) card.getChildAt(i);
        if (row == null) return;
        for (int i = 0; i < Math.min(5, cards.length()); i++) {
            TextView view = (TextView) row.getChildAt(i);
            String value = cards.optString(i, "?");
            view.setText(cardLabel(value) + (held.contains(i) ? "\nHELD" : ""));
            boolean red = value.endsWith("h") || value.endsWith("d");
            view.setTextColor(held.contains(i) ? GOLD_BRIGHT : red ? RED : WHITE);
            view.setBackground(rounded(held.contains(i) ? Color.rgb(72, 51, 25) : PANEL_ALT, 10));
        }
    }

    private String cardLabel(String value) {
        if (value.length() < 2) return value;
        String suit = value.substring(value.length() - 1);
        String glyph = suit.equals("h") ? "♥" : suit.equals("d") ? "♦" : suit.equals("s") ? "♠" : "♣";
        return value.substring(0, value.length() - 1) + glyph;
    }

    private void openMines() {
        JSONObject machine = new JSONObject();
        try { machine.put("id", "mines"); machine.put("game", "mines"); machine.put("label", "Mines"); machine.put("min", 1); }
        catch (JSONException ignored) {}
        renderInstantGame(machine);
    }

    private void openLiveTable(JSONObject table) {
        String game = table.optString("game");
        if (api.token() == null) { showAuth(false); return; }
        closeSocket();
        showPage(table.optString("name").toUpperCase(), "Live table · " + table.optString("currency").toUpperCase(), true);
        activeTable = table;
        activeLiveTableId = table.optString("id");
        activeLiveGame = game;
        liveConnectionView = text("Connecting to live table…", 12, GOLD, true);
        page.addView(liveConnectionView, topSpace(10));
        liveStateView = text("Waiting for the next table update", 16, WHITE, true);
        liveStateView.setBackground(rounded(PANEL, 18));
        liveStateView.setPadding(dp(16), dp(20), dp(16), dp(20));
        page.addView(liveStateView, topSpace(10));
        EditText bet = input("Bet · min " + formatStake(table.optLong("minBet"), table.optString("currency")), false);
        bet.setInputType(InputType.TYPE_CLASS_NUMBER);
        bet.setText(String.valueOf(Math.max(1, table.optLong("minBet", 1))));
        page.addView(bet, topSpace(14));
        addLiveControls(table, bet);
        addBottomNav("floor");
        final String tableId = activeLiveTableId;
        gameSocket = new NativeGameSocket(api.token(), (event, payload) -> activity.runOnUiThread(() -> {
            if (!tableId.equals(activeLiveTableId)) return;
            if (event.equals("connect")) {
                liveConnectionView.setText("● Connected · table updates are live"); liveConnectionView.setTextColor(GREEN);
                gameSocket.emit("joinHouse", json("tableId", tableId));
            } else if (event.equals("disconnect") || event.equals("connect_error")) {
                liveConnectionView.setText("Reconnecting to the live table…"); liveConnectionView.setTextColor(RED);
            } else if (event.equals("actionError") || event.equals("casinoError")) {
                toast(payload.optString("message", "Action could not be completed"));
            } else if (event.equals("houseInit")) {
                updateLiveState(payload.optJSONObject("state"));
            } else if (event.equals("houseState")) {
                updateLiveState(payload);
            }
        }));
    }

    private void addLiveControls(JSONObject table, EditText bet) {
        String game = table.optString("game");
        String tableId = table.optString("id");
        if (game.equals("blackjack")) {
            page.addView(button("PLACE BET", true, () -> {
                if (gameSocket != null) gameSocket.emit("bjBet", json("tableId", tableId, "amount", number(bet, 100), "seat", JSONObject.NULL));
            }), topSpace(12));
            addActionRow(new String[]{"HIT", "STAND", "DOUBLE", "SPLIT"}, names -> {
                String action = names.toLowerCase();
                if (gameSocket != null) gameSocket.emit("bjAction", json("tableId", tableId, "action", action));
            });
            page.addView(text("Betting opens between hands. During your turn choose hit, stand, double, or split.", 12, MUTED, false), topSpace(12));
        } else if (game.equals("roulette")) {
            Spinner types = spinner(new String[]{"Red", "Black", "Odd", "Even", "1–18", "19–36", "1st dozen", "2nd dozen", "3rd dozen"});
            page.addView(types, topSpace(12));
            page.addView(button("PLACE TABLE BET", true, () -> {
                String[] vals = {"red", "black", "odd", "even", "low", "high", "dozen1", "dozen2", "dozen3"};
                int index = types.getSelectedItemPosition();
                if (gameSocket != null) gameSocket.emit("rlBet", json("tableId", tableId, "type", vals[index], "amount", number(bet, 10)));
            }), topSpace(9));
            page.addView(button("CLEAR MY BETS", false, () -> { if (gameSocket != null) gameSocket.emit("rlClear", json("tableId", tableId)); }), topSpace(8));
            page.addView(text("Choose a red/black, odd/even, high/low, or dozen wager while the betting window is open.", 12, MUTED, false), topSpace(10));
        } else if (game.equals("baccarat")) {
            addActionRow(new String[]{"PLAYER", "BANKER", "TIE"}, side -> {
                if (gameSocket != null) gameSocket.emit("bcBet", json("tableId", tableId, "side", side.toLowerCase(), "amount", number(bet, 25)));
            });
            page.addView(button("CLEAR MY BETS", false, () -> { if (gameSocket != null) gameSocket.emit("bcClear", json("tableId", tableId)); }), topSpace(8));
            page.addView(text("Bet on the Player hand, Banker hand, or a Tie. Cards are dealt automatically.", 12, MUTED, false), topSpace(10));
        } else if (game.equals("crash")) {
            page.addView(button("QUEUE BET FOR NEXT ROUND", true, () -> {
                if (gameSocket != null) gameSocket.emit("crashBet", json("tableId", tableId, "amount", number(bet, 10), "autoCashout", JSONObject.NULL));
            }), topSpace(12));
            page.addView(button("CASH OUT NOW", false, () -> { if (gameSocket != null) gameSocket.emit("crashCashout", json("tableId", tableId)); }), topSpace(8));
            page.addView(text("Queue before the next round, then cash out while the multiplier climbs.", 12, MUTED, false), topSpace(10));
        }
    }

    private interface StringAction { void run(String value); }
    private void addActionRow(String[] actions, StringAction callback) {
        LinearLayout buttons = row();
        for (String action : actions) {
            Button button = button(action, false, () -> callback.run(action));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(46), 1);
            if (buttons.getChildCount() > 0) lp.leftMargin = dp(5);
            buttons.addView(button, lp);
        }
        page.addView(buttons, topSpace(9));
    }

    private void updateLiveState(JSONObject state) {
        if (state == null || liveStateView == null) return;
        StringBuilder out = new StringBuilder();
        out.append(state.optString("name", activeTable == null ? "Live game" : activeTable.optString("name"))).append("\n");
        out.append("ROUND ").append(state.optInt("roundNo", state.optInt("handNumber", 0))).append("  ·  ").append(state.optString("phase", "waiting").toUpperCase()).append("\n\n");
        if (activeLiveGame.equals("blackjack")) {
            JSONObject dealer = state.optJSONObject("dealer");
            out.append("DEALER   ").append(cards(dealer == null ? null : dealer.optJSONArray("cards"))).append("  ·  ").append(dealer == null ? "" : dealer.optString("value", "")).append("\n\n");
            JSONArray seats = state.optJSONArray("seats");
            if (seats != null) for (int i = 0; i < seats.length(); i++) {
                JSONObject seat = seats.optJSONObject(i); if (seat == null || seat.optBoolean("empty")) continue;
                out.append(seat.optString("username", "Seat")).append(seat.optBoolean("active") ? "  ·  YOUR TURN" : "").append("\n");
                JSONArray hands = seat.optJSONArray("hands");
                if (hands != null) for (int j = 0; j < hands.length(); j++) { JSONObject hand = hands.optJSONObject(j); out.append("  ").append(cards(hand.optJSONArray("cards"))).append("  ·  ").append(hand.optInt("value")).append("\n"); }
            }
        } else if (activeLiveGame.equals("roulette")) {
            Object pocket = state.opt("result");
            out.append(pocket == null || pocket == JSONObject.NULL ? "Wheel is ready for bets" : "LAST POCKET   " + pocket).append("\n\n");
            out.append("MY BETS   ").append(state.optJSONObject("myBets") == null ? "No bets this round" : state.optJSONObject("myBets").toString());
        } else if (activeLiveGame.equals("baccarat")) {
            JSONObject cards = state.optJSONObject("cards");
            out.append("PLAYER   ").append(cards == null ? "" : cards(cards.optJSONArray("player"))).append("\n");
            out.append("BANKER   ").append(cards == null ? "" : cards(cards.optJSONArray("banker"))).append("\n\n");
            out.append("PLAYER ").append(state.opt("playerTotal") == JSONObject.NULL ? "—" : state.optString("playerTotal"));
            out.append("    BANKER ").append(state.opt("bankerTotal") == JSONObject.NULL ? "—" : state.optString("bankerTotal"));
            out.append("\nMY BETS   ").append(state.optJSONObject("myBets") == null ? "No bets this coup" : state.optJSONObject("myBets").toString());
        } else if (activeLiveGame.equals("crash")) {
            out.append("MULTIPLIER   ").append(String.format("%.2f", state.optDouble("mult", 1))).append("×\n\n");
            out.append("RECENT   ").append(state.optJSONArray("history") == null ? "—" : state.optJSONArray("history").toString());
        } else {
            out.append("POT   ").append(formatNumber(state.optLong("pot"))).append("\n");
            out.append("COMMUNITY   ").append(cards(state.optJSONArray("communityCards"))).append("\n\n");
            JSONArray seats = state.optJSONArray("seats");
            if (seats != null) for (int i = 0; i < seats.length(); i++) {
                JSONObject seat = seats.optJSONObject(i); if (seat == null) continue;
                out.append(seat.optString("username", "Empty seat")).append("  ·  ").append(formatNumber(seat.optLong("chips")));
                if (seat.optBoolean("isTurn")) out.append("  ·  TO ACT");
                out.append("\n");
            }
            out.append("\nYOUR HAND   ").append(cards(state.optJSONArray("myCards")));
        }
        liveStateView.setText(out.toString());
    }

    private String cards(JSONArray cards) {
        if (cards == null || cards.length() == 0) return "—";
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < cards.length(); i++) { if (i > 0) s.append("  "); s.append(cardLabel(cards.optString(i))); }
        return s.toString();
    }

    private void joinPoker(JSONObject format) {
        showLoading("Taking a seat at the poker table");
        api.post("/api/poker/cash/join", json("stakeKey", format.optString("key"), "maxSeats", format.optInt("maxSeats", 9)), (body, error) -> {
            if (error != null || body == null) { showLobby(); toast(error == null ? "Could not join the table" : error); return; }
            JSONObject table = json("id", body.optString("tableId"), "game", "poker", "name", format.optString("name"), "currency", format.optString("currency"), "minBet", format.optLong("min"), "maxBet", format.optLong("max"));
            openPokerTable(table);
        });
    }

    private void joinSng(JSONObject format) {
        showLoading("Registering for the Sit & Go");
        api.post("/api/poker/sng/join", json("currency", format.optString("currency"), "buyin", format.optInt("buyin"), "seats", format.optInt("seats"), "speed", format.optString("speed")), (body, error) -> {
            showLobby();
            if (error != null || body == null) toast(error == null ? "Sit & Go registration failed" : error);
            else toast("Registered for the Six-max Sit & Go");
        });
    }

    private void registerTournament(JSONObject event) {
        api.post("/api/poker/mtt/register", json("gameId", event.optString("id")), (body, error) -> {
            if (error != null || body == null) toast(error == null ? "Tournament registration failed" : error);
            else toast("Tournament registration confirmed");
            showLobby();
        });
    }

    private void unregisterTournament(JSONObject event) {
        api.post("/api/poker/mtt/unregister", json("gameId", event.optString("id")), (body, error) -> {
            if (error != null || body == null) toast(error == null ? "Could not cancel registration" : error);
            else toast("Registration cancelled · entry returned");
            showPokerRoom();
        });
    }

    private void showPokerRoom() {
        showPage("POKER ROOM", "Choose the format, pace, and stakes that suit you.", true);
        LinearLayout currencyRow = row(); currencyRow.setGravity(Gravity.CENTER_VERTICAL);
        currencyRow.addView(text("CURRENCY", 10, MUTED, true), new LinearLayout.LayoutParams(0, -2, 1));
        currencyRow.addView(chip("PLAY", currency.equals("play"), () -> { currency = "play"; showPokerRoom(); }));
        currencyRow.addView(chip("BTC", currency.equals("btc"), () -> { currency = "btc"; showPokerRoom(); }), leftSpace(8, null));
        page.addView(currencyRow, topSpace(6));

        addSectionHeader("CASH TABLES", "Live No-Limit Hold’em · choose any open stake");
        JSONArray cash = pokerLobby.optJSONArray("cash");
        int count = 0;
        if (cash != null) for (int i = 0; i < cash.length(); i++) {
            JSONObject format = cash.optJSONObject(i);
            if (format == null || !currency.equals(format.optString("currency"))) continue;
            JSONArray tableList = format.optJSONArray("tables");
            String live = format.optInt("players") + " seated · " + (tableList == null ? 0 : tableList.length()) + " open tables";
            String detail = formatStake(format.optLong("sb"), currency) + " / " + formatStake(format.optLong("bb"), currency) + " blinds · " + live;
            addNativeGameCard("♠", format.optString("name"), detail, () -> joinPoker(format));
            count++;
        }
        if (count == 0) page.addView(text("No cash formats are available in this currency yet.", 12, MUTED, false), topSpace(10));

        addSectionHeader("SIT & GO", "A compact tournament that starts when the field fills");
        Spinner buyinPicker = spinner(currency.equals("btc") ? new String[]{"$1", "$5", "$10", "$25", "$100"} : new String[]{"1,000 chips", "5,000 chips", "25,000 chips"});
        Spinner seatPicker = spinner(new String[]{"2 players · heads-up", "3 players", "6 players", "8 players", "9 players"});
        Spinner speedPicker = spinner(new String[]{"Regular", "Turbo", "Hyper", "Deepstack"});
        page.addView(label("ENTRY"), topSpace(12)); page.addView(buyinPicker, topSpace(4));
        page.addView(label("TABLE SIZE"), topSpace(11)); page.addView(seatPicker, topSpace(4));
        page.addView(label("BLIND SPEED"), topSpace(11)); page.addView(speedPicker, topSpace(4));
        TextView sngAvailability = text("Find a seat in the selected format.", 11, MUTED, false);
        page.addView(sngAvailability, topSpace(9));
        Runnable updateSngAvailability = () -> {
            int selectedBuyin = currency.equals("btc") ? new int[]{1, 5, 10, 25, 100}[buyinPicker.getSelectedItemPosition()] : new int[]{1000, 5000, 25000}[buyinPicker.getSelectedItemPosition()];
            int selectedSeats = new int[]{2, 3, 6, 8, 9}[seatPicker.getSelectedItemPosition()];
            String selectedSpeed = new String[]{"regular", "turbo", "hyper", "deepstack"}[speedPicker.getSelectedItemPosition()];
            JSONArray sngs = pokerLobby.optJSONArray("sngs"); int open = 0;
            if (sngs != null) for (int i = 0; i < sngs.length(); i++) {
                JSONObject s = sngs.optJSONObject(i);
                if (s != null && currency.equals(s.optString("currency")) && selectedBuyin == s.optInt("buyin") && selectedSeats == s.optInt("seats") && selectedSpeed.equals(s.optString("speed"))) { open = s.optInt("open"); break; }
            }
            sngAvailability.setText(open + " already waiting · your entry is held securely until the event starts");
        };
        android.widget.AdapterView.OnItemSelectedListener sngSelectionListener = new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) { updateSngAvailability.run(); }
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
        };
        buyinPicker.setOnItemSelectedListener(sngSelectionListener); seatPicker.setOnItemSelectedListener(sngSelectionListener); speedPicker.setOnItemSelectedListener(sngSelectionListener);
        page.addView(button("REGISTER FOR SIT & GO", true, () -> {
            int selectedBuyin = currency.equals("btc") ? new int[]{1, 5, 10, 25, 100}[buyinPicker.getSelectedItemPosition()] : new int[]{1000, 5000, 25000}[buyinPicker.getSelectedItemPosition()];
            int selectedSeats = new int[]{2, 3, 6, 8, 9}[seatPicker.getSelectedItemPosition()];
            String selectedSpeed = new String[]{"regular", "turbo", "hyper", "deepstack"}[speedPicker.getSelectedItemPosition()];
            showLoading("Registering for Sit & Go");
            api.post("/api/poker/sng/join", json("currency", currency, "buyin", selectedBuyin, "seats", selectedSeats, "speed", selectedSpeed), (body, error) -> {
                if (error != null || body == null) { showPokerRoom(); toast(error == null ? "Registration failed" : error); }
                else { toast("Registered · " + body.optInt("registered") + " / " + body.optInt("needed") + " players"); showLobby(); }
            });
        }), topSpace(13));

        addSectionHeader("SCHEDULED TOURNAMENTS", "Multi-table events with published start times");
        JSONArray events = pokerLobby.optJSONArray("mtts");
        JSONArray mine = pokerLobby.optJSONArray("mine");
        if (events == null || events.length() == 0) page.addView(text("The next scheduled event will appear here.", 12, MUTED, false), topSpace(8));
        else for (int i = 0; i < events.length(); i++) {
            JSONObject event = events.optJSONObject(i); if (event == null || !currency.equals(event.optString("currency"))) continue;
            boolean registered = false; JSONObject ownGame = null;
            if (mine != null) for (int j = 0; j < mine.length(); j++) {
                JSONObject own = mine.optJSONObject(j);
                if (own != null && own.optString("gameId").equals(event.optString("id"))) { registered = true; ownGame = own; break; }
            }
            final boolean wasRegistered = registered;
            JSONObject ownRef = ownGame;
            String entry = currency.equals("btc") ? "$" + event.optInt("entryUsd") : formatNumber(event.optLong("entryFee")) + " chips";
            String eventDetail = entry + " entry · " + event.optInt("registered") + " entered · " + event.optString("status").toUpperCase();
            if (ownGame != null && ownGame.optString("tableId").length() > 5) {
                addNativeGameCard("🏆", event.optString("name"), eventDetail + " · tap to return", () -> openPokerTable(json("id", ownRef.optString("tableId"), "game", "poker", "gameId", ownRef.optString("gameId"), "name", ownRef.optString("name"), "currency", ownRef.optString("currency"), "tournament", true)));
            } else {
                addNativeGameCard(registered ? "✓" : "🏆", event.optString("name"), eventDetail + (registered ? " · registered" : ""), () -> {
                    if (wasRegistered) unregisterTournament(event); else registerTournament(event);
                });
            }
        }
        JSONArray calendar = pokerLobby.optJSONArray("calendar");
        if (calendar != null && calendar.length() > 0) {
            addSectionHeader("EVENT CALENDAR", "Regular starts are shown in UTC");
            for (int i = 0; i < Math.min(6, calendar.length()); i++) {
                JSONObject event = calendar.optJSONObject(i); if (event == null || !currency.equals(event.optString("currency"))) continue;
                addNativeGameCard("◷", event.optString("name"), event.optString("description") + " · " + String.format("%02d:%02d UTC", event.optInt("hours"), event.optInt("minute")), () -> toast("This event opens at its listed start time."));
            }
        }
        addBottomNav("floor");
    }

    private void openPokerTable(JSONObject table) {
        closeSocket();
        showPage("TEXAS HOLD’EM", "Poker room · " + table.optString("currency").toUpperCase(), true);
        activeTable = table;
        activeLiveGame = "poker";
        activeLiveTableId = table.optString("id");
        pokerSittingOut = false;
        liveConnectionView = text("Connecting to the table…", 12, GOLD, true);
        page.addView(liveConnectionView, topSpace(10));
        liveStateView = text("Waiting for the next hand", 16, WHITE, true);
        liveStateView.setBackground(rounded(PANEL, 18)); liveStateView.setPadding(dp(16), dp(20), dp(16), dp(20));
        page.addView(liveStateView, topSpace(10));
        EditText raiseAmount = input("Raise to amount", false); raiseAmount.setInputType(InputType.TYPE_CLASS_NUMBER); raiseAmount.setText("100");
        page.addView(raiseAmount, topSpace(12));
        addActionRow(new String[]{"FOLD", "CHECK", "CALL"}, action -> emitPokerAction(table, action.toLowerCase(), 0));
        page.addView(button("RAISE TO AMOUNT", true, () -> emitPokerAction(table, "raise", number(raiseAmount, 100))), topSpace(8));
        page.addView(button("USE TIME BANK", false, () -> { if (gameSocket != null) gameSocket.emit("casinoTimebank", json("tableId", activeLiveTableId)); }), topSpace(8));
        Button[] sitButton = {null};
        sitButton[0] = button("SIT OUT", false, () -> {
            pokerSittingOut = !pokerSittingOut;
            if (gameSocket != null) gameSocket.emit("sitToggle", json("tableId", activeLiveTableId, "sitOut", pokerSittingOut));
            sitButton[0].setText(pokerSittingOut ? "RETURN TO TABLE" : "SIT OUT");
        });
        page.addView(sitButton[0], topSpace(8));
        if (table.optBoolean("tournament")) page.addView(button("BACK TO FLOOR", false, this::showLobby), topSpace(8));
        else {
            page.addView(button("REBUY CHIPS", false, () -> api.post("/api/poker/cash/rebuy", json("tableId", table.optString("id")), (body, error) -> {
                if (error != null || body == null) toast(error == null ? "Rebuy could not be completed" : error);
                else { toast("Chips added to your stack"); refreshUser(null); }
            })), topSpace(8));
            page.addView(button("LEAVE TABLE & CASH OUT", false, () -> leavePoker(table)), topSpace(8));
        }
        page.addView(button("HAND HISTORY", false, () -> showPokerHistory(table)), topSpace(8));
        page.addView(text("TABLE CHAT", 10, GOLD, true), topSpace(14));
        LinearLayout chatLines = new LinearLayout(activity); chatLines.setOrientation(LinearLayout.VERTICAL); page.addView(chatLines, topSpace(4));
        EditText chatInput = input("Message · 200 characters", false); chatInput.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(200)});
        LinearLayout chatRow = row(); chatRow.addView(chatInput, new LinearLayout.LayoutParams(0, dp(46), 1));
        chatRow.addView(button("SEND", true, () -> { String message = chatInput.getText().toString().trim(); if (!message.isEmpty() && gameSocket != null) { gameSocket.emit("tableChat", json("tableId", table.optString("id"), "message", message)); chatInput.setText(""); } }), leftSpace(7, new LinearLayout.LayoutParams(dp(78), dp(46))));
        page.addView(chatRow, topSpace(5));
        addBottomNav("floor");
        final String tableId = activeLiveTableId;
        gameSocket = new NativeGameSocket(api.token(), (event, payload) -> activity.runOnUiThread(() -> {
            if (!tableId.equals(activeLiveTableId)) return;
            if (event.equals("connect")) {
                liveConnectionView.setText("● Connected · poker action feed is live"); liveConnectionView.setTextColor(GREEN);
                gameSocket.emit("joinTable", json("tableId", tableId));
            } else if (event.equals("disconnect") || event.equals("connect_error")) {
                liveConnectionView.setText("Reconnecting to poker table…"); liveConnectionView.setTextColor(RED);
            } else if (event.equals("tableInit")) updateLiveState(payload.optJSONObject("state"));
            else if (event.equals("gameState")) updateLiveState(payload);
            else if (event.equals("tableSeats")) updateLiveState(payload);
            else if (event.equals("tableChat")) addChatLine(chatLines, payload.optString("username", "Player"), payload.optString("message", ""));
            else if (event.equals("myCards")) {
                String cards = cards(payload.optJSONArray("cards"));
                if (liveStateView != null) liveStateView.append("\n\nYOUR PRIVATE CARDS   " + cards);
            } else if (event.equals("actionError") || event.equals("casinoError")) toast(payload.optString("message", "Action could not be completed"));
        }));
    }

    private void showPokerHistory(JSONObject table) {
        showPage("HAND HISTORY", "Recent hands from " + table.optString("name", "your poker table"), true);
        String gameId = table.optString("gameId", "");
        if (gameId.isEmpty()) { page.addView(text("Hand history is not available for this table.", 12, MUTED, false), topSpace(10)); addBottomNav("floor"); return; }
        page.addView(text("Loading the recent hands…", 12, MUTED, false), topSpace(10));
        LinearLayout historyPage = page;
        api.get("/api/poker/game/" + Uri.encode(gameId) + "/hands", (body, error) -> {
            if (historyPage != page) return;
            while (page.getChildCount() > 1) page.removeViewAt(page.getChildCount() - 1);
            JSONArray hands = body == null ? null : body.optJSONArray("hands");
            if (hands == null || hands.length() == 0) { page.addView(text(error == null ? "No completed hands are recorded yet." : error, 12, MUTED, false), topSpace(10)); return; }
            for (int i = hands.length() - 1; i >= 0; i--) {
                JSONObject hand = hands.optJSONObject(i); if (hand == null) continue;
                LinearLayout item = cardColumn(); item.setPadding(dp(13), dp(11), dp(13), dp(11));
                item.addView(text("HAND " + hand.optInt("hand_number") + "   ·   POT " + formatNumber(hand.optDouble("pot")), 12, GOLD_BRIGHT, true));
                item.addView(text("BOARD   " + cards(hand.optJSONArray("community_cards")), 12, WHITE, false), topSpace(6));
                page.addView(item, topSpace(7));
            }
        });
        addBottomNav("floor");
    }

    private void emitPokerAction(JSONObject table, String action, long amount) {
        if (gameSocket == null) return;
        JSONObject event = json("tableId", table.optString("id"), "action", action);
        if (amount > 0) try { event.put("amount", amount); } catch (JSONException ignored) {}
        gameSocket.emit("casinoAction", event);
    }

    private void leavePoker(JSONObject table) {
        showLoading("Leaving the table");
        api.post("/api/poker/cash/leave", json("tableId", table.optString("id")), (body, error) -> {
            closeSocket(); refreshUser(null); showLobby(); if (error != null) toast(error);
        });
    }

    private void refreshUser(Runnable done) {
        api.get("/api/auth/me", (body, error) -> {
            if (body != null && body.optJSONObject("user") != null) user = body.optJSONObject("user");
            if (done != null) done.run();
        });
    }

    private void showPage(String title, String subtitle, boolean back) {
        closeSocket(); transientInputs.clear();
        clubOnlineView = null;
        currentTitle = title;
        root.removeAllViews();
        ScrollView scroll = new ScrollView(activity);
        scroll.setFillViewport(false);
        page = new LinearLayout(activity);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(18), dp(13), dp(18), dp(24));
        scroll.addView(page);
        LinearLayout heading = row(); heading.setGravity(Gravity.CENTER_VERTICAL);
        if (back) {
            TextView backButton = text("‹", 32, GOLD_BRIGHT, true); backButton.setGravity(Gravity.CENTER);
            heading.addView(backButton, new LinearLayout.LayoutParams(dp(40), dp(42)));
            backButton.setOnClickListener(v -> goBack());
        }
        LinearLayout titles = new LinearLayout(activity); titles.setOrientation(LinearLayout.VERTICAL);
        titles.addView(text(title, 17, WHITE, true)); titles.addView(text(subtitle, 11, MUTED, false), topSpace(3));
        heading.addView(titles, new LinearLayout.LayoutParams(0, -2, 1));
        TextView insignia = text("₿", 21, GOLD, true); insignia.setGravity(Gravity.CENTER);
        heading.addView(insignia, new LinearLayout.LayoutParams(dp(38), dp(38)));
        page.addView(heading, bottomSpace(12));
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
    }

    private void showMyBets() {
        showPage("MY BETS", "A private record of your settled casino rounds.", false);
        LinearLayout betsPage = page;
        page.addView(text("Loading your recent rounds…", 13, MUTED, false), topSpace(12));
        api.get("/api/house/mybets", (body, error) -> {
            if (betsPage != page) return;
            if (error != null || body == null) { toast(error == null ? "Bet history could not load" : error); cachedBets = new JSONArray(); }
            else cachedBets = body.optJSONArray("bets") == null ? new JSONArray() : body.optJSONArray("bets");
            renderMyBets();
        });
        addBottomNav("bets");
    }

    private void renderMyBets() {
        if (page == null) return;
        while (page.getChildCount() > 1) page.removeViewAt(page.getChildCount() - 1);
        ArrayList<String> filters = new ArrayList<>(); filters.add("all");
        for (int i = 0; i < cachedBets.length(); i++) {
            JSONObject bet = cachedBets.optJSONObject(i); if (bet == null) continue;
            String game = bet.optString("game", "Other"); if (!filters.contains(game)) filters.add(game);
        }
        HorizontalScrollView scroller = new HorizontalScrollView(activity); scroller.setHorizontalScrollBarEnabled(false);
        LinearLayout chips = row(); chips.setPadding(0, dp(4), 0, dp(5));
        for (String filter : filters) {
            String title = filter.equals("all") ? "ALL" : filter.toUpperCase();
            chips.addView(chip(title, betFilter.equals(filter), () -> { betFilter = filter; renderMyBets(); }), leftSpace(chips.getChildCount() == 0 ? 0 : 7, null));
        }
        scroller.addView(chips); page.addView(scroller, topSpace(8));
        int visible = 0;
        for (int i = 0; i < cachedBets.length(); i++) {
            JSONObject bet = cachedBets.optJSONObject(i); if (bet == null) continue;
            if (!betFilter.equals("all") && !betFilter.equals(bet.optString("game"))) continue;
            LinearLayout item = cardColumn(); item.setPadding(dp(14), dp(12), dp(14), dp(12));
            LinearLayout head = row(); head.setGravity(Gravity.CENTER_VERTICAL);
            head.addView(text(bet.optString("game", "Casino round"), 14, WHITE, true), new LinearLayout.LayoutParams(0, -2, 1));
            double net = bet.optDouble("net"); head.addView(text((net >= 0 ? "+" : "") + formatStake(net, bet.optString("currency")), 12, net >= 0 ? GREEN : RED, true));
            item.addView(head);
            item.addView(text(formatStake(bet.optDouble("bet"), bet.optString("currency")) + " wagered   ·   " + formatStake(bet.optDouble("payout"), bet.optString("currency")) + " returned", 11, MUTED, false), topSpace(5));
            item.addView(text(bet.optString("at", "Settled") + "   ·   round " + shortId(bet.optString("id")), 9, MUTED, false), topSpace(5));
            if (isVerifiableGame(bet.optString("game"))) {
                TextView verify = text("VERIFY THIS ROUND  ›", 10, GOLD_BRIGHT, true); verify.setGravity(Gravity.RIGHT);
                item.addView(verify, topSpace(7)); item.setOnClickListener(v -> showFair(bet.optString("id")));
            }
            page.addView(item, topSpace(8)); visible++;
        }
        if (visible == 0) page.addView(text(cachedBets.length() == 0 ? "No settled bets yet. Choose a game on the floor to begin." : "No rounds match this filter.", 13, MUTED, false), topSpace(16));
        page.addView(button("OPEN FAIR PLAY VERIFIER", false, () -> showFair(null)), topSpace(14));
    }

    private boolean isVerifiableGame(String name) {
        String lower = name.toLowerCase(java.util.Locale.ROOT);
        return lower.contains("slot") || lower.contains("dice") || lower.contains("plinko");
    }

    private String shortId(String value) { return value == null || value.length() < 12 ? String.valueOf(value) : value.substring(0, 8) + "…" + value.substring(value.length() - 4); }

    private void showFair(String roundId) {
        showPage("PROVABLY FAIR", "Verify results with your published seeds.", true);
        LinearLayout fairPage = page;
        page.addView(text("Instant game outcomes are derived from a committed server seed, your client seed, and a nonce. Rotate the seed to reveal the old server seed, then replay eligible rounds here.", 12, MUTED, false), topSpace(8));
        LinearLayout seeds = cardColumn(); seeds.setPadding(dp(15), dp(15), dp(15), dp(15));
        seeds.addView(text("ACTIVE SEED PAIR", 11, GOLD_BRIGHT, true));
        TextView hash = text("Loading commitment…", 10, WHITE, false); hash.setTextIsSelectable(true); seeds.addView(hash, topSpace(9));
        TextView client = text("Client seed: —", 11, MUTED, false); client.setTextIsSelectable(true); seeds.addView(client, topSpace(5));
        TextView nonce = text("Bets placed: —", 11, MUTED, false); seeds.addView(nonce, topSpace(5));
        EditText newSeed = input("Optional next client seed · max 64 characters", false);
        newSeed.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(64)});
        seeds.addView(newSeed, topSpace(12));
        TextView revealed = text("", 10, GREEN, false); revealed.setTextIsSelectable(true); seeds.addView(revealed, topSpace(9));
        seeds.addView(button("ROTATE SEEDS & REVEAL OLD SEED", true, () -> {
            String chosen = newSeed.getText().toString().trim(); JSONObject payload = chosen.isEmpty() ? new JSONObject() : json("clientSeed", chosen);
            api.post("/api/house/fair/rotate", payload, (body, error) -> {
                if (error != null || body == null) { toast(error == null ? "Seed rotation failed" : error); return; }
                JSONObject old = body.optJSONObject("revealed");
                if (old != null) revealed.setText("REVEALED SERVER SEED\n" + old.optString("serverSeed") + "\n\nCOMMITTED HASH\n" + old.optString("serverSeedHash") + "\n\nCompare this hash with the commitment you recorded before the bet.");
                newSeed.setText("");
                JSONObject next = body.optJSONObject("next");
                if (next != null) { hash.setText("SERVER SEED HASH\n" + next.optString("serverSeedHash")); client.setText("Client seed: " + next.optString("clientSeed")); nonce.setText("Bets placed: 0"); }
            });
        }), topSpace(13));
        page.addView(seeds, topSpace(14));

        LinearLayout verify = cardColumn(); verify.setPadding(dp(15), dp(15), dp(15), dp(15));
        verify.addView(text("VERIFY A SETTLED BET", 11, GOLD_BRIGHT, true));
        verify.addView(text("Paste a round ID from My Bets. Slots, dice, and Plinko rounds can be replayed.", 11, MUTED, false), topSpace(5));
        EditText id = input("Round ID", false); if (roundId != null) id.setText(roundId); verify.addView(id, topSpace(11));
        TextView result = text("", 11, WHITE, false); result.setTextIsSelectable(true); verify.addView(result, topSpace(10));
        verify.addView(button("VERIFY RESULT", true, () -> {
            String value = id.getText().toString().trim(); if (value.isEmpty()) { toast("Enter a round ID"); return; }
            result.setText("Replaying the committed result…");
            api.get("/api/house/fair/verify/" + Uri.encode(value), (body, error) -> {
                if (error != null || body == null) { result.setText(""); toast(error == null ? "Round could not be verified" : error); return; }
                String status = body.optBoolean("verifiable") ? (body.optBoolean("matches") ? "VERIFIED · outcome matches the committed seeds" : "MISMATCH · the derived outcome differs") : "SEED NOT REVEALED · rotate the active pair first";
                result.setText(status + "\n\nClient seed: " + body.optString("clientSeed") + "\nNonce: " + body.optString("nonce") + "\nServer seed: " + (body.has("serverSeed") ? body.optString("serverSeed") : "not revealed") + "\n\nDerived outcome: " + (body.optJSONObject("derived") == null ? "—" : body.optJSONObject("derived").toString()) + "\n\n" + body.optString("note"));
                result.setTextColor(body.optBoolean("matches") ? GREEN : GOLD_BRIGHT);
            });
        }), topSpace(12));
        page.addView(verify, topSpace(15));
        api.get("/api/house/fair/current", (body, error) -> {
            if (body == null || fairPage != page) return;
            hash.setText("SERVER SEED HASH\n" + body.optString("serverSeedHash"));
            client.setText("Client seed: " + body.optString("clientSeed")); nonce.setText("Bets placed: " + body.optLong("nonce"));
        });
        addBottomNav("bets");
    }

    private void showLeaderboard() {
        showPage("LEADERBOARD", "The players making their mark on the floor.", true);
        LinearLayout listPage = page;
        page.addView(text("Loading standings…", 12, MUTED, false), topSpace(10));
        api.get("/api/stats/leaderboard", (body, error) -> {
            if (listPage != page) return;
            while (page.getChildCount() > 1) page.removeViewAt(page.getChildCount() - 1);
            JSONArray rows = body == null ? null : body.optJSONArray("leaderboard");
            if (rows == null || rows.length() == 0) { page.addView(text("No completed matches yet. Be the first name on the board.", 13, MUTED, false), topSpace(14)); return; }
            for (int i = 0; i < rows.length(); i++) {
                JSONObject player = rows.optJSONObject(i); if (player == null) continue;
                LinearLayout card = row(); card.setGravity(Gravity.CENTER_VERTICAL); card.setBackground(rounded(PANEL, 15)); card.setPadding(dp(13), dp(12), dp(13), dp(12));
                int rank = player.optInt("rank", i + 1); int medal = rank == 1 ? GOLD_BRIGHT : rank == 2 ? Color.LTGRAY : rank == 3 ? Color.rgb(205, 127, 50) : MUTED;
                TextView place = text(rank <= 3 ? new String[]{"♛", "✦", "✧"}[Math.max(0, rank - 1)] : "#" + rank, 17, medal, true); place.setGravity(Gravity.CENTER);
                card.addView(place, new LinearLayout.LayoutParams(dp(38), dp(38)));
                LinearLayout summary = new LinearLayout(activity); summary.setOrientation(LinearLayout.VERTICAL);
                String username = player.optString("username", "Player"); summary.addView(text(username, 14, WHITE, true));
                summary.addView(text(player.optInt("wins") + " wins · " + player.optString("winRate", "0") + "% win rate", 10, MUTED, false), topSpace(3));
                card.addView(summary, leftSpace(8, new LinearLayout.LayoutParams(0, -2, 1)));
                card.addView(text((player.optDouble("profit") >= 0 ? "+" : "") + String.format("%.6f BTC", player.optDouble("profit")), 10, player.optDouble("profit") >= 0 ? GREEN : RED, true));
                card.setOnClickListener(v -> showProfile(username));
                page.addView(card, topSpace(7));
            }
        });
        addBottomNav("club");
    }

    private void showProfile(String username) {
        String target = username == null || username.isEmpty() ? (user == null ? "" : user.optString("username")) : username;
        if (target.isEmpty()) { showAuth(false); return; }
        showPage("PLAYER PROFILE", "A record of games and time at the tables.", true);
        LinearLayout profilePage = page;
        String path = target.equals(user == null ? "" : user.optString("username")) ? "/api/stats/me" : "/api/stats/profile/" + Uri.encode(target);
        page.addView(text("Loading player record…", 12, MUTED, false), topSpace(10));
        api.get(path, (body, error) -> {
            if (profilePage != page) return;
            while (page.getChildCount() > 1) page.removeViewAt(page.getChildCount() - 1);
            JSONObject stats = body == null ? null : body.optJSONObject("profile");
            if (error != null || stats == null) { page.addView(text(error == null ? "This player could not be found." : error, 13, MUTED, false), topSpace(14)); return; }
            String name = stats.optString("username", target);
            LinearLayout identity = cardColumn(); identity.setPadding(dp(17), dp(17), dp(17), dp(17));
            identity.addView(text("♛   " + name, 22, WHITE, true));
            identity.addView(text("MEMBER SINCE  " + stats.optString("memberSince", "—"), 10, GOLD, true), topSpace(5));
            page.addView(identity, topSpace(9));
            LinearLayout grid = new LinearLayout(activity); grid.setOrientation(LinearLayout.VERTICAL);
            grid.addView(statLine("Win rate", stats.optString("winRate", "0.0") + "%", stats.optInt("wins") + " wins · " + stats.optInt("losses") + " losses"));
            grid.addView(statLine("Matches", String.valueOf(stats.optInt("games")), stats.optInt("handsPlayed") + " hands played"), topSpace(7));
            grid.addView(statLine("Profit", String.format("%.8f BTC", stats.optDouble("profit")), stats.has("profitUsd") && !stats.isNull("profitUsd") ? "$" + stats.optString("profitUsd") + " USD" : "Lifetime net"), topSpace(7));
            grid.addView(statLine("Biggest pot", formatNumber(stats.optDouble("biggestPot")), "Play chips"), topSpace(7));
            page.addView(grid, topSpace(12));
            if (name.equals(user == null ? "" : user.optString("username"))) {
                page.addView(button("EDIT APP SETTINGS", false, this::showSettings), topSpace(12));
            } else {
                page.addView(button("ADD " + name.toUpperCase() + " AS A FRIEND", true, () -> {
                    api.post("/api/social/friends/" + Uri.encode(name), new JSONObject(), (result, addError) -> toast(addError == null ? "Friend request sent" : addError));
                }), topSpace(12));
            }
            JSONArray recent = body.optJSONArray("recentGames");
            addSectionHeader("RECENT MATCHES", "Your latest completed heads-up games");
            if (recent == null || recent.length() == 0) page.addView(text("No completed matches yet.", 11, MUTED, false), topSpace(7));
            else for (int i = 0; i < recent.length(); i++) {
                JSONObject match = recent.optJSONObject(i); if (match == null) continue;
                String result = match.optBoolean("won") ? "VICTORY" : "DEFEAT";
                addNativeGameCard(match.optBoolean("won") ? "♛" : "♢", result + " · " + match.optString("opponent", "Opponent"), match.optString("ended_at", "Completed"), () -> {});
            }
        });
        addBottomNav("account");
    }

    private LinearLayout statLine(String title, String value, String detail) {
        LinearLayout card = cardColumn(); card.setPadding(dp(13), dp(11), dp(13), dp(11));
        LinearLayout row = row(); row.addView(text(title, 11, MUTED, true), new LinearLayout.LayoutParams(0, -2, 1)); row.addView(text(value, 15, GOLD_BRIGHT, true)); card.addView(row);
        card.addView(text(detail, 10, MUTED, false), topSpace(4)); return card;
    }

    private void showFriends() {
        showPage("FRIENDS & CLUB", "Find your people and join the conversation.", false);
        LinearLayout friendsPage = page;
        EditText nameInput = input("Player username", false);
        LinearLayout add = row(); add.addView(nameInput, new LinearLayout.LayoutParams(0, dp(48), 1));
        add.addView(button("ADD", true, () -> {
            String name = nameInput.getText().toString().trim(); if (name.isEmpty()) { toast("Enter a username"); return; }
            api.post("/api/social/friends/" + Uri.encode(name), new JSONObject(), (body, error) -> {
                if (error != null) toast(error); else { toast("Friend request sent"); nameInput.setText(""); showFriends(); }
            });
        }), leftSpace(8, new LinearLayout.LayoutParams(dp(75), dp(48))));
        page.addView(add, topSpace(10));
        page.addView(button("LEADERBOARD", false, this::showLeaderboard), topSpace(12));
        page.addView(button("LOBBY CHAT", false, this::showLobbyChat), topSpace(8));
        TextView live = text("Checking who is online…", 11, MUTED, false); page.addView(live, topSpace(12));
        clubOnlineView = live;
        page.addView(text("FRIENDS", 11, GOLD, true), topSpace(14));
        JSONArray[] friendRows = {new JSONArray()}, requestRows = {new JSONArray()}, sentRows = {new JSONArray()};
        LinearLayout rows = new LinearLayout(activity); rows.setOrientation(LinearLayout.VERTICAL); page.addView(rows, topSpace(7));
        Runnable refresh = () -> {
            if (friendsPage != page) return;
            rows.removeAllViews();
            renderFriendGroup(rows, "REQUESTS FOR YOU", requestRows[0], "ACCEPT", (name) -> api.put("/api/social/friends/" + Uri.encode(name) + "/accept", new JSONObject(), (body, error) -> { if (error != null) toast(error); showFriends(); }));
            renderFriendGroup(rows, "YOUR FRIENDS", friendRows[0], "CHALLENGE", (name) -> challengeFriend(name));
            renderFriendGroup(rows, "REQUESTS SENT", sentRows[0], "PENDING", null);
            if (requestRows[0].length() + friendRows[0].length() + sentRows[0].length() == 0) rows.addView(text("Your friend list is quiet. Add a username to send an invite.", 12, MUTED, false), topSpace(8));
        };
        api.get("/api/social/friends", (body, error) -> {
            if (body != null) { friendRows[0] = safeArray(body, "friends"); requestRows[0] = safeArray(body, "requests"); sentRows[0] = safeArray(body, "sent"); refresh.run(); }
            else live.setText(error == null ? "Friend list unavailable" : error);
        });
        api.get("/api/online", (body, error) -> {
            onlinePlayers.clear(); JSONArray names = body == null ? null : body.optJSONArray("players");
            if (names != null) for (int i = 0; i < names.length(); i++) { Object entry = names.opt(i); onlinePlayers.add(entry instanceof JSONObject ? ((JSONObject) entry).optString("username") : String.valueOf(entry)); }
            live.setText(onlinePlayers.size() + " players online now · green dot marks a live friend");
        });
        ensurePresenceSocket();
        addBottomNav("club");
    }

    private JSONArray safeArray(JSONObject object, String key) { JSONArray value = object.optJSONArray(key); return value == null ? new JSONArray() : value; }

    private interface NameAction { void run(String username); }

    private void renderFriendGroup(LinearLayout parent, String title, JSONArray members, String action, NameAction onAction) {
        if (members == null || members.length() == 0) return;
        parent.addView(text(title, 10, GOLD_BRIGHT, true), topSpace(12));
        for (int i = 0; i < members.length(); i++) {
            JSONObject friend = members.optJSONObject(i); if (friend == null) continue;
            String username = friend.optString("username", "Player");
            LinearLayout card = row(); card.setGravity(Gravity.CENTER_VERTICAL); card.setPadding(dp(11), dp(9), dp(9), dp(9)); card.setBackground(rounded(PANEL, 13));
            String presence = onlinePlayers.contains(username) ? "●" : friend.optString("avatar", "🃏");
            card.addView(text(presence, 18, onlinePlayers.contains(username) ? GREEN : GOLD_BRIGHT, true), new LinearLayout.LayoutParams(dp(34), dp(34)));
            TextView name = text(username, 13, WHITE, true); card.addView(name, new LinearLayout.LayoutParams(0, -2, 1)); name.setOnClickListener(v -> showProfile(username));
            if (action.equals("ACCEPT")) {
                card.addView(button("ACCEPT", true, () -> onAction.run(username)));
                card.addView(button("DECLINE", false, () -> removeFriend(username)), leftSpace(5, null));
            } else if (action.equals("CHALLENGE")) {
                card.addView(button("CHALLENGE", true, () -> onAction.run(username)));
                card.addView(button("REMOVE", false, () -> removeFriend(username)), leftSpace(5, null));
            } else if (action.equals("PENDING")) {
                card.addView(button("CANCEL", false, () -> removeFriend(username)));
            }
            parent.addView(card, topSpace(6));
        }
    }

    private void removeFriend(String username) {
        api.delete("/api/social/friends/" + Uri.encode(username), (body, error) -> {
            if (error != null) toast(error); else toast("Friend link removed");
            showFriends();
        });
    }

    private void challengeFriend(String username) {
        api.post("/api/social/friends/" + Uri.encode(username) + "/challenge", new JSONObject(), (body, error) -> {
            if (error != null || body == null) { toast(error == null ? "Challenge could not be created" : error); return; }
            String tournamentId = body.optString("tournamentId", "");
            openLegacyPokerTournament(tournamentId);
        });
    }

    private void openLegacyPokerTournament(String tournamentId) {
        if (tournamentId == null || tournamentId.isEmpty() || tournamentId.equals("null")) { showLobby(); toast("Poker table was not found"); return; }
        closeSocket();
        JSONObject table = json("id", tournamentId, "game", "legacy-poker", "name", "Heads-up Hold’em", "currency", "play", "tournament", true);
        showPage("HEADS-UP HOLD’EM", "One opponent · no-limit Texas Hold’em · play chips", true);
        activeTable = table; activeLiveGame = "legacy-poker"; activeLiveTableId = tournamentId;
        liveConnectionView = text("Connecting to your opponent…", 11, GOLD, true); page.addView(liveConnectionView, topSpace(8));
        liveStateView = text("Joining your table…", 14, WHITE, true); liveStateView.setBackground(rounded(PANEL, 17)); liveStateView.setPadding(dp(15), dp(16), dp(15), dp(16)); page.addView(liveStateView, topSpace(9));
        TextView privateCards = text("YOUR CARDS   —", 15, GOLD_BRIGHT, true); page.addView(privateCards, topSpace(12));
        EditText raise = input("Raise amount · chips", false); raise.setInputType(InputType.TYPE_CLASS_NUMBER); raise.setText("200"); page.addView(raise, topSpace(11));
        addActionRow(new String[]{"FOLD", "CHECK", "CALL"}, action -> emitLegacyAction(tournamentId, action.toLowerCase(java.util.Locale.ROOT), 0));
        page.addView(button("RAISE TO AMOUNT", true, () -> emitLegacyAction(tournamentId, "raise", number(raise, 200))), topSpace(8));
        LinearLayout controls = row();
        controls.addView(button("SIT OUT", false, () -> { if (gameSocket != null) gameSocket.emit("sitOut", json("tournamentId", tournamentId, "sitOut", true)); }), new LinearLayout.LayoutParams(0, dp(46), 1));
        controls.addView(button("USE TIME BANK", false, () -> { if (gameSocket != null) gameSocket.emit("useTimebank", json("tournamentId", tournamentId)); }), leftSpace(8, new LinearLayout.LayoutParams(0, dp(46), 1)));
        page.addView(controls, topSpace(8));
        page.addView(text("TABLE CHAT", 10, GOLD, true), topSpace(16));
        LinearLayout chatLines = new LinearLayout(activity); chatLines.setOrientation(LinearLayout.VERTICAL); page.addView(chatLines, topSpace(5));
        EditText chatInput = input("Send a short message", false); chatInput.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(200)});
        LinearLayout chatRow = row(); chatRow.addView(chatInput, new LinearLayout.LayoutParams(0, dp(46), 1));
        chatRow.addView(button("SEND", true, () -> { String message = chatInput.getText().toString().trim(); if (!message.isEmpty() && gameSocket != null) { gameSocket.emit("chatMessage", json("tournamentId", tournamentId, "message", message)); chatInput.setText(""); } }), leftSpace(7, new LinearLayout.LayoutParams(dp(78), dp(46))));
        page.addView(chatRow, topSpace(6)); addBottomNav("floor");
        final String tableId = tournamentId;
        gameSocket = new NativeGameSocket(api.token(), (event, payload) -> activity.runOnUiThread(() -> {
            if (!tableId.equals(activeLiveTableId)) return;
            if (event.equals("connect")) { liveConnectionView.setText("● Connected · game updates are live"); liveConnectionView.setTextColor(GREEN); gameSocket.emit("joinTournament", json("tournamentId", tableId)); }
            else if (event.equals("disconnect") || event.equals("connect_error")) { liveConnectionView.setText("Reconnecting to the table…"); liveConnectionView.setTextColor(RED); }
            else if (event.equals("tournamentInfo")) {
                legacyPlayerPos = payload.optInt("myPos", 0);
                String p1 = payload.optString("player1", "Waiting for a player"); String p2 = payload.optString("player2", "Waiting for a player");
                liveStateView.setText(p1 + "   vs   " + p2 + "\n\n" + payload.optString("status", "waiting").toUpperCase() + " · prize " + formatNumber(payload.optDouble("prizePool")) + " play chips\nYour seat: " + (legacyPlayerPos == 1 ? "Player 1" : legacyPlayerPos == 2 ? "Player 2" : "Spectator"));
                if (payload.optString("status").equals("active") && legacyPlayerPos > 0) gameSocket.emit("startGame", json("tournamentId", tableId));
            } else if (event.equals("gameState")) updateLegacyPokerState(payload, privateCards);
            else if (event.equals("handResult")) {
                String result = payload.optInt("winner") == 0 ? "SPLIT POT" : payload.optInt("winner") == legacyPlayerPos ? "YOU WON THIS HAND" : "OPPONENT WON THIS HAND";
                if (liveStateView != null) liveStateView.append("\n\n" + result + " · pot " + formatNumber(payload.optDouble("pot")));
            } else if (event.equals("tournamentEnd")) {
                liveStateView.setText("MATCH COMPLETE\n\n" + payload.optString("winnerName", "Player") + " takes the table.");
                page.addView(button("RETURN TO CASINO FLOOR", true, this::showLobby), topSpace(12));
            } else if (event.equals("buttonDraw")) {
                liveStateView.setText("HIGH CARD DRAW\n\nPlayer 1 " + cardLabel(payload.optString("p1Card")) + "   ·   Player 2 " + cardLabel(payload.optString("p2Card")) + "\n\nButton goes to player " + payload.optInt("winner"));
            } else if (event.equals("chatMessage")) addChatLine(chatLines, payload.optString("username", "Player"), payload.optString("message", ""));
            else if (event.equals("playerJoined")) toast(payload.optString("username", "Your opponent") + " joined your table");
            else if (event.equals("playerDisconnected")) toast(payload.optString("username", "Your opponent") + " disconnected");
            else if (event.equals("actionError") || event.equals("error")) toast(payload.optString("message", "The action could not be completed"));
        }));
    }

    private void emitLegacyAction(String tournamentId, String action, long amount) {
        if (gameSocket == null) return;
        JSONObject payload = json("tournamentId", tournamentId, "action", action);
        if (amount > 0) try { payload.put("amount", amount); } catch (JSONException ignored) {}
        gameSocket.emit("action", payload);
    }

    private void updateLegacyPokerState(JSONObject state, TextView privateCards) {
        if (liveStateView == null) return;
        int pos = state.optInt("myPos", 0);
        double myBet = pos == 1 ? state.optDouble("p1Bet") : state.optDouble("p2Bet");
        StringBuilder out = new StringBuilder();
        out.append("HAND ").append(state.optInt("handNumber")).append("  ·  ").append(state.optString("phase", "waiting").toUpperCase()).append("\n");
        out.append("BLINDS  ").append(formatNumber(state.optDouble("smallBlind"))).append(" / ").append(formatNumber(state.optDouble("bigBlind"))).append("\n\n");
        out.append("POT  ").append(formatNumber(state.optDouble("pot"))).append("   ·   TO CALL  ").append(formatNumber(Math.max(0, state.optDouble("currentBet") - myBet))).append("\n\n");
        out.append("YOU  ").append(formatNumber(pos == 1 ? state.optDouble("p1Chips") : pos == 2 ? state.optDouble("p2Chips") : 0)).append(" chips").append(state.optInt("actionOn") == pos ? "  ·  YOUR TURN" : "").append("\n");
        out.append("OPPONENT  ").append(formatNumber(pos == 1 ? state.optDouble("p2Chips") : state.optDouble("p1Chips"))).append(" chips\n\n");
        out.append("BOARD  ").append(cards(state.optJSONArray("communityCards")));
        liveStateView.setText(out.toString());
        privateCards.setText("YOUR CARDS   " + cards(state.optJSONArray("myCards")));
    }

    private void showLobbyChat() {
        showPage("LOBBY CHAT", "Talk with players across the casino floor.", true);
        LinearLayout chatPage = page;
        TextView connection = text("Connecting to live chat…", 10, GOLD, true); page.addView(connection, topSpace(6));
        LinearLayout messages = new LinearLayout(activity); messages.setOrientation(LinearLayout.VERTICAL);
        LinearLayout history = cardColumn(); history.setPadding(dp(12), dp(10), dp(12), dp(10)); history.addView(messages);
        page.addView(history, topSpace(10));
        EditText message = input("Message · 200 characters", false); message.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(200)});
        LinearLayout sendRow = row(); sendRow.addView(message, new LinearLayout.LayoutParams(0, dp(48), 1));
        sendRow.addView(button("SEND", true, () -> {
            String value = message.getText().toString().trim(); if (value.isEmpty()) return;
            if (gameSocket == null || !gameSocket.connected()) { toast("Chat is reconnecting. Try again shortly."); return; }
            gameSocket.emit("lobbyChatMessage", json("message", value)); message.setText("");
        }), leftSpace(8, new LinearLayout.LayoutParams(dp(82), dp(48))));
        page.addView(sendRow, topSpace(10));
        api.get("/api/social/lobby-chat", (body, error) -> {
            if (chatPage != page || body == null) return;
            JSONArray historyRows = body.optJSONArray("messages");
            if (historyRows != null) for (int i = 0; i < historyRows.length(); i++) {
                JSONObject item = historyRows.optJSONObject(i); if (item != null) addChatLine(messages, item.optString("username"), item.optString("message"));
            }
        });
        gameSocket = new NativeGameSocket(api.token(), (event, payload) -> activity.runOnUiThread(() -> {
            if (chatPage != page) return;
            if (event.equals("connect")) { connection.setText("● Connected · messages appear live"); connection.setTextColor(GREEN); }
            else if (event.equals("disconnect") || event.equals("connect_error")) { connection.setText("Reconnecting to the chat…"); connection.setTextColor(RED); }
            else if (event.equals("lobbyChatMessage")) addChatLine(messages, payload.optString("username", "Player"), payload.optString("message", ""));
        }));
        addBottomNav("club");
    }

    private void addChatLine(LinearLayout messages, String username, String value) {
        TextView line = text((username.equals(user == null ? "" : user.optString("username")) ? "YOU" : username) + "   " + value, 12, WHITE, false);
        line.setPadding(0, dp(5), 0, dp(5)); messages.addView(line);
        if (messages.getChildCount() > 60) messages.removeViewAt(0);
    }

    private void showRewards() {
        showPage("REWARDS & RACE", "Your play-chip level, cashback, and daily standings.", true);
        LinearLayout rewardPage = page;
        LinearLayout level = cardColumn(); level.setPadding(dp(16), dp(15), dp(16), dp(15));
        level.addView(text("CLUB LEVEL", 11, GOLD_BRIGHT, true));
        TextView levelText = text("Loading progress…", 15, WHITE, true); level.addView(levelText, topSpace(8));
        TextView progress = text("", 11, MUTED, false); level.addView(progress, topSpace(5)); page.addView(level, topSpace(10));
        LinearLayout rb = cardColumn(); rb.setPadding(dp(16), dp(15), dp(16), dp(15));
        rb.addView(text("PLAY-CHIP RAKEBACK", 11, GOLD_BRIGHT, true));
        TextView rakeback = text("Calculating your available cashback…", 12, MUTED, false); rb.addView(rakeback, topSpace(7));
        Button claim = button("CLAIM CASHBACK", true, () -> {}); claim.setEnabled(false); rb.addView(claim, topSpace(11)); page.addView(rb, topSpace(10));
        addSectionHeader("DAILY WAGER RACE", "Top three play-chip wagers earn daily prizes");
        LinearLayout race = cardColumn(); race.setPadding(dp(14), dp(12), dp(14), dp(12)); page.addView(race, topSpace(8));
        api.get("/api/house/me", (body, error) -> { if (body != null && rewardPage == page) { levelText.setText("Level " + body.optInt("level", 1) + " · " + formatNumber(body.optDouble("wagered")) + " chips wagered"); progress.setText("Next level at " + formatNumber(body.optDouble("nextLevelAt")) + " play chips wagered."); } });
        api.get("/api/house/rakeback", (body, error) -> { if (body != null && rewardPage == page) { double available = body.optDouble("available"); rakeback.setText(formatNumber(available) + " play chips ready · " + String.format("%.2f%%", body.optDouble("rate") * 100) + " rate · lifetime " + formatNumber(body.optDouble("lifetime"))); claim.setEnabled(available > 0); claim.setOnClickListener(v -> api.post("/api/house/rakeback/claim", new JSONObject(), (result, claimError) -> { if (claimError != null || result == null) toast(claimError == null ? "Cashback could not be claimed" : claimError); else { toast("Collected " + formatNumber(result.optDouble("amount")) + " play chips"); refreshUser(null); showRewards(); } })); } });
        api.get("/api/house/race", (body, error) -> {
            if (body == null || rewardPage != page) return;
            race.removeAllViews();
            JSONArray prizes = body.optJSONArray("prizes"); JSONArray standings = body.optJSONArray("standings");
            String[] names = {"1ST", "2ND", "3RD"};
            if (prizes != null) for (int i = 0; i < prizes.length(); i++) race.addView(text(names[Math.min(i, 2)] + "   " + formatNumber(prizes.optDouble(i)) + " play chips", 12, GOLD_BRIGHT, true), topSpace(4));
            if (standings != null) for (int i = 0; i < standings.length(); i++) { JSONObject player = standings.optJSONObject(i); if (player != null) race.addView(text("#" + (i + 1) + "   " + player.optString("username") + "   ·   " + formatNumber(player.optDouble("wagered")), 11, WHITE, false), topSpace(6)); }
            if (standings == null || standings.length() == 0) race.addView(text("No wagers on today's board yet.", 11, MUTED, false), topSpace(6));
        });
        addBottomNav("account");
    }

    private void showSettings() {
        showPage("APP SETTINGS", "Personalize your native casino experience.", true);
        page.addView(text("Loading your preferences…", 12, MUTED, false), topSpace(10));
        api.get("/api/preferences", (body, error) -> {
            if (page == null || !"APP SETTINGS".equals(currentTitle)) return;
            cachedPreferences = body == null || body.optJSONObject("preferences") == null ? new JSONObject() : body.optJSONObject("preferences");
            renderSettings();
            addBottomNav("account");
        });
    }

    private void renderSettings() {
        while (page.getChildCount() > 1) page.removeViewAt(page.getChildCount() - 1);
        JSONObject p = cachedPreferences;
        LinearLayout avatar = cardColumn(); avatar.setPadding(dp(14), dp(14), dp(14), dp(14));
        avatar.addView(text("PLAYER AVATAR", 11, GOLD_BRIGHT, true));
        String[] avatars = {"🃏", "♠️", "🎲", "🦊", "🐺", "👑", "🦁", "🐉", "💎", "🌙", "⚡", "🎩"};
        LinearLayout picks = row(); picks.setPadding(0, dp(8), 0, 0);
        for (String value : avatars) {
            TextView option = text(value, 22, WHITE, true); option.setGravity(Gravity.CENTER); option.setBackground(rounded(value.equals(p.optString("avatar", "🃏")) ? Color.rgb(72, 51, 25) : PANEL_ALT, 12));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(44), dp(46)); lp.rightMargin = dp(5); picks.addView(option, lp);
            option.setOnClickListener(v -> { try { p.put("avatar", value); } catch (JSONException ignored) {} renderSettings(); });
        }
        HorizontalScrollView avatarScroller = new HorizontalScrollView(activity); avatarScroller.setHorizontalScrollBarEnabled(false); avatarScroller.addView(picks); avatar.addView(avatarScroller);
        page.addView(avatar, topSpace(10));

        LinearLayout appearance = cardColumn(); appearance.setPadding(dp(14), dp(14), dp(14), dp(14));
        appearance.addView(text("CARD APPEARANCE", 11, GOLD_BRIGHT, true));
        boolean four = p.optBoolean("four_color_deck", false);
        LinearLayout colors = row(); colors.addView(chip("CLASSIC 2-COLOR", !four, () -> { try { p.put("four_color_deck", false); } catch (JSONException ignored) {} renderSettings(); }));
        colors.addView(chip("4-COLOR DECK", four, () -> { try { p.put("four_color_deck", true); } catch (JSONException ignored) {} renderSettings(); }), leftSpace(7, null));
        appearance.addView(colors, topSpace(10)); page.addView(appearance, topSpace(10));

        LinearLayout sound = cardColumn(); sound.setPadding(dp(14), dp(14), dp(14), dp(14));
        sound.addView(text("SOUND PREFERENCE", 11, GOLD_BRIGHT, true));
        boolean soundEnabled = p.optBoolean("sound_enabled", true);
        LinearLayout soundOptions = row(); soundOptions.addView(chip("ON", soundEnabled, () -> { try { p.put("sound_enabled", true); } catch (JSONException ignored) {} renderSettings(); }));
        soundOptions.addView(chip("OFF", !soundEnabled, () -> { try { p.put("sound_enabled", false); } catch (JSONException ignored) {} renderSettings(); }), leftSpace(7, null));
        sound.addView(soundOptions, topSpace(10));
        SeekBar volume = new SeekBar(activity); volume.setMax(100); volume.setProgress(p.optInt("sound_volume", 80)); volume.setProgressTintList(android.content.res.ColorStateList.valueOf(GOLD)); sound.addView(volume, topSpace(7));
        page.addView(sound, topSpace(10));

        LinearLayout limits = cardColumn(); limits.setPadding(dp(14), dp(14), dp(14), dp(14));
        limits.addView(text("RESPONSIBLE PLAY LIMITS", 11, GOLD_BRIGHT, true));
        limits.addView(text("The daily BTC cap counts pending invoices and confirmed deposits. Enter 0 or leave it blank to disable the cap. The session reminder runs from sign-in; leave that field blank to disable it.", 11, MUTED, false), topSpace(5));
        EditText depositLimit = input("Daily deposit limit · BTC", false); depositLimit.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        EditText sessionLimit = input("Session time limit · minutes", false); sessionLimit.setInputType(InputType.TYPE_CLASS_NUMBER);
        if (p.has("deposit_limit_btc") && !p.isNull("deposit_limit_btc")) depositLimit.setText(p.optString("deposit_limit_btc"));
        if (p.has("session_limit_minutes") && !p.isNull("session_limit_minutes")) sessionLimit.setText(p.optString("session_limit_minutes"));
        limits.addView(depositLimit, topSpace(11)); limits.addView(sessionLimit, topSpace(8));
        page.addView(limits, topSpace(10));
        page.addView(text("If play stops feeling enjoyable, you can contact support at jacobstephane@outlook.com to ask for a cool-off or self-exclusion.", 10, MUTED, false), topSpace(12));
        page.addView(button("SAVE MY SETTINGS", true, () -> {
            try {
                String depositText = depositLimit.getText().toString().trim();
                String sessionText = sessionLimit.getText().toString().trim();
                Double depositBtc = depositText.isEmpty() ? null : Double.parseDouble(depositText);
                Integer sessionMinutes = sessionText.isEmpty() ? null : Integer.parseInt(sessionText);
                if (depositBtc != null && (!Double.isFinite(depositBtc) || depositBtc < 0)) { toast("Daily deposit limit must be zero or greater"); return; }
                if (sessionMinutes != null && (sessionMinutes < 1 || sessionMinutes > 1440)) { toast("Session reminder must be between 1 and 1,440 minutes"); return; }
                p.put("sound_enabled", soundEnabled); p.put("sound_volume", volume.getProgress());
                p.put("deposit_limit_btc", depositBtc == null ? JSONObject.NULL : depositBtc);
                p.put("session_limit_minutes", sessionMinutes == null ? JSONObject.NULL : sessionMinutes);
                api.put("/api/preferences", p, (body, error) -> {
                    if (error != null) { toast(error); return; }
                    scheduleSessionReminder(sessionMinutes == null ? 0 : sessionMinutes);
                    toast("Preferences saved securely");
                });
            } catch (Exception e) { toast("Enter valid numeric limits"); return; }
        }), topSpace(14));
        page.addView(button("HELP & GAME GUIDES", false, this::showHelp), topSpace(8));
    }

    private void showHelp() {
        showPage("HELP & GAME GUIDES", "Clear answers before you take a seat.", true);
        String[][] topics = {
                {"Texas Hold’em", "Each player gets two private cards. Five shared cards arrive across the flop, turn, and river. Make the best five-card hand or win by getting your opponent to fold."},
                {"Blackjack", "Make a total closer to 21 than the dealer without going over. Number cards count as shown, face cards count as ten, and an ace counts as one or eleven. Hit draws a card; stand keeps your total; double doubles your stake for one final card; split separates a matching pair."},
                {"Roulette", "Choose a red/black, odd/even, high/low, or dozen wager before betting closes. A single-zero wheel gives European roulette its classic layout."},
                {"Baccarat", "Choose Player, Banker, or Tie. The dealer draws both hands and the standard third-card rule completes the round automatically."},
                {"Crash", "Queue a wager before the round begins. The multiplier rises until the round crashes; cash out before it stops to lock in the displayed return."},
                {"Slots, dice & Plinko", "Choose a stake, read the game controls, and play. Round results are returned by the server. Dice and Plinko let you adjust odds or risk before each round."},
                {"Mines", "Choose how many hidden mines to place, start a round, and reveal tiles one at a time. Each safe gem raises the return multiplier. Cash out to settle before revealing a mine."},
                {"Video poker", "Deal five cards, tap cards to hold, then draw replacements. The paytable shows which poker hands return a prize."},
                {"Deposits & withdrawals", "Deposits start at $5 USD equivalent and are paid through the available BTCPay methods. Withdrawals are paid in BTC to the Bitcoin address you submit; check your address carefully before confirming."},
                {"Fair play & privacy", "Instant games publish a server-seed hash before play. Rotate seeds to reveal the old seed, then verify eligible rounds by their ID in the Fair Play screen."},
                {"Play limits & support", "Set a daily deposit limit or session reminder in Settings. If gambling affects your life, visit gamblingtherapy.org or contact jacobstephane@outlook.com."}
        };
        for (String[] topic : topics) {
            LinearLayout item = cardColumn(); item.setPadding(dp(14), dp(13), dp(14), dp(13));
            item.addView(text(topic[0], 14, GOLD_BRIGHT, true)); item.addView(text(topic[1], 12, WHITE, false), topSpace(7));
            page.addView(item, topSpace(8));
        }
        page.addView(button("OPEN STRATEGY & CRYPTO HUB", false, this::showStrategyHub), topSpace(12));
        addBottomNav("account");
    }

    private void showStrategyHub() {
        showPage("STRATEGY & CRYPTO HUB", "Know the tools, rules, and numbers before you play.", true);
        addSectionHeader("THE CRYPTO ADVANTAGE", "Native account tools connected to the casino services");
        addGuideCard("In-app cashier", "Create a deposit invoice, choose a payment method shown for that invoice, and copy its address or payment request without leaving the app. Your balance updates after BTCPay confirms settlement.");
        addGuideCard("Provably fair rounds", "Instant games publish a server-seed hash. After rotating your seed, open the verifier and check eligible round IDs against the revealed seed.");
        addGuideCard("Two ways to play", "Switch between play chips and BTC where a game offers both. The lobby shows the active currency and its matching tables.");
        addGuideCard("Club rewards", "Check the daily play-chip bonus, level progress, cashback, and daily wager race from Rewards. Availability and amounts come from your account.");
        page.addView(button("OPEN THE FAIR PLAY VERIFIER", true, () -> showFair(null)), topSpace(10));
        page.addView(button("VIEW REWARDS & RACE", false, this::showRewards), topSpace(8));

        addSectionHeader("STRATEGY NOTES", "Understand the mechanics; every round still has variance");
        addGuideCard("Bankroll basics", "Choose a session amount you can afford to lose, decide on a stopping point before play, and keep deposits within the cap you set in App Settings. A session reminder can prompt you to pause.");
        addGuideCard("Pot odds", "Compare the call amount with the pot you could win. For example, if the pot is 100 chips and an opponent bets 50, calling 50 would contest a final 200-chip pot, so the call price is 25% of that final pot.");
        addGuideCard("RTP and volatility", "RTP is a long-run theoretical return for a slot; it does not predict an individual session. Volatility describes how payouts tend to be distributed, so review the game details before choosing a stake.");
        addGuideCard("Blackjack decisions", "Hit, stand, double, and split change the hand in different ways. Start with the rules in Help & Game Guides and use the table’s available actions; dealer rules can vary by table.");
        addGuideCard("Video poker paytables", "Check the paytable before dealing. Hold decisions depend on the game variant and its payouts, so the same five cards can have different strategic value across cabinets.");
        addBottomNav("account");
    }

    private void addGuideCard(String title, String body) {
        LinearLayout card = cardColumn(); card.setPadding(dp(14), dp(13), dp(14), dp(13));
        card.addView(text(title, 14, GOLD_BRIGHT, true));
        card.addView(text(body, 12, WHITE, false), topSpace(7));
        page.addView(card, topSpace(8));
    }

    private void addBottomNav(String selected) {
        LinearLayout nav = row(); nav.setBackgroundColor(Color.rgb(13, 14, 17)); nav.setPadding(dp(5), dp(6), dp(5), dp(8));
        nav.addView(navItem("⌂", "FLOOR", selected.equals("floor"), this::showLobby), new LinearLayout.LayoutParams(0, dp(54), 1));
        nav.addView(navItem("↗", "BETS", selected.equals("bets"), this::showMyBets), new LinearLayout.LayoutParams(0, dp(54), 1));
        nav.addView(navItem("◈", "WALLET", selected.equals("wallet"), this::showWallet), new LinearLayout.LayoutParams(0, dp(54), 1));
        nav.addView(navItem("♧", "CLUB", selected.equals("club"), this::showFriends), new LinearLayout.LayoutParams(0, dp(54), 1));
        nav.addView(navItem("●", "ACCOUNT", selected.equals("account"), this::showAccount), new LinearLayout.LayoutParams(0, dp(54), 1));
        root.addView(nav, new LinearLayout.LayoutParams(-1, -2));
    }

    private View navItem(String symbol, String label, boolean active, Runnable click) {
        LinearLayout item = new LinearLayout(activity); item.setGravity(Gravity.CENTER); item.setOrientation(LinearLayout.VERTICAL);
        item.addView(text(symbol, 19, active ? GOLD_BRIGHT : MUTED, true)); item.addView(text(label, 9, active ? GOLD_BRIGHT : MUTED, true), topSpace(2));
        item.setOnClickListener(v -> click.run()); return item;
    }

    private void showAccount() {
        showPage("YOUR ACCOUNT", "Profile, app settings, and club tools", false);
        addProfilePanel();
        page.addView(button("VIEW PLAYER PROFILE", true, () -> showProfile(null)), topSpace(14));
        page.addView(button("REWARDS, RAKEBACK & DAILY RACE", false, this::showRewards), topSpace(8));
        page.addView(button("FRIENDS & LOBBY CHAT", false, this::showFriends), topSpace(8));
        page.addView(button("LEADERBOARD", false, this::showLeaderboard), topSpace(8));
        page.addView(button("PROVABLY FAIR VERIFIER", false, () -> showFair(null)), topSpace(8));
        page.addView(button("STRATEGY & CRYPTO HUB", false, this::showStrategyHub), topSpace(8));
        page.addView(button("APP SETTINGS & PLAY LIMITS", false, this::showSettings), topSpace(8));
        page.addView(button("HELP & GAME GUIDES", false, this::showHelp), topSpace(8));
        page.addView(button("SIGN OUT", false, this::signOut), topSpace(18));
        page.addView(text("Your balances, session, and game results stay connected to the casino account you signed in with.", 11, MUTED, false), topSpace(13));
        addBottomNav("account");
    }

    private void signOut() {
        closeSocket();
        if (presenceSocket != null) { presenceSocket.close(); presenceSocket = null; }
        clearSessionClock();
        api.post("/api/auth/logout", new JSONObject(), (body, error) -> {});
        api.clearToken(); user = null; showAuth(false);
    }

    private void startSessionClock(boolean newSession) {
        android.content.SharedPreferences prefs = activity.getSharedPreferences("cryptomania_native", Context.MODE_PRIVATE);
        if (newSession || prefs.getLong("session_started_at", 0) <= 0) {
            prefs.edit().putLong("session_started_at", System.currentTimeMillis()).putBoolean("session_reminder_shown", false).apply();
        }
        api.get("/api/preferences", (body, error) -> {
            if (api.token() == null) return;
            JSONObject preferences = body == null ? null : body.optJSONObject("preferences");
            int minutes = preferences == null ? 0 : preferences.optInt("session_limit_minutes", 0);
            scheduleSessionReminder(minutes);
        });
    }

    private void scheduleSessionReminder(int minutes) {
        if (sessionReminderTask != null) mainHandler.removeCallbacks(sessionReminderTask);
        sessionReminderTask = null;
        if (minutes <= 0) return;
        sessionReminderTask = new Runnable() {
            @Override public void run() {
                android.content.SharedPreferences prefs = activity.getSharedPreferences("cryptomania_native", Context.MODE_PRIVATE);
                if (prefs.getBoolean("session_reminder_shown", false) || api.token() == null) return;
                long startedAt = prefs.getLong("session_started_at", System.currentTimeMillis());
                long remaining = startedAt + minutes * 60_000L - System.currentTimeMillis();
                if (remaining > 0) {
                    mainHandler.postDelayed(this, remaining);
                    return;
                }
                if (activity.isFinishing() || activity.isDestroyed()) return;
                if (!activity.hasWindowFocus()) {
                    mainHandler.postDelayed(this, 30_000L);
                    return;
                }
                prefs.edit().putBoolean("session_reminder_shown", true).apply();
                new androidx.appcompat.app.AlertDialog.Builder(activity)
                        .setTitle("Session reminder")
                        .setMessage("You set a reminder for " + minutes + " minutes. Consider taking a break before you continue.")
                        .setPositiveButton("Take a break", (dialog, which) -> {})
                        .setNeutralButton("End session", (dialog, which) -> signOut())
                        .show();
            }
        };
        mainHandler.post(sessionReminderTask);
    }

    private void clearSessionClock() {
        if (sessionReminderTask != null) mainHandler.removeCallbacks(sessionReminderTask);
        sessionReminderTask = null;
        activity.getSharedPreferences("cryptomania_native", Context.MODE_PRIVATE).edit()
                .remove("session_started_at").remove("session_reminder_shown").apply();
    }

    private void showWallet() {
        showPage("WALLET", "Balances and cashier", false);
        LinearLayout walletPage = page;
        LinearLayout wallet = cardColumn(); wallet.setPadding(dp(18), dp(18), dp(18), dp(18));
        wallet.addView(label("AVAILABLE PLAY CHIPS")); wallet.addView(text(formatNumber(user == null ? 0 : user.optDouble("balancePlay", 0)), 28, WHITE, true), topSpace(8));
        wallet.addView(label("BITCOIN BALANCE"), topSpace(18)); wallet.addView(text(formatBtc(user == null ? 0 : user.optDouble("balanceBtc", 0)), 22, GOLD_BRIGHT, true), topSpace(6));
        page.addView(wallet, topSpace(8));
        page.addView(button("REFRESH BALANCE", true, () -> refreshUser(() -> { showWallet(); toast("Wallet refreshed"); })), topSpace(14));

        LinearLayout deposit = cardColumn(); deposit.setPadding(dp(17), dp(17), dp(17), dp(17));
        deposit.addView(text("Deposit", 18, WHITE, true));
        deposit.addView(text("Create a secure BTCPay invoice. The available crypto payment methods appear at checkout.", 12, MUTED, false), topSpace(5));
        EditText depositAmount = input("Amount in USD · minimum $5", false);
        depositAmount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        deposit.addView(depositAmount, topSpace(14));
        TextView invoiceStatus = text("", 12, GOLD_BRIGHT, false); invoiceStatus.setTextIsSelectable(true);
        deposit.addView(invoiceStatus, topSpace(10));
        deposit.addView(button("CREATE DEPOSIT INVOICE", true, () -> {
            double amount = numberDouble(depositAmount, 0);
            if (amount < 5) { toast("Minimum deposit is $5"); return; }
            invoiceStatus.setText("Preparing secure invoice…");
            api.post("/api/wallet/deposit", json("amountUsd", amount), (body, error) -> {
                if (error != null || body == null) { invoiceStatus.setText(""); toast(error == null ? "Could not create invoice" : error); return; }
                invoiceStatus.setText("Invoice created · $" + body.optString("amountUsd") + " · estimated " + String.format("%.8f BTC", body.optDouble("amountBtc")));
                deposit.addView(button("VIEW PAYMENT INSTRUCTIONS IN APP", true, () -> showDepositInvoice(body.optString("invoiceId"))), topSpace(10));
            });
        }), topSpace(12));
        page.addView(deposit, topSpace(20));

        LinearLayout withdrawal = cardColumn(); withdrawal.setPadding(dp(17), dp(17), dp(17), dp(17));
        withdrawal.addView(text("Withdraw BTC", 18, WHITE, true));
        withdrawal.addView(text("Enter a Bitcoin address and USD value. The server validates your balance and submits the payout.", 12, MUTED, false), topSpace(5));
        EditText withdrawAmount = input("Amount in USD · minimum $5", false);
        withdrawAmount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        EditText address = input("Bitcoin destination address", false);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        withdrawal.addView(withdrawAmount, topSpace(14)); withdrawal.addView(address, topSpace(9));
        withdrawal.addView(button("SUBMIT WITHDRAWAL", true, () -> {
            double amount = numberDouble(withdrawAmount, 0); String destination = address.getText().toString().trim();
            if (amount < 5 || destination.isEmpty()) { toast("Enter at least $5 and a Bitcoin address"); return; }
            api.post("/api/wallet/withdraw", json("amountUsd", amount, "address", destination), (body, error) -> {
                if (error != null) { toast(error); return; }
                toast("Withdrawal submitted"); withdrawAmount.setText(""); address.setText(""); refreshUser(() -> showWallet());
            });
        }), topSpace(12));
        page.addView(withdrawal, topSpace(13));

        api.get("/api/wallet/balance", (balance, error) -> {
            JSONArray transactions = balance == null ? null : balance.optJSONArray("transactions");
            if (transactions == null || page != walletPage) return;
            addSectionHeader("RECENT ACTIVITY", "Latest wallet transactions");
            int count = Math.min(5, transactions.length());
            for (int i = 0; i < count; i++) {
                JSONObject tx = transactions.optJSONObject(i); if (tx == null) continue;
                String type = tx.optString("type", "transaction").replace('_', ' ').toUpperCase();
                String txCurrency = tx.optString("currency", "BTC");
                String amount = "PLAY".equalsIgnoreCase(txCurrency) ? formatNumber(tx.optDouble("amount")) + " chips" : formatBtc(tx.optDouble("amount"));
                addNativeGameCard("◈", type, amount + " · " + tx.optString("status", "pending"), () -> {});
            }
        });
        addBottomNav("wallet");
    }

    private void showDepositInvoice(String invoiceId) {
        if (invoiceId == null || invoiceId.isEmpty()) { toast("Invoice reference is missing"); return; }
        showPage("DEPOSIT INVOICE", "Payment instructions stay inside the app.", true);
        LinearLayout invoicePage = page;
        LinearLayout summary = cardColumn(); summary.setPadding(dp(16), dp(15), dp(16), dp(15));
        summary.addView(text("BTCPAY INVOICE", 11, GOLD_BRIGHT, true));
        TextView status = text("Loading payment details…", 18, WHITE, true); summary.addView(status, topSpace(8));
        TextView amount = text("", 12, MUTED, false); summary.addView(amount, topSpace(4));
        summary.addView(text("Invoice " + shortId(invoiceId), 10, MUTED, false), topSpace(7));
        page.addView(summary, topSpace(10));
        page.addView(text("Choose a payment method, copy its payment request, and open your crypto wallet. Your deposit credits after BTCPay confirms payment.", 12, MUTED, false), topSpace(12));
        LinearLayout methods = new LinearLayout(activity); methods.setOrientation(LinearLayout.VERTICAL); page.addView(methods, topSpace(12));
        page.addView(button("REFRESH PAYMENT STATUS", true, () -> loadDepositDetails(invoiceId, invoicePage, status, amount, methods)), topSpace(12));
        page.addView(button("BACK TO WALLET", false, this::showWallet), topSpace(8));
        loadDepositDetails(invoiceId, invoicePage, status, amount, methods);
        addBottomNav("wallet");
    }

    private void loadDepositDetails(String invoiceId, LinearLayout invoicePage, TextView status, TextView amount, LinearLayout methods) {
        status.setText("Checking invoice status…"); methods.removeAllViews();
        api.get("/api/wallet/deposit/" + Uri.encode(invoiceId), (body, error) -> {
            if (invoicePage != page) return;
            if (error != null || body == null) {
                status.setText("Payment details could not load");
                methods.addView(text(error == null ? "The BTCPay service is temporarily unavailable. Try refreshing in a moment." : error, 12, MUTED, false));
                return;
            }
            String invoiceStatus = body.optString("status", "New");
            status.setText(invoiceStatus.toUpperCase(java.util.Locale.ROOT));
            status.setTextColor(invoiceStatus.equalsIgnoreCase("Settled") ? GREEN : invoiceStatus.equalsIgnoreCase("Expired") || invoiceStatus.equalsIgnoreCase("Invalid") ? RED : GOLD_BRIGHT);
            amount.setText("Invoice amount  ·  " + body.optString("amount", "—") + " " + body.optString("currency", "USD") + (body.optString("expiresAt").isEmpty() ? "" : "\nExpires  ·  " + body.optString("expiresAt")));
            JSONArray options = body.optJSONArray("paymentMethods");
            if (options == null || options.length() == 0) {
                methods.addView(text("No payment methods are available for this invoice yet.", 12, MUTED, false));
            } else {
                for (int i = 0; i < options.length(); i++) {
                    JSONObject option = options.optJSONObject(i); if (option == null) continue;
                    LinearLayout method = cardColumn(); method.setPadding(dp(14), dp(13), dp(14), dp(13));
                    String methodName = option.optString("cryptoCode", option.optString("paymentMethodId", "Crypto"));
                    method.addView(text(methodName + " PAYMENT", 12, GOLD_BRIGHT, true));
                    String destination = option.optString("destination", ""); String request = option.optString("paymentLink", "");
                    String due = option.optString("due", "");
                    if (!due.isEmpty()) method.addView(text("Amount due  ·  " + due + " " + methodName, 11, WHITE, true), topSpace(7));
                    if (!destination.isEmpty()) {
                        TextView address = text("ADDRESS\n" + destination, 11, WHITE, false); address.setTextIsSelectable(true); address.setBreakStrategy(android.text.Layout.BREAK_STRATEGY_HIGH_QUALITY); method.addView(address, topSpace(9));
                        method.addView(button("COPY ADDRESS", false, () -> copyText("Deposit address", destination)), topSpace(8));
                    }
                    if (!request.isEmpty()) {
                        TextView payRequest = text("PAYMENT REQUEST\n" + request, 10, MUTED, false); payRequest.setTextIsSelectable(true); method.addView(payRequest, topSpace(9));
                        method.addView(button("COPY PAYMENT REQUEST", true, () -> copyText("BTCPay payment request", request)), topSpace(8));
                    }
                    methods.addView(method, topSpace(i == 0 ? 0 : 8));
                }
            }
            if (invoiceStatus.equalsIgnoreCase("Settled")) {
                refreshUser(null);
                methods.addView(button("RETURN TO WALLET", true, this::showWallet), topSpace(12));
            }
        });
    }

    private void copyText(String label, String value) {
        ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) { toast("Clipboard is unavailable"); return; }
        clipboard.setPrimaryClip(ClipData.newPlainText(label, value)); toast(label + " copied");
    }

    private void addProfilePanel() {
        LinearLayout profile = cardColumn(); profile.setPadding(dp(18), dp(18), dp(18), dp(18));
        profile.addView(text("♛   " + (user == null ? "Guest" : user.optString("username", "Player")), 22, WHITE, true));
        profile.addView(text("CRYPTOMANIA MEMBER", 10, GOLD, true), topSpace(6));
        LinearLayout row = row();
        row.addView(balancePill("PLAY CHIPS", formatNumber(user == null ? 0 : user.optDouble("balancePlay", 0))), new LinearLayout.LayoutParams(0, -2, 1));
        row.addView(balancePill("BTC", formatBtc(user == null ? 0 : user.optDouble("balanceBtc", 0))), leftSpace(8, new LinearLayout.LayoutParams(0, -2, 1)));
        profile.addView(row, topSpace(16)); page.addView(profile, topSpace(8));
    }

    private LinearLayout balancePill(String title, String value) {
        LinearLayout pill = new LinearLayout(activity); pill.setOrientation(LinearLayout.VERTICAL); pill.setPadding(dp(11), dp(9), dp(11), dp(9)); pill.setBackground(rounded(Color.rgb(34, 29, 23), 13));
        pill.addView(text(title, 9, GOLD, true)); pill.addView(text(value, 14, WHITE, true), topSpace(4)); return pill;
    }

    private void closeSocket() {
        activeLiveTableId = null;
        if (gameSocket != null) { gameSocket.close(); gameSocket = null; }
    }

    private String gameIcon(String game) {
        switch (game) { case "blackjack": return "♠"; case "roulette": return "◉"; case "baccarat": return "♦"; case "crash": return "↗"; default: return "✦"; }
    }

    private LinearLayout cardColumn() {
        LinearLayout card = new LinearLayout(activity); card.setOrientation(LinearLayout.VERTICAL); card.setBackground(rounded(PANEL, 18)); return card;
    }

    private LinearLayout row() { LinearLayout row = new LinearLayout(activity); row.setOrientation(LinearLayout.HORIZONTAL); return row; }

    private TextView label(String value) { return text(value, 10, MUTED, true); }

    private TextView text(String value, float size, int color, boolean bold) {
        TextView view = new TextView(activity); view.setText(value); view.setTextColor(color); view.setTextSize(size);
        view.setTypeface(Typeface.create(bold ? "sans-serif" : "sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL));
        view.setIncludeFontPadding(true); return view;
    }

    private EditText input(String hint, boolean password) {
        EditText edit = new EditText(activity); edit.setSingleLine(true); edit.setTextColor(WHITE); edit.setHintTextColor(MUTED); edit.setHint(hint); edit.setTextSize(14);
        edit.setPadding(dp(14), dp(10), dp(14), dp(10)); edit.setBackground(rounded(PANEL_ALT, 12));
        if (password) edit.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        transientInputs.add(edit); return edit;
    }

    private Button button(String label, boolean primary, Runnable click) {
        Button button = new Button(activity); button.setText(label); button.setTextSize(12); button.setAllCaps(false); button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setTextColor(primary ? BG : GOLD_BRIGHT); button.setPadding(dp(12), dp(6), dp(12), dp(6));
        button.setBackground(rounded(primary ? GOLD : PANEL_ALT, 13)); button.setMinHeight(dp(46)); button.setStateListAnimator(null);
        button.setOnClickListener(v -> { if (click != null) click.run(); }); return button;
    }

    private View chip(String label, boolean selected, Runnable click) {
        TextView chip = text(label, 11, selected ? BG : GOLD_BRIGHT, true); chip.setGravity(Gravity.CENTER); chip.setPadding(dp(13), dp(8), dp(13), dp(8)); chip.setBackground(rounded(selected ? GOLD : PANEL_ALT, 20)); chip.setOnClickListener(v -> click.run()); return chip;
    }

    private void styleToggle(Button button, boolean selected) { button.setTextColor(selected ? BG : GOLD_BRIGHT); button.setBackground(rounded(selected ? GOLD : PANEL_ALT, 13)); }

    private Spinner spinner(String[] values) {
        Spinner spinner = new Spinner(activity); ArrayAdapter<String> adapter = new ArrayAdapter<String>(activity, android.R.layout.simple_spinner_item, values) {
            @Override public View getView(int position, View convertView, ViewGroup parent) {
                TextView view = (TextView) super.getView(position, convertView, parent); view.setTextColor(WHITE); view.setTextSize(14); return view;
            }
            @Override public View getDropDownView(int position, View convertView, ViewGroup parent) {
                TextView view = (TextView) super.getDropDownView(position, convertView, parent); view.setTextColor(WHITE); view.setBackgroundColor(PANEL_ALT); view.setPadding(dp(14), dp(11), dp(14), dp(11)); return view;
            }
        };
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item); spinner.setAdapter(adapter);
        spinner.setBackground(rounded(PANEL_ALT, 12)); spinner.setPopupBackgroundDrawable(rounded(PANEL_ALT, 12)); return spinner;
    }

    private GradientDrawable rounded(int color, int radius) {
        GradientDrawable background = new GradientDrawable(); background.setColor(color); background.setCornerRadius(dp(radius));
        if (color == PANEL || color == PANEL_ALT) background.setStroke(dp(1), Color.rgb(42, 39, 36));
        return background;
    }

    private GradientDrawable roundedGradient(int[] colors, int radius) {
        GradientDrawable background = new GradientDrawable(GradientDrawable.Orientation.TL_BR, colors); background.setCornerRadius(dp(radius)); background.setStroke(dp(1), Color.rgb(93, 65, 34)); return background;
    }

    private LinearLayout.LayoutParams topSpace(int top) { LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2); lp.topMargin = dp(top); return lp; }
    private LinearLayout.LayoutParams bottomSpace(int bottom) { LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2); lp.bottomMargin = dp(bottom); return lp; }
    private LinearLayout.LayoutParams leftSpace(int left, LinearLayout.LayoutParams lp) { if (lp != null) lp.leftMargin = dp(left); return lp; }
    private int dp(float px) { return Math.round(px * activity.getResources().getDisplayMetrics().density); }

    private long number(EditText edit, long fallback) {
        try { return Math.max(1, Long.parseLong(edit.getText().toString().replaceAll("[^0-9]", ""))); }
        catch (Exception error) { return fallback; }
    }

    private double numberDouble(EditText edit, double fallback) {
        try { return Double.parseDouble(edit.getText().toString().trim()); }
        catch (Exception error) { return fallback; }
    }

    private JSONObject json(Object... pairs) {
        JSONObject object = new JSONObject();
        try { for (int i = 0; i + 1 < pairs.length; i += 2) object.put(String.valueOf(pairs[i]), pairs[i + 1]); }
        catch (JSONException ignored) {}
        return object;
    }

    private String formatNumber(double value) {
        if (Math.abs(value) >= 1000) return String.format("%,.0f", value);
        return String.format("%.0f", value);
    }

    private String formatBtc(double value) { return String.format("%.8f BTC", value); }

    private String formatStake(double value, String currency) {
        if ("btc".equalsIgnoreCase(currency)) {
            double dollars = Math.abs(value) / 100.0;
            return (value < 0 ? "-$" : "$" ) + String.format("%.2f", dollars);
        }
        return formatNumber(value) + " chips";
    }

    private void hideKeyboard() {
        try { InputMethodManager manager = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE); manager.hideSoftInputFromWindow(root.getWindowToken(), 0); root.clearFocus(); }
        catch (Exception ignored) {}
    }

    private void toast(String message) { Toast.makeText(activity, message, Toast.LENGTH_LONG).show(); }
}
