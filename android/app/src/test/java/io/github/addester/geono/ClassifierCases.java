package io.github.addester.geono;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Runs tests/cases.json (shared with the browser extension) against the Java classifier.
 * Plain main() so it needs nothing but a JDK:  bash scripts/test-java.sh
 */
public final class ClassifierCases {

    public static void main(String[] args) throws Exception {
        String path = args.length > 0 ? args[0] : "tests/cases.json";
        String json = new String(Files.readAllBytes(Paths.get(path)), StandardCharsets.UTF_8);
        @SuppressWarnings("unchecked")
        List<Object> cases = (List<Object>) new Json(json).value();

        int fail = 0;
        for (Object o : cases) {
            @SuppressWarnings("unchecked") Map<String, Object> c = (Map<String, Object>) o;
            @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) c.get("meta");
            Classifier.Meta meta = new Classifier.Meta();
            meta.title = (String) m.get("title");
            meta.description = (String) m.get("description");
            meta.channelTitle = (String) m.get("channelTitle");
            meta.channelDescription = (String) m.get("channelDescription");
            meta.channelCountry = (String) m.get("channelCountry");
            meta.audioLanguage = (String) m.get("audioLanguage");
            meta.defaultLanguage = (String) m.get("defaultLanguage");
            meta.location = (String) m.get("location");
            meta.audioTitle = (String) m.get("audioTitle");
            @SuppressWarnings("unchecked") List<String> countries = c.containsKey("countries")
                ? (List<String>) (List<?>) c.get("countries") : Collections.singletonList("IN");
            String sens = c.containsKey("sensitivity") ? (String) c.get("sensitivity") : "medium";

            Classifier.Verdict v = Classifier.classify(meta, countries, sens);
            boolean want = (Boolean) c.get("block");
            boolean ok = v.block == want;
            if (!ok) fail++;
            System.out.printf("%s %-34s %s %s %s%n", ok ? "ok  " : "FAIL", c.get("name"), v.block, v.score,
                String.join(" | ", v.reasons));
        }
        System.out.println(fail > 0 ? fail + " FAILED" : "all " + cases.size() + " passed");
        if (fail > 0) System.exit(1);
    }

    /** Minimal JSON reader: objects, arrays, strings, booleans, numbers, null. */
    static final class Json {
        private final String s;
        private int i;
        Json(String s) { this.s = s; }

        Object value() {
            ws();
            char c = s.charAt(i);
            if (c == '{') return obj();
            if (c == '[') return arr();
            if (c == '"') return str();
            if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i)) { i += 4; return null; }
            int st = i;
            while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            return Double.parseDouble(s.substring(st, i));
        }

        private Map<String, Object> obj() {
            Map<String, Object> m = new LinkedHashMap<>();
            i++; ws();
            if (s.charAt(i) == '}') { i++; return m; }
            while (true) {
                ws(); String k = str(); ws(); i++; // ':'
                m.put(k, value()); ws();
                if (s.charAt(i++) == '}') return m;
            }
        }

        private List<Object> arr() {
            List<Object> a = new ArrayList<>();
            i++; ws();
            if (s.charAt(i) == ']') { i++; return a; }
            while (true) {
                a.add(value()); ws();
                if (s.charAt(i++) == ']') return a;
            }
        }

        private String str() {
            StringBuilder b = new StringBuilder();
            i++;
            while (true) {
                char c = s.charAt(i++);
                if (c == '"') return b.toString();
                if (c == '\\') {
                    char e = s.charAt(i++);
                    switch (e) {
                        case 'n': b.append('\n'); break;
                        case 't': b.append('\t'); break;
                        case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                        default: b.append(e);
                    }
                } else b.append(c);
            }
        }

        private void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }
    }
}
