#!/bin/sh
# Run this ONCE after cloning the repo to generate the gradle-wrapper.jar
# Requires Java 17 to be installed
set -e

echo "Generating gradle-wrapper.jar..."

# Download Gradle 8.6 if not cached
GRADLE_HOME="${HOME}/.gradle/wrapper/dists/gradle-8.6-bin"
GRADLE_ZIP="${GRADLE_HOME}/gradle-8.6-bin.zip"
GRADLE_EXEC="${GRADLE_HOME}/gradle-8.6/bin/gradle"

if [ ! -f "${GRADLE_EXEC}" ]; then
  echo "Downloading Gradle 8.6..."
  mkdir -p "${GRADLE_HOME}"
  curl -L "https://services.gradle.org/distributions/gradle-8.6-bin.zip" \
    -o "${GRADLE_ZIP}"
  cd "${GRADLE_HOME}"
  unzip -q "${GRADLE_ZIP}"
  rm "${GRADLE_ZIP}"
fi

# Use Gradle to generate the wrapper jar
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${SCRIPT_DIR}"
"${GRADLE_EXEC}" wrapper --gradle-version=8.6 --distribution-type=bin

echo "Done. gradle-wrapper.jar is now in gradle/wrapper/"
