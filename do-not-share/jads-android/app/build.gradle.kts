plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
}

android {
    namespace   = "com.jads"
    compileSdk  = 34

    defaultConfig {
        applicationId  = "com.jads.drone"
        minSdk         = 26
        targetSdk      = 34
        versionCode    = 1
        versionName    = "6.0.0"

        ksp {
            arg("room.schemaLocation",   "$projectDir/schemas")
            arg("room.incremental",      "true")
            arg("room.generateKotlin",   "true")
        }

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            isDebuggable          = true
            isMinifyEnabled       = false
            applicationIdSuffix   = ".debug"
        }
        release {
            isDebuggable          = false
            isMinifyEnabled       = true
            isShrinkResources     = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    buildFeatures {
        compose = true
    }

    composeOptions {
        // Must match Kotlin version 1.9.23 — see https://developer.android.com/jetpack/androidx/releases/compose-kotlin
        kotlinCompilerExtensionVersion = "1.5.11"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs += listOf("-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi")
    }

    sourceSets {
        getByName("main") { java.srcDirs("src/main/kotlin") }
        getByName("test") { java.srcDirs("src/test/kotlin") }
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/NOTICE.md",
                "META-INF/LICENSE.md",
                "META-INF/BCKEY.DSA",
                "META-INF/BCKEY.SF"
            )
        }
    }
}

dependencies {

    // ── Kotlin ────────────────────────────────────────────────────────────────
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.23")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")

    // ── AndroidX core ─────────────────────────────────────────────────────────
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-compose:1.9.0")

    // ── Jetpack Compose (BOM pins all compose versions) ──────────────────────
    val composeBom = platform("androidx.compose:compose-bom:2024.04.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    // ── Navigation ────────────────────────────────────────────────────────────
    implementation("androidx.navigation:navigation-compose:2.7.7")

    // ── Lifecycle / ViewModel ─────────────────────────────────────────────────
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")

    // ── WorkManager — background mission upload ───────────────────────────────
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    // ── Security — EncryptedSharedPreferences for JWT storage ─────────────────
    // IMPORTANT: Use 1.0.0 (stable), not 1.1.0-alpha06. Alpha breaks on some API 26 devices.
    implementation("androidx.security:security-crypto:1.0.0")

    // ── Room (SQLite ORM) ─────────────────────────────────────────────────────
    val roomVersion = "2.6.1"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    ksp("androidx.room:room-compiler:$roomVersion")

    // ── SQLCipher ─────────────────────────────────────────────────────────────
    implementation("net.zetetic:android-database-sqlcipher:4.5.4")
    implementation("androidx.sqlite:sqlite-ktx:2.4.0")

    // ── Bouncy Castle ─────────────────────────────────────────────────────────
    implementation("org.bouncycastle:bcprov-jdk18on:1.78.1")
    // PQC provider — ML-DSA-65 (FIPS 204, formerly CRYSTALS-Dilithium Level 3)
    implementation("org.bouncycastle:bcpqc-jdk18on:1.78.1")

    // ── Apache Commons Net (NTP) ──────────────────────────────────────────────
    implementation("commons-net:commons-net:3.10.0")

    // ── OkHttp ────────────────────────────────────────────────────────────────
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // ── Gson ──────────────────────────────────────────────────────────────────
    implementation("com.google.code.gson:gson:2.10.1")


    // ── DataStore (Preferences) ───────────────────────────────────────────────
    // LoginViewModel + MissionViewModel use DataStore to persist session across restarts.
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // ── Lifecycle Service ─────────────────────────────────────────────────────
    // MissionForegroundService extends LifecycleService for lifecycleScope coroutines.
    implementation("androidx.lifecycle:lifecycle-service:2.7.0")

    // ── Tests ─────────────────────────────────────────────────────────────────
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.0")
    testImplementation("io.mockk:mockk:1.13.10")

    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation("androidx.room:room-testing:$roomVersion")
}
