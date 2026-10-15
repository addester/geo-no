package io.github.addester.geono;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Reads the text Instagram Reels / YouTube Shorts show on screen (caption, account name, audio
 * name, hashtags), runs the classifier on the phone, and skips or covers matches.
 * Nothing leaves the phone: there are no network requests at all.
 */
public class GeoNoService extends AccessibilityService {

    static final String IG = "com.instagram.android";
    static final String YT = "com.google.android.youtube";

    // Resource-id fragments of the full-screen Reels / Shorts players.
    private static final String[] IG_PLAYER_IDS = {"clips_viewer", "clips_video", "clips_item", "clips_tab"};
    private static final String[] YT_PLAYER_IDS = {"reel_recycler", "reel_player", "reel_watch", "shorts_player"};

    // On-screen labels that say nothing about where a video is from.
    private static final Set<String> UI_WORDS = new HashSet<>(Arrays.asList(
        "like", "likes", "comment", "comments", "share", "send", "save", "remix", "more", "follow", "following",
        "subscribe", "subscribed", "reels", "shorts", "original audio", "audio", "home", "search", "explore",
        "profile", "dislike", "camera", "back", "more options", "play", "pause", "mute", "unmute", "sound off",
        "sound on", "sponsored", "see translation", "view all", "add comment", "reply", "repost", "you",
        "subscriptions", "library", "create", "suggested for you", "...", "more actions", "video"));
    private static final Pattern COUNTER = Pattern.compile("^[\\d.,]+\\s*[kmbKMB]?$|^\\d+[smhdw]$|^\\d+:\\d+$");
    private static final Pattern HANDLE = Pattern.compile("^@?[A-Za-z0-9._]{2,30}$");

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable scan = this::scan;
    private Prefs prefs;
    private WindowManager wm;

    private String lastFingerprint = "";
    private final Set<String> shownAnyway = new HashSet<>();
    private long lastSwipe = 0, lastDiag = 0;

    private View blockView, toastView;
    private final Runnable hideToast = this::removeToast;
    private AudioManager.OnAudioFocusChangeListener focusListener;

    @Override
    protected void onServiceConnected() {
        prefs = new Prefs(this);
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e.getPackageName() == null) return;
        String pkg = e.getPackageName().toString();
        if (!IG.equals(pkg) && !YT.equals(pkg)) return;
        handler.removeCallbacks(scan);
        handler.postDelayed(scan, 350); // wait for the scroll / new Reel to settle
    }

    @Override public void onInterrupt() { }

    @Override
    public void onDestroy() {
        removeBlock();
        removeToast();
        super.onDestroy();
    }

    // ---------------------------------------------------------------------------------------
    private void scan() {
        if (prefs == null) prefs = new Prefs(this);
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null) return;
        String pkg = root.getPackageName().toString();
        if (pkg.equals(getPackageName())) return; // our own cover is on top; leave it alone
        boolean isIg = IG.equals(pkg);
        if (!isIg && !YT.equals(pkg)) { removeBlock(); return; }
        if (!prefs.enabled() || (isIg && !prefs.instagram()) || (!isIg && !prefs.youtube())
            || prefs.countries().isEmpty()) { removeBlock(); return; }

        Rect screen = new Rect();
        root.getBoundsInScreen(screen);

        // 1) Are we in the full-screen Reels / Shorts player?
        AccessibilityNodeInfo player = findPlayer(root, isIg ? IG_PLAYER_IDS : YT_PLAYER_IDS, screen);
        if (player == null) {
            removeBlock();
            lastFingerprint = "";
            diag(pkg, "not a " + (isIg ? "Reels" : "Shorts") + " screen. ids: " + sampleIds(root));
            return;
        }

        // 2) Read the visible text of the current Reel / Short.
        List<String> texts = new ArrayList<>();
        String handle = collectTexts(player, screen, texts, isIg);
        if (texts.isEmpty()) return;
        String joined = String.join("\n", texts);
        String fingerprint = pkg + "|" + handle + "|" + joined.substring(0, Math.min(140, joined.length()));
        if (fingerprint.equals(lastFingerprint)) return;
        lastFingerprint = fingerprint;
        removeBlock();
        if (shownAnyway.contains(fingerprint)) return;

        // 3) Judge it.
        String key = handle.isEmpty() ? "" : (isIg ? "ig:" : "yt:") + handle.toLowerCase(Locale.ROOT);
        Classifier.Verdict v;
        if (!key.isEmpty() && prefs.allowed().contains(key)) {
            v = new Classifier.Verdict();
            v.reasons.add("on your allow list");
        } else {
            Classifier.Meta meta = new Classifier.Meta();
            meta.title = joined;
            meta.channelTitle = handle;
            v = Classifier.classify(meta, prefs.countries(), prefs.sensitivity());
        }
        prefs.count(v.block);
        diag(pkg, (v.block ? "BLOCKED " : "allowed ") + v.score + " " + String.join(" · ", v.reasons)
            + "\naccount: " + handle + "\ntext: " + joined.substring(0, Math.min(300, joined.length())));
        if (!v.block) return;

        String where = v.country != null ? "from " + Classifier.countryName(v.country) : "blocked";
        String noun = isIg ? "Reel" : "Short";
        if ("skip".equals(prefs.mode())) {
            swipeToNext(screen);
            showToast("Skipped a " + noun + " " + where, key, handle);
        } else {
            showBlock(noun, where, String.join(" · ", v.reasons), key, handle, fingerprint, screen);
        }
    }

    private static boolean idMatches(String id, String[] frags) {
        if (id == null) return false;
        for (String f : frags) if (id.contains(f)) return true;
        return false;
    }

    /** Largest visible node whose id looks like the Reels/Shorts player and fills most of the screen. */
    private static AccessibilityNodeInfo findPlayer(AccessibilityNodeInfo root, String[] frags, Rect screen) {
        ArrayDeque<AccessibilityNodeInfo> q = new ArrayDeque<>();
        q.add(root);
        int seen = 0;
        Rect r = new Rect();
        while (!q.isEmpty() && seen++ < 3000) {
            AccessibilityNodeInfo n = q.poll();
            if (n == null) continue;
            if (idMatches(n.getViewIdResourceName(), frags) && n.isVisibleToUser()) {
                n.getBoundsInScreen(r);
                if (r.height() >= screen.height() * 0.6 && r.width() >= screen.width() * 0.8) return n;
            }
            for (int i = 0; i < n.getChildCount(); i++) q.add(n.getChild(i));
        }
        return null;
    }

    /** Collects useful on-screen strings; returns the account handle if one is spotted. */
    private static String collectTexts(AccessibilityNodeInfo player, Rect screen, List<String> out, boolean isIg) {
        LinkedHashSet<String> texts = new LinkedHashSet<>();
        String handle = "";
        ArrayDeque<AccessibilityNodeInfo> q = new ArrayDeque<>();
        q.add(player);
        Rect r = new Rect();
        int seen = 0, total = 0;
        while (!q.isEmpty() && seen++ < 2000 && total < 1500) {
            AccessibilityNodeInfo n = q.poll();
            if (n == null) continue;
            n.getBoundsInScreen(r);
            if (n.isVisibleToUser() && Rect.intersects(r, screen)) {
                for (CharSequence cs : new CharSequence[]{n.getText(), n.getContentDescription()}) {
                    if (cs == null) continue;
                    String s = cs.toString().trim();
                    String low = s.toLowerCase(Locale.ROOT);
                    if (s.length() < 2 || UI_WORDS.contains(low) || COUNTER.matcher(s).matches()) continue;
                    if (low.startsWith("like") || low.startsWith("comment") || low.startsWith("share")) continue;
                    if (handle.isEmpty() && HANDLE.matcher(s).matches() && s.matches(".*[A-Za-z].*")
                        && (isIg || s.startsWith("@"))) {
                        handle = s.startsWith("@") && isIg ? s.substring(1) : s;
                    }
                    if (texts.add(s)) total += s.length();
                }
            }
            for (int i = 0; i < n.getChildCount(); i++) q.add(n.getChild(i));
        }
        out.addAll(texts);
        return handle;
    }

    private static String sampleIds(AccessibilityNodeInfo root) {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        ArrayDeque<AccessibilityNodeInfo> q = new ArrayDeque<>();
        q.add(root);
        int seen = 0;
        while (!q.isEmpty() && seen++ < 1500 && ids.size() < 40) {
            AccessibilityNodeInfo n = q.poll();
            if (n == null) continue;
            String id = n.getViewIdResourceName();
            if (id != null) ids.add(id.substring(id.indexOf('/') + 1));
            for (int i = 0; i < n.getChildCount(); i++) q.add(n.getChild(i));
        }
        return String.join(", ", ids);
    }

    private void diag(String pkg, String text) {
        long now = SystemClock.elapsedRealtime();
        if (text.startsWith("not a") && now - lastDiag < 3000) return;
        lastDiag = now;
        prefs.setLastCheck((IG.equals(pkg) ? "Instagram" : "YouTube") + ": " + text);
    }

    // ---------------------------------------------------------------------------------------
    private void swipeToNext(Rect screen) {
        long now = SystemClock.elapsedRealtime();
        if (now - lastSwipe < 700) return;
        lastSwipe = now;
        float x = screen.centerX();
        Path path = new Path();
        path.moveTo(x, screen.top + screen.height() * 0.78f);
        path.lineTo(x, screen.top + screen.height() * 0.22f);
        GestureDescription g = new GestureDescription.Builder()
            .addStroke(new GestureDescription.StrokeDescription(path, 0, 220)).build();
        dispatchGesture(g, null, null);
    }

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private Button pill(String label, boolean primary) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(15);
        b.setTextColor(primary ? Color.rgb(15, 15, 15) : Color.WHITE);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(22));
        if (primary) bg.setColor(Color.WHITE);
        else { bg.setColor(Color.TRANSPARENT); bg.setStroke(dp(1), Color.argb(90, 255, 255, 255)); }
        b.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(240), dp(44));
        lp.topMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    private TextView label(String s, float size, int alpha) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(size);
        t.setTextColor(Color.argb(alpha, 255, 255, 255));
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(4), 0, dp(4));
        return t;
    }

    /** Full-screen cover with Next / Show anyway / Allow this account. */
    private void showBlock(String noun, String where, String why, String key, String handle, String fp, Rect screen) {
        removeBlock();
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.argb(250, 15, 15, 15));
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(dp(24), dp(24), dp(24), dp(24));
        TextView title = label("Hidden: " + where, 20, 255);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        card.addView(title);
        card.addView(label(why, 12, 180));
        if (!handle.isEmpty()) card.addView(label(handle, 14, 220));
        Button next = pill("Next " + noun, true);
        Button show = pill("Show anyway", false);
        card.addView(next);
        card.addView(show);
        Button allow = null;
        if (!key.isEmpty()) { allow = pill("Allow this account", false); card.addView(allow); }
        frame.addView(card, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        next.setOnClickListener(v -> { removeBlock(); handler.postDelayed(() -> swipeToNext(screen), 120); });
        show.setOnClickListener(v -> { shownAnyway.add(fp); removeBlock(); });
        if (allow != null) allow.setOnClickListener(v -> { prefs.allow(key); shownAnyway.add(fp); removeBlock(); });

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.TRANSLUCENT);
        try { wm.addView(frame, lp); blockView = frame; } catch (Exception ignored) { }
        pauseAudio(true);
    }

    private void removeBlock() {
        if (blockView != null) {
            try { wm.removeView(blockView); } catch (Exception ignored) { }
            blockView = null;
            pauseAudio(false);
        }
    }

    /** Asking for audio focus makes Instagram / YouTube pause while the cover is shown. */
    @SuppressWarnings("deprecation")
    private void pauseAudio(boolean pause) {
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        if (pause) {
            if (focusListener == null) focusListener = change -> { };
            am.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        } else if (focusListener != null) {
            am.abandonAudioFocus(focusListener);
        }
    }

    /** Small note at the bottom after a skip, with an "Allow" undo. */
    private void showToast(String text, String key, String handle) {
        removeToast();
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(16), dp(8), dp(8), dp(8));
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(10));
        bg.setColor(Color.rgb(33, 33, 33));
        bar.setBackground(bg);
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(Color.WHITE);
        t.setTextSize(14);
        bar.addView(t);
        if (!key.isEmpty()) {
            Button b = new Button(this);
            b.setText("Allow " + handle);
            b.setAllCaps(false);
            b.setTextColor(Color.rgb(62, 166, 255));
            b.setBackgroundColor(Color.TRANSPARENT);
            b.setOnClickListener(v -> { prefs.allow(key); removeToast(); });
            bar.addView(b);
        }
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        lp.y = dp(96);
        try { wm.addView(bar, lp); toastView = bar; } catch (Exception ignored) { }
        handler.removeCallbacks(hideToast);
        handler.postDelayed(hideToast, 4000);
    }

    private void removeToast() {
        if (toastView != null) {
            try { wm.removeView(toastView); } catch (Exception ignored) { }
            toastView = null;
        }
    }
}
