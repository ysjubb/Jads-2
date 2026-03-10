package com.jads.ui.screen

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jads.ui.component.InfoRow
import com.jads.ui.component.SectionHeader
import com.jads.ui.component.StatusBadge
import com.jads.ui.theme.JadsColors
import com.jads.ui.viewmodel.FlightFormSubmission
import com.jads.ui.viewmodel.FlightFormViewModel
import kotlinx.coroutines.launch

// ─────────────────────────────────────────────────────────────────────────────
// SpecialOpsFlightScreen — P24 multi-step form for BVLOS / Rule 70 exemption.
//
// Uses a HorizontalPager with 3 steps:
//   Step 1: Operation Details — exemption type, narrative, flight window
//   Step 2: SAF Document Upload — PDF file picker for Rule 70 SAF
//   Step 3: Review & Submit — summary of all fields, submit to eGCA
//
// SAF (Safety Assessment Form) is required under DGCA Rule 70 for
// BVLOS, night operations, and special operations beyond standard
// weight/altitude limits.
//
// No business logic — all state managed by FlightFormViewModel.
// ─────────────────────────────────────────────────────────────────────────────

private const val TOTAL_STEPS = 3

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
fun SpecialOpsFlightScreen(
    viewModel:       FlightFormViewModel,
    onSubmitSuccess: () -> Unit,
    onBack:          () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val pagerState = rememberPagerState(pageCount = { TOTAL_STEPS })
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    // Navigate on successful submission
    LaunchedEffect(state.submissionState) {
        if (state.submissionState is FlightFormSubmission.Success) {
            onSubmitSuccess()
        }
    }

    // SAF PDF file picker
    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        uri?.let {
            val fileName = uri.lastPathSegment ?: "saf_document.pdf"
            viewModel.onSafFileSelected(uri.toString(), fileName)
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Special Operations", fontWeight = FontWeight.SemiBold)
                        Text(
                            "Rule 70 Exemption Application",
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
        ) {
            // ── Step indicators ──────────────────────────────────────────
            StepIndicator(
                currentStep = pagerState.currentPage,
                totalSteps  = TOTAL_STEPS,
                labels      = listOf("Operation", "Documents", "Review")
            )

            // ── Pager content ────────────────────────────────────────────
            HorizontalPager(
                state    = pagerState,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                userScrollEnabled = false
            ) { page ->
                when (page) {
                    0 -> OperationDetailsPage(
                        viewModel = viewModel,
                        state     = state,
                        onNext    = {
                            scope.launch { pagerState.animateScrollToPage(1) }
                        }
                    )
                    1 -> DocumentUploadPage(
                        viewModel = viewModel,
                        state     = state,
                        onPickFile = {
                            filePickerLauncher.launch(arrayOf("application/pdf"))
                        },
                        onNext = {
                            scope.launch { pagerState.animateScrollToPage(2) }
                        },
                        onBack = {
                            scope.launch { pagerState.animateScrollToPage(0) }
                        }
                    )
                    2 -> ReviewSubmitPage(
                        viewModel = viewModel,
                        state     = state,
                        onBack    = {
                            scope.launch { pagerState.animateScrollToPage(1) }
                        }
                    )
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// StepIndicator — horizontal dot + label indicators
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun StepIndicator(
    currentStep: Int,
    totalSteps:  Int,
    labels:      List<String>
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 24.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment     = Alignment.CenterVertically
    ) {
        for (i in 0 until totalSteps) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.weight(1f)
            ) {
                Box(
                    modifier = Modifier
                        .size(if (i == currentStep) 12.dp else 10.dp)
                        .clip(CircleShape)
                        .background(
                            when {
                                i < currentStep  -> JadsColors.GreenClear
                                i == currentStep -> JadsColors.Amber
                                else             -> MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)
                            }
                        )
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text  = labels.getOrElse(i) { "Step ${i + 1}" },
                    style = MaterialTheme.typography.labelSmall,
                    color = if (i == currentStep)
                        MaterialTheme.colorScheme.onSurface
                    else
                        MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = if (i == currentStep) FontWeight.Bold else FontWeight.Normal
                )
            }

            // Connector line between steps
            if (i < totalSteps - 1) {
                Divider(
                    modifier  = Modifier
                        .width(24.dp)
                        .padding(bottom = 16.dp),
                    color     = if (i < currentStep)
                        JadsColors.GreenClear
                    else
                        MaterialTheme.colorScheme.outline.copy(alpha = 0.3f),
                    thickness = 1.5.dp
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Operation Details
// ─────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OperationDetailsPage(
    viewModel: FlightFormViewModel,
    state:     com.jads.ui.viewmodel.FlightFormUiState,
    onNext:    () -> Unit
) {
    var exemptionExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // ── Zone context ──────────────────────────────────────────────
        val (zoneColor, zoneName) = when (state.zoneType) {
            "RED"    -> JadsColors.RedBlocked        to "RED ZONE"
            "YELLOW" -> JadsColors.OrangeConditional to "YELLOW ZONE"
            else     -> JadsColors.GreenClear        to "GREEN ZONE"
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape    = RoundedCornerShape(8.dp),
            colors   = CardDefaults.cardColors(containerColor = zoneColor.copy(alpha = 0.08f))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment     = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StatusBadge(label = zoneName, color = zoneColor)
                    Spacer(Modifier.width(8.dp))
                    Icon(Icons.Default.Shield, null, tint = JadsColors.Amber, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Special Ops", style = MaterialTheme.typography.labelMedium)
                }
                Text(
                    "${state.altitude}m AGL",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                )
            }
        }

        // ── Exemption type ────────────────────────────────────────────
        SectionHeader("Exemption Type")

        ExposedDropdownMenuBox(
            expanded         = exemptionExpanded,
            onExpandedChange = { exemptionExpanded = !exemptionExpanded }
        ) {
            OutlinedTextField(
                value         = when (state.exemptionType) {
                    "RULE_70"  -> "Rule 70 — General Exemption"
                    "BVLOS"    -> "BVLOS Operations"
                    "NIGHT"    -> "Night Operations"
                    "SWARM"    -> "Swarm Operations"
                    else       -> state.exemptionType
                },
                onValueChange = {},
                readOnly      = true,
                label         = { Text("Exemption Category") },
                leadingIcon   = { Icon(Icons.Default.Policy, null) },
                trailingIcon  = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = exemptionExpanded) },
                modifier      = Modifier
                    .fillMaxWidth()
                    .menuAnchor()
            )
            ExposedDropdownMenu(
                expanded         = exemptionExpanded,
                onDismissRequest = { exemptionExpanded = false }
            ) {
                listOf(
                    "RULE_70"  to "Rule 70 -- General Exemption",
                    "BVLOS"    to "BVLOS Operations",
                    "NIGHT"    to "Night Operations",
                    "SWARM"    to "Swarm Operations"
                ).forEach { (value, label) ->
                    DropdownMenuItem(
                        text    = { Text(label) },
                        onClick = {
                            viewModel.onExemptionTypeChanged(value)
                            exemptionExpanded = false
                        }
                    )
                }
            }
        }

        // ── UIN ───────────────────────────────────────────────────────
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
                singleLine    = true,
                modifier      = Modifier.weight(1f)
            )
            OutlinedTextField(
                value         = state.endTime,
                onValueChange = { viewModel.onEndTimeChanged(it) },
                label         = { Text("End (IST)") },
                singleLine    = true,
                modifier      = Modifier.weight(1f)
            )
        }

        // ── Operation narrative ───────────────────────────────────────
        SectionHeader("Operation Description")

        OutlinedTextField(
            value         = state.operationNarrative,
            onValueChange = { viewModel.onOperationNarrativeChanged(it) },
            label         = { Text("Detailed Operation Narrative") },
            placeholder   = { Text("Describe the special operation, safety measures, risk mitigations...") },
            minLines      = 4,
            maxLines      = 8,
            modifier      = Modifier.fillMaxWidth()
        )

        // ── Capabilities ──────────────────────────────────────────────
        SectionHeader("Drone Capabilities")

        SpecialOpsToggle("Return-to-Home", Icons.Default.Home, state.rthCapability) {
            viewModel.onRthToggled(it)
        }
        SpecialOpsToggle("Geo-Fencing", Icons.Default.Fence, state.geofencingEnabled) {
            viewModel.onGeofencingToggled(it)
        }
        SpecialOpsToggle("Detect & Avoid", Icons.Default.Radar, state.daaEnabled) {
            viewModel.onDaaToggled(it)
        }

        // ── Next button ───────────────────────────────────────────────
        Button(
            onClick  = onNext,
            enabled  = state.uinNumber.isNotBlank() && state.operationNarrative.isNotBlank(),
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            colors   = ButtonDefaults.buttonColors(containerColor = JadsColors.Amber),
            shape    = RoundedCornerShape(8.dp)
        ) {
            Text("Continue to Documents", color = Color.White, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(8.dp))
            Icon(Icons.Default.ArrowForward, null, tint = Color.White)
        }

        Spacer(Modifier.height(16.dp))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Document Upload
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun DocumentUploadPage(
    viewModel:   FlightFormViewModel,
    state:       com.jads.ui.viewmodel.FlightFormUiState,
    onPickFile:  () -> Unit,
    onNext:      () -> Unit,
    onBack:      () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // ── SAF info card ─────────────────────────────────────────────
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape    = RoundedCornerShape(8.dp),
            colors   = CardDefaults.cardColors(
                containerColor = JadsColors.Amber.copy(alpha = 0.08f)
            )
        ) {
            Column(Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Description,
                        contentDescription = null,
                        tint     = JadsColors.Amber,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text       = "Safety Assessment Form (SAF)",
                        style      = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color      = MaterialTheme.colorScheme.onSurface
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    text  = "Under DGCA Rule 70, all special operations (BVLOS, night, " +
                            "swarm, weight/altitude exemptions) require submission of a " +
                            "completed Safety Assessment Form (SAF) in PDF format.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        SectionHeader("Upload SAF Document")

        // ── File picker button ────────────────────────────────────────
        OutlinedButton(
            onClick  = onPickFile,
            modifier = Modifier
                .fillMaxWidth()
                .height(80.dp),
            shape    = RoundedCornerShape(8.dp),
            border   = ButtonDefaults.outlinedButtonBorder
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    if (state.safFileUri != null) Icons.Default.CheckCircle else Icons.Default.UploadFile,
                    contentDescription = null,
                    tint     = if (state.safFileUri != null) JadsColors.GreenClear else JadsColors.Amber,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text  = if (state.safFileUri != null)
                        state.safFileName ?: "Document selected"
                    else
                        "Select PDF file",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (state.safFileUri != null)
                        JadsColors.GreenClear
                    else
                        MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        if (state.safFileUri != null) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors   = CardDefaults.cardColors(
                    containerColor = JadsColors.GreenClear.copy(alpha = 0.08f)
                ),
                shape    = RoundedCornerShape(8.dp)
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.PictureAsPdf, null, tint = JadsColors.RedBlocked, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            text  = state.safFileName ?: "saf_document.pdf",
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text  = "PDF document ready for upload",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Icon(Icons.Default.CheckCircle, null, tint = JadsColors.GreenClear, modifier = Modifier.size(20.dp))
                }
            }
        }

        // ── Required documents checklist ──────────────────────────────
        SectionHeader("Required Documents Checklist")

        DocumentCheckItem("Safety Assessment Form (SAF)", state.safFileUri != null)
        DocumentCheckItem("Operator insurance certificate", false)
        DocumentCheckItem("Operations manual / SOP", false)
        if (state.exemptionType == "BVLOS") {
            DocumentCheckItem("SORA assessment report", false)
        }

        Text(
            text  = "Additional documents can be submitted through the eGCA portal after initial application.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
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
                    checked = state.selfDeclared,
                    onCheckedChange = { viewModel.onSelfDeclared(it) },
                    colors = CheckboxDefaults.colors(checkedColor = JadsColors.GreenClear)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text  = "I declare that this special UAS operation complies with DGCA " +
                            "Drone Rules 2021 (Rule 70 exemption provisions) and all applicable " +
                            "regulations. The SAF and supporting documents are accurate.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        // ── Navigation buttons ────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedButton(
                onClick  = onBack,
                modifier = Modifier.weight(1f).height(48.dp),
                shape    = RoundedCornerShape(8.dp)
            ) {
                Icon(Icons.Default.ArrowBack, null)
                Spacer(Modifier.width(4.dp))
                Text("Back")
            }
            Button(
                onClick  = onNext,
                enabled  = state.safFileUri != null && state.selfDeclared,
                modifier = Modifier.weight(1f).height(48.dp),
                colors   = ButtonDefaults.buttonColors(containerColor = JadsColors.Amber),
                shape    = RoundedCornerShape(8.dp)
            ) {
                Text("Review", color = Color.White, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(4.dp))
                Icon(Icons.Default.ArrowForward, null, tint = Color.White)
            }
        }

        Spacer(Modifier.height(16.dp))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Review & Submit
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun ReviewSubmitPage(
    viewModel: FlightFormViewModel,
    state:     com.jads.ui.viewmodel.FlightFormUiState,
    onBack:    () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // ── Summary card ──────────────────────────────────────────────
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape    = RoundedCornerShape(8.dp),
            colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    text       = "Application Summary",
                    style      = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(12.dp))

                InfoRow(label = "Exemption", value = state.exemptionType)
                InfoRow(label = "UIN", value = state.uinNumber.ifBlank { "Not set" })
                InfoRow(label = "Zone", value = state.zoneType)
                InfoRow(label = "Altitude", value = "${state.altitude}m AGL")
                InfoRow(label = "Polygon", value = "${state.polygon.size} vertices")
                InfoRow(label = "Start", value = state.startTime.ifBlank { "Not set" })
                InfoRow(label = "End", value = state.endTime.ifBlank { "Not set" })

                Divider(Modifier.padding(vertical = 8.dp))

                InfoRow(label = "RTH Capability", value = if (state.rthCapability) "Yes" else "No")
                InfoRow(label = "Geo-Fencing", value = if (state.geofencingEnabled) "Yes" else "No")
                InfoRow(label = "DAA System", value = if (state.daaEnabled) "Yes" else "No")

                Divider(Modifier.padding(vertical = 8.dp))

                InfoRow(
                    label = "SAF Document",
                    value = state.safFileName ?: "Not uploaded",
                    valueColor = if (state.safFileUri != null) JadsColors.GreenClear else JadsColors.RedBlocked
                )
                InfoRow(
                    label = "Self-Declaration",
                    value = if (state.selfDeclared) "Accepted" else "Not accepted",
                    valueColor = if (state.selfDeclared) JadsColors.GreenClear else JadsColors.RedBlocked
                )
            }
        }

        // ── Operation narrative preview ───────────────────────────────
        if (state.operationNarrative.isNotBlank()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape    = RoundedCornerShape(8.dp),
                colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            ) {
                Column(Modifier.padding(12.dp)) {
                    Text(
                        text       = "Operation Narrative",
                        style      = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color      = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text  = state.operationNarrative,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }

        // ── Error display ─────────────────────────────────────────────
        if (state.submissionState is FlightFormSubmission.Error) {
            val error = (state.submissionState as FlightFormSubmission.Error).message
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors   = CardDefaults.cardColors(containerColor = JadsColors.RedBlocked.copy(alpha = 0.1f)),
                shape    = RoundedCornerShape(8.dp)
            ) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Error, null, tint = JadsColors.RedBlocked, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(error, style = MaterialTheme.typography.bodySmall, color = JadsColors.RedBlocked)
                }
            }
        }

        // ── Success display ───────────────────────────────────────────
        if (state.submissionState is FlightFormSubmission.Success) {
            val success = state.submissionState as FlightFormSubmission.Success
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors   = CardDefaults.cardColors(containerColor = JadsColors.GreenClear.copy(alpha = 0.1f)),
                shape    = RoundedCornerShape(8.dp)
            ) {
                Column(Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CheckCircle, null, tint = JadsColors.GreenClear, modifier = Modifier.size(24.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Application Submitted",
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                            color = JadsColors.GreenClear
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    InfoRow(label = "Application ID", value = success.applicationId)
                    if (success.referenceNumber != null) {
                        InfoRow(label = "Reference", value = success.referenceNumber)
                    }
                    InfoRow(label = "Submitted", value = success.submittedAt)
                }
            }
        }

        // ── Navigation buttons ────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedButton(
                onClick  = onBack,
                modifier = Modifier.weight(1f).height(48.dp),
                shape    = RoundedCornerShape(8.dp)
            ) {
                Icon(Icons.Default.ArrowBack, null)
                Spacer(Modifier.width(4.dp))
                Text("Back")
            }
            Button(
                onClick  = { viewModel.submitToEgca() },
                enabled  = viewModel.canSubmitSpecialOps() &&
                           state.submissionState !is FlightFormSubmission.Loading &&
                           state.submissionState !is FlightFormSubmission.Success,
                modifier = Modifier.weight(1f).height(48.dp),
                colors   = ButtonDefaults.buttonColors(
                    containerColor         = JadsColors.GreenClear,
                    disabledContainerColor = JadsColors.GreenClear.copy(alpha = 0.3f)
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                if (state.submissionState is FlightFormSubmission.Loading) {
                    CircularProgressIndicator(
                        modifier    = Modifier.size(18.dp),
                        color       = Color.White,
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(Icons.Default.Upload, null, tint = Color.White)
                    Spacer(Modifier.width(4.dp))
                    Text("Submit", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        }

        Spacer(Modifier.height(32.dp))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DocumentCheckItem — checklist row with icon
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun DocumentCheckItem(label: String, completed: Boolean) {
    Row(
        modifier          = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            if (completed) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
            contentDescription = null,
            tint     = if (completed) JadsColors.GreenClear else MaterialTheme.colorScheme.outline,
            modifier = Modifier.size(18.dp)
        )
        Spacer(Modifier.width(10.dp))
        Text(
            text  = label,
            style = MaterialTheme.typography.bodySmall,
            color = if (completed)
                MaterialTheme.colorScheme.onSurface
            else
                MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SpecialOpsToggle — switch row for special ops screen
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun SpecialOpsToggle(
    label:    String,
    icon:     androidx.compose.ui.graphics.vector.ImageVector,
    checked:  Boolean,
    onToggle: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
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
