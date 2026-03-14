package com.jads.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jads.ui.component.*
import com.jads.ui.theme.JadsColors
import com.jads.ui.viewmodel.MissionState
import com.jads.ui.viewmodel.MissionViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MissionSetupScreen(
    viewModel:    MissionViewModel,
    operatorId:   String,
    onMissionStarted: () -> Unit,
    onBack:       () -> Unit
) {
    val state     by viewModel.setupState.collectAsStateWithLifecycle()
    val mActive   by viewModel.missionActive.collectAsStateWithLifecycle()

    // Navigate when service confirms mission is active
    LaunchedEffect(mActive) {
        if (mActive) onMissionStarted()
    }

    val allChecklistDone = state.checklistItems.all { it.checked }
    val npntClear        = state.npntResult?.let { !it.blocked } == true
    val canStart         = npntClear && state.ntpSynced && allChecklistDone && !state.isStarting

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Mission Setup", fontWeight = FontWeight.SemiBold)
                        Text(
                            "Operator: $operatorId",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor    = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {

            // ── 1. NTP Status ──────────────────────────────────────────────
            SectionHeader("Time Authority")
            NtpStatusCard(
                synced    = state.ntpSynced,
                offsetMs  = state.ntpOffsetMs
            )

            // ── 2. Flight Coordinates ──────────────────────────────────────
            SectionHeader("Flight Parameters")
            Card(
                shape  = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value         = state.latInput,
                            onValueChange = viewModel::onLatChanged,
                            label         = { Text("Latitude") },
                            placeholder   = { Text("28.6139") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine    = true,
                            modifier      = Modifier.weight(1f),
                            leadingIcon   = { Icon(Icons.Default.MyLocation, null, modifier = Modifier.size(18.dp)) }
                        )
                        OutlinedTextField(
                            value         = state.lonInput,
                            onValueChange = viewModel::onLonChanged,
                            label         = { Text("Longitude") },
                            placeholder   = { Text("77.2090") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine    = true,
                            modifier      = Modifier.weight(1f)
                        )
                    }
                    OutlinedTextField(
                        value         = state.aglInput,
                        onValueChange = viewModel::onAglChanged,
                        label         = { Text("Planned AGL (ft)") },
                        placeholder   = { Text("100") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine    = true,
                        modifier      = Modifier.fillMaxWidth(),
                        leadingIcon   = { Icon(Icons.Default.Expand, null, modifier = Modifier.size(18.dp)) },
                        supportingText = { Text("Max 400ft without Digital Sky token") }
                    )
                    OutlinedTextField(
                        value         = state.permissionToken,
                        onValueChange = viewModel::onTokenChanged,
                        label         = { Text("Digital Sky Permission Token (optional)") },
                        singleLine    = true,
                        modifier      = Modifier.fillMaxWidth(),
                        leadingIcon   = { Icon(Icons.Default.Key, null, modifier = Modifier.size(18.dp)) }
                    )
                }
            }

            // ── 3. NPNT Check ──────────────────────────────────────────────
            SectionHeader("NPNT Compliance Check")

            val latOk = state.latInput.toDoubleOrNull() != null
            val lonOk = state.lonInput.toDoubleOrNull() != null

            if (state.npntResult != null) {
                NpntStatusCard(
                    zoneType = state.npntResult!!.classification.name,
                    blocked  = state.npntResult!!.blocked,
                    reasons  = state.npntResult!!.blockingReasons
                )
                Spacer(Modifier.height(4.dp))
            }

            OutlinedButton(
                onClick  = viewModel::runNpntCheck,
                enabled  = latOk && lonOk && !state.isCheckingNpnt,
                modifier = Modifier.fillMaxWidth(),
                shape    = RoundedCornerShape(8.dp),
                colors   = OutlinedButtonDefaults.outlinedButtonColors(
                    contentColor = JadsColors.AmberYellow
                ),
                border   = androidx.compose.foundation.BorderStroke(1.dp, JadsColors.AmberYellow.copy(alpha = 0.6f))
            ) {
                if (state.isCheckingNpnt) {
                    CircularProgressIndicator(Modifier.size(16.dp), color = JadsColors.AmberYellow, strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                    Text("Checking...")
                } else {
                    Icon(Icons.Default.Radar, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(if (state.npntResult != null) "Re-run NPNT Check" else "Run NPNT Check")
                }
            }

            // ── 4. Pre-flight Checklist ────────────────────────────────────
            SectionHeader("Pre-flight Checklist")
            Card(
                shape  = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(Modifier.padding(vertical = 4.dp)) {
                    state.checklistItems.forEachIndexed { idx, item ->
                        if (idx > 0) Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                        ChecklistRow(
                            label   = item.label,
                            checked = item.checked,
                            onToggle = { viewModel.toggleChecklist(item.key) }
                        )
                    }
                }
            }

            // ── Start error ────────────────────────────────────────────────
            if (state.startError != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(JadsColors.RedBlocked.copy(alpha = 0.1f), RoundedCornerShape(6.dp))
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Error, null, tint = JadsColors.RedBlocked, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(state.startError!!, style = MaterialTheme.typography.bodySmall, color = JadsColors.RedBlocked)
                }
            }

            // ── Start mission button ───────────────────────────────────────
            Button(
                onClick  = viewModel::startMission,
                enabled  = canStart,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors   = ButtonDefaults.buttonColors(
                    containerColor  = JadsColors.GreenClear,
                    disabledContainerColor = JadsColors.GreenClear.copy(alpha = 0.3f)
                ),
                shape    = RoundedCornerShape(8.dp)
            ) {
                if (state.isStarting) {
                    CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                    Text("Starting Mission...", color = Color.White, fontWeight = FontWeight.Bold)
                } else {
                    Icon(Icons.Default.FlightTakeoff, null, tint = Color.White)
                    Spacer(Modifier.width(8.dp))
                    Text("START MISSION", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(Modifier.height(16.dp))
        }
    }
}

// ── Supporting composables ────────────────────────────────────────────────────

@Composable
private fun NtpStatusCard(synced: Boolean, offsetMs: Long) {
    val (color, icon, label) = if (synced)
        Triple(JadsColors.GreenClear,   Icons.Default.CheckCircle, "NTP Synced")
    else
        Triple(JadsColors.RedBlocked,   Icons.Default.ErrorOutline, "NTP Not Synced")

    Card(
        shape  = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = color.copy(alpha = 0.08f)
        )
    ) {
        Row(
            Modifier.padding(14.dp).fillMaxWidth(),
            verticalAlignment    = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, null, tint = color, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(label, style = MaterialTheme.typography.titleSmall, color = color)
                    if (!synced) Text(
                        "Mission cannot start without NTP quorum",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            if (synced) Text(
                "±${offsetMs}ms",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun ChecklistRow(label: String, checked: Boolean, onToggle: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = { onToggle() },
            colors = CheckboxDefaults.colors(
                checkedColor   = JadsColors.GreenClear,
                checkmarkColor = Color.White
            )
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text  = label,
            style = MaterialTheme.typography.bodySmall,
            color = if (checked) MaterialTheme.colorScheme.onSurfaceVariant
                    else         MaterialTheme.colorScheme.onSurface
        )
    }
}
