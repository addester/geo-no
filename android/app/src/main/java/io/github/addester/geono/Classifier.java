package io.github.addester.geono;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Geo No origin classifier – Java port of extension/classifier.js.
 * Pure Java (no Android APIs) so it can be tested on any JVM.
 * Keep it in step with the JS version; both run the cases in tests/cases.json.
 */
public final class Classifier {

    /** What we know about one Short / Reel. Any field may be null. */
    public static final class Meta {
        public String title, description, channelTitle, channelDescription, channelCountry;
        public String audioLanguage, defaultLanguage, location, audioTitle;
        public List<String> tags = new ArrayList<>();
    }

    public static final class Verdict {
        public boolean block;
        public String country;   // ISO code or null
        public double score;
        public List<String> reasons = new ArrayList<>();
    }

    // ---------- scripts ----------
    private static final Map<String, Pattern> SCRIPTS = new LinkedHashMap<>();
    static {
        SCRIPTS.put("devanagari", Pattern.compile("[ऀ-ॿ]"));
        SCRIPTS.put("bengali", Pattern.compile("[ঀ-৿]"));
        SCRIPTS.put("gurmukhi", Pattern.compile("[਀-੿]"));
        SCRIPTS.put("gujarati", Pattern.compile("[઀-૿]"));
        SCRIPTS.put("oriya", Pattern.compile("[଀-୿]"));
        SCRIPTS.put("tamil", Pattern.compile("[஀-௿]"));
        SCRIPTS.put("telugu", Pattern.compile("[ఀ-౿]"));
        SCRIPTS.put("kannada", Pattern.compile("[ಀ-೿]"));
        SCRIPTS.put("malayalam", Pattern.compile("[ഀ-ൿ]"));
        SCRIPTS.put("sinhala", Pattern.compile("[඀-෿]"));
        SCRIPTS.put("urdu", Pattern.compile("[ٹڈڑںھےۓ]"));
        SCRIPTS.put("thai", Pattern.compile("[฀-๿]"));
        SCRIPTS.put("hangul", Pattern.compile("[가-힯ᄀ-ᇿ]"));
        SCRIPTS.put("kana", Pattern.compile("[぀-ヿ]"));
        SCRIPTS.put("hebrew", Pattern.compile("[֐-׿]"));
        SCRIPTS.put("georgian", Pattern.compile("[Ⴀ-ჿ]"));
        SCRIPTS.put("armenian", Pattern.compile("[԰-֏]"));
        SCRIPTS.put("khmer", Pattern.compile("[ក-៿]"));
        SCRIPTS.put("lao", Pattern.compile("[຀-໿]"));
        SCRIPTS.put("myanmar", Pattern.compile("[က-႟]"));
        SCRIPTS.put("ethiopic", Pattern.compile("[ሀ-፿]"));
    }

    private static final Set<String> HINGLISH = new HashSet<>(Arrays.asList((
        "bhai bhaiya bhabhi yaar yr kya kyu kyun kyon hai hain nahi nahin nhi bhi kaise kaisa " +
        "kab kaha kahan accha acha achha bahut bohot bht mera meri mere tera teri tere apna apni " +
        "humara hamara tumhara aap aapka aapke abhi sab sabko kuch kuchh dekho dekh suno chalo " +
        "karo karna kar raha rahi rahe tha thi wala wali wale ladka ladki paisa paise pyaar pyar " +
        "dost dil zindagi jaldi bilkul matlab samjha samajh pata log logo ghar khana desi " +
        "mummy papa didi beta ji jee haan nahi sirf bas toh lekin agar jab phir fir bahot " +
        "shaadi shadi saal din raat subah naya purana sasta mehnga bachpan").split("\\s+")));

    /** Country profile: scripts / audio weights, hinglish weight, keywords. */
    private static final class Profile {
        final Map<String, Double> scripts = new LinkedHashMap<>();
        final Map<String, Double> audio = new LinkedHashMap<>();
        double hinglish = 0;
        final List<String> keywords = new ArrayList<>();

        Profile s(String k, double w) { scripts.put(k, w); return this; }
        Profile a(String k, double w) { audio.put(k, w); return this; }
        Profile h(double w) { hinglish = w; return this; }
        Profile k(String words) { keywords.addAll(Arrays.asList(words.trim().split("\\s+"))); return this; }
    }

    public static final Map<String, Profile> PROFILES = new HashMap<>();
    static {
        PROFILES.put("IN", new Profile()
            .s("devanagari", 0.8).s("gujarati", 0.95).s("oriya", 0.95).s("telugu", 0.95).s("kannada", 0.95)
            .s("malayalam", 0.95).s("gurmukhi", 0.75).s("tamil", 0.8).s("bengali", 0.5)
            .a("hi", 0.9).a("mr", 0.95).a("gu", 0.95).a("te", 0.95).a("kn", 0.95).a("ml", 0.95).a("or", 0.95)
            .a("as", 0.9).a("ta", 0.8).a("pa", 0.65).a("bn", 0.5).a("ur", 0.25)
            .h(0.75)
            .k("india indian bharat hindustan desi bollywood tollywood kollywood mollywood sandalwood hindi " +
               "tamil telugu marathi punjabi gujarati bengali kannada malayalam mumbai delhi newdelhi bangalore " +
               "bengaluru hyderabad chennai kolkata pune jaipur ahmedabad lucknow kanpur nagpur indore bhopal " +
               "patna raipur surat goa kerala rajasthan gujarat maharashtra bihar punjab uttarpradesh up mp " +
               "chhattisgarh odisha assam ipl diwali holi navratri ganpati rupees crore lakh jugaad jaihind modi " +
               "chai chaiwala paneer biryani samosa vadapav panipuri golgappa dosa upsc jee neet iit cbse"));
        PROFILES.put("PK", new Profile().s("urdu", 0.9).s("gurmukhi", 0.1)
            .a("ur", 0.85).a("pa", 0.3).a("sd", 0.8).a("ps", 0.5).h(0.3)
            .k("pakistan pakistani karachi lahore islamabad rawalpindi peshawar quetta multan faisalabad psl urdu sindhi"));
        PROFILES.put("BD", new Profile().s("bengali", 0.5).a("bn", 0.5)
            .k("bangladesh bangladeshi dhaka chittagong sylhet bangla"));
        PROFILES.put("NP", new Profile().s("devanagari", 0.25).a("ne", 0.95).k("nepal nepali kathmandu pokhara"));
        PROFILES.put("LK", new Profile().s("sinhala", 0.95).s("tamil", 0.2).a("si", 0.95).k("srilanka srilankan colombo kandy"));
        PROFILES.put("TH", new Profile().s("thai", 0.9).a("th", 0.9).k("thailand thai bangkok"));
        PROFILES.put("KR", new Profile().s("hangul", 0.85).a("ko", 0.85).k("korea korean seoul kpop"));
        PROFILES.put("JP", new Profile().s("kana", 0.85).a("ja", 0.9).k("japan japanese tokyo osaka"));
        PROFILES.put("IL", new Profile().s("hebrew", 0.85).a("he", 0.9).a("iw", 0.9).k("israel telaviv"));
        PROFILES.put("GE", new Profile().s("georgian", 0.95).a("ka", 0.95).k("georgia tbilisi"));
        PROFILES.put("AM", new Profile().s("armenian", 0.9).a("hy", 0.9).k("armenia yerevan"));
        PROFILES.put("KH", new Profile().s("khmer", 0.95).a("km", 0.95).k("cambodia phnompenh"));
        PROFILES.put("LA", new Profile().s("lao", 0.95).a("lo", 0.95).k("laos vientiane"));
        PROFILES.put("MM", new Profile().s("myanmar", 0.95).a("my", 0.95).k("myanmar yangon"));
        PROFILES.put("ET", new Profile().s("ethiopic", 0.85).a("am", 0.9).k("ethiopia addisababa"));
    }

    public static final Map<String, Double> THRESHOLDS = new HashMap<>();
    static {
        THRESHOLDS.put("low", 0.85);
        THRESHOLDS.put("medium", 0.7);
        THRESHOLDS.put("high", 0.5);
    }

    private Classifier() {}

    public static String countryName(String code) {
        String n = new Locale("", code).getDisplayCountry(Locale.ENGLISH);
        return n == null || n.isEmpty() ? code : n;
    }

    static String squash(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static final Pattern WORD = Pattern.compile("[a-z]+");
    static List<String> tokenize(String text) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;
        Matcher m = WORD.matcher(text.toLowerCase(Locale.ROOT));
        while (m.find()) out.add(m.group());
        return out;
    }

    private static final Pattern HASHTAG = Pattern.compile("#[\\p{L}\\p{N}_]+");
    static List<String> hashtags(String text) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;
        Matcher m = HASHTAG.matcher(text.toLowerCase(Locale.ROOT));
        while (m.find()) out.add(m.group().substring(1).replace("_", ""));
        return out;
    }

    static int countScript(String text, Pattern p) {
        if (text == null) return 0;
        int n = 0;
        Matcher m = p.matcher(text);
        while (m.find()) n++;
        return n;
    }

    /** Noisy-OR combination of independent evidence. */
    static double combine(List<Double> strengths) {
        double acc = 1;
        for (double s : strengths) acc *= (1 - Math.max(0, Math.min(1, s)));
        return 1 - acc;
    }

    private static String joinNonEmpty(String sep, String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p == null || p.isEmpty()) continue;
            if (sb.length() > 0) sb.append(sep);
            sb.append(p);
        }
        return sb.toString();
    }

    private static final class Score {
        double score;
        List<String> reasons = new ArrayList<>();
    }

    static Score contentScore(Meta meta, String country) {
        Profile profile = PROFILES.get(country);
        if (profile == null) profile = new Profile();
        Score out = new Score();
        List<Double> strengths = new ArrayList<>();
        String tagsJoined = String.join(" ", meta.tags);

        String text = joinNonEmpty("\n", meta.title, meta.description, meta.channelTitle,
            meta.channelDescription, tagsJoined, meta.location, meta.audioTitle);

        // 1) Scripts
        for (Map.Entry<String, Double> e : profile.scripts.entrySet()) {
            int n = countScript(text, SCRIPTS.get(e.getKey()));
            if (n >= 2) {
                strengths.add(e.getValue() * Math.min(1, n / 6.0));
                out.reasons.add(e.getKey() + " script (" + n + " chars)");
            }
        }

        // 2) Audio / default language
        Set<String> seenLang = new HashSet<>();
        for (String l : new String[]{meta.audioLanguage, meta.defaultLanguage}) {
            if (l == null || l.isEmpty()) continue;
            String code = l.toLowerCase(Locale.ROOT).split("[-_]")[0];
            if (!seenLang.add(code)) continue;
            Double w = profile.audio.get(code);
            if (w != null) { strengths.add(w); out.reasons.add("language: " + code); }
        }

        // 3) Romanised Hindi/Urdu
        if (profile.hinglish > 0) {
            List<String> toks = tokenize(joinNonEmpty(" ", meta.title, meta.description, tagsJoined));
            List<String> hits = new ArrayList<>();
            for (String t : toks) if (HINGLISH.contains(t)) hits.add(t);
            Set<String> distinct = new LinkedHashSet<>(hits);
            if (distinct.size() >= 2) {
                double ratio = hits.size() / (double) Math.max(toks.size(), 1);
                strengths.add(profile.hinglish * Math.min(1, distinct.size() / 3.0 + ratio));
                List<String> shown = new ArrayList<>(distinct);
                out.reasons.add("Hinglish words: " + String.join(", ", shown.subList(0, Math.min(4, shown.size()))));
            }
        }

        // 4) Hashtags / keywords (incl. the country's own name)
        Set<String> kw = new LinkedHashSet<>();
        for (String k : profile.keywords) kw.add(squash(k));
        kw.add(squash(countryName(country)));
        Set<String> tags = new LinkedHashSet<>(hashtags(text));
        for (String t : meta.tags) tags.add(squash(t));
        Set<String> tokenSet = new HashSet<>(tokenize(text));
        List<String> tagHits = new ArrayList<>();
        for (String t : tags) {
            boolean hit = kw.contains(t);
            if (!hit) for (String k : kw) if (k.length() >= 5 && t.contains(k)) { hit = true; break; }
            if (hit) tagHits.add(t);
        }
        List<String> wordHits = new ArrayList<>();
        for (String k : kw) if (k.length() >= 4 && tokenSet.contains(k) && !tagHits.contains(k)) wordHits.add(k);
        if (!tagHits.isEmpty()) {
            strengths.add(Math.min(0.85, 0.5 + 0.15 * tagHits.size()));
            out.reasons.add("hashtags: #" + String.join(" #", tagHits.subList(0, Math.min(3, tagHits.size()))));
        }
        if (!wordHits.isEmpty()) {
            strengths.add(Math.min(0.6, 0.3 + 0.1 * wordHits.size()));
            out.reasons.add("mentions: " + String.join(", ", wordHits.subList(0, Math.min(3, wordHits.size()))));
        }

        // 5) Tagged location
        if (meta.location != null && !meta.location.isEmpty()) {
            Set<String> locToks = new HashSet<>(tokenize(meta.location));
            String locSquash = squash(meta.location);
            for (String k : kw) {
                if ((k.length() >= 4 && locToks.contains(k)) || (k.length() >= 6 && locSquash.contains(k))) {
                    strengths.add(0.85);
                    String loc = meta.location;
                    out.reasons.add("location: " + (loc.length() > 40 ? loc.substring(0, 40) : loc));
                    break;
                }
            }
        }

        out.score = combine(strengths);
        return out;
    }

    /** Main entry point. countries = ISO codes to block; sensitivity = low | medium | high. */
    public static Verdict classify(Meta meta, List<String> countries, String sensitivity) {
        Double th = THRESHOLDS.get(sensitivity);
        double threshold = th == null ? THRESHOLDS.get("medium") : th;
        String declared = meta.channelCountry == null || meta.channelCountry.isEmpty()
            ? null : meta.channelCountry.toUpperCase(Locale.ROOT);

        Verdict best = new Verdict();
        for (String raw : countries) {
            String c = raw.toUpperCase(Locale.ROOT);
            if (c.equals(declared)) {
                Verdict v = new Verdict();
                v.block = true; v.country = c; v.score = 1;
                v.reasons.add("channel country is " + countryName(c));
                return v;
            }
            Score s = contentScore(meta, c);
            double score = s.score;
            List<String> reasons = s.reasons;
            if (declared != null && score > 0) {
                score *= 0.5;
                reasons.add("but channel country is " + countryName(declared));
            }
            if (score > best.score) {
                best = new Verdict();
                best.country = c; best.score = score; best.reasons = reasons;
            }
        }
        best.block = best.score >= threshold;
        best.score = Math.round(best.score * 100) / 100.0;
        return best;
    }
}
