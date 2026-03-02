package com.jads.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jads.ui.component.StatusBadge
import com.jads.ui.theme.JadsColors
import com.jads.ui.viewmodel.HistoryLoadState
import com.jads.ui.viewmodel.HistoryViewModel
import com.jads.ui.viewmodel.MissionHistoryItem
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MissionHistoryScreen(
    viewModel: HistoryViewModel,
    onBack:    () -> Unit
) {
    val loadState by viewModel.loadState.collectAsStateWithLifecycle()
    val dateFmt   = remember {
        SimpleDateFormat("dd MMM yyyy, HH:mm", Locale.getDefault())
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("Mission History", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::refresh) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when (val st = loadState) {
                is HistoryLoadState.Loading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                        color    = JadsColors.AmberYellow
                    )
                }

                is HistoryLoadState.Empty -> {
                    EmptyHistoryState(modifier = Modifier.align(Alignment.Center))
                }

                is HistoryLoadState.Error -> {
                    Column(
                        modifier            = Modifier.align(Alignment.Center).padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            Icons.Default.ErrorOutline,
                            null,
                            tint     = JadsColors.RedBlocked,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(Modifier.height(12.dp))
                        Text(
                            "Failed to load history",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            st.message,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(16.dp))
                        OutlinedButton(onClick = viewModel::refresh) {
                            Text("Retry")
                        }
                    }
                }

                is HistoryLoadState.Loaded -> {
                    LazyColumn(
                        modifier       = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Summary header
                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment     = Alignment.CenterVertically
                            ) {
                                Text(
                                    "${st.items.size} missions",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                val uploaded = st.items.count { it.uploadedAt != null }
                                Text(
                                    "$uploaded / ${st.items.size} uploaded",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (uploaded == st.items.size) JadsColors.GreenClear
                                            else JadsColors.OrangeConditional
                                )
                            }
                        }

                        items(st.items, key = { it.dbId }) { mission ->
                            MissionHistoryCard(mission = mission, dateFmt = dateFmt)
                        }

                        item { Spacer(Modifier.height(8.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun MissionHistoryCard(
    mission: MissionHistoryItem,
    dateFmt: SimpleDateFormat
) {
    val npntColor = when (mission.npntClass) {
        "GREEN"  -> JadsColors.GreenClear
        "YELLOW" -> JadsColors.OrangeConditional
        "RED"    -> JadsColors.RedBlocked
        else     -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    val stateColor = when (mission.state) {
        "COMPLETED"  -> JadsColors.GreenClear
        "ACTIVE"     -> JadsColors.AmberYellow
        "UPLOADING"  -> JadsColors.SkyBlue
        "ABORTED"    -> JadsColors.RedBlocked
        else         -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(
        shape  = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(Modifier.padding(14.dp)) {

            // Header row
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment     = Alignment.CenterVertically
            ) {
                Text(
                    text  = mission.missionId.toString(),
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontFamily = FontFamily.Monospace,
                        fontSize   = 11.sp
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    StatusBadge(mission.npntClass, npntColor)
                    StatusBadge(mission.state, stateColor)
                }
            }

            Spacer(Modifier.height(10.dp))

            // Stats row
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                StatChip(Icons.Default.DataUsage, "${mission.recordCount} records")
                if (mission.endUtcMs != null && mission.startUtcMs > 0) {
                    val durationSec = (mission.endUtcMs - mission.startUtcMs) / 1000
                    StatChip(Icons.Default.Timer, formatDuration(durationSec))
                }
                if (mission.strongboxBacked == true) {
                    StatChip(Icons.Default.Security, "Strongbox")
                }
            }

            Spacer(Modifier.height(10.dp))
            Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
            Spacer(Modifier.height(10.dp))

            // Timestamps
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("Started", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        dateFmt.format(Date(mission.startUtcMs)),
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    if (mission.uploadedAt != null) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.CloudDone,
                                null,
                                tint     = JadsColors.GreenClear,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                dateFmt.format(Date(mission.uploadedAt)),
                                style = MaterialTheme.typography.bodySmall,
                                color = JadsColors.GreenClear
                            )
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.CloudOff,
                                null,
                                tint     = JadsColors.OrangeConditional,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                "Not uploaded",
                                style = MaterialTheme.typography.bodySmall,
                                color = JadsColors.OrangeConditional
                            )
                        }
                    }
                }
            }

            // Integrity warning
            if (!mission.integrityOk) {
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(JadsColors.RedBlocked.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
                        .padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Warning,
                        null,
                        tint = JadsColors.RedBlocked,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        "Local integrity check failed",
                        style = MaterialTheme.typography.labelSmall,
                        color = JadsColors.RedBlocked
                    )
                }
            }
        }
    }
}

@Composable
private fun StatChip(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(4.dp))
        Text(
            text  = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun EmptyHistoryState(modifier: Modifier = Modifier) {
    Column(
        modifier            = modifier.padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            Icons.Default.FlightOff,
            null,
            tint     = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
            modifier = Modifier.size(64.dp)
        )
        Spacer(Modifier.height(16.dp))
        Text(
            "No missions yet",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            "Completed missions will appear here.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
        )
    }
}

private fun formatDuration(sec: Long): String {
    val m = sec / 60
    val s = sec % 60
    return if (m > 0) "${m}m ${s}s" else "${s}s"
}
