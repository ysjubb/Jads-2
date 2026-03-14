# JADS Platform — iDEX Battle Plan

**Date:** 3 March 2026
**Classification:** Internal — Do Not Share
**Objective:** Survive iDEX evaluation. Get a DIO meeting.

---

## PHASE 1 — GET EVERYTHING RUNNING ON YOUR LAPTOP (TODAY → TOMORROW)

### Step 1.1: Start the Database

```bash
cd /home/user/Jads-2/do-not-share
docker-compose up -d
```

Wait for healthcheck to pass:
```bash
docker-compose ps   # should show "healthy"
```

### Step 1.2: Start the Backend

```bash
cd jads-backend
npm install
```

Create `.env` file:
```bash
cat > .env << 'EOF'
DATABASE_URL=postgresql://jads:jads_dev_password@localhost:5432/jads_dev
JWT_SECRET=a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
ADMIN_JWT_SECRET=b4c9d3e2f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2
ADAPTER_INBOUND_KEY=c5d0e4f3a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3
ANCHOR_HMAC_KEY=d6e1f5a4b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4
USE_LIVE_ADAPTERS=false
EOF
```

Run migrations and seed data:
```bash
npx prisma migrate deploy
npx prisma db seed
```

Start the server:
```bash
npm run dev
```

**Verify:** Open `http://localhost:8080/api/system/health` — should return `{ "status": "ok" }`

### Step 1.3: Start the Admin Portal

```bash
cd ../jads-admin-portal
npm install
npm run dev
```

**Verify:** Open `http://localhost:5173` — should show the Admin login page.

Default admin credentials are in `prisma/seed.ts`. Check the seed file for the exact username/password.

### Step 1.4: Start the Audit Portal

```bash
cd ../jads-audit-portal
npm install
npm run dev
```

**Verify:** Open `http://localhost:5174` — should show the Auditor login page.

### Step 1.5: Build the Android App

```bash
cd ../jads-android
```

Open in Android Studio. Requirements:
- Android Studio Hedgehog (2023.1.1) or later
- JDK 17
- Android SDK 34 (API level 34)
- Kotlin 1.9.23

In `local.properties`, ensure your SDK path is set:
```
sdk.dir=/home/user/Android/Sdk
```

Build:
```bash
./gradlew assembleDebug
```

The APK will be at `app/build/outputs/apk/debug/app-debug.apk`.

Install on your phone or emulator:
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

**Configure the app to talk to your laptop's backend:**

Find your laptop's IP on your WiFi network:
```bash
ip addr show wlan0 | grep "inet "
# e.g., 192.168.1.100
```

In the Android app, the backend URL is set via `JADS_BACKEND_URL`. You'll need to update the `JadsApiClient.kt` to point to `http://192.168.1.100:8080` (your laptop's local IP). Your phone and laptop must be on the same WiFi network.

### Step 1.6: Verify Tests Pass

Before demoing, run the full test suite to confirm nothing is broken:
```bash
cd jads-backend
npm test
```

Expected: **545 tests, 19 suites, 0 failures** (including route advisory tests).

Also verify the CI pipeline configuration:
- 7 stages, 26 jobs (including SBOM generation and route advisory tests)
- SBOM artifacts (CycloneDX for npm, Gradle dependency report for Android) are uploaded to CI

### Step 1.7: What "Success" Looks Like for Phase 1

You should have **four terminal windows** running:

| Terminal | Service | URL |
|----------|---------|-----|
| 1 | PostgreSQL (Docker) | port 5432 |
| 2 | Backend API | http://localhost:8080 |
| 3 | Admin Portal | http://localhost:5173 |
| 4 | Audit Portal | http://localhost:5174 |

Plus the Android app running on your phone, connected to the backend.

**Demo flow to verify everything works:**
1. Open Admin Portal → Login → See dashboard with users, airspace zones, drone zones
2. Open Audit Portal → Login → See missions list (may be empty if no missions uploaded)
3. Open Android App → Login → Go to Mission Setup → Enter coordinates (e.g., 28.6139, 77.2090) → Run NPNT Check → See zone classification result
4. Start a mission in the app → See telemetry being recorded → Complete mission → Upload to backend
5. Go back to Audit Portal → See the mission appear → Click it → See the forensic verification report with all 8 invariants

---

## PHASE 2 — FILE A REAL FLIGHT PLAN FROM YOUR APP (DAY AFTER TOMORROW)

You're an IAF pilot. This is the single most devastating demo you can give at iDEX. **No startup in India can demo this.** Here's exactly what to do.

### Step 2.1: Understanding What Your System Already Supports

Your backend has a complete ICAO flight plan filing system at `POST /api/flight-plans`. It:
- Validates all ICAO fields (Item 7 through Item 19)
- Builds a proper AFTN FPL message (per ICAO Doc 4444)
- Generates AFTN addressees based on route
- Has SSE real-time updates for ADC/FIC clearance events
- Supports DLA (delay), CNL (cancel), and CHG (change) messages

The flight plan route is in `flightPlanRoutes.ts`. The validation is in `OfplValidationService.ts`. The AFTN message builder is in `AftnMessageBuilder.ts`.

### Step 2.2: What Constitutes a Valid Flight Plan via Your App

Your system expects ICAO flight plan fields. For a helicopter sortie, you'll file:

```json
{
  "aircraftId": "YOUR_HELICOPTER_TAIL_NUMBER",
  "flightRules": "V",
  "typeOfFlight": "M",
  "number": 1,
  "typeOfAircraft": "H60",
  "wakeTurbulenceCat": "M",
  "equipment": "SDFG/C",
  "departureAerodrome": "VIDP",
  "eobt": "050530",
  "cruisingSpeed": "N0120",
  "cruisingLevel": "A050",
  "route": "DCT DESTINATION",
  "destinationAerodrome": "VIDD",
  "totalEet": "0045",
  "alternateAerodrome": "VIDP",
  "otherInfo": "DOF/260305 RMK/IAF TRAINING SORTIE",
  "endurance": "0300",
  "personsOnBoard": 2,
  "pilotInCommand": "YOUR NAME",
  "item19Remarks": "SAR EQUIPMENT AS PER SOP"
}
```

**Field explanations for your helicopter:**

| Field | Value | Why |
|-------|-------|-----|
| `flightRules` | `"V"` (VFR) or `"I"` (IFR) | Your choice based on sortie type |
| `typeOfFlight` | `"M"` (Military) | You're IAF |
| `typeOfAircraft` | Your helicopter type designator (e.g., `"H60"` for ALH, `"MI17"` for Mi-17, `"C295"` if fixed-wing) | ICAO aircraft type code |
| `wakeTurbulenceCat` | `"M"` (Medium) for most IAF helicopters | ICAO wake turbulence |
| `departureAerodrome` | Your base ICAO code (e.g., `"VIDP"` for Delhi, `"VOBG"` for Bangalore) | 4-letter ICAO |
| `eobt` | `"DDHHmm"` format (e.g., `"050530"` = 5th of month, 0530Z) | Estimated Off-Block Time |
| `cruisingSpeed` | `"N0120"` = 120 knots (typical helo cruise) | ICAO format |
| `cruisingLevel` | `"A050"` = 5000ft altitude, or `"VFR"` | ICAO format |
| `route` | `"DCT WAYPOINT DCT"` or airway names | Your actual route |
| `totalEet` | `"0045"` = 45 minutes | Estimated Elapsed Time |

### Step 2.3: How to Demo This

**Pre-requisites:**
- Backend running on your laptop (Phase 1 complete)
- Your phone with the JADS app on the same network
- You registered as a SpecialUser (military) via the admin portal

**The demo sequence:**

1. **Login to the Android app** as a SpecialUser (military credentials)
2. **Navigate to Flight Plans** (this is currently in the user app — you may need to build this screen, see Step 2.4)
3. **Fill in the flight plan form** with your actual helicopter sortie details
4. **Submit** — the system:
   - Validates all ICAO fields
   - Builds the AFTN FPL message
   - Logs the submission in the audit trail
   - Returns a flight plan ID
5. **Show the AFTN message** that was generated — it follows ICAO Doc 4444 format exactly
6. **Show the SSE stream** — your app is now listening for ADC/FIC numbers
7. (In a separate terminal) **Simulate ADC issuance** via the adapter webhook:
   ```bash
   curl -X POST http://localhost:8080/api/adapter-webhooks/adc \
     -H "Content-Type: application/json" \
     -H "X-JADS-Adapter-Key: YOUR_ADAPTER_KEY" \
     -d '{"flightPlanId": "THE_PLAN_ID", "adcNumber": "ADC/0305/001", "issuedBy": "AFMLU_DELHI"}'
   ```
8. **Show the app receiving the ADC number in real-time** via SSE
9. **File a DLA (delay) message** — demonstrate the delay flow
10. **File a CNL (cancel) message** — demonstrate cancellation

### Step 2.4: What You Need to Build for This Demo

The flight plan filing API is complete. What's missing is the **user-facing screen** in the Android app to file and track flight plans. The User App (`jads-user-app`) is a scaffold.

**Two options:**

**Option A (Recommended — fastest):** Demo the flight plan filing from the **Admin Portal** or **Audit Portal** web interface. Both already have FlightPlans pages (`FlightPlansPage.tsx`). You just need to add a "File New Plan" form to one of them. This is a React component — 2-3 hours of work.

**Option B:** Build a Flight Plan screen in the Android app. This is the more impressive demo but takes longer.

### Step 2.5: What Constitutes "Success" for Phase 2

**Minimum viable demo (Option A):**
- [ ] File a flight plan from the web portal with your real helicopter details
- [ ] Show the generated AFTN FPL message on screen
- [ ] Show the flight plan appearing in the audit trail
- [ ] Show the SSE connection waiting for clearance
- [ ] Simulate ADC/FIC issuance via webhook
- [ ] Show the clearance update arriving in real-time

**Full demo (Option B — if time permits):**
- [ ] All of the above, but from the Android app
- [ ] Show the pilot workflow: login → file plan → wait for clearance → receive ADC → go fly

**What makes this devastating at iDEX:**
- You're a real IAF pilot filing a real helicopter flight plan
- The AFTN message format is correct (ICAO Doc 4444)
- The semicircular rule is enforced (altitude vs heading)
- The system generates proper AFTN addressees
- ADC/FIC clearance arrives via SSE in real-time
- Everything is audit-logged with tamper-proof hash chains
- An iDEX evaluator from IAF will recognize every single field

### Step 2.6: Regulatory Note

You're filing a flight plan through YOUR app, not through the official AFTN network. The AFTN gateway is a stub — it logs the message but doesn't transmit it to the real AFTN network. This is fine for demo purposes. You'd need an AFTN gateway license and infrastructure to actually transmit.

**What to say at iDEX:** "The AFTN gateway integration uses a stub adapter in development. In production, this plugs into the AFMLU's existing AFTN infrastructure via a certified gateway. The message format is production-ready — it follows ICAO Doc 4444 Section 4 exactly."

---

## PHASE 3 — INTEGRATE WITH A DJI DRONE (THIS WEEK)

Your friend has a DJI drone. Here's exactly how to connect JADS to it.

### Step 3.1: Determine Which DJI Drone Your Friend Has

**DJI Mobile SDK v5 supports these models:**

| Category | Supported Models |
|----------|-----------------|
| Enterprise | Matrice 400, Matrice 4E/4T, Matrice 4D/4TD, Matrice 350 RTK, Matrice 300 RTK, Matrice 30/30T, Mavic 3 Enterprise/3T/3M |
| Consumer | **Mini 4 Pro**, **Mini 3 Pro**, **Mini 3** |
| NOT supported | Mavic 3 (consumer), Mavic 3 Classic, Air 2S, Air 3, DJI Avata, Mini 2, Mini SE, Phantom series |

**Ask your friend which exact model they have.** If it's a Mini 3 Pro, Mini 4 Pro, or any Enterprise/Matrice model — you're good. If it's a Mavic 3 consumer, Air 2S, or Air 3 — MSDK v5 does NOT support it and you'll need a different approach.

### Step 3.2: If the Drone IS Supported by MSDK v5

This is the proper integration path. You'll add the DJI Mobile SDK to your JADS Android app.

#### 3.2.1: Register as a DJI Developer

1. Go to `https://developer.dji.com/`
2. Create a developer account (email + phone verification required)
3. Go to "Developer Center" → "Create Application"
4. Enter:
   - App Name: `JADS Platform`
   - Software Platform: `Android`
   - Package Name: `com.jads` (must match your `AndroidManifest.xml`)
   - Category: `Enterprise`
   - Description: "NPNT-compliant drone management and telemetry platform"
5. You'll receive an **App Key** — save it

#### 3.2.2: Add DJI SDK to Your Gradle Build

In your `jads-android/settings.gradle.kts` (or `settings.gradle`), add the DJI Maven repository:

```kotlin
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://developer.dji.com/maven2") }
    }
}
```

In your `app/build.gradle.kts`, add the DJI dependencies:

```kotlin
dependencies {
    // ... your existing dependencies ...

    // DJI Mobile SDK v5
    implementation("com.dji:dji-sdk-v5-aircraft:5.17.0")
    compileOnly("com.dji:dji-sdk-v5-aircraft-provided:5.17.0")
    runtimeOnly("com.dji:dji-sdk-v5-networkImp:5.17.0")
}
```

#### 3.2.3: Configure AndroidManifest.xml

Add the DJI API key and required permissions:

```xml
<application>
    <!-- DJI API Key -->
    <meta-data
        android:name="com.dji.sdk.API_KEY"
        android:value="YOUR_DJI_APP_KEY_HERE" />

    <!-- USB accessory for RC connection -->
    <activity android:name=".MainActivity">
        <intent-filter>
            <action android:name="android.hardware.usb.action.USB_ACCESSORY_ATTACHED" />
        </intent-filter>
        <meta-data
            android:name="android.hardware.usb.action.USB_ACCESSORY_ATTACHED"
            android:resource="@xml/accessory_filter" />
    </activity>
</application>

<!-- Required permissions (add to existing) -->
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_PHONE_STATE" />
```

Create `res/xml/accessory_filter.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <usb-accessory model="T600" manufacturer="DJI"/>
    <usb-accessory model="AG410" manufacturer="DJI"/>
    <usb-accessory model="com.dji.logiclink" manufacturer="DJI"/>
    <usb-accessory model="WM160" manufacturer="DJI"/>
</resources>
```

#### 3.2.4: Initialize DJI SDK in JadsApplication.kt

```kotlin
// In JadsApplication.kt, add DJI initialization
import dji.v5.manager.SDKManager
import dji.v5.manager.interfaces.SDKManagerCallback

class JadsApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // ... your existing init ...

        // Initialize DJI SDK
        SDKManager.getInstance().init(this, object : SDKManagerCallback {
            override fun onRegisterSuccess() {
                // DJI SDK registered — API key verified
                Log.i("JADS", "DJI SDK registered successfully")
            }
            override fun onRegisterFailure(error: IDJIError?) {
                Log.e("JADS", "DJI SDK registration failed: ${error?.description()}")
            }
            override fun onProductConnect(productId: Int) {
                Log.i("JADS", "DJI product connected: $productId")
            }
            override fun onProductDisconnect(productId: Int) {
                Log.i("JADS", "DJI product disconnected: $productId")
            }
            // ... other callbacks ...
        })
    }
}
```

#### 3.2.5: Create the DJI Telemetry Bridge

This is the critical piece — bridging DJI telemetry into your JADS canonical format.

Create a new file `DjiTelemetryBridge.kt`:

```kotlin
package com.jads.drone

import dji.v5.manager.KeyManager
import dji.v5.manager.key.FlightControllerKey
import dji.v5.manager.key.BatteryKey
import dji.v5.common.callback.CommonCallbacks
import com.jads.telemetry.TelemetryFields

/**
 * Bridges DJI Mobile SDK v5 telemetry into JADS canonical format.
 *
 * DJI provides:
 *   - KeyAircraftLocation3D → lat, lon, alt (relative to takeoff)
 *   - KeyAircraftVelocity → NED velocity (m/s)
 *   - KeyCompassHeading → heading in degrees
 *   - KeyGPSSatelliteCount → satellite count
 *   - KeyChargeRemainingInPercent → battery %
 *   - KeyBatteryTemperature → battery temp
 *
 * JADS canonical format expects:
 *   - latitude_microdeg (lat × 1,000,000)
 *   - longitude_microdeg (lon × 1,000,000)
 *   - altitude_cm (signed centimeters)
 *   - velocity_north/east/down_mms (mm/s)
 */
class DjiTelemetryBridge {

    private val keyManager = KeyManager.getInstance()

    // DJI Keys
    private val locationKey   = FlightControllerKey.KeyAircraftLocation3D.create()
    private val velocityKey   = FlightControllerKey.KeyAircraftVelocity.create()
    private val headingKey    = FlightControllerKey.KeyCompassHeading.create()
    private val gpsCountKey   = FlightControllerKey.KeyGPSSatelliteCount.create()
    private val batteryKey    = BatteryKey.KeyChargeRemainingInPercent.create()
    private val isFlyingKey   = FlightControllerKey.KeyIsFlying.create()
    private val serialKey     = FlightControllerKey.KeySerialNumber.create()

    // Callback: called every time DJI pushes a new GPS fix
    fun startListening(onTelemetry: (TelemetryFields) -> Unit) {
        keyManager.listen(locationKey, this) { oldVal, newVal ->
            if (newVal == null) return@listen

            // Grab current velocity (may be slightly stale — acceptable)
            val velocity = keyManager.getValue(velocityKey)

            val fields = TelemetryFields(
                latitudeMicrodeg  = (newVal.latitude * 1_000_000).toLong(),
                longitudeMicrodeg = (newVal.longitude * 1_000_000).toLong(),
                altitudeCm        = (newVal.altitude * 100).toLong(),    // meters → cm
                velocityNorthMms  = ((velocity?.x ?: 0.0) * 1000).toLong(),  // m/s → mm/s
                velocityEastMms   = ((velocity?.y ?: 0.0) * 1000).toLong(),
                velocityDownMms   = ((velocity?.z ?: 0.0) * 1000).toLong(),
                // sensorHealthFlags and flightStateFlags are populated separately
            )

            onTelemetry(fields)
        }
    }

    fun stopListening() {
        keyManager.cancelListen(locationKey, this)
    }

    // One-shot reads for display purposes
    fun getBatteryPercent(): Int? =
        keyManager.getValue(batteryKey)

    fun getGpsSatelliteCount(): Int? =
        keyManager.getValue(gpsCountKey)

    fun isFlying(): Boolean =
        keyManager.getValue(isFlyingKey) ?: false

    fun getSerialNumber(): String? =
        keyManager.getValue(serialKey)
}
```

#### 3.2.6: Wire It Into Your MissionController

Your existing `MissionController.kt` already has a GPS polling loop. You'll add a mode switch:

```kotlin
// In MissionController, add a telemetry source enum
enum class TelemetrySource { DEVICE_GPS, DJI_SDK }

// When DJI drone is connected, switch source:
if (djiConnected) {
    djiTelemetryBridge.startListening { fields ->
        // Feed DJI telemetry into the existing pipeline:
        // 1. Serialize to 96-byte canonical format
        // 2. Sign with ECDSA
        // 3. Chain hash
        // 4. Store in SQLCipher
        // 5. Check geofence
        processTelemetryRecord(fields)
    }
} else {
    // Fall back to phone GPS (existing code)
    useDeviceGps()
}
```

#### 3.2.7: Physical Setup for the Demo

```
                    WiFi (same network)
[Your Laptop] ◄──────────────────────► [Your Phone running JADS app]
  │                                              │
  ├─ PostgreSQL (Docker)                         │  USB-C / WiFi
  ├─ Backend API (:8080)                         │
  ├─ Admin Portal (:5173)           [DJI Remote Controller]
  └─ Audit Portal (:5174)                        │
                                                  │  OcuSync / WiFi
                                                  │
                                           [DJI Drone]
```

1. Phone connects to DJI RC via USB-C cable (or WiFi for newer RCs)
2. JADS app on phone reads telemetry from DJI SDK
3. JADS app serializes into 96-byte canonical format, signs with ECDSA, chains hash
4. When mission ends, JADS app uploads to your backend via WiFi
5. Backend verifies all 8 forensic invariants
6. You open the Audit Portal and show the verified mission

### Step 3.3: If the Drone is NOT Supported by MSDK v5

If your friend has a Mavic 3 consumer, Air 2S, Air 3, or DJI Mini 2 — the MSDK v5 won't work. But you still have options:

#### Option A: Use the DJI Flight Log

Every DJI drone writes a `.txt` flight log to the RC/phone. After the flight:

1. Extract the flight log from the DJI Fly app's data folder:
   - Android: `/storage/emulated/0/DJI/DJI Fly/FlightRecords/`
   - Each flight creates a `.txt` file with GPS, altitude, speed, battery data
2. Write a parser that converts DJI flight log → JADS canonical format
3. Upload to your backend as a "post-flight forensic upload"
4. Run the forensic verifier on it

This is less impressive than real-time but still proves the concept.

#### Option B: Use the Phone's GPS During the Drone Flight

Your JADS app already uses the phone's GPS. During the drone flight:

1. The operator holds the phone (with JADS running) while flying the drone
2. JADS records the operator's position (which is roughly the GCS location)
3. After flight, upload and verify

This proves the telemetry pipeline works, even though it's the operator's position, not the drone's.

#### Option C: Use DJI Cloud API (if they have DJI Pilot 2)

If the drone operator uses DJI Pilot 2 on the remote controller (Enterprise drones only), the DJI Cloud API can stream telemetry via MQTT to your backend directly:

- Topic: `thing/product/{device_sn}/osd`
- Data includes: lat, lon, height, speed, battery, GPS count
- Your backend subscribes to the MQTT broker and converts to JADS format

### Step 3.4: What Constitutes "Success" for Phase 3

**Minimum (with any DJI drone):**
- [ ] One flight with GPS data captured (phone GPS or DJI log)
- [ ] Data converted to JADS 96-byte canonical format
- [ ] Hash chain computed and ECDSA signatures applied
- [ ] Uploaded to your backend
- [ ] Forensic verifier runs and passes all invariants
- [ ] Audit portal shows the verified mission with a map

**Full demo (with MSDK v5 compatible drone):**
- [ ] All of the above, plus:
- [ ] Real-time telemetry streaming from DJI drone to JADS app
- [ ] Live geofence checking during flight
- [ ] NPNT zone classification displayed during flight
- [ ] Violation detection if drone breaches geofence
- [ ] 3-minute video recording of the entire flow

### Step 3.5: Recording the Demo Video

**This is critical. Record everything.**

Equipment needed:
- Screen recording on your phone (built-in on most Android phones)
- Screen recording on your laptop (OBS Studio or similar)
- A second phone to record video of the physical setup (drone, RC, phone, laptop)

**The 3-minute demo video structure:**

```
0:00-0:20  — Show the physical setup: drone on ground, RC, phone with JADS, laptop with portals
0:20-0:40  — Show JADS app: login, mission setup, NPNT check (GREEN zone), NTP synced
0:40-0:55  — Start mission in JADS → drone takes off
0:55-1:30  — Show split screen: drone flying + JADS app showing live telemetry
1:30-1:45  — Drone lands → mission complete → upload starts
1:45-2:15  — Switch to laptop: Audit Portal → click the mission → forensic report
2:15-2:40  — Show the 8 invariants all passing (green checkmarks)
2:40-2:55  — Show the hash chain verification, Merkle tree anchor
2:55-3:00  — Text overlay: "JADS Platform — Forensic-Grade Drone Telemetry for Indian Airspace"
```

---

## PHASE 4 — DIGITAL SKY INTEGRATION

### Step 4.1: Current State of Digital Sky

**Critical update:** As of July 2025, DGCA has begun migrating all drone regulatory services from Digital Sky to the **eGCA Portal** (`dgca.gov.in/digigov-portal`). The original Digital Sky platform never offered a public developer sandbox.

**What this means for you:**
- There is no live sandbox API you can call today
- The iSPIRT open-source reference implementation is the closest thing to a testable API
- You'll self-host the reference implementation for development and demo

### Step 4.2: Self-Host the Digital Sky Reference Implementation

The iSPIRT team built an open-source reference implementation of the Digital Sky API:

```bash
# Clone the reference API
git clone https://github.com/iSPIRT/digital-sky-api.git

# It's a Java/Spring Boot application
cd digital-sky-api

# Build and run (requires Java 8+, Maven)
mvn clean install
java -jar target/digital-sky-api-0.0.1-SNAPSHOT.jar
```

This gives you a local Digital Sky server with:
- User registration and JWT auth (`POST /api/user`, `POST /api/auth/token`)
- Pilot profile management (`POST /api/pilot`)
- Drone registration (`POST /api/droneDevice/register/{mfgId}`)
- UIN applications (`POST /api/applicationForm/uinApplication`)
- **Flight permission applications** (`POST /api/applicationForm/flyDronePermissionApplication`)
- Permission Artefact generation (signed XML)

### Step 4.3: Implement the IDigitalSkyAdapter

Your codebase already defines the interface in `NpntComplianceGate.kt`:

```kotlin
interface IDigitalSkyAdapter {
    suspend fun classifyLocation(latDeg: Double, lonDeg: Double, altFt: Double): ZoneResult
    suspend fun validatePermissionToken(token: String): TokenValidationResult
}
```

Create a real implementation that talks to your self-hosted Digital Sky:

```kotlin
package com.jads.drone

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import com.google.gson.Gson

class DigitalSkyAdapterImpl(
    private val baseUrl: String,   // e.g., "http://192.168.1.100:8080" (your local Digital Sky)
    private val apiToken: String
) : IDigitalSkyAdapter {

    private val client = OkHttpClient()
    private val gson = Gson()

    override suspend fun classifyLocation(
        latDeg: Double, lonDeg: Double, altFt: Double
    ): ZoneResult = withContext(Dispatchers.IO) {

        // Option 1: Call your self-hosted Digital Sky
        // Option 2: Use Mappls (MapMyIndia) airspace layers API
        // Option 3: Use hardcoded Indian airspace data (for demo)

        // For the demo, use the hardcoded zone classification:
        classifyFromKnownZones(latDeg, lonDeg, altFt)
    }

    override suspend fun validatePermissionToken(token: String): TokenValidationResult =
        withContext(Dispatchers.IO) {
            // Parse the Permission Artefact XML
            // Verify XMLDSig signature
            // Check time validity
            // Check geofence polygon
            // For demo: validate XML structure, trust self-signed cert
            try {
                val artefact = parsePermissionArtefact(token)
                if (artefact.isExpired()) {
                    TokenValidationResult(false, "Permission artefact has expired")
                } else {
                    TokenValidationResult(true, null)
                }
            } catch (e: Exception) {
                TokenValidationResult(false, "Invalid artefact: ${e.message}")
            }
        }

    // Classify based on known Indian restricted zones
    // Source: Digital Sky zone data + DGCA published red/yellow/green zones
    private fun classifyFromKnownZones(lat: Double, lon: Double, alt: Double): ZoneResult {
        // Known RED zones (airports, military bases, border areas)
        // This data comes from the Digital Sky Interactive Map
        val redZones = listOf(
            // Delhi IGI Airport
            Zone("VIDP_RED", 28.5665, 77.1031, 8.0, ZoneType.RED),
            // Mumbai CSIA
            Zone("VABB_RED", 19.0896, 72.8656, 8.0, ZoneType.RED),
            // Parliament
            Zone("PARLIAMENT_RED", 28.6175, 77.2076, 5.0, ZoneType.RED),
            // Rashtrapati Bhavan
            Zone("RB_RED", 28.6143, 77.1994, 3.0, ZoneType.RED),
        )

        val yellowZones = listOf(
            // Delhi controlled airspace (outside 8km airport, within city limits)
            Zone("DELHI_YELLOW", 28.6139, 77.2090, 25.0, ZoneType.YELLOW),
            // Mumbai controlled
            Zone("MUMBAI_YELLOW", 19.0760, 72.8777, 20.0, ZoneType.YELLOW),
        )

        // Check RED first
        for (zone in redZones) {
            if (haversineKm(lat, lon, zone.centerLat, zone.centerLon) <= zone.radiusKm) {
                return ZoneResult(ZoneType.RED, zone.id, null, null)
            }
        }

        // Check YELLOW
        for (zone in yellowZones) {
            if (haversineKm(lat, lon, zone.centerLat, zone.centerLon) <= zone.radiusKm) {
                return ZoneResult(ZoneType.YELLOW, zone.id, 400, null)
            }
        }

        // Default: GREEN
        return ZoneResult(ZoneType.GREEN, "GREEN_DEFAULT", 400, null)
    }

    private fun haversineKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val R = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = Math.sin(dLat / 2).let { it * it } +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                Math.sin(dLon / 2).let { it * it }
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    data class Zone(
        val id: String,
        val centerLat: Double,
        val centerLon: Double,
        val radiusKm: Double,
        val type: ZoneType
    )
}
```

### Step 4.4: The Permission Artefact

The NPNT Permission Artefact is a **digitally signed XML document** (XMLDSig standard, RSA-SHA256). Here's the exact structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<UAPermission lastUpdated="2026-03-05T10:00:00+05:30"
              ttl="3600"
              txnId="txn-jads-001"
              permissionArtifactId="pa-uuid-001">

    <Permission>
        <Owner operatorId="OP-JADS-001">
            <Pilot uaplNo="UAPL-001" validTo="2027-01-01" />
        </Owner>

        <FlightDetails>
            <UADetails uinNo="UA-DJI-001" />
            <FlightPurpose shortDesc="Survey" />
            <PayloadDetails payLoadWeightInKg="0.249" payloadDetails="RGB Camera" />

            <FlightParameters flightStartTime="2026-03-05T10:00:00+05:30"
                              flightEndTime="2026-03-05T11:00:00+05:30"
                              maxAltitude="120">
                <Coordinates>
                    <Coordinate latitude="28.5000" longitude="77.1000" />
                    <Coordinate latitude="28.5010" longitude="77.1010" />
                    <Coordinate latitude="28.5010" longitude="77.1000" />
                    <Coordinate latitude="28.5000" longitude="77.1000" />
                </Coordinates>
            </FlightParameters>
        </FlightDetails>
    </Permission>

    <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
        <!-- XMLDSig RSA-SHA256 signature -->
    </Signature>
</UAPermission>
```

**What your system should verify (per DGCA RFM spec):**
1. XMLDSig signature validity (RSA-SHA256)
2. Current GPS within the `<Coordinates>` polygon
3. Current time within `flightStartTime` to `flightEndTime`
4. Drone UIN matches `uinNo`
5. Altitude below `maxAltitude`

### Step 4.5: Integrate Mappls (MapMyIndia) Airspace API

Mappls provides Digital Sky airspace layers as map overlays. This gives you a visual map with GREEN/YELLOW/RED zones.

1. Register at `https://developer.mappls.com/`
2. Get an API key
3. Use their Android SDK to display airspace zones on a map in your app
4. API endpoint for airspace layers: `https://developer.mappls.com/mapping/air-space/`

This is a visual enhancement — show the zone classification on an actual map, not just text.

### Step 4.5b: What to Say at iDEX About NPNT

> **What to say at iDEX about NPNT:** "NPNT compliance in JADS enforces the Permission Artefact structure, time bounds, and weight-category rules per DGCA UAS Rules 2021. We now verify XMLDSig signatures on Permission Artefacts (RSA-SHA256, exclusive C14N canonicalization) — the same standard Digital Sky uses. Full PKI chain verification against the DGCA root CA requires DSP certification — a 6–12 month government process. In demo mode, the PA is signed with a self-signed certificate to prove the complete cryptographic workflow end-to-end. The moment DGCA publishes the root CA certificate, our verification pipeline trusts it without code changes."

### Step 4.6: What to Say at iDEX About Digital Sky

**The honest pitch:**

> "Digital Sky is migrating to eGCA. The public API is not yet available for third-party integration. We've built our integration against the iSPIRT reference specification — the same specification that Digital Sky was built on. Our NPNT compliance gate validates Permission Artefacts per the DGCA RFM specification: XMLDSig signature verification, geofence polygon containment, temporal validity, and UIN matching. The moment DGCA publishes the eGCA API, our adapter slots in — we only need to change the base URL and authentication. The compliance logic doesn't change."

This is true, defensible, and shows you understand the regulatory landscape better than 99% of drone startups.

---

## PHASE 5 — EVERYTHING ELSE YOU SHOULD DO

### 5.1: Register a Legal Entity (Non-Negotiable for iDEX)

iDEX only funds registered Indian entities. Options:

| Entity Type | Time to Register | Cost | Best For |
|-------------|-----------------|------|----------|
| **LLP** (Limited Liability Partnership) | 7-10 days | ~Rs 5,000-8,000 | Solo/duo founders, low compliance |
| **Private Limited** | 10-15 days | ~Rs 8,000-15,000 | Serious startup, raising investment |
| **One Person Company (OPC)** | 7-10 days | ~Rs 7,000-10,000 | Solo founder |

**Recommendation:** Register an **LLP** immediately. You can convert to Pvt Ltd later. Use services like Vakilsearch, ClearTax, or LegalRaasta for fast incorporation.

For iDEX DISC application, you need:
- Company registration certificate
- DIPP/DPIIT Startup Recognition (apply on `https://www.startupindia.gov.in/`)
- PAN and GST (generated during registration)

### 5.2: Get DPIIT Startup Recognition

1. Go to `https://www.startupindia.gov.in/`
2. Register your entity
3. Apply for DPIIT recognition
4. This gives you: tax benefits, easier compliance, and eligibility for government grants (including iDEX)

### 5.3: Write a Patent (Provisional)

File a **provisional patent application** with the Indian Patent Office. Cost: Rs 1,600 (startup rate).

**What to patent:** "A method and system for cryptographic chain-of-custody verification of unmanned aerial system telemetry data using hash-chained canonical payloads and hardware-backed digital signatures."

**Claims to include:**
1. The 96-byte canonical telemetry payload format with deterministic serialization
2. The hash chain linking method (HASH_0 = SHA256("MISSION_INIT" || missionId_BE), HASH_n = SHA256(canonical || HASH_(n-1)))
3. The 8-invariant forensic verification method
4. The Merkle tree daily evidence anchoring system
5. The NTP quorum time authority for cryptographic timestamping

A provisional patent buys you 12 months of "patent pending" status. This is enough for iDEX evaluation and shows IP protection.

### 5.4: Get a Letter of Interest (LOI)

An LOI from any of these entities massively boosts your iDEX application:

| Source | How to Get It | Difficulty |
|--------|---------------|------------|
| **Your IAF unit** | Ask your CO/unit commander to write an LOI expressing interest in a UTM/flight plan filing system | Medium — depends on your unit's culture |
| **A state police drone unit** | Most state police forces have drone units now. Approach them with a demo. | Medium |
| **DGCA** | Unlikely without a formal proposal, but worth a shot via NPNT compliance discussion | Hard |
| **A drone OEM** | ideaForge, Garuda Aerospace, Throttle Aerospace — approach them as a potential integration partner | Medium |
| **An airport authority** | AAI has been looking at UTM integration | Hard |

**The IAF LOI is your easiest win.** You're an IAF pilot. You built a system that files flight plans in ICAO format. Your CO will understand the value.

### 5.5: Prepare the iDEX Application

#### For DISC (Defence India Startup Challenge):

1. Monitor `https://idex.gov.in/` for open challenges
2. Look for challenges in categories: UTM, counter-drone, airspace management, flight data recording
3. Application requires:
   - Company details (hence the LLP)
   - Problem statement alignment
   - Technical proposal (your architecture document)
   - TRL assessment
   - Team details
   - Financial projections

#### For Open Challenge:

The Open Challenge accepts unsolicited proposals. Submit under:
- **Category:** Air Systems
- **Sub-category:** Unmanned Systems / Airspace Management
- **Title:** "NPNT-Compliant Forensic Drone Telemetry and Manned Flight Plan Management Platform"

### 5.6: The iDEX Pitch Deck (10 Slides)

| Slide | Content |
|-------|---------|
| 1 | **Title:** JADS — Joint Airspace Defence System. Tagline: "Forensic-grade telemetry for Indian airspace" |
| 2 | **Problem:** No tamper-proof chain-of-custody for drone telemetry. No unified manned + unmanned flight plan system. NPNT compliance is theoretical. |
| 3 | **Solution:** Cryptographically signed, hash-chained telemetry. Real NPNT enforcement. ICAO flight plan filing. Forensic audit trail. |
| 4 | **Demo screenshot:** Show the Audit Portal with a verified mission — all 8 invariants passing |
| 5 | **Architecture:** Lead with: "JADS sits in the planning and oversight layer, not the control layer." One-page diagram: Android app → Backend → Forensic Verifier → Audit Portal. Highlight: ECDSA, hash chains, Merkle trees. Pre-empt the misread — JADS does not command drones or direct aircraft. It validates, records, and proves. |
| 6 | **NPNT Compliance:** Show the RED/YELLOW/GREEN zone gate, airport proximity check, Digital Sky integration path |
| 7 | **Flight Plan Filing:** Show the ICAO flight plan with proper AFTN messaging. "This was filed by an IAF pilot for a real helicopter sortie." |
| 8 | **Live Demo Video:** The 3-minute video from Phase 3 |
| 9 | **Market:** 10 lakh+ registered drones by 2030 (DGCA projection). Every drone needs NPNT. Every manned aircraft needs flight plan filing. Defence forces need tamper-proof telemetry. |
| 10 | **Ask:** Rs 1.5 Cr for 18 months. Deliverables: HSM integration, Digital Sky/eGCA live connection, multi-drone fleet management, IAF field trials. |

### 5.7: Timeline Summary

| Day | Action | Output |
|-----|--------|--------|
| **Today (Day 1)** | Phase 1: Get everything running locally | 4 services running, Android app built |
| **Tomorrow (Day 2)** | Phase 2: File a flight plan, record demo | Flight plan filed via app, AFTN message generated |
| **Day 3-4** | Phase 3: DJI integration + drone flight | Real telemetry from DJI drone → JADS → forensic report |
| **Day 3-4** | Phase 4: Digital Sky stub → real adapter | Zone classification working, Permission Artefact parsing |
| **Week 1** | Record the 3-minute demo video | Video ready for submission |
| **Week 2** | Register LLP, apply for DPIIT | Legal entity ready |
| **Week 2** | File provisional patent | Patent pending status |
| **Week 2** | Get IAF LOI from your CO | Letter of interest in hand |
| **Week 3** | Prepare iDEX application | Application submitted |
| **Week 4** | Polish pitch deck, practice | Ready for DIO meeting |

### 5.8: One More Thing — Your IAF Background is the Weapon

**No drone startup founder in India is an active IAF pilot.** This is not a small advantage — it's the entire game.

When you walk into iDEX:
- You understand airspace because you fly in it
- You understand ICAO flight plans because you file them
- You understand the AFTN because you use it
- You understand the military's pain points because you live them
- You built the system because you needed it

Every other drone startup at iDEX will have engineers explaining airspace to military evaluators. **You're a military pilot explaining your own system to engineers.** That's a fundamentally different conversation.

Lead with that.
