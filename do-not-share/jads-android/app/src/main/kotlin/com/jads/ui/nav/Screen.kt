package com.jads.ui.nav

// ─────────────────────────────────────────────────────────────────────────────
// Navigation routes for JADS operator app.
//
// Flow:
//   Login ──► MissionSetup ──► ActiveMission ──► MissionComplete
//                ▲                                       │
//                └───────────────────────────────────────┘  (via History back)
//   Login ──► MissionHistory ──► (back to Login)
//
// Back-stack rules:
//   • Login is the start destination — popUpTo(Login, inclusive=true) on sign-out
//   • MissionSetup → ActiveMission: remove MissionSetup from backstack so Back
//     from active mission shows a confirmation dialog, not setup screen
//   • MissionComplete → MissionHistory: clear setup+active from backstack
// ─────────────────────────────────────────────────────────────────────────────

sealed class Screen(val route: String) {
    object Login          : Screen("login")
    object MissionSetup   : Screen("mission_setup")
    object ActiveMission  : Screen("active_mission")
    object MissionComplete: Screen("mission_complete/{missionDbId}") {
        fun createRoute(missionDbId: Long) = "mission_complete/$missionDbId"
    }
    object MissionHistory : Screen("mission_history")
}
