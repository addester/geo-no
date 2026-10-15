package io.github.addester.geono;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/** Settings screen. Built in code to keep the app tiny and dependency-free. */
public class MainActivity extends Activity {

    private static final int ACCENT = Color.rgb(216, 40, 40);
    private static final int MUTED = Color.rgb(110, 110, 110);
    private static final int LINE = Color.rgb(230, 230, 230);

    private Prefs prefs;
    private LinearLayout root;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = new Prefs(this);
        getWindow().setStatusBarColor(Color.WHITE);
        if (Build.VERSION.SDK_INT >= 23) getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
    }

    @Override
    protected void onResume() {
        super.onResume();
        render();
    }

    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private void render() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.WHITE);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(24), dp(20), dp(48));
        scroll.addView(root);
        setContentView(scroll);

        // ---------- header ----------
        LinearLayout brand = new LinearLayout(this);
        brand.setGravity(Gravity.CENTER_VERTICAL);
        ImageView icon = new ImageView(this);
        icon.setImageResource(R.mipmap.ic_launcher);
        brand.addView(icon, new LinearLayout.LayoutParams(dp(40), dp(40)));
        TextView h = text("Geo No", 24, Color.BLACK);
        h.setTypeface(Typeface.DEFAULT_BOLD);
        h.setPadding(dp(10), 0, 0, 0);
        brand.addView(h);
        root.addView(brand);
        TextView sub = text("Skips or hides Instagram Reels and YouTube Shorts from countries you choose. "
            + "Everything runs on your phone: no account, no internet requests.", 14, MUTED);
        sub.setPadding(0, dp(8), 0, dp(8));
        root.addView(sub);

        // ---------- service status ----------
        boolean on = serviceEnabled();
        LinearLayout status = card(on ? Color.rgb(232, 245, 233) : Color.rgb(255, 236, 236));
        TextView st = text(on ? "✓ Geo No is running" : "Geo No is switched off in Android settings", 16, Color.BLACK);
        st.setTypeface(Typeface.DEFAULT_BOLD);
        status.addView(st);
        if (!on) {
            status.addView(text("Android needs your OK before an app can see what's on screen. "
                + "Tap below, choose Geo No (it may be under \"Installed apps\" or \"Downloaded apps\") and switch it on.", 13, Color.DKGRAY));
            Button open = button("Open Accessibility settings", true);
            open.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
            status.addView(open);
            status.addView(text("Switch greyed out or \"Restricted setting\"? Android 13+ blocks this for apps installed "
                + "outside the Play Store until you allow it: tap below → ⋮ (top right) → \"Allow restricted settings\", then try again.", 12, Color.DKGRAY));
            Button info = button("Open Geo No app info", false);
            info.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getPackageName()))));
            status.addView(info);
        }
        root.addView(status);

        // ---------- stats ----------
        int[] s = prefs.stats();
        root.addView(text(s[1] + " blocked today · " + s[0] + " checked", 14, MUTED));

        // ---------- main switch ----------
        section("Filtering");
        root.addView(toggle("Geo No on", prefs.enabled(), (b, v) -> prefs.setEnabled(v)));
        root.addView(toggle("Instagram Reels", prefs.instagram(), (b, v) -> prefs.setInstagram(v)));
        root.addView(toggle("YouTube Shorts", prefs.youtube(), (b, v) -> prefs.setYoutube(v)));

        // ---------- countries ----------
        section("Countries to block");
        List<String> cs = prefs.countries();
        StringBuilder names = new StringBuilder();
        for (String c : cs) names.append(flag(c)).append(' ').append(Classifier.countryName(c))
            .append(Classifier.PROFILES.containsKey(c) ? " ★" : "").append('\n');
        root.addView(text(cs.isEmpty() ? "None yet." : names.toString().trim(), 16, Color.BLACK));
        Button choose = button("Choose countries", false);
        choose.setOnClickListener(v -> pickCountries());
        root.addView(choose);
        root.addView(text("★ = also detected by language, script and hashtags. Other countries are matched by "
            + "#countryname hashtags and place names.", 12, MUTED));

        // ---------- behaviour ----------
        section("When a Reel or Short matches");
        root.addView(radio(new String[]{"skip", "blur"}, new String[]{"Skip to the next one", "Cover it (with Show anyway)"},
            prefs.mode(), prefs::setMode));
        section("Sensitivity");
        root.addView(radio(new String[]{"low", "medium", "high"}, new String[]{"Low", "Medium", "High (catches more, more mistakes)"},
            prefs.sensitivity(), prefs::setSensitivity));

        // ---------- allow list ----------
        section("Always allowed accounts");
        List<String> allowed = new ArrayList<>(prefs.allowed());
        Collections.sort(allowed);
        if (allowed.isEmpty()) root.addView(text("None. Use \"Allow\" on a hidden Reel or Short to add one.", 13, MUTED));
        for (String k : allowed) {
            LinearLayout row = new LinearLayout(this);
            row.setGravity(Gravity.CENTER_VERTICAL);
            TextView t = text((k.startsWith("ig:") ? "Instagram · " : "YouTube · ") + k.substring(3), 15, Color.BLACK);
            row.addView(t, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
            Button rm = button("Remove", false);
            rm.setOnClickListener(v -> { prefs.disallow(k); render(); });
            row.addView(rm);
            root.addView(row);
        }

        // ---------- diagnostics ----------
        section("Last check");
        String last = prefs.lastCheck();
        TextView diag = text(last.isEmpty() ? "Nothing yet. Open Instagram Reels or YouTube Shorts." : last, 12, MUTED);
        diag.setTextIsSelectable(true);
        diag.setTypeface(Typeface.MONOSPACE);
        root.addView(diag);
        root.addView(text("If Geo No stops working after an Instagram or YouTube update, copy this text into an issue on GitHub.", 12, MUTED));

        section("About");
        root.addView(text("Geo No is free and open source (MIT). It reads only the text Instagram and YouTube show on "
            + "screen while you watch Reels or Shorts, and never sends anything anywhere.", 13, MUTED));
        Button gh = button("github.com/addester/geo-no", false);
        gh.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/addester/geo-no"))));
        root.addView(gh);
    }

    // ---------- pieces ----------
    private TextView text(String s, float size, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(size);
        t.setTextColor(color);
        t.setLineSpacing(0, 1.15f);
        t.setPadding(0, dp(4), 0, dp(4));
        return t;
    }

    private void section(String title) {
        View line = new View(this);
        line.setBackgroundColor(LINE);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1));
        lp.topMargin = dp(20);
        lp.bottomMargin = dp(12);
        root.addView(line, lp);
        TextView t = text(title.toUpperCase(Locale.ROOT), 12, MUTED);
        t.setLetterSpacing(0.08f);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(t);
    }

    private LinearLayout card(int bg) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(16), dp(14), dp(16), dp(14));
        GradientDrawable d = new GradientDrawable();
        d.setCornerRadius(dp(12));
        d.setColor(bg);
        c.setBackground(d);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        lp.bottomMargin = dp(8);
        c.setLayoutParams(lp);
        return c;
    }

    private Button button(String label, boolean primary) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(primary ? Color.WHITE : Color.BLACK);
        GradientDrawable d = new GradientDrawable();
        d.setCornerRadius(dp(10));
        if (primary) d.setColor(ACCENT);
        else { d.setColor(Color.rgb(245, 245, 245)); d.setStroke(dp(1), LINE); }
        b.setBackground(d);
        b.setPadding(dp(16), 0, dp(16), 0);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(44));
        lp.topMargin = dp(8);
        lp.bottomMargin = dp(4);
        b.setLayoutParams(lp);
        return b;
    }

    private Switch toggle(String label, boolean on, CompoundButton.OnCheckedChangeListener l) {
        Switch sw = new Switch(this);
        sw.setText(label);
        sw.setTextSize(16);
        sw.setTextColor(Color.BLACK);
        sw.setChecked(on);
        sw.setPadding(0, dp(8), 0, dp(8));
        sw.setOnCheckedChangeListener(l);
        return sw;
    }

    interface Setter { void set(String v); }

    private RadioGroup radio(String[] values, String[] labels, String current, Setter setter) {
        RadioGroup g = new RadioGroup(this);
        for (int i = 0; i < values.length; i++) {
            RadioButton r = new RadioButton(this);
            r.setId(View.generateViewId());
            r.setText(labels[i]);
            r.setTextSize(15);
            r.setTextColor(Color.BLACK);
            r.setTag(values[i]);
            g.addView(r);
            if (values[i].equals(current)) r.setChecked(true);
        }
        g.setOnCheckedChangeListener((grp, id) -> {
            View r = grp.findViewById(id);
            if (r != null) setter.set((String) r.getTag());
        });
        return g;
    }

    private static String flag(String c) {
        if (c.length() != 2) return "";
        int a = 0x1F1E6 + c.charAt(0) - 'A', b = 0x1F1E6 + c.charAt(1) - 'A';
        return new String(Character.toChars(a)) + new String(Character.toChars(b));
    }

    private void pickCountries() {
        List<String> codes = new ArrayList<>(Arrays.asList(Locale.getISOCountries()));
        Collections.sort(codes, (x, y) -> Classifier.countryName(x).compareTo(Classifier.countryName(y)));
        // Put the countries with rich detection first.
        List<String> rich = new ArrayList<>();
        for (String c : codes) if (Classifier.PROFILES.containsKey(c)) rich.add(c);
        codes.removeAll(rich);
        codes.addAll(0, rich);

        List<String> current = prefs.countries();
        String[] labels = new String[codes.size()];
        boolean[] checked = new boolean[codes.size()];
        for (int i = 0; i < codes.size(); i++) {
            String c = codes.get(i);
            labels[i] = flag(c) + "  " + Classifier.countryName(c) + (rich.contains(c) ? "  ★" : "");
            checked[i] = current.contains(c);
        }
        new AlertDialog.Builder(this)
            .setTitle("Block content from")
            .setMultiChoiceItems(labels, checked, (d, which, isChecked) -> checked[which] = isChecked)
            .setPositiveButton("Save", (d, w) -> {
                List<String> out = new ArrayList<>();
                for (int i = 0; i < codes.size(); i++) if (checked[i]) out.add(codes.get(i));
                prefs.setCountries(out);
                render();
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private boolean serviceEnabled() {
        String enabled = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (TextUtils.isEmpty(enabled)) return false;
        String me = new ComponentName(this, GeoNoService.class).flattenToString();
        String meShort = new ComponentName(this, GeoNoService.class).flattenToShortString();
        for (String s : enabled.split(":")) if (s.equalsIgnoreCase(me) || s.equalsIgnoreCase(meShort)) return true;
        return false;
    }
}
