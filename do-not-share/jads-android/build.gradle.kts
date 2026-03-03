// Root build.gradle.kts
// Plugins are declared here and APPLIED only in :app/build.gradle.kts.
// Do not add any dependencies here — only plugin version declarations.

plugins {
    id("com.android.application")     version "8.3.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.23" apply false
    // KSP (Kotlin Symbol Processing) — used by Room instead of KAPT.
    // KSP is 2× faster than KAPT and fully supports Kotlin 1.9+.
    id("com.google.devtools.ksp")     version "1.9.23-1.0.20" apply false
}
