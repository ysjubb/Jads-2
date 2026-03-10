package com.jads.ui.screen

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
import com.jads.ui.viewmodel.FlightFormSubmission
import com.jads.ui.viewmodel.FlightFormViewModel
import com.jads.ui.viewmodel.FlightPurpose

// ─────────────────────────────────────────────────────────────────────────────
// AgriculturalFlightScreen — P24 agricultural drone form extension.
//
// Extends the base flight details with agriculture-specific fields:
//   - Pesticide name
//   - CIB&RC registration number
//   - Crop type
//   - Spray volume (litres)
//   - Field owner contact (name + phone)
//
// All agricultural drone operations require eGCA submission.
// Uses FlightFormViewModel for state management.
// ─────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgriculturalFlightScreen(
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
                        Text("Agricultural Flight", fontWeight = FontWeight.SemiBold)
                        Text(
                            "Pesticide / Crop Spraying Operation",
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
            AgriZoneCard(
                zoneType    = state.zoneType,
                altitude    = state.altitude,
                vertexCount = state.polygon.size
            )

            // ── Drone identification ──────────────────────────────────────
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

            // ── Pesticide information ─────────────────────────────────────
            SectionHeader("Pesticide Information")

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape    = RoundedCornerShape(8.dp),
                colors   = CardDefaults.cardColors(
                    containerColor = JadsColors.GreenClear.copy(alpha = 0.06f)
                )
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.Eco,
                            contentDescription = null,
                            tint     = JadsColors.GreenClear,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text  = "As per Insecticides Act 1968, all pesticide application " +
                                    "drones must carry CIB&RC registered products only.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            OutlinedTextField(
                value         = state.pesticideName,
                onValueChange = { viewModel.onPesticideNameChanged(it) },
                label         = { Text("Pesticide / Chemical Name") },
                placeholder   = { Text("e.g. Imidacloprid 17.8% SL") },
                leadingIcon   = { Icon(Icons.Default.Science, null) },
                singleLine    = true,
                modifier      = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value         = state.cibrcNumber,
                onValueChange = { viewModel.onCibrcNumberChanged(it) },
                label         = { Text("CIB&RC Registration Number") },
                placeholder   = { Text("e.g. CIR-XXX-YYYY") },
                leadingIcon   = { Icon(Icons.Default.Badge, null) },
                singleLine    = true,
                modifier      = Modifier.fillMaxWidth()
            )

            // ── Crop & field information ──────────────────────────────────
            SectionHeader("Crop & Field Information")

            OutlinedTextField(
                value         = state.cropType,
                onValueChange = { viewModel.onCropTypeChanged(it) },
                label         = { Text("Crop Type") },
                placeholder   = { Text("e.g. Wheat, Rice, Cotton") },
                leadingIcon   = { Icon(Icons.Default.Grass, null) },
                singleLine    = true,
                modifier      = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value         = if (state.sprayVolumeLitres > 0) state.sprayVolumeLitres.toString() else "",
                onValueChange = { viewModel.onSprayVolumeChanged(it.toDoubleOrNull() ?: 0.0) },
                label         = { Text("Spray Volume (litres)") },
                placeholder   = { Text("e.g. 10.0") },
                leadingIcon   = { Icon(Icons.Default.Water, null) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine    = true,
                modifier      = Modifier.fillMaxWidth()
            )

            // ── Field owner contact ───────────────────────────────────────
            SectionHeader("Field Owner Contact")

            OutlinedTextField(
                value         = state.fieldOwnerName,
                onValueChange = { viewModel.onFieldOwnerNameChanged(it) },
                label         = { Text("Field Owner Name") },
                leadingIcon   = { Icon(Icons.Default.Person, null) },
                singleLine    = true,
                modifier      = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value         = state.fieldOwnerPhone,
                onValueChange = { viewModel.onFieldOwnerPhoneChanged(it) },
                label         = { Text("Field Owner Phone") },
                placeholder   = { Text("+91-XXXXXXXXXX") },
                leadingIcon   = { Icon(Icons.Default.Phone, null) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                singleLine    = true,
                modifier      = Modifier.fillMaxWidth()
            )

            // ── Payload weight ────────────────────────────────────────────
            SectionHeader("Payload")

            OutlinedTextField(
                value         = if (state.payloadWeightKg > 0) state.payloadWeightKg.toString() else "",
                onValueChange = { viewModel.onPayloadWeightChanged(it.toDoubleOrNull() ?: 0.0) },
                label         = { Text("Total Payload Weight (kg)") },
                leadingIcon   = { Icon(Icons.Default.Scale, null) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine    = true,
                modifier      = Modifier.fillMaxWidth()
            )

            // ── Capabilities ──────────────────────────────────────────────
            SectionHeader("Drone Capabilities")

            AgriCapabilityRow("Return-to-Home", Icons.Default.Home, state.rthCapability) {
                viewModel.onRthToggled(it)
            }
            AgriCapabilityRow("Geo-Fencing", Icons.Default.Fence, state.geofencingEnabled) {
                viewModel.onGeofencingToggled(it)
            }
            AgriCapabilityRow("Detect & Avoid", Icons.Default.Radar, state.daaEnabled) {
                viewModel.onDaaToggled(it)
            }

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
                        checked = state.selfDeclared,
                        onCheckedChange = { viewModel.onSelfDeclared(it) },
                        colors = CheckboxDefaults.colors(checkedColor = JadsColors.GreenClear)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text  = "I declare that this agricultural UAS operation complies with " +
                                "DGCA Drone Rules 2021 (Rule 39), Insecticides Act 1968, and " +
                                "all applicable CIB&RC guidelines. The pesticide being applied " +
                                "is registered and approved for drone-based aerial application.",
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
                        Text(error, style = MaterialTheme.typography.bodySmall, color = JadsColors.RedBlocked)
                    }
                }
            }

            // ── Submit button ─────────────────────────────────────────────
            Button(
                onClick  = { viewModel.submitToEgca() },
                enabled  = viewModel.canSubmitAgricultural() &&
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
                        text       = "Submit Agricultural Flight Plan",
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
// AgriZoneCard — compact zone context for agricultural screen
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun AgriZoneCard(
    zoneType:    String,
    altitude:    Int,
    vertexCount: Int
) {
    val (color, label) = when (zoneType) {
        "RED"    -> JadsColors.RedBlocked        to "RED ZONE"
        "YELLOW" -> JadsColors.OrangeConditional to "YELLOW ZONE"
        else     -> JadsColors.GreenClear        to "GREEN ZONE"
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape    = RoundedCornerShape(8.dp),
        colors   = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.08f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment     = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusBadge(label = label, color = color)
                Spacer(Modifier.width(8.dp))
                Icon(
                    Icons.Default.Eco,
                    contentDescription = null,
                    tint     = JadsColors.GreenClear,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text  = "Agricultural",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                text  = "${altitude}m AGL | $vertexCount pts",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AgriCapabilityRow — switch row for agricultural screen
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun AgriCapabilityRow(
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
            Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(10.dp))
            Text(label, style = MaterialTheme.typography.bodyMedium)
        }
        Switch(
            checked         = checked,
            onCheckedChange = onToggle,
            colors          = SwitchDefaults.colors(checkedTrackColor = JadsColors.GreenClear)
        )
    }
}
