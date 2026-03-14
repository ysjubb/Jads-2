# JADS Android — One-Time Setup

The project is complete except for one binary file: `gradle/wrapper/gradle-wrapper.jar`.

This is a standard 64KB JAR that Gradle uses to bootstrap itself.
It cannot be committed to source control easily — instead it is generated once
on the developer's machine in 30 seconds.

---

## Step 1 — Prerequisites (check these first)

| Requirement | Version | How to check |
|---|---|---|
| Android Studio | Iguana (2024.1) or newer | Help → About |
| JDK | 17 | `java -version` |
| Android SDK API | 34 | SDK Manager in Android Studio |

If Android Studio isn't installed: https://developer.android.com/studio

---

## Step 2 — Generate the wrapper JAR (one command)

Open a terminal, `cd` to the `jads-android/` folder, then run:

**Option A — if Gradle is installed on your machine:**
```bash
gradle wrapper --gradle-version 8.6
```

This creates `gradle/wrapper/gradle-wrapper.jar` and sets the version to 8.6.

**Option B — if Gradle is NOT installed:**
Install it first:
```bash
# macOS
brew install gradle

# Ubuntu/Debian
sudo apt-get install gradle

# Windows
choco install gradle
```
Then run the same command above.

**Option C — let Android Studio do it:**
1. Open Android Studio → File → Open → select the `jads-android/` folder
2. Android Studio detects the missing JAR and shows a "Gradle sync" prompt
3. Click **"Use Gradle wrapper"** — it downloads and generates the JAR automatically

---

## Step 3 — Open and sync in Android Studio

1. File → Open → select `jads-android/`
2. Wait for Gradle sync to complete (downloads ~150MB of libraries on first run — needs internet)
3. Green checkmark in bottom bar = sync successful

---

## Step 4 — Build the debug APK

```
Build → Build Bundle(s) / APK(s) → Build APK(s)
```

Output: `app/build/outputs/apk/debug/app-debug.apk`

---

## If sync fails

**"Gradle JVM not found"** → File → Project Structure → SDK Location → JDK Location → point to JDK 17

**"Could not resolve com.android.tools.build:gradle:8.3.2"** → needs internet to download AGP from Google's Maven

**"Kotlin daemon failed"** → increase heap: `org.gradle.jvmargs=-Xmx4g` is already in `gradle.properties`

---

## What the project compiles to

After a successful build, `app-debug.apk` contains:
- All Kotlin source (MissionController, EcdsaSigner, HashChainEngine, NtpQuorumAuthority, etc.)
- SQLCipher AES-256 encrypted database
- Bouncy Castle ECDSA P-256 with RFC 6979 deterministic nonces
- Apache Commons Net NTP quorum client
- Android Room ORM with KSP-generated code

The app stub starts but shows a blank screen — the 5 UI screens are built in Step 6.
The cryptographic core, database, and mission logic are all wired and ready.
