# JADS ProGuard rules — release build only
# Keep everything in release builds but strip unused code from libraries.

# ── Bouncy Castle ────────────────────────────────────────────────────────────
# BCProvider must be findable by name for JCA to work.
# ECNamedCurveTable.getByName() uses string lookups — keep the curve name registry.
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**

# ── SQLCipher ────────────────────────────────────────────────────────────────
# SQLCipher's JNI bridge registers native methods by class name.
-keep class net.sqlcipher.** { *; }
-keep class net.sqlcipher.database.** { *; }
-dontwarn net.sqlcipher.**

# ── Room ─────────────────────────────────────────────────────────────────────
# Room-generated _Impl classes are created at runtime via reflection.
-keep class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao class * { *; }
-dontwarn androidx.room.**

# ── Apache Commons Net (NTP) ─────────────────────────────────────────────────
-keep class org.apache.commons.net.** { *; }
-dontwarn org.apache.commons.net.**

# ── OkHttp ───────────────────────────────────────────────────────────────────
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# ── Kotlin coroutines ────────────────────────────────────────────────────────
-dontwarn kotlinx.coroutines.**

# ── JADS application classes ─────────────────────────────────────────────────
# Keep all JADS classes — they may be referenced by reflection or DI.
-keep class com.jads.** { *; }
