package com.jads.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jads.network.ValidationCheck
import com.jads.ui.component.SectionHeader
import com.jads.ui.theme.JadsColors
import com.jads.ui.viewmodel.SubmitToEgcaState
import com.jads.ui.viewmodel.ValidationUiState
import com.jads.ui.viewmodel.ValidationViewModel

// ─────────────────────────────────────────────────────────────────────────────
// ValidationChecklistScreen — P35 Pre-Submission Validation Checklist.
//
// Displays the result of POST /api/drone/validate-flight-plan grouped into
// three sections:
//   1. REQUIRED   — must all pass before submission is allowed
//   2. ADVISORY   — warnings that can be acknowledged by the user
//   3. INFORMATION — read-only context items
//
// BottomBar shows "X of Y checks passed" and a "Submit to eGCA" button
// that is enabled only when all required checks pass and all advisories
// are either passed or acknowledged.
//
// No business logic in this composable — all state managed by
// ValidationViewModel.
// ─────────────────────────────────────────────────────────────────────────────

// ── Status colours ────────────────────────────────────────────────────────
private val FailedRed     = JadsColors.RedBlocked
private val WarningAmber  = JadsColors.OrangeConditional
private val PassedGreen   = JadsColors.GreenClear
private val InfoBlue      = JadsColors.SkyBlue

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ValidationChecklistScreen(
    viewModel:         ValidationViewModel,
    onSubmissionDone:  (applicationId: String) -> Unit,
    onBack:            () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // Navigate on successful submission
    LaunchedEffect(state.submitState) {
        val submitState = state.submitState
        if (submitState is SubmitToEgcaState.Success) {
            onSubmissionDone(submitState.applicationId)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Pre-Submission Checklist") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        bottomBar = {
            ValidationBottomBar(state = state)
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                state.isLoading -> LoadingState()
                state.errorMessage != null -> ErrorState(
                    message = state.errorMessage!!,
                    onRetry = { /* Caller should re-trigger validation */ }
                )
                state.totalChecks == 0 -> EmptyState()
                else -> ChecklistContent(
                    state     = state,
                    onToggleAcknowledge = viewModel::toggleAcknowledgement
                )
            }
        }
    }

    // Error dialog for submission failures
    val submitState = state.submitState
    if (submitState is SubmitToEgcaState.Error) {
        AlertDialog(
            onDismissRequest = { viewModel.resetSubmitState() },
            title            = { Text("Submission Failed") },
            text             = { Text(submitState.message) },
            confirmButton    = {
                TextButton(onClick = { viewModel.resetSubmitState() }) {
                    Text("OK")
                }
            }
        )
    }
}

// ── Checklist content ─────────────────────────────────────────────────────

@Composable
private fun ChecklistContent(
    state: ValidationUiState,
    onToggleAcknowledge: (String) -> Unit
) {
    LazyColumn(
        contentPadding  = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        // ── Section 1: REQUIRED ───────────────────────────────────────────
        if (state.requiredChecks.isNotEmpty()) {
            item(key = "header_required") {
                SectionHeader(title = "Required Checks")
            }
            items(
                items = state.requiredChecks,
                key   = { "req_${it.code}" }
            ) { check ->
                ChecklistItemCard(
                    check        = check,
                    severity     = "REQUIRED",
                    acknowledged = false,
                    onToggle     = null
                )
            }
        }

        // ── Section 2: ADVISORY ───────────────────────────────────────────
        if (state.advisoryChecks.isNotEmpty()) {
            item(key = "header_advisory") {
                Spacer(Modifier.height(8.dp))
                SectionHeader(title = "Advisories")
            }
            items(
                items = state.advisoryChecks,
                key   = { "adv_${it.code}" }
            ) { check ->
                ChecklistItemCard(
                    check        = check,
                    severity     = "ADVISORY",
                    acknowledged = check.code in state.acknowledgedWarnings,
                    onToggle     = if (!check.passed) {
                        { onToggleAcknowledge(check.code) }
                    } else null
                )
            }
        }

        // ── Section 3: INFORMATION ────────────────────────────────────────
        if (state.infoChecks.isNotEmpty()) {
            item(key = "header_info") {
                Spacer(Modifier.height(8.dp))
                SectionHeader(title = "Information")
            }
            items(
                items = state.infoChecks,
                key   = { "info_${it.code}" }
            ) { check ->
                ChecklistItemCard(
                    check        = check,
                    severity     = "INFO",
                    acknowledged = false,
                    onToggle     = null
                )
            }
        }

        // Bottom spacer for BottomBar clearance
        item(key = "bottom_spacer") {
            Spacer(Modifier.height(16.dp))
        }
    }
}

// ── ChecklistItemCard ────────────────────────────────────────────────────
// Displays a single validation check with:
//   - Status icon (X red for REQUIRED fail, ! amber for ADVISORY, check green, i blue)
//   - Name and description
//   - Remediation hint (when failed)
//   - Checkbox for acknowledging advisory warnings

@Composable
private fun ChecklistItemCard(
    check:        ValidationCheck,
    severity:     String,
    acknowledged: Boolean,
    onToggle:     (() -> Unit)?
) {
    val (statusIcon, statusColor) = resolveStatusIcon(check, severity, acknowledged)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape    = RoundedCornerShape(8.dp),
        colors   = CardDefaults.cardColors(
            containerColor = statusColor.copy(alpha = 0.06f)
        )
    ) {
        Row(
            modifier          = Modifier.padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Status icon circle
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .background(statusColor.copy(alpha = 0.15f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector        = statusIcon,
                    contentDescription = null,
                    tint               = statusColor,
                    modifier           = Modifier.size(16.dp)
                )
            }

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text  = check.name,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontWeight = FontWeight.SemiBold
                    ),
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(Modifier.height(2.dp))

                Text(
                    text  = check.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                // Remediation hint — shown only when check has failed
                if (!check.passed && check.remediation != null) {
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.Top) {
                        Icon(
                            imageVector        = Icons.Default.Lightbulb,
                            contentDescription = null,
                            tint               = JadsColors.Amber,
                            modifier           = Modifier.size(14.dp).padding(top = 2.dp)
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text  = check.remediation,
                            style = MaterialTheme.typography.labelSmall,
                            color = JadsColors.Amber
                        )
                    }
                }
            }

            // Acknowledge checkbox for failed advisory items
            if (onToggle != null && severity == "ADVISORY") {
                Spacer(Modifier.width(8.dp))
                Checkbox(
                    checked         = acknowledged,
                    onCheckedChange = { onToggle() },
                    colors          = CheckboxDefaults.colors(
                        checkedColor          = WarningAmber,
                        uncheckedColor        = MaterialTheme.colorScheme.onSurfaceVariant,
                        checkmarkColor        = MaterialTheme.colorScheme.surface
                    )
                )
            }
        }
    }
}

// ── Resolve status icon and colour per check state ─────────────────────

@Composable
private fun resolveStatusIcon(
    check:        ValidationCheck,
    severity:     String,
    acknowledged: Boolean
): Pair<androidx.compose.ui.graphics.vector.ImageVector, Color> {
    return when {
        // Info items — always blue info icon
        severity == "INFO" -> Icons.Default.Info to InfoBlue

        // Passed — green checkmark
        check.passed -> Icons.Default.CheckCircle to PassedGreen

        // Advisory, acknowledged — amber checkmark
        severity == "ADVISORY" && acknowledged ->
            Icons.Default.CheckCircle to WarningAmber

        // Advisory, not acknowledged — amber warning
        severity == "ADVISORY" ->
            Icons.Default.Warning to WarningAmber

        // Required, failed — red X
        else -> Icons.Default.Cancel to FailedRed
    }
}

// ── Bottom bar ──────────────────────────────────────────────────────────

@Composable
private fun ValidationBottomBar(state: ValidationUiState) {
    Surface(
        modifier   = Modifier.fillMaxWidth(),
        color      = MaterialTheme.colorScheme.surface,
        shadowElevation = 8.dp
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            // Progress text
            Text(
                text  = "${state.passedChecks} of ${state.totalChecks} checks passed",
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontWeight = FontWeight.Medium
                ),
                color = if (state.isReadyToSubmit) PassedGreen
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(8.dp))

            // Progress bar
            LinearProgressIndicator(
                progress = if (state.totalChecks > 0)
                    state.passedChecks.toFloat() / state.totalChecks.toFloat()
                else 0f,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp),
                color          = if (state.isReadyToSubmit) PassedGreen else WarningAmber,
                trackColor     = MaterialTheme.colorScheme.surfaceVariant
            )

            Spacer(Modifier.height(12.dp))

            // Submit button
            Button(
                onClick  = { /* Submit is triggered by caller passing flightPlanJson */ },
                enabled  = state.isReadyToSubmit,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape    = RoundedCornerShape(8.dp),
                colors   = ButtonDefaults.buttonColors(
                    containerColor         = JadsColors.Amber,
                    contentColor           = Color(0xFF1A0F00),
                    disabledContainerColor = JadsColors.AmberDim.copy(alpha = 0.3f),
                    disabledContentColor   = MaterialTheme.colorScheme.onSurfaceVariant
                )
            ) {
                if (state.submitState is SubmitToEgcaState.Loading) {
                    CircularProgressIndicator(
                        modifier  = Modifier.size(20.dp),
                        color     = Color(0xFF1A0F00),
                        strokeWidth = 2.dp
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("Submitting...")
                } else {
                    Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text  = "Submit to eGCA",
                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold)
                    )
                }
            }
        }
    }
}

// ── Loading state ─────────────────────────────────────────────────────────

@Composable
private fun LoadingState() {
    Column(
        modifier            = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        CircularProgressIndicator(color = JadsColors.Amber)
        Spacer(Modifier.height(16.dp))
        Text(
            text  = "Running pre-submission checks...",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

// ── Error state ──────────────────────────────────────────────────────────

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(
        modifier            = Modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector        = Icons.Default.ErrorOutline,
            contentDescription = null,
            tint               = FailedRed,
            modifier           = Modifier.size(48.dp)
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text      = "Validation Failed",
            style     = MaterialTheme.typography.headlineSmall,
            color     = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text      = message,
            style     = MaterialTheme.typography.bodyMedium,
            color     = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(24.dp))
        OutlinedButton(onClick = onRetry) {
            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Retry")
        }
    }
}

// ── Empty state ──────────────────────────────────────────────────────────

@Composable
private fun EmptyState() {
    Column(
        modifier            = Modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector        = Icons.Default.Checklist,
            contentDescription = null,
            tint               = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier           = Modifier.size(48.dp)
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text      = "No Checks Available",
            style     = MaterialTheme.typography.headlineSmall,
            color     = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text      = "Submit a flight plan to run pre-submission validation.",
            style     = MaterialTheme.typography.bodyMedium,
            color     = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
    }
}
