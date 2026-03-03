package com.jads.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// JADS colour palette — aviation-grade dark military HUD theme.
// Rationale:
//   Dark background — reduces glare in outdoor operations and cockpit-adjacent use.
//   Amber accent    — standard aviation instrument colour (ADI, altimeter, HSI).
//   Green / Red     — ICAO-standard OK / warning signal colours.
//   No pure white   — dimmers to 80% white to ease eye strain in low-light.

object JadsColors {
    val NavyBackground   = Color(0xFF050A08)   // Deep dark green — primary background
    val DeepCharcoal     = Color(0xFF080C0A)   // Slightly warmer dark — LoginScreen gradient
    val SurfaceDark      = Color(0xFF0A120E)   // Cards, dialogs
    val SurfaceVariant   = Color(0xFF122018)   // Input fields, list items
    val Amber            = Color(0xFFFFB800)   // Primary accent — aviation amber
    val AmberDim         = Color(0xFFCC9200)   // Pressed / disabled amber
    val GreenClear       = Color(0xFF00FF88)   // NPNT GREEN / OK
    val YellowCaution    = Color(0xFFFFD600)   // NPNT YELLOW / caution
    val RedBlocked       = Color(0xFFFF3B3B)   // NPNT RED / critical violation
    val TextPrimary      = Color(0xFFB0C8B8)   // Off-white green — primary text
    val TextSecondary    = Color(0xFF4A7A5A)   // Muted green — secondary labels
    val Divider          = Color(0xFF1A3020)   // Subtle dividers
    val NtpSynced        = Color(0xFF00FF88)   // NTP quorum OK
    val NtpFailed        = Color(0xFFFF3B3B)   // NTP quorum failed

    // ── Aliases used by screens — map to canonical names above ───────────
    val AmberYellow        = Amber                 // LoginScreen, SetupScreen
    val OrangeConditional  = YellowCaution         // YELLOW zone, non-critical violations
    val SkyBlue            = Color(0xFF40C4FF)     // Advisory violations, upload pending
}

private val JadsDarkColorScheme = darkColorScheme(
    primary          = JadsColors.Amber,
    onPrimary        = Color(0xFF1A0F00),
    primaryContainer = JadsColors.AmberDim,
    secondary        = JadsColors.GreenClear,
    onSecondary      = Color(0xFF001A0A),
    tertiary         = JadsColors.YellowCaution,
    background       = JadsColors.NavyBackground,
    onBackground     = JadsColors.TextPrimary,
    surface          = JadsColors.SurfaceDark,
    onSurface        = JadsColors.TextPrimary,
    surfaceVariant   = JadsColors.SurfaceVariant,
    onSurfaceVariant = JadsColors.TextSecondary,
    error            = JadsColors.RedBlocked,
    onError          = Color.White,
    outline          = JadsColors.Divider,
)

@Composable
fun JadsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = JadsDarkColorScheme,
        typography  = JadsTypography,
        content     = content
    )
}
