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
import com.jads.ui.component.InfoRow
import com.jads.ui.component.SectionHeader
import com.jads.ui.component.StatusBadge
import com.jads.ui.theme.JadsColors
import com.jads.ui.viewmodel.DroneCategory
import com.jads.ui.viewmodel.FlightFormSubmission
import com.jads.ui.viewmodel.FlightFormViewModel
import com.jads.ui.viewmodel.FlightPurpose

// ─────────────────────────────────────────────────────────────────────────────
// FlightDetailsScreen — P24 progressive disclosure form for MICRO/SMALL drones.
//
// Fields:
//   - UIN picker (Unique Identification Number)
//   - Time window (start/end)
//   - Purpose dropdown
//   - Payload weight
//   - Self-declaration toggle
//   - Capabilities (RTH, Geo-fencing, DAA)
//   - Submit to eGCA
//
// For NANO_RECREATIONAL: use inline QuickPlanCard instead (no navigation).
// For AGRICULTURAL: navigate to AgriculturalFlightScreen (extra fields).
// For BVLOS/SPECIAL: navigate to SpecialOpsFlightScreen (SAF upload).
//
// No business logic — all state managed by FlightFormViewModel.
// ─────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FlightDetailsScreen(
    viewModel:        FlightFormViewModel,
    onSubmitSuccess:  () -> Unit,
    onBack:           () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var purposeExpanded by remember { mutableStateOf(false) }

    // Navigate on successful submission
    LaunchedEffect(state.submissionState) {
        if (state.submissionState is FlightFormSubmission.Success) {
            onSubmitSuccess()
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Flight Details", fontWeight = FontWeight.SemiBold)
                        Text(
                            "${state.droneCategory.displayName} (${state.droneCategory.weightRange})",
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
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // ── Zone context card ─────────────────────────────────────────
            ZoneContextCard(
                zoneType     = state.zoneType,
                altitude     = state.altitude,
                vertexCount  = state.polygon.size,
                atcAuthority = state.atcAuthority
            )

            // ── UIN picker ────────────────────────────────────────────────
            SectionHeader("Drone Identification")

            OutlinedTextField(
                value         = state.uinNumber,
                onValueChange = { viewModel.onUinChanged(it) },
                label         = { Text("UIN (Unique Identification Number)") },
                placeholder   = { Text("e.g. UA-XXXXX-YYYY") },
                leadingIcon   = { Icon(Icons.Default.QrCode, null) },
                singleLine    = true,
                modifier      = Modifier.fillMaxWidth()
            )

            // ── Time window ───────────────────────────────────────────────
            SectionHeader("Time Window")

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(
                    value         = state.startTime,
                    onValueChange = { viewModel.onStartTimeChanged(it) },
                    label         = { Text("Start (IST)") },
                    leadingIcon   = { Icon(Icons.Default.Schedule, null) },
                    singleLine    = true,
                    modifier      = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value         = state.endTime,
                    onValueChange = { viewModel.onEndTimeChanged(it) },
                    label         = { Text("End (IST)") },
                    leadingIcon   = { Icon(Icons.Default.Schedule, null) },
                    singleLine    = true,
                    modifier      = Modifier.weight(1f)
                )
            }

            // ── Flight purpose dropdown ───────────────────────────────────
            SectionHeader("Flight Purpose")

            ExposedDropdownMenuBox(
                expanded       = purposeExpanded,
                onExpandedChange = { purposeExpanded = !purposeExpanded }
            ) {
                OutlinedTextField(
                    value         = state.flightPurpose.displayName,
                    onValueChange = {},
                    readOnly      = true,
                    label         = { Text("Purpose of Flight") },
                    leadingIcon   = { Icon(Icons.Default.FlightTakeoff, null) },
                    trailingIcon  = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = purposeExpanded) },
                    modifier      = Modifier
                        .fillMaxWidth()
                        .menuAnchor()
                )
                ExposedDropdownMenu(
                    expanded   = purposeExpanded,
                    onDismissRequest = { purposeExpanded = false }
                ) {
                    FlightPurpose.entries.forEach { purpose ->
                        DropdownMenuItem(
                            text    = { Text(purpose.displayName) },
                            onClick = {
                                viewModel.onFlightPurposeChanged(purpose)
                                purposeExpanded = false
                            }
                        )
                    }
                }
            }

            // ── Payload weight ────────────────────────────────────────────
            SectionHeader("Payload")

            OutlinedTextField(
                value         = if (state.payloadWeightKg > 0) state.payloadWeightKg.toString() else "",
                onValueChange = { viewModel.onPayloadWeightChanged(it.toDoubleOrNull() ?: 0.0) },
                label         = { Text("Payload Weight (kg)") },
                leadingIcon   = { Icon(Icons.Default.Scale, null) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine    = true,
                modifier      = Modifier.fillMaxWidth()
            )

            // ── Capabilities ──────────────────────────────────────────────
            SectionHeader("Drone Capabilities")

            CapabilityToggle(
                label   = "Return-to-Home / Flight Termination",
                icon    = Icons.Default.Home,
                checked = state.rthCapability,
                onToggle = { viewModel.onRthToggled(it) }
            )
            CapabilityToggle(
                label   = "Active Geo-Fencing",
                icon    = Icons.Default.Fence,
                checked = state.geofencingEnabled,
                onToggle = { viewModel.onGeofencingToggled(it) }
            )
            CapabilityToggle(
                label   = "Detect and Avoid System",
                icon    = Icons.Default.Radar,
                checked = state.daaEnabled,
                onToggle = { viewModel.onDaaToggled(it) }
            )

            // ── Self-declaration ──────────────────────────────────────────
            SectionHeader("Legal Declaration")

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    Checkbox(
                        checked   = state.selfDeclared,
                        onCheckedChange = { viewModel.onSelfDeclared(it) },
                        colors    = CheckboxDefaults.colors(
                            checkedColor = JadsColors.GreenClear
                        )
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text  = "I declare that this UAS operation complies with DGCA Drone Rules 2021, " +
                                "Rule 39, and all applicable provisions of the UAS Rules 2021. " +
                                "The information provided is true and accurate.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // ── Error display ─────────────────────────────────────────────
            if (state.submissionState is FlightFormSubmission.Error) {
                val error = (state.submissionState as FlightFormSubmission.Error).message
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = JadsColors.RedBlocked.copy(alpha = 0.1f)
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Error, null, tint = JadsColors.RedBlocked, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text  = error,
                            style = MaterialTheme.typography.bodySmall,
                            color = JadsColors.RedBlocked
                        )
                    }
                }
            }

            // ── Submit button ─────────────────────────────────────────────
            Button(
                onClick  = { viewModel.submitToEgca() },
                enabled  = viewModel.canSubmitFlightDetails() &&
                           state.submissionState !is FlightFormSubmission.Loading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                colors   = ButtonDefaults.buttonColors(
                    containerColor         = JadsColors.GreenClear,
                    disabledContainerColor = JadsColors.GreenClear.copy(alpha = 0.3f)
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                if (state.submissionState is FlightFormSubmission.Loading) {
                    CircularProgressIndicator(
                        modifier    = Modifier.size(20.dp),
                        color       = Color.White,
                        strokeWidth = 2.dp
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("Submitting to eGCA...", color = Color.White)
                } else {
                    Icon(Icons.Default.Upload, null, tint = Color.White)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text       = "Submit to eGCA",
                        color      = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// QuickPlanCard — inline 3-field form for NANO_RECREATIONAL drones.
// No navigation required. No eGCA submission.
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun QuickPlanCard(
    viewModel: FlightFormViewModel,
    modifier:  Modifier = Modifier
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Card(
        modifier = modifier.fillMaxWidth(),
        shape    = RoundedCornerShape(12.dp),
        colors   = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.FlightTakeoff,
                    contentDescription = null,
                    tint     = JadsColors.SkyBlue,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text  = "Quick Flight Plan",
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.weight(1f))
                StatusBadge(label = "NANO", color = JadsColors.SkyBlue)
            }

            Text(
                text  = "No eGCA submission required for Nano recreational flights (< 250g).",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            // Field 1: Drone description
            OutlinedTextField(
                value         = state.nanoDescription,
                onValueChange = { viewModel.onNanoDescriptionChanged(it) },
                label         = { Text("Drone Description") },
                placeholder   = { Text("e.g. DJI Mini 3") },
                singleLine    = true,
                modifier      = Modifier.fillMaxWidth()
            )

            // Field 2: Location (tap on map)
            OutlinedTextField(
                value         = if (state.nanoLocationLat != null)
                    String.format("%.4f, %.4f", state.nanoLocationLat, state.nanoLocationLon)
                else "",
                onValueChange = {},
                label         = { Text("Location (tap on map)") },
                readOnly      = true,
                leadingIcon   = { Icon(Icons.Default.LocationOn, null) },
                singleLine    = true,
                modifier      = Modifier.fillMaxWidth()
            )

            // Field 3: Flight duration
            OutlinedTextField(
                value         = state.nanoTimeMinutes.toString(),
                onValueChange = {
                    viewModel.onNanoTimeChanged(it.toIntOrNull() ?: 15)
                },
                label         = { Text("Duration (minutes)") },
                leadingIcon   = { Icon(Icons.Default.Timer, null) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine    = true,
                modifier      = Modifier.fillMaxWidth()
            )

            // Save button
            Button(
                onClick  = { viewModel.saveNanoQuickPlan() },
                enabled  = state.nanoDescription.isNotBlank() && !state.nanoQuickPlanSaved,
                modifier = Modifier.fillMaxWidth(),
                colors   = ButtonDefaults.buttonColors(containerColor = JadsColors.SkyBlue),
                shape    = RoundedCornerShape(8.dp)
            ) {
                if (state.nanoQuickPlanSaved) {
                    Icon(Icons.Default.Check, null, tint = Color.White)
                    Spacer(Modifier.width(8.dp))
                    Text("Saved", color = Color.White)
                } else {
                    Text("Save Quick Plan", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ZoneContextCard — shows zone + altitude + polygon info at top of form
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun ZoneContextCard(
    zoneType:     String,
    altitude:     Int,
    vertexCount:  Int,
    atcAuthority: String?
) {
    val (zoneColor, zoneName) = when (zoneType) {
        "RED"    -> JadsColors.RedBlocked        to "RED ZONE"
        "YELLOW" -> JadsColors.OrangeConditional to "YELLOW ZONE"
        else     -> JadsColors.GreenClear        to "GREEN ZONE"
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape    = RoundedCornerShape(8.dp),
        colors   = CardDefaults.cardColors(
            containerColor = zoneColor.copy(alpha = 0.08f)
        )
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(
                modifier          = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                StatusBadge(label = zoneName, color = zoneColor)
                Text(
                    text  = "${altitude}m AGL",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            Spacer(Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text  = "$vertexCount vertices",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (atcAuthority != null) {
                    Text(
                        text  = "Authority: $atcAuthority",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CapabilityToggle — labelled switch with icon
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun CapabilityToggle(
    label:    String,
    icon:     androidx.compose.ui.graphics.vector.ImageVector,
    checked:  Boolean,
    onToggle: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment     = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                icon,
                contentDescription = null,
                tint     = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp)
            )
            Spacer(Modifier.width(10.dp))
            Text(
                text  = label,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
        Switch(
            checked         = checked,
            onCheckedChange = onToggle,
            colors          = SwitchDefaults.colors(
                checkedTrackColor = JadsColors.GreenClear
            )
        )
    }
}
