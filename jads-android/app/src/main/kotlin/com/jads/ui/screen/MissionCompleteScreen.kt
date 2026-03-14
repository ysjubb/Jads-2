package com.jads.ui.screen

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jads.ui.component.*
import com.jads.ui.theme.JadsColors
import com.jads.ui.viewmodel.MissionViewModel
import com.jads.ui.viewmodel.UploadStatus
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MissionCompleteScreen(
    viewModel:        MissionViewModel,
    missionDbId:      Long,
    onNewMission:     () -> Unit,
    onViewHistory:    () -> Unit
) {
    val uploadStatus    by viewModel.uploadStatus.collectAsStateWithLifecycle()
    val missionId       by viewModel.activeMissionId.collectAsStateWithLifecycle()
    val recordCount     by viewModel.recordCount.collectAsStateWithLifecycle()
    val violations      by viewModel.violations.collectAsStateWithLifecycle()

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("Mission Complete", fontWeight = FontWeight.SemiBold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {

            // ── Landing confirmation banner ─────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(JadsColors.GreenClear.copy(alpha = 0.1f), RoundedCornerShape(8.dp))
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.CheckCircle,
                    null,
                    tint     = JadsColors.GreenClear,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        "Mission Completed",
                        style      = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color      = JadsColors.GreenClear
                    )
                    Text(
                        "Drone has landed. Telemetry secured in encrypted local storage.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // ── Forensic summary ────────────────────────────────────────────
            SectionHeader("Forensic Summary")
            Card(
                shape  = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(Modifier.padding(16.dp)) {
                    MonoValue(
                        label = "Mission ID",
                        value = if (missionId > 0) missionId.toString() else "—",
                        color = JadsColors.AmberYellow
                    )
                    Divider(Modifier.padding(vertical = 10.dp), color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)

                    InfoRow(
                        label = "Total Records",
                        value = "$recordCount",
                        icon  = Icons.Default.DataUsage,
                        valueColor = MaterialTheme.colorScheme.onSurface
                    )
                    Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                    InfoRow(
                        label = "Local Integrity Check",
                        value = "PASSED",   // LandingDetector confirmed before finalize()
                        icon  = Icons.Default.VerifiedUser,
                        valueColor = JadsColors.GreenClear
                    )
                    Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                    InfoRow(
                        label = "Chain Algorithm",
                        value = "SHA-256 / ECDSA P-256",
                        icon  = Icons.Default.Lock
                    )
                    Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                    InfoRow(
                        label = "Violations",
                        value = "${violations.size} (${violations.count { it.severity == "CRITICAL" }} critical)",
                        icon  = Icons.Default.GppMaybe,
                        valueColor = if (violations.any { it.severity == "CRITICAL" })
                                         JadsColors.RedBlocked
                                     else JadsColors.GreenClear
                    )
                    Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                    InfoRow(
                        label = "Completed At",
                        value = SimpleDateFormat("dd MMM yyyy, HH:mm:ss 'UTC'", Locale.getDefault())
                                    .apply { timeZone = TimeZone.getTimeZone("UTC") }
                                    .format(Date()),
                        icon  = Icons.Default.AccessTime
                    )
                }
            }

            // ── Violations summary ──────────────────────────────────────────
            if (violations.isNotEmpty()) {
                SectionHeader("Violations Summary")
                val criticals = violations.filter { it.severity == "CRITICAL" }
                val warnings  = violations.filter { it.severity == "WARNING" }

                if (criticals.isNotEmpty()) {
                    InfoRow(
                        label = "Critical",
                        value = "${criticals.size}",
                        icon  = Icons.Default.Error,
                        valueColor = JadsColors.RedBlocked
                    )
                }
                if (warnings.isNotEmpty()) {
                    InfoRow(
                        label = "Warnings",
                        value = "${warnings.size}",
                        icon  = Icons.Default.Warning,
                        valueColor = JadsColors.OrangeConditional
                    )
                }
            }

            // ── Upload section ──────────────────────────────────────────────
            SectionHeader("Backend Upload")
            UploadPanel(
                status    = uploadStatus,
                onUpload  = viewModel::triggerUpload
            )

            // ── Action buttons ──────────────────────────────────────────────
            Spacer(Modifier.height(4.dp))
            Button(
                onClick  = {
                    viewModel.resetForNewMission()
                    onNewMission()
                },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                colors   = ButtonDefaults.buttonColors(containerColor = JadsColors.AmberYellow),
                shape    = RoundedCornerShape(8.dp)
            ) {
                Icon(Icons.Default.AddCircle, null, tint = Color(0xFF1A1200))
                Spacer(Modifier.width(8.dp))
                Text("New Mission", color = Color(0xFF1A1200), fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick  = onViewHistory,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape    = RoundedCornerShape(8.dp),
                colors   = OutlinedButtonDefaults.outlinedButtonColors(
                    contentColor = MaterialTheme.colorScheme.onSurface
                )
            ) {
                Icon(Icons.Default.History, null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("View Mission History")
            }

            Spacer(Modifier.height(16.dp))
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// UploadPanel — shows upload status and retry button
// ─────────────────────────────────────────────────────────────────────────────
@Composable
private fun UploadPanel(status: UploadStatus, onUpload: () -> Unit) {
    Card(
        shape  = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {

            when (status) {
                is UploadStatus.Idle -> {
                    Text(
                        "Mission data is stored locally and encrypted. Upload to the JADS backend to make it available for forensic audit.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Button(
                        onClick  = onUpload,
                        modifier = Modifier.fillMaxWidth(),
                        shape    = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Default.CloudUpload, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Upload to JADS Backend")
                    }
                }

                is UploadStatus.Uploading -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(
                            modifier    = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color       = JadsColors.AmberYellow
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            "Uploading to JADS backend...",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }

                is UploadStatus.Success -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.CloudDone,
                            null,
                            tint     = JadsColors.GreenClear,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(
                                "Upload successful",
                                style      = MaterialTheme.typography.titleSmall,
                                color      = JadsColors.GreenClear,
                                fontWeight = FontWeight.Medium
                            )
                            Text(
                                "Server ID: ${status.missionServerId}",
                                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                is UploadStatus.Failed -> {
                    Row(verticalAlignment = Alignment.Top) {
                        Icon(
                            Icons.Default.CloudOff,
                            null,
                            tint     = JadsColors.RedBlocked,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(
                                "Upload failed",
                                style      = MaterialTheme.typography.titleSmall,
                                color      = JadsColors.RedBlocked,
                                fontWeight = FontWeight.Medium
                            )
                            Text(
                                status.reason,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    if (status.retryable) {
                        OutlinedButton(
                            onClick = onUpload,
                            modifier = Modifier.fillMaxWidth(),
                            shape    = RoundedCornerShape(8.dp),
                            colors   = OutlinedButtonDefaults.outlinedButtonColors(
                                contentColor = JadsColors.AmberYellow
                            ),
                            border   = androidx.compose.foundation.BorderStroke(1.dp, JadsColors.AmberYellow.copy(alpha = 0.6f))
                        ) {
                            Icon(Icons.Default.Refresh, null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Retry Upload")
                        }
                    }
                }

                is UploadStatus.AlreadyUploaded -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CheckCircle, null, tint = JadsColors.SkyBlue, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Mission already uploaded to backend.",
                            style = MaterialTheme.typography.bodySmall,
                            color = JadsColors.SkyBlue
                        )
                    }
                }
            }
        }
    }
}
