package exchange.btcpay.poker.heisenberg;

import android.os.Bundle;
import android.view.Window;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;

public class MainActivity extends AppCompatActivity {
    private NativeCasinoApp casinoApp;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, true);
        window.setStatusBarColor(0xFF08090B);
        window.setNavigationBarColor(0xFF08090B);
        window.getDecorView().setSystemUiVisibility(0);
        casinoApp = new NativeCasinoApp(this);
        setContentView(casinoApp.rootView());
        casinoApp.launch();
    }

    @Override
    protected void onDestroy() {
        if (casinoApp != null) casinoApp.destroy();
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (casinoApp == null || !casinoApp.goBack()) super.onBackPressed();
    }
}
