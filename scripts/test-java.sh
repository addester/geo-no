#!/usr/bin/env bash
# Runs the shared detection cases against the Android app's Java classifier (needs only a JDK).
set -euo pipefail
cd "$(dirname "$0")/.."
out=$(mktemp -d)
javac -encoding UTF-8 -d "$out" \
  android/app/src/main/java/io/github/addester/geono/Classifier.java \
  android/app/src/test/java/io/github/addester/geono/ClassifierCases.java
java -Dfile.encoding=UTF-8 -cp "$out" io.github.addester.geono.ClassifierCases tests/cases.json
