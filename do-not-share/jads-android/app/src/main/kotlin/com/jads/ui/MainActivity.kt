package com.jads.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.jads.ui.nav.Screen
import com.jads.ui.screen.*
import com.jads.ui.theme.JadsTheme
import com.jads.ui.viewmodel.*

// ─────────────────────────────────────────────────────────────────────────────
// MainActivity — single-activity host for all 5 JADS screens.
//
// Navigation flow:
//   Login ──► MissionSetup ──► ActiveMission ──► MissionComplete ──► (loop)
//     └────────────────────────────────────────────────────────► MissionHistory
//
// Back-stack policy:
//   • Login is always the bottom of the stack — signing out pops to it.
//   • MissionSetup is removed from backstack when ActiveMission starts,
//     so Back during a mission shows a stop-confirmation dialog, not setup.
//   • MissionComplete is a dead-end: Back is suppressed (mission can't restart).
//
// ViewModel scoping:
//   • LoginViewModel    — activity-scoped (owns session state across screens)
//   • MissionViewModel  — activity-scoped (owns mission lifecycle across 3 screens)
//   • HistoryViewModel  — activity-scoped (pre-loads history on login)
//
// ─────────────────────────────────────────────────────────────────────────────

class MainActivity : ComponentActivity() {

    private val loginVm:   LoginViewModel   by viewModels()
    private val missionVm: MissionViewModel by viewModels()
    private val historyVm: HistoryViewModel by viewModels()

    // ── Permission state ─────────────────────────────────────────────────────
    // locationGranted drives whether the NavHost is shown or a permission rationale.
    // We use a simple mutableState rather than Accompanist to avoid the extra dep.
    private val locationGranted = mutableStateOf(false)

    // Fine location launcher — always requested first.
    private val fineLocationLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val fine = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true
        locationGranted.value = fine
        if (fine && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Background location must be requested SEPARATELY on API 29+ — Android requirement.
            // We request it here, after fine location is already granted.
            backgroundLocationLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        }
        Log.d("Permissions", "Fine location granted: $fine")
    }

    // Background location launcher (API 29+ only).
    private val backgroundLocationLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        Log.d("Permissions", "Background location granted: $granted")
        // We do NOT block the app if background location is denied.
        // The foreground service can still record while the screen is on.
    }

    // Notification permission launcher (API 33+).
    private val notificationLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        Log.d("Permissions", "POST_NOTIFICATIONS granted: $granted")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Check current permission state (may already be granted on re-launch)
        locationGranted.value = ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        // Request notification permission on API 33+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        // Request location if not already granted
        if (!locationGranted.value) {
            fineLocationLauncher.launch(arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ))
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Fine location already granted — check background
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
                backgroundLocationLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            }
        }

        setContent {
            JadsTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color    = MaterialTheme.colorScheme.background
                ) {
                    val granted by locationGranted
                    if (granted) {
                        JadsNavHost(loginVm, missionVm, historyVm)
                    } else {
                        LocationPermissionRationale(
                            onRequest = {
                                fineLocationLauncher.launch(arrayOf(
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                                ))
                            }
                        )
                    }
                }
            }
        }
    }
}

// ── Permission rationale screen ───────────────────────────────────────────────
// Shown only if the user previously denied location permission.
// We explain why JADS requires it before re-requesting.

@Composable
private fun LocationPermissionRationale(onRequest: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement   = Arrangement.Center,
        horizontalAlignment   = Alignment.CenterHorizontally
    ) {
        Text(
            text       = "Location Permission Required",
            style      = MaterialTheme.typography.headlineSmall,
            textAlign  = TextAlign.Center
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text      = "JADS records GPS telemetry for every drone mission. " +
                        "Without location access, the app cannot record flight data " +
                        "or generate forensic-grade mission logs.",
            style     = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(32.dp))
        Button(onClick = onRequest) {
            Text("Grant Location Access")
        }
    }
}

@Composable
private fun JadsNavHost(
    loginVm:   LoginViewModel,
    missionVm: MissionViewModel,
    historyVm: HistoryViewModel
) {
    val navController = rememberNavController()
    val loginState    by loginVm.state.collectAsStateWithLifecycle()

    NavHost(
        navController    = navController,
        startDestination = Screen.Login.route
    ) {

        // ── 1. Login ───────────────────────────────────────────────────────
        composable(Screen.Login.route) {
            LoginScreen(
                viewModel      = loginVm,
                onLoginSuccess = {
                    historyVm.refresh()   // pre-load history on login
                    navController.navigate(Screen.MissionSetup.route) {
                        // Remove Login from backstack — Back from Setup exits app
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                },
                onViewHistory  = {
                    navController.navigate(Screen.MissionHistory.route)
                }
            )
        }

        // ── 2. Mission Setup ───────────────────────────────────────────────
        composable(Screen.MissionSetup.route) {
            MissionSetupScreen(
                viewModel       = missionVm,
                operatorId      = loginState.savedOperatorId,
                onMissionStarted = {
                    navController.navigate(Screen.ActiveMission.route) {
                        // Remove Setup from backstack — prevents navigating back
                        // into Setup while a mission is active (data integrity)
                        popUpTo(Screen.MissionSetup.route) { inclusive = true }
                    }
                },
                onBack = {
                    loginVm.logout()
                    navController.navigate(Screen.Login.route) {
                        popUpTo(Screen.MissionSetup.route) { inclusive = true }
                    }
                }
            )
        }

        // ── 3. Active Mission ──────────────────────────────────────────────
        composable(Screen.ActiveMission.route) {
            ActiveMissionScreen(
                viewModel         = missionVm,
                onMissionFinished = { missionDbId ->
                    navController.navigate(Screen.MissionComplete.createRoute(missionDbId)) {
                        // Remove ActiveMission so Back from Complete goes to Setup, not Active
                        popUpTo(Screen.ActiveMission.route) { inclusive = true }
                    }
                }
            )
        }

        // ── 4. Mission Complete ────────────────────────────────────────────
        composable(
            route     = Screen.MissionComplete.route,
            arguments = listOf(navArgument("missionDbId") { type = NavType.LongType })
        ) { backStackEntry ->
            val missionDbId = backStackEntry.arguments?.getLong("missionDbId") ?: -1L
            MissionCompleteScreen(
                viewModel     = missionVm,
                missionDbId   = missionDbId,
                onNewMission  = {
                    navController.navigate(Screen.MissionSetup.route) {
                        popUpTo(Screen.MissionComplete.route) { inclusive = true }
                    }
                },
                onViewHistory = {
                    historyVm.refresh()
                    navController.navigate(Screen.MissionHistory.route) {
                        popUpTo(Screen.MissionComplete.route) { inclusive = true }
                    }
                }
            )
        }

        // ── 5. Mission History ─────────────────────────────────────────────
        composable(Screen.MissionHistory.route) {
            MissionHistoryScreen(
                viewModel = historyVm,
                onBack    = { navController.popBackStack() }
            )
        }
    }
}
