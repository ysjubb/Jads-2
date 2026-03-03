package com.jads.ui.screen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jads.ui.component.AltitudeGauge
import com.jads.ui.component.SectionHeader
import com.jads.ui.component.ViolationCard
import com.jads.ui.theme.JadsColors
import com.jads.ui.viewmodel.MissionViewModel
import com.jads.ui.viewmodel.ViolationSummary
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActiveMissionScreen(
    viewModel:          MissionViewModel,
    onMissionFinished:  (missionDbId: Long) -> Unit
) {
    val missionId   by viewModel.activeMissionId.collectAsStateWithLifecycle()
    val missionDbId by viewModel.activeMissionDbId.collectAsStateWithLifecycle()
    val altitudeFt  by viewModel.altitudeFt.collectAsStateWithLifecycle()
    val recordCount by viewModel.recordCount.collectAsStateWithLifecycle()
    val violations  by viewModel.violations.collectAsStateWithLifecycle()
    val latDeg      by viewModel.latDeg.collectAsStateWithLifecycle()
    val lonDeg      by viewModel.lonDeg.collectAsStateWithLifecycle()
    val velocityMs  by viewModel.velocityMs.collectAsStateWithLifecycle()
    val mActive     by viewModel.missionActive.collectAsStateWithLifecycle()

    // Navigate when service signals mission finished
    LaunchedEffect(mActive, missionDbId) {
        if (!mActive && missionDbId > 0) {
            onMissionFinished(missionDbId)
        }
    }

    // Elapsed time ticker
    var elapsedSec by remember { mutableLongStateOf(0L) }
    LaunchedEffect(Unit) {
        while (true) { delay(1000L); elapsedSec++ }
    }

    // Blinking red dot for recording indicator
    val infiniteTransition = rememberInfiniteTransition(label = "rec_blink")
    val recAlpha by infiniteTransition.animateFloat(
        initialValue = 1f, targetValue = 0.2f,
        animationSpec = infiniteRepeatable(
            animation  = tween(700, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "rec_alpha"
    )

    // Stop confirmation dialog
    var showStopDialog by remember { mutableStateOf(false) }

    if (showStopDialog) {
        StopConfirmationDialog(
            onConfirm = {
                showStopDialog = false
                viewModel.stopMission()
            },
            onDismiss = { showStopDialog = false }
        )
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // Blinking REC dot
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .background(JadsColors.RedBlocked.copy(alpha = recAlpha), shape = androidx.compose.foundation.shape.CircleShape)
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text("Active Mission", fontWeight = FontWeight.SemiBold)
                            Text(
                                "ID: ${if (missionId > 0) missionId.toString() else "—"}",
                                style = MaterialTheme.typography.bodySmall.copy(
                                    fontFamily = FontFamily.Monospace,
                                    fontSize   = 10.sp
                                ),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                actions = {
                    // Elapsed time
                    Text(
                        text     = formatElapsed(elapsedSec),
                        style    = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                        color    = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(end = 16.dp)
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        bottomBar = {
            // STOP button — always visible, can't miss it
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .navigationBarsPadding()
            ) {
                Button(
                    onClick  = { showStopDialog = true },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    colors   = ButtonDefaults.buttonColors(containerColor = JadsColors.RedBlocked),
                    shape    = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.FlightLand, null, tint = Color.White)
                    Spacer(Modifier.width(8.dp))
                    Text("STOP MISSION", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier            = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding      = PaddingValues(vertical = 12.dp)
        ) {

            // ── Telemetry main panel ───────────────────────────────────────
            item {
                Card(
                    shape  = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Row(
                        Modifier.padding(16.dp).fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment     = Alignment.CenterVertically
                    ) {
                        // Left: altitude gauge
                        AltitudeGauge(altitudeFt = altitudeFt, limitFt = 400.0)

                        // Centre: key readings
                        Column(
                            Modifier.weight(1f).padding(horizontal = 16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            LiveMetric(label = "Records", value = recordCount.toString())
                            LiveMetric(label = "Velocity", value = "${String.format("%.1f", velocityMs)} m/s")
                            LiveMetric(label = "Lat",      value = "%.5f".format(latDeg))
                            LiveMetric(label = "Lon",      value = "%.5f".format(lonDeg))
                        }

                        // Right: violations badge
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            val critCount = violations.count { it.severity == "CRITICAL" }
                            Box(
                                modifier = Modifier
                                    .size(56.dp)
                                    .background(
                                        if (critCount > 0) JadsColors.RedBlocked.copy(alpha = 0.15f)
                                        else               JadsColors.GreenClear.copy(alpha = 0.1f),
                                        RoundedCornerShape(28.dp)
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text  = violations.size.toString(),
                                    style = MaterialTheme.typography.headlineMedium.copy(
                                        fontWeight = FontWeight.Bold,
                                        fontSize   = 24.sp
                                    ),
                                    color = if (critCount > 0) JadsColors.RedBlocked
                                            else               JadsColors.GreenClear
                                )
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text  = "Violations",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            // ── Compliance status ──────────────────────────────────────────
            item {
                val criticalViolations = violations.filter { it.severity == "CRITICAL" }
                val compliant          = criticalViolations.none { it.type.startsWith("UNPERMITTED_ZONE") }
                ComplianceStatusBar(compliant = compliant)
            }

            // ── Violations list ────────────────────────────────────────────
            if (violations.isNotEmpty()) {
                item { SectionHeader("Violations (${violations.size})") }

                items(violations.reversed()) { violation ->
                    ViolationCard(
                        type     = violation.type,
                        severity = violation.severity,
                        detail   = violation.detailMessage
                    )
                }
            }

            // Bottom padding for FAB / button clearance
            item { Spacer(Modifier.height(4.dp)) }
        }
    }
}

// ── Supporting composables ────────────────────────────────────────────────────

@Composable
private fun LiveMetric(label: String, value: String) {
    Column {
        Text(
            text  = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text  = value,
            style = MaterialTheme.typography.titleSmall.copy(
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Medium
            ),
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun ComplianceStatusBar(compliant: Boolean) {
    val (color, icon, text) = if (compliant)
        Triple(JadsColors.GreenClear, Icons.Default.CheckCircle, "NPNT COMPLIANT")
    else
        Triple(JadsColors.RedBlocked, Icons.Default.GppBad, "NPNT NON-COMPLIANT — CRITICAL VIOLATION")

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(color.copy(alpha = 0.1f), RoundedCornerShape(6.dp))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, null, tint = color, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(8.dp))
        Text(
            text  = text,
            style = MaterialTheme.typography.labelMedium,
            color = color,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun StopConfirmationDialog(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(Icons.Default.FlightLand, null, tint = JadsColors.RedBlocked, modifier = Modifier.size(32.dp))
        },
        title  = { Text("Stop Mission?") },
        text   = {
            Text(
                "The mission recording will stop. The drone should be on the ground or landing now.\n\n" +
                "Data will be preserved and available for upload.",
                style = MaterialTheme.typography.bodyMedium
            )
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors  = ButtonDefaults.buttonColors(containerColor = JadsColors.RedBlocked)
            ) {
                Text("Stop Mission", color = Color.White, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Continue Flying") }
        },
        containerColor = MaterialTheme.colorScheme.surface
    )
}

private fun formatElapsed(sec: Long): String {
    val h = sec / 3600
    val m = (sec % 3600) / 60
    val s = sec % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
}
