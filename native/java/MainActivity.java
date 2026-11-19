package fr.fifelas.pilotagebudget;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BankNotifPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
