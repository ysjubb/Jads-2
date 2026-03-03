package com.jads.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jads.ui.theme.JadsColors
import com.jads.ui.viewmodel.LoginUiState
import com.jads.ui.viewmodel.LoginViewModel
import com.jads.ui.viewmodel.OperatorRole

@Composable
fun LoginScreen(
    viewModel: LoginViewModel,
    onLoginSuccess: () -> Unit,
    onViewHistory: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // Navigate on successful login
    LaunchedEffect(state.isLoggedIn) {
        if (state.isLoggedIn) onLoginSuccess()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(JadsColors.DeepCharcoal, Color(0xFF0D0F14))
                )
            )
    ) {
        Column(
            modifier            = Modifier
                .fillMaxWidth()
                .padding(horizontal = 28.dp)
                .align(Alignment.Center),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {

            // ── Logo / wordmark ────────────────────────────────────────────
            Icon(
                imageVector        = Icons.Default.Flight,
                contentDescription = "JADS",
                tint               = JadsColors.AmberYellow,
                modifier           = Modifier.size(52.dp)
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text  = "JADS",
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontWeight = FontWeight.Bold,
                    color      = JadsColors.AmberYellow
                )
            )
            Text(
                text  = "Joint Aviation Drone System",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(40.dp))

            // ── Operator ID field ──────────────────────────────────────────
            OutlinedTextField(
                value         = state.operatorIdInput,
                onValueChange = viewModel::onOperatorIdChanged,
                label         = { Text("Operator ID") },
                leadingIcon   = {
                    Icon(Icons.Default.Badge, contentDescription = null)
                },
                singleLine    = true,
                isError       = state.loginError != null,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Ascii,
                    imeAction    = ImeAction.Done
                ),
                keyboardActions = KeyboardActions(onDone = { viewModel.login() }),
                modifier      = Modifier.fillMaxWidth(),
                colors        = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor   = JadsColors.AmberYellow,
                    focusedLabelColor    = JadsColors.AmberYellow,
                    focusedLeadingIconColor = JadsColors.AmberYellow,
                )
            )

            Spacer(Modifier.height(16.dp))

            // ── Role selector ──────────────────────────────────────────────
            Text(
                text     = "Operator Role",
                style    = MaterialTheme.typography.labelMedium,
                color    = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.Start)
            )
            Spacer(Modifier.height(8.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(8.dp))
            ) {
                OperatorRole.values().forEachIndexed { idx, role ->
                    if (idx > 0) {
                        Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                    }
                    RoleRow(
                        role       = role,
                        selected   = state.selectedRole == role,
                        onClick    = { viewModel.onRoleSelected(role) }
                    )
                }
            }

            // ── Error ──────────────────────────────────────────────────────
            if (state.loginError != null) {
                Spacer(Modifier.height(12.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier          = Modifier
                        .fillMaxWidth()
                        .background(JadsColors.RedBlocked.copy(alpha = 0.1f), RoundedCornerShape(6.dp))
                        .padding(10.dp)
                ) {
                    Icon(
                        Icons.Default.Error,
                        contentDescription = null,
                        tint     = JadsColors.RedBlocked,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text  = state.loginError!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = JadsColors.RedBlocked
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            // ── Login button ───────────────────────────────────────────────
            Button(
                onClick  = viewModel::login,
                enabled  = state.operatorIdInput.isNotBlank() && !state.isLoading,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                colors   = ButtonDefaults.buttonColors(containerColor = JadsColors.AmberYellow),
                shape    = RoundedCornerShape(8.dp)
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color    = Color(0xFF1A1200),
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(
                        Icons.Default.Login,
                        contentDescription = null,
                        tint = Color(0xFF1A1200)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Enter Mission Control",
                        color      = Color(0xFF1A1200),
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            // ── View history (offline access) ──────────────────────────────
            TextButton(onClick = onViewHistory) {
                Icon(
                    Icons.Default.History,
                    contentDescription = null,
                    tint     = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    "View Mission History",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }

        // ── Version watermark ──────────────────────────────────────────────
        Text(
            text     = "JADS v5.0 — Restricted Use",
            style    = MaterialTheme.typography.labelSmall,
            color    = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 20.dp)
        )
    }
}

@Composable
private fun RoleRow(
    role:    OperatorRole,
    selected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(
                if (selected) JadsColors.AmberYellow.copy(alpha = 0.08f)
                else          Color.Transparent
            )
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(
            selected = selected,
            onClick  = onClick,
            colors   = RadioButtonDefaults.colors(selectedColor = JadsColors.AmberYellow)
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text  = role.displayName,
            style = MaterialTheme.typography.bodyMedium,
            color = if (selected) JadsColors.AmberYellow
                    else          MaterialTheme.colorScheme.onSurface
        )
    }
}
