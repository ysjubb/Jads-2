# JADS Android — Kotlin Developer Brief
## Version 2.1 | 1 March 2026

---

## Your Responsibility

You own everything inside `jads-android/`.
The backend is Node.js/TypeScript — not your concern to write.
Your job is to open this Android project in Android Studio, get it building, and connect it to the backend running on the same laptop.

---

## What Is Already Written

Every Kotlin file is complete. Do not rewrite from scratch.

| Package | Files | What it does |
|---|---|---|
| `com.jads.crypto` | `HashChainEngine.kt`, `EcdsaSigner.kt` | SHA-256 forensic chain, ECDSA P-256 signing via Android Keystore |
| `com.jads.telemetry` | `CanonicalSerializer.kt`, `EndianWriter.kt` | 96-byte fixed-layout payload, big-endian encoding |
| `com.jads.time` | `NtpQuorumAuthority.kt`, `MonotonicClock.kt` | NTP quorum sync (3 servers), monotonic clock with correction |
| `com.jads.drone` | `MissionController.kt`, `NpntComplianceGate.kt`, `GeofenceChecker.kt`, `HardcodedZoneMapAdapter.kt`, `GnssPlausibilityValidator.kt`, `LandingDetector.kt` | Full mission lifecycle, geofence ray-casting, zone classification |
| `com.jads.storage` | `SqlCipherMissionStore.kt`, `JadsDatabase.kt`, `MissionEntity.kt`, `TelemetryRecordEntity.kt`, `ViolationEntity.kt`, `AppPreferences.kt` | SQLCipher-encrypted Room database |
| `com.jads.service` | `MissionForegroundService.kt` | Android foreground service, GPS loop at 1Hz |
| `com.jads.network` | `JadsApiClient.kt`, `MissionUploadService.kt`, `UploadService.kt` | OkHttp backend upload |
| `com.jads.ui.*` | 5 Compose screens + ViewModels | Login, Mission Setup, Active Mission, Mission Complete, History |

---

## Step 1 — Open in Android Studio

1. Open Android Studio (Hedgehog or newer)
2. File → Open → select the `jads-android/` folder
3. Let Gradle sync complete (it will download dependencies)

**If Gradle sync fails:**
```
cd jads-android
./setup-gradle-wrapper.sh    # downloads gradle-wrapper.jar
```
Then re-sync in Android Studio.

---

## Step 2 — Get the Backend Running

The Android app calls `http://10.0.2.2:8080` (emulator) or `http://<laptop-ip>:8080` (physical device).

On the backend laptop:
```bash
cd jads-backend
cp .env.example .env          # edit DATABASE_URL and JWT_SECRET
docker-compose up -d          # starts Postgres on port 5432
npm install
npx prisma migrate dev        # runs migrations
npm run dev                   # backend on port 8080
```

---

## Step 3 — Configure the Backend URL

Edit `app/src/main/kotlin/com/jads/network/JadsApiClient.kt`:
```kotlin
// For emulator:
private const val BASE_URL = "http://10.0.2.2:8080"

// For physical device (replace with your laptop IP):
private const val BASE_URL = "http://192.168.1.x:8080"
```

HTTP (not HTTPS) is explicitly allowed for demo — see `res/xml/network_security_config.xml`.

---

## Step 4 — Build and Install

```bash
./gradlew assembleDebug
# APK at: app/build/outputs/apk/debug/app-debug.apk
```

Or run directly from Android Studio on a connected device or emulator.

**Minimum Android version:** API 26 (Android 8.0)
**Target:** API 34

---

## Step 5 — Run the Unit Tests

```bash
./gradlew test
```

This runs all tests in `app/src/test/kotlin/com/jads/`:
- `stage8-logic-tests.kt` — hash chain, NTP, geofence logic (49 tests)
- `stage9-stress-chaos.kt` — GPS loss, process kill, zone map, chaos (65 tests)
- `drone/GeofenceCheckerTest.kt` — geofence boundary conditions

Expected: all pass, 0 failures.

---

## Critical Implementation Notes

### SQLCipher passphrase
The database is encrypted. The passphrase is derived from the device's Android Keystore.
See `JadsDatabase.kt` for the passphrase derivation.
**Do not hardcode the passphrase.** It must come from Keystore.

### MissionStoreDecryptionError (v2.1 fix)
`SqlCipherMissionStore.getRecords()` now throws `MissionStoreDecryptionError` if SQLCipher
reports a key or schema error — rather than returning an empty list silently.
`MissionController.resumeMission()` catches this and calls `onDecryptionFailure` — wired in
`MissionForegroundService`. **Do not catch and suppress this error.** It means the database
is inaccessible and the mission chain cannot be continued.

### GPS permissions
The app requests `ACCESS_FINE_LOCATION` at runtime on first launch.
If denied, the mission cannot start. This is intentional — no GPS = no telemetry = no chain.

### NTP quorum
`NtpQuorumAuthority` contacts 3 NTP servers: `time.google.com`, `time.cloudflare.com`, `0.in.pool.ntp.org`.
All 3 must respond within 3 seconds. If fewer than 2 respond, `SyncStatus.FAILED` is returned
and `MissionController.startMission()` will block the mission.
**This is not a bug.** It is the forensic integrity requirement.

### ECDSA key
The signing key is generated in Android Keystore on first app launch (`EcdsaSigner.kt`).
On StrongBox-capable devices, it is hardware-backed. The app logs this at startup.
The key alias is `JADS_MISSION_SIGNING_KEY_V1` — do not change this.

---

## What to Verify on First Run

1. App installs without crash
2. Login screen appears
3. GPS permission prompt appears on first mission setup
4. Backend connection: tap "Check Connection" — should show green
5. NTP sync: should show SYNCED with offset <500ms on a normal network
6. Start a test mission: walk around for 30 seconds, stop
7. Upload: tap upload after mission ends
8. Open audit portal at `http://localhost:5174` on laptop — mission should appear

---

## Open Gaps That Are Your Concern

| Gap | Status | What to do |
|---|---|---|
| `gradle-wrapper.jar` | Must run `setup-gradle-wrapper.sh` once | Run the script, commit the jar |
| Physical device GPS test | Not done in container | Must test on real Android hardware |
| E2E chain test (C4-01) | Not done | Android → backend → ForensicVerifier on real device |

---

## Files You Should NOT Modify

- `HashChainEngine.kt` — frozen. Any change breaks cross-runtime hash compatibility with the TypeScript backend.
- `CanonicalSerializer.kt` — frozen. The 96-byte layout is the forensic record format.
- `EndianWriter.kt` — frozen. Big-endian encoding matches backend exactly.

The TypeScript canonical serializer in `jads-backend/src/telemetry/canonicalSerializer.ts`
produces identical output to the Kotlin one. Test vectors in
`jads-backend/src/__tests__/vectors/canonical_test_vectors.json` prove this.

---

## Questions

Bring questions about backend API contracts, forensic verification, or test failures to the project lead.
