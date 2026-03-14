package com.jads.ui.screen

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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jads.ui.component.InfoRow
import com.jads.ui.component.SectionHeader
import com.jads.ui.component.StatusBadge
import com.jads.ui.theme.JadsColors
import com.jads.ui.viewmodel.OperationType
import com.jads.ui.viewmodel.SubmissionState
import com.jads.ui.viewmodel.YellowZoneViewModel
import kotlinx.coroutines.launch

// ─────────────────────────────────────────────────────────────────────────────
// YellowZoneSubmissionScreen — P15 Yellow Zone flight permission submission.
//
// Launched when AirspaceMapScreen (P09) detects a YELLOW zone.
// Uses a HorizontalPager with 3 pages:
//   Page 1: Authority Info (read-only — ATC name, contact, expedited badge)
//   Page 2: Operation Details (form — type, capabilities, self-declaration)
//   Page 3: Review & Submit (summary + submit to eGCA)
//
// After successful submission, navigates to MissionHistoryScreen.
// No business logic in this composable — all state managed by YellowZoneViewModel.
// ─────────────────────────────────────────────────────────────────────────────

private const val PAGE_COUNT = 3

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun YellowZoneSubmissionScreen(
    viewModel:            YellowZoneViewModel,
    onSubmissionSuccess:  () -> Unit,
    onBack:               () -> Unit
) {
    val state      by viewModel.state.collectAsStateWithLifecycle()
    val pagerState = rememberPagerState(pageCount = { PAGE_COUNT })
    val scope      = rememberCoroutineScope()

    // Navigate to history on successful submission
    LaunchedEffect(state.submissionState) {
        if (state.submissionState is SubmissionState.Success) {
            // Small delay so the user can see the success state
            kotlinx.coroutines.delay(2000)
            onSubmissionSuccess()
        }
    }

    val pageLabels = listOf("Authority", "Details", "Review")

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Yellow Zone Submission", fontWeight = FontWeight.SemiBold)
                        Text(
                            "DGCA Flight Permission Application",
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
            // ── Page indicator ───────────────────────────────────────────────
            PageIndicatorRow(
                currentPage = pagerState.currentPage,
                pageLabels  = pageLabels
            )

            // ── Pager ────────────────────────────────────────────────────────
            HorizontalPager(
                state    = pagerState,
                modifier = Modifier.weight(1f)
            ) { page ->
                when (page) {
                    0 -> AuthorityInfoPage(
                        authorityName    = state.authorityName,
                        authorityContact = state.authorityContact,
                        expedited        = state.expeditedEligible,
                        expectedDays     = state.expectedDays,
                        zoneName         = state.zoneResult?.zone ?: "YELLOW",
                        reasons          = state.zoneResult?.reasons ?: emptyList()
                    )
                    1 -> OperationDetailsPage(
                        operationType    = state.operationType,
                        rthCapability    = state.rthCapability,
                        geofencing       = state.geofencingEnabled,
                        daa              = state.daaEnabled,
                        selfDeclared     = state.selfDeclared,
                        pilotName        = state.pilotName,
                        uinNumber        = state.uinNumber,
                        droneId          = state.droneId,
                        onOperationTypeChanged = viewModel::onOperationTypeChanged,
                        onRthToggled           = viewModel::onRthToggled,
                        onGeofencingToggled    = viewModel::onGeofencingToggled,
                        onDaaToggled           = viewModel::onDaaToggled,
                        onSelfDeclared         = viewModel::onSelfDeclared,
                        onPilotNameChanged     = viewModel::onPilotNameChanged,
                        onUinChanged           = viewModel::onUinChanged,
                        onDroneIdChanged       = viewModel::onDroneIdChanged
                    )
                    2 -> ReviewSubmitPage(
                        state           = state,
                        canSubmit       = viewModel.canSubmit(),
                        onSubmit        = viewModel::submitToEgca,
                        onResetError    = viewModel::resetSubmission
                    )
                }
            }

            // ── Bottom navigation arrows ─────────────────────────────────────
            PagerNavigationRow(
                currentPage  = pagerState.currentPage,
                pageCount    = PAGE_COUNT,
                onPrevious   = {
                    scope.launch { pagerState.animateScrollToPage(pagerState.currentPage - 1) }
                },
                onNext       = {
                    scope.launch { pagerState.animateScrollToPage(pagerState.currentPage + 1) }
                }
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page indicator row — dots + labels
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun PageIndicatorRow(
    currentPage: Int,
    pageLabels:  List<String>
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment     = Alignment.CenterVertically
    ) {
        pageLabels.forEachIndexed { idx, label ->
            val isActive = idx == currentPage
            val dotColor = if (isActive) JadsColors.OrangeConditional
                           else          MaterialTheme.colorScheme.surfaceVariant

            if (idx > 0) {
                // Connector line
                Box(
                    modifier = Modifier
                        .width(24.dp)
                        .height(2.dp)
                        .background(
                            if (idx <= currentPage) JadsColors.OrangeConditional.copy(alpha = 0.5f)
                            else MaterialTheme.colorScheme.surfaceVariant
                        )
                )
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(if (isActive) 12.dp else 8.dp)
                        .clip(CircleShape)
                        .background(dotColor)
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text  = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isActive) JadsColors.OrangeConditional
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = if (isActive) FontWeight.Bold else FontWeight.Normal
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pager bottom navigation
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun PagerNavigationRow(
    currentPage: Int,
    pageCount:   Int,
    onPrevious:  () -> Unit,
    onNext:      () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment     = Alignment.CenterVertically
    ) {
        // Previous button
        if (currentPage > 0) {
            OutlinedButton(
                onClick = onPrevious,
                shape   = RoundedCornerShape(8.dp),
                colors  = OutlinedButtonDefaults.outlinedButtonColors(
                    contentColor = JadsColors.OrangeConditional
                ),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp, JadsColors.OrangeConditional.copy(alpha = 0.5f)
                )
            ) {
                Icon(Icons.Default.ArrowBack, null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Previous")
            }
        } else {
            Spacer(Modifier.width(1.dp))
        }

        // Page counter
        Text(
            text  = "${currentPage + 1} / $pageCount",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        // Next button
        if (currentPage < pageCount - 1) {
            Button(
                onClick = onNext,
                shape   = RoundedCornerShape(8.dp),
                colors  = ButtonDefaults.buttonColors(
                    containerColor = JadsColors.OrangeConditional
                )
            ) {
                Text("Next", color = Color.Black, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(4.dp))
                Icon(Icons.Default.ArrowForward, null, tint = Color.Black, modifier = Modifier.size(16.dp))
            }
        } else {
            Spacer(Modifier.width(1.dp))
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 1 — Authority Info
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun AuthorityInfoPage(
    authorityName:    String,
    authorityContact: String,
    expedited:        Boolean,
    expectedDays:     Int,
    zoneName:         String,
    reasons:          List<String>
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // ── Zone status banner ───────────────────────────────────────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    JadsColors.OrangeConditional.copy(alpha = 0.12f),
                    RoundedCornerShape(12.dp)
                )
                .padding(20.dp),
            contentAlignment = Alignment.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(16.dp)
                        .background(JadsColors.OrangeConditional, CircleShape)
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    text  = "YELLOW ZONE \u2014 Permission Required",
                    style = MaterialTheme.typography.headlineSmall.copy(
                        fontWeight = FontWeight.Bold
                    ),
                    color = JadsColors.OrangeConditional
                )
            }
        }

        // ── ATC Authority name (large) ───────────────────────────────────
        SectionHeader("ATC Authority")
        Card(
            shape  = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.AccountBalance,
                        contentDescription = null,
                        tint     = JadsColors.OrangeConditional,
                        modifier = Modifier.size(28.dp)
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(
                        text       = authorityName,
                        style      = MaterialTheme.typography.headlineMedium.copy(
                            fontWeight = FontWeight.Bold
                        ),
                        color      = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }

        // ── Contact info card (monospace) ────────────────────────────────
        SectionHeader("Contact Information")
        Card(
            shape  = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(Modifier.padding(16.dp)) {
                authorityContact.lines().forEach { line ->
                    Text(
                        text  = line,
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontFamily = FontFamily.Monospace,
                            fontSize   = 12.sp
                        ),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }

        // ── Expedited badge + Expected days ──────────────────────────────
        Row(
            modifier              = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Expedited badge
            if (expedited) {
                Card(
                    modifier = Modifier.weight(1f),
                    shape    = RoundedCornerShape(8.dp),
                    colors   = CardDefaults.cardColors(
                        containerColor = JadsColors.GreenClear.copy(alpha = 0.1f)
                    )
                ) {
                    Row(
                        Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.Speed,
                            contentDescription = null,
                            tint     = JadsColors.GreenClear,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(
                                text       = "EXPEDITED",
                                style      = MaterialTheme.typography.labelMedium.copy(
                                    fontWeight = FontWeight.Bold
                                ),
                                color      = JadsColors.GreenClear
                            )
                            Text(
                                text  = "Eligible for fast-track",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            // Expected days chip
            Card(
                modifier = if (expedited) Modifier.weight(1f) else Modifier.fillMaxWidth(),
                shape    = RoundedCornerShape(8.dp),
                colors   = CardDefaults.cardColors(
                    containerColor = JadsColors.Amber.copy(alpha = 0.1f)
                )
            ) {
                Row(
                    Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Schedule,
                        contentDescription = null,
                        tint     = JadsColors.Amber,
                        modifier = Modifier.size(22.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text(
                            text       = "$expectedDays DAYS",
                            style      = MaterialTheme.typography.labelMedium.copy(
                                fontWeight = FontWeight.Bold
                            ),
                            color      = JadsColors.Amber
                        )
                        Text(
                            text  = "Expected processing",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }

        // ── Zone assessment reasons ──────────────────────────────────────
        if (reasons.isNotEmpty()) {
            SectionHeader("Zone Assessment")
            Card(
                shape  = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    reasons.forEach { reason ->
                        Row(verticalAlignment = Alignment.Top) {
                            Text(
                                text     = "\u2022",
                                style    = MaterialTheme.typography.bodyMedium,
                                color    = JadsColors.OrangeConditional,
                                modifier = Modifier.padding(top = 1.dp)
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text  = reason,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 2 — Operation Details
// ─────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OperationDetailsPage(
    operationType:          OperationType,
    rthCapability:          Boolean,
    geofencing:             Boolean,
    daa:                    Boolean,
    selfDeclared:           Boolean,
    pilotName:              String,
    uinNumber:              String,
    droneId:                String,
    onOperationTypeChanged: (OperationType) -> Unit,
    onRthToggled:           (Boolean) -> Unit,
    onGeofencingToggled:    (Boolean) -> Unit,
    onDaaToggled:           (Boolean) -> Unit,
    onSelfDeclared:         (Boolean) -> Unit,
    onPilotNameChanged:     (String) -> Unit,
    onUinChanged:           (String) -> Unit,
    onDroneIdChanged:       (String) -> Unit
) {
    var operationDropdownExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // ── Pilot & Drone Info ───────────────────────────────────────────
        SectionHeader("Pilot & Drone")
        Card(
            shape  = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(
                Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(
                    value         = pilotName,
                    onValueChange = onPilotNameChanged,
                    label         = { Text("Pilot Name") },
                    singleLine    = true,
                    modifier      = Modifier.fillMaxWidth(),
                    leadingIcon   = {
                        Icon(Icons.Default.Person, null, modifier = Modifier.size(18.dp))
                    }
                )
                OutlinedTextField(
                    value         = uinNumber,
                    onValueChange = onUinChanged,
                    label         = { Text("UIN Number") },
                    placeholder   = { Text("e.g. UA-XXXX-XXXX") },
                    singleLine    = true,
                    modifier      = Modifier.fillMaxWidth(),
                    leadingIcon   = {
                        Icon(Icons.Default.Badge, null, modifier = Modifier.size(18.dp))
                    }
                )
                OutlinedTextField(
                    value         = droneId,
                    onValueChange = onDroneIdChanged,
                    label         = { Text("Drone ID") },
                    singleLine    = true,
                    modifier      = Modifier.fillMaxWidth(),
                    leadingIcon   = {
                        Icon(Icons.Default.FlightTakeoff, null, modifier = Modifier.size(18.dp))
                    }
                )
            }
        }

        // ── Operation type dropdown ──────────────────────────────────────
        SectionHeader("Operation Type")
        Card(
            shape  = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(Modifier.padding(16.dp)) {
                ExposedDropdownMenuBox(
                    expanded          = operationDropdownExpanded,
                    onExpandedChange  = { operationDropdownExpanded = it }
                ) {
                    OutlinedTextField(
                        value         = operationType.displayName,
                        onValueChange = {},
                        readOnly      = true,
                        label         = { Text("Type of Operation") },
                        trailingIcon  = {
                            ExposedDropdownMenuDefaults.TrailingIcon(expanded = operationDropdownExpanded)
                        },
                        modifier      = Modifier
                            .menuAnchor()
                            .fillMaxWidth(),
                        leadingIcon   = {
                            Icon(Icons.Default.Category, null, modifier = Modifier.size(18.dp))
                        }
                    )
                    ExposedDropdownMenu(
                        expanded        = operationDropdownExpanded,
                        onDismissRequest = { operationDropdownExpanded = false }
                    ) {
                        OperationType.values().forEach { type ->
                            DropdownMenuItem(
                                text    = { Text(type.displayName) },
                                onClick = {
                                    onOperationTypeChanged(type)
                                    operationDropdownExpanded = false
                                }
                            )
                        }
                    }
                }
            }
        }

        // ── Capability toggle switches ───────────────────────────────────
        SectionHeader("Drone Capabilities")
        Card(
            shape  = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                CapabilityToggleRow(
                    label   = "Return-to-Home (RTH)",
                    icon    = Icons.Default.Home,
                    checked = rthCapability,
                    onToggle = onRthToggled
                )
                Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)

                CapabilityToggleRow(
                    label   = "Geofencing",
                    icon    = Icons.Default.GpsFixed,
                    checked = geofencing,
                    onToggle = onGeofencingToggled
                )
                Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)

                CapabilityToggleRow(
                    label   = "Detect & Avoid (DAA)",
                    icon    = Icons.Default.Radar,
                    checked = daa,
                    onToggle = onDaaToggled
                )
            }
        }

        // ── Self-declaration checkbox with legal text ────────────────────
        SectionHeader("Self-Declaration")
        Card(
            shape  = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(Modifier.padding(16.dp)) {
                // Scrollable legal text
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp)
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant,
                            RoundedCornerShape(6.dp)
                        )
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(12.dp)
                    ) {
                        Text(
                            text = "SELF-DECLARATION UNDER DGCA UAS RULES 2021\n\n" +
                                   "I, the undersigned, hereby declare that:\n\n" +
                                   "1. I am a registered Remote Pilot and hold a valid Remote Pilot " +
                                   "Certificate (RPC) issued by an authorised Remote Pilot Training " +
                                   "Organisation (RPTO) recognised by DGCA.\n\n" +
                                   "2. The Unmanned Aircraft System (UAS) identified by the UIN " +
                                   "specified in this application is duly registered with the " +
                                   "Digital Sky Platform and is airworthy.\n\n" +
                                   "3. I have verified that the proposed flight area falls within " +
                                   "a YELLOW zone and requires prior permission from the appropriate " +
                                   "Air Traffic Control (ATC) authority.\n\n" +
                                   "4. I will comply with all conditions specified in the flight " +
                                   "permission, including altitude restrictions, time windows, and " +
                                   "operational limitations.\n\n" +
                                   "5. I understand that flying without valid permission in a YELLOW " +
                                   "zone is a punishable offence under Rule 45 of the UAS Rules 2021.\n\n" +
                                   "6. The information provided in this application is true and " +
                                   "correct to the best of my knowledge and belief.",
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))

                // Checkbox row
                Row(
                    modifier          = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked         = selfDeclared,
                        onCheckedChange = onSelfDeclared,
                        colors          = CheckboxDefaults.colors(
                            checkedColor   = JadsColors.OrangeConditional,
                            checkmarkColor = Color.Black
                        )
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text  = "I have read and agree to the self-declaration above",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (selfDeclared) MaterialTheme.colorScheme.onSurface
                                else JadsColors.OrangeConditional
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun CapabilityToggleRow(
    label:    String,
    icon:     androidx.compose.ui.graphics.vector.ImageVector,
    checked:  Boolean,
    onToggle: (Boolean) -> Unit
) {
    Row(
        modifier          = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
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
            checked = checked,
            onCheckedChange = onToggle,
            colors  = SwitchDefaults.colors(
                checkedThumbColor  = Color.Black,
                checkedTrackColor  = JadsColors.OrangeConditional,
                uncheckedThumbColor = MaterialTheme.colorScheme.onSurfaceVariant,
                uncheckedTrackColor = MaterialTheme.colorScheme.surfaceVariant
            )
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 3 — Review & Submit
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun ReviewSubmitPage(
    state:        com.jads.ui.viewmodel.YellowZoneUiState,
    canSubmit:    Boolean,
    onSubmit:     () -> Unit,
    onResetError: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // ── Summary cards ────────────────────────────────────────────────
        SectionHeader("Application Summary")

        // Pilot & UIN card
        Card(
            shape  = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(Modifier.padding(16.dp)) {
                InfoRow(
                    label = "Pilot Name",
                    value = state.pilotName.ifBlank { "Not provided" },
                    icon  = Icons.Default.Person
                )
                Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                InfoRow(
                    label = "UIN",
                    value = state.uinNumber.ifBlank { "Not provided" },
                    icon  = Icons.Default.Badge
                )
                Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                InfoRow(
                    label = "Drone ID",
                    value = state.droneId,
                    icon  = Icons.Default.FlightTakeoff
                )
            }
        }

        // Zone & Authority card
        Card(
            shape  = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(Modifier.padding(16.dp)) {
                InfoRow(
                    label      = "Zone",
                    value      = "YELLOW",
                    icon       = Icons.Default.Map,
                    valueColor = JadsColors.OrangeConditional
                )
                Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                InfoRow(
                    label = "ATC Authority",
                    value = state.authorityName,
                    icon  = Icons.Default.AccountBalance
                )
                Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                InfoRow(
                    label = "Altitude",
                    value = "${state.altitude}m AGL",
                    icon  = Icons.Default.Expand
                )
                Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                InfoRow(
                    label = "Polygon Vertices",
                    value = "${state.polygon.size}",
                    icon  = Icons.Default.Layers
                )
            }
        }

        // Operation details card
        Card(
            shape  = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(Modifier.padding(16.dp)) {
                InfoRow(
                    label = "Operation Type",
                    value = state.operationType.displayName,
                    icon  = Icons.Default.Category
                )
                Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                InfoRow(
                    label      = "RTH Capability",
                    value      = if (state.rthCapability) "YES" else "NO",
                    icon       = Icons.Default.Home,
                    valueColor = if (state.rthCapability) JadsColors.GreenClear
                                 else MaterialTheme.colorScheme.onSurfaceVariant
                )
                Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                InfoRow(
                    label      = "Geofencing",
                    value      = if (state.geofencingEnabled) "YES" else "NO",
                    icon       = Icons.Default.GpsFixed,
                    valueColor = if (state.geofencingEnabled) JadsColors.GreenClear
                                 else MaterialTheme.colorScheme.onSurfaceVariant
                )
                Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                InfoRow(
                    label      = "DAA",
                    value      = if (state.daaEnabled) "YES" else "NO",
                    icon       = Icons.Default.Radar,
                    valueColor = if (state.daaEnabled) JadsColors.GreenClear
                                 else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // Estimated approval
        Card(
            shape  = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(
                containerColor = JadsColors.Amber.copy(alpha = 0.08f)
            )
        ) {
            Row(
                Modifier.padding(14.dp).fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.CalendarMonth,
                    contentDescription = null,
                    tint     = JadsColors.Amber,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(
                        text  = "Estimated Approval",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text       = state.estimatedApproval,
                        style      = MaterialTheme.typography.titleSmall,
                        color      = JadsColors.Amber,
                        fontWeight = FontWeight.Bold
                    )
                    if (state.expeditedEligible) {
                        StatusBadge(
                            label    = "EXPEDITED",
                            color    = JadsColors.GreenClear,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }
            }
        }

        // ── Submission state ─────────────────────────────────────────────
        when (val submission = state.submissionState) {
            is SubmissionState.Idle -> {
                // Nothing to show
            }

            is SubmissionState.Loading -> {
                Card(
                    shape  = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = JadsColors.Amber.copy(alpha = 0.08f)
                    )
                ) {
                    Row(
                        Modifier.padding(16.dp).fillMaxWidth(),
                        verticalAlignment     = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        CircularProgressIndicator(
                            modifier    = Modifier.size(24.dp),
                            color       = JadsColors.Amber,
                            strokeWidth = 3.dp
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            text  = "Submitting to eGCA...",
                            style = MaterialTheme.typography.bodyMedium,
                            color = JadsColors.Amber
                        )
                    }
                }
            }

            is SubmissionState.Success -> {
                Card(
                    shape  = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = JadsColors.GreenClear.copy(alpha = 0.1f)
                    )
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint     = JadsColors.GreenClear,
                                modifier = Modifier.size(28.dp)
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                text       = "SUBMITTED SUCCESSFULLY",
                                style      = MaterialTheme.typography.titleSmall,
                                color      = JadsColors.GreenClear,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(Modifier.height(12.dp))
                        Divider(
                            color     = JadsColors.GreenClear.copy(alpha = 0.3f),
                            thickness = 0.5.dp
                        )
                        Spacer(Modifier.height(12.dp))

                        // Application ID (monospaced)
                        Text(
                            text  = "Application ID",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text  = submission.applicationId,
                            style = MaterialTheme.typography.bodyMedium.copy(
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold
                            ),
                            color = JadsColors.GreenClear
                        )

                        if (submission.referenceNumber != null) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text  = "Reference Number",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text  = submission.referenceNumber,
                                style = MaterialTheme.typography.bodySmall.copy(
                                    fontFamily = FontFamily.Monospace
                                ),
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }

                        Spacer(Modifier.height(8.dp))
                        Text(
                            text  = "Submitted: ${submission.submittedAt}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        Spacer(Modifier.height(12.dp))
                        Text(
                            text  = "Redirecting to Mission History...",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            is SubmissionState.Error -> {
                Card(
                    shape  = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = JadsColors.RedBlocked.copy(alpha = 0.1f)
                    )
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Error,
                                contentDescription = null,
                                tint     = JadsColors.RedBlocked,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text  = "Submission Failed",
                                style = MaterialTheme.typography.titleSmall,
                                color = JadsColors.RedBlocked
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text  = submission.message,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(
                            onClick  = onResetError,
                            shape    = RoundedCornerShape(6.dp),
                            colors   = OutlinedButtonDefaults.outlinedButtonColors(
                                contentColor = JadsColors.RedBlocked
                            ),
                            border   = androidx.compose.foundation.BorderStroke(
                                1.dp, JadsColors.RedBlocked.copy(alpha = 0.5f)
                            )
                        ) {
                            Text("Dismiss")
                        }
                    }
                }
            }
        }

        // ── Submit button ────────────────────────────────────────────────
        val isLoading = state.submissionState is SubmissionState.Loading
        val isSuccess = state.submissionState is SubmissionState.Success

        if (!isSuccess) {
            Button(
                onClick  = onSubmit,
                enabled  = canSubmit && !isLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors   = ButtonDefaults.buttonColors(
                    containerColor         = JadsColors.OrangeConditional,
                    disabledContainerColor = JadsColors.OrangeConditional.copy(alpha = 0.3f)
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        Modifier.size(20.dp),
                        color       = Color.Black,
                        strokeWidth = 2.dp
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text       = "Submitting...",
                        color      = Color.Black,
                        fontWeight = FontWeight.Bold
                    )
                } else {
                    Icon(
                        Icons.Default.Send,
                        null,
                        tint     = Color.Black,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text       = "SUBMIT TO eGCA",
                        color      = Color.Black,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))
    }
}
