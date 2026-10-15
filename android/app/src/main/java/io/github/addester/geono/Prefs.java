package io.github.addester.geono;

import android.content.Context;
import android.content.SharedPreferences;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** All settings and counters, stored on the phone only. */
public final class Prefs {
    private final SharedPreferences p;

    public Prefs(Context c) { p = c.getSharedPreferences("geono", Context.MODE_PRIVATE); }

    public boolean enabled() { return p.getBoolean("enabled", true); }
    public void setEnabled(boolean v) { p.edit().putBoolean("enabled", v).apply(); }

    public boolean instagram() { return p.getBoolean("instagram", true); }
    public void setInstagram(boolean v) { p.edit().putBoolean("instagram", v).apply(); }

    public boolean youtube() { return p.getBoolean("youtube", true); }
    public void setYoutube(boolean v) { p.edit().putBoolean("youtube", v).apply(); }

    /** "skip" or "blur" */
    public String mode() { return p.getString("mode", "skip"); }
    public void setMode(String v) { p.edit().putString("mode", v).apply(); }

    /** "low" | "medium" | "high" */
    public String sensitivity() { return p.getString("sensitivity", "medium"); }
    public void setSensitivity(String v) { p.edit().putString("sensitivity", v).apply(); }

    public List<String> countries() {
        String s = p.getString("countries", "IN");
        List<String> out = new ArrayList<>();
        for (String c : s.split(",")) if (!c.trim().isEmpty()) out.add(c.trim());
        return out;
    }
    public void setCountries(List<String> list) { p.edit().putString("countries", String.join(",", list)).apply(); }

    /** Allowed accounts, keys like "ig:username" or "yt:@handle". */
    public Set<String> allowed() { return new HashSet<>(p.getStringSet("allowed", new HashSet<>())); }
    public void allow(String key) { Set<String> s = allowed(); s.add(key); p.edit().putStringSet("allowed", s).apply(); }
    public void disallow(String key) { Set<String> s = allowed(); s.remove(key); p.edit().putStringSet("allowed", s).apply(); }

    // ---------- daily counters ----------
    private static String today() { return new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date()); }

    public int[] stats() { // {checked, blocked}
        if (!today().equals(p.getString("statsDate", ""))) return new int[]{0, 0};
        return new int[]{p.getInt("checked", 0), p.getInt("blocked", 0)};
    }

    public void count(boolean blocked) {
        int[] s = stats();
        p.edit().putString("statsDate", today())
            .putInt("checked", s[0] + 1)
            .putInt("blocked", s[1] + (blocked ? 1 : 0)).apply();
    }

    // ---------- diagnostics (shown in the app so people can report problems) ----------
    public String lastCheck() { return p.getString("lastCheck", ""); }
    public void setLastCheck(String v) { p.edit().putString("lastCheck", v).apply(); }

    public static List<String> parseList(String csv) { return new ArrayList<>(Arrays.asList(csv.split(","))); }
}
