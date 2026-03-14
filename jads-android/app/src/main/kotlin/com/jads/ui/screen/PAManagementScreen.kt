package com.jads.ui.screen

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jads.ui.component.InfoRow
import com.jads.ui.component.MonoValue
import com.jads.ui.component.SectionHeader
import com.jads.ui.component.StatusBadge
import com.jads.ui.theme.JadsColors
import com.jads.ui.viewmodel.*

// ---------------------------------------------------------------------------
// PAManagementScreen -- P21 Permission Artefact management.
//
// Layout (top to bottom):
//   1. "Active Permissions" -- APPROVED / ACTIVE / DOWNLOADED items
//   2. "Pending Approvals"  -- PENDING items with 60s status polling
//   3. "Upload Flight Log"  -- COMPLETED missions, SAF file picker
//
// Tap any item -> detail bottom sheet (scrollable, monospace XML attrs,
//                                      simplified polygon Canvas)
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PAManagementScreen(
    viewModel: PAManagementViewModel,
    onBack:    () -> Unit
) {
    val uiState       by viewModel.state.collectAsStateWithLifecycle()
    val context       = LocalContext.current
    val sheetState    = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope         = rememberCoroutineScope()

    // SAF file picker for flight log upload
    val logPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            val target = uiState.uploadTarget
            if (target != null) {
                viewModel.uploadFlightLog(target.applicationId, uri)
            }
        }
    }

    // Start polling on composition
    LaunchedEffect(Unit) {
        viewModel.startPollingIfNeeded()
    }

    // Stop polling on disposal
    DisposableEffect(Unit) {
        onDispose { viewModel.stopPolling() }
    }

    // Error snackbar
    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(uiState.errorMessage) {
        uiState.errorMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            viewModel.clearError()
        }
    }

    // Log upload success snackbar
    LaunchedEffect(uiState.logUploadState) {
        val st = uiState.logUploadState
        if (st is LogUploadState.Success) {
            snackbarHostState.showSnackbar("Flight log uploaded for ${st.applicationId}")
            viewModel.resetLogUpload()
        } else if (st is LogUploadState.Error) {
            snackbarHostState.showSnackbar(st.message)
            viewModel.resetLogUpload()
        }
    }

    Scaffold(
        containerColor  = MaterialTheme.colorScheme.background,
        snackbarHost    = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Text("Permission Artefacts", fontWeight = FontWeight.SemiBold)
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.refresh() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { padding ->

        if (uiState.isLoading) {
            Box(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = JadsColors.AmberYellow)
            }
        } else if (uiState.activeItems.isEmpty() &&
                   uiState.pendingItems.isEmpty() &&
                   uiState.completedItems.isEmpty()) {
            EmptyPAState(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            )
        } else {
            LazyColumn(
                modifier       = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {

                // -- Section 1: Active Permissions ----------------------------
                if (uiState.activeItems.isNotEmpty()) {
                    item {
                        SectionHeader("Active Permissions")
                    }
                    items(uiState.activeItems, key = { "active-${it.applicationId}" }) { pa ->
                        ActivePACard(
                            item          = pa,
                            isDownloading = uiState.downloadingId == pa.applicationId,
                            onTap         = { viewModel.showDetail(pa) },
                            onDownload    = { viewModel.downloadPA(pa.applicationId) },
                            onShare       = {
                                val file = viewModel.getCachedPAFile(pa.applicationId)
                                if (file != null && file.exists()) {
                                    val uri = FileProvider.getUriForFile(
                                        context,
                                        "${context.packageName}.fileprovider",
                                        file
                                    )
                                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                        type = "application/zip"
                                        putExtra(Intent.EXTRA_STREAM, uri)
                                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                    }
                                    context.startActivity(
                                        Intent.createChooser(shareIntent, "Share PA to GCS")
                                    )
                                }
                            }
                        )
                    }
                }

                // -- Section 2: Pending Approvals -----------------------------
                if (uiState.pendingItems.isNotEmpty()) {
                    item {
                        SectionHeader("Pending Approvals")
                    }
                    item {
                        Row(
                            modifier          = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Sync,
                                contentDescription = null,
                                tint     = JadsColors.AmberYellow,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text  = "Auto-polling every 60s",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    items(uiState.pendingItems, key = { "pending-${it.applicationId}" }) { pa ->
                        PendingPACard(
                            item  = pa,
                            onTap = { viewModel.showDetail(pa) }
                        )
                    }
                }

                // -- Section 3: Upload Flight Log -----------------------------
                if (uiState.completedItems.isNotEmpty()) {
                    item {
                        SectionHeader("Upload Flight Log")
                    }
                    items(uiState.completedItems, key = { "completed-${it.applicationId}" }) { pa ->
                        CompletedPACard(
                            item     = pa,
                            onTap    = { viewModel.showDetail(pa) },
                            onUpload = {
                                viewModel.selectUploadTarget(pa)
                                logPickerLauncher.launch(
                                    arrayOf("application/zip", "application/octet-stream", "*/*")
                                )
                            },
                            isUploading = uiState.logUploadState is LogUploadState.Loading &&
                                          uiState.uploadTarget?.applicationId == pa.applicationId
                        )
                    }
                }

                item { Spacer(Modifier.height(16.dp)) }
            }
        }

        // -- Detail bottom sheet ----------------------------------------------
        if (uiState.showDetail && uiState.selectedItem != null) {
            ModalBottomSheet(
                onDismissRequest = { viewModel.dismissDetail() },
                sheetState       = sheetState,
                containerColor   = MaterialTheme.colorScheme.surface
            ) {
                PADetailContent(item = uiState.selectedItem!!)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Active PA Card -- APPROVED / ACTIVE / DOWNLOADED items
// ---------------------------------------------------------------------------

@Composable
private fun ActivePACard(
    item:          PAItem,
    isDownloading: Boolean,
    onTap:         () -> Unit,
    onDownload:    () -> Unit,
    onShare:       () -> Unit
) {
    val zoneColor = zoneAccentColor(item.zone)

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onTap),
        shape  = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(Modifier.fillMaxWidth()) {
            // Left zone colour indicator bar
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .fillMaxHeight()
                    .background(zoneColor, RoundedCornerShape(topStart = 8.dp, bottomStart = 8.dp))
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(14.dp)
            ) {
                // Header: application ID + status chip
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment     = Alignment.CenterVertically
                ) {
                    Text(
                        text  = item.applicationId,
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontFamily = FontFamily.Monospace,
                            fontSize   = 11.sp
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    StatusBadge(
                        label = item.status.displayLabel,
                        color = statusColor(item.status)
                    )
                }

                Spacer(Modifier.height(8.dp))

                // Flight window times (monospace)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    MonoValue(
                        label = "Window Start",
                        value = item.flightWindowStart.ifBlank { "--" }
                    )
                    MonoValue(
                        label = "Window End",
                        value = item.flightWindowEnd.ifBlank { "--" }
                    )
                }

                Spacer(Modifier.height(6.dp))

                // Drone UIN
                Text(
                    text  = "UIN: ${item.droneUin.ifBlank { "N/A" }}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(Modifier.height(10.dp))

                // Action buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (item.status == PAStatus.APPROVED) {
                        Button(
                            onClick = onDownload,
                            enabled = !isDownloading,
                            colors  = ButtonDefaults.buttonColors(
                                containerColor = JadsColors.Amber,
                                contentColor   = Color(0xFF1A0F00)
                            ),
                            modifier      = Modifier.weight(1f),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                        ) {
                            if (isDownloading) {
                                CircularProgressIndicator(
                                    modifier      = Modifier.size(16.dp),
                                    strokeWidth   = 2.dp,
                                    color         = Color(0xFF1A0F00)
                                )
                                Spacer(Modifier.width(6.dp))
                            } else {
                                Icon(
                                    Icons.Default.Download,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(6.dp))
                            }
                            Text("Download PA", fontSize = 12.sp)
                        }
                    }
                    if (item.status == PAStatus.DOWNLOADED || item.hasCachedPA) {
                        OutlinedButton(
                            onClick        = onShare,
                            modifier       = Modifier.weight(1f),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                        ) {
                            Icon(
                                Icons.Default.Share,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text("Share to GCS", fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Pending PA Card -- PENDING items
// ---------------------------------------------------------------------------

@Composable
private fun PendingPACard(
    item:  PAItem,
    onTap: () -> Unit
) {
    val zoneColor = zoneAccentColor(item.zone)

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onTap),
        shape  = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.7f)
        )
    ) {
        Row(Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .fillMaxHeight()
                    .background(zoneColor, RoundedCornerShape(topStart = 8.dp, bottomStart = 8.dp))
            )

            Column(modifier = Modifier.weight(1f).padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment     = Alignment.CenterVertically
                ) {
                    Text(
                        text  = item.applicationId,
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontFamily = FontFamily.Monospace,
                            fontSize   = 11.sp
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    StatusBadge(
                        label = "PENDING",
                        color = JadsColors.AmberYellow
                    )
                }

                Spacer(Modifier.height(8.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(
                        text  = "UIN: ${item.droneUin.ifBlank { "N/A" }}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (item.submittedAt.isNotBlank()) {
                        Text(
                            text  = "Submitted: ${item.submittedAt}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Spacer(Modifier.height(4.dp))

                // Polling indicator
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(
                        modifier    = Modifier.size(12.dp),
                        strokeWidth = 1.5.dp,
                        color       = JadsColors.AmberYellow
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text  = "Awaiting DGCA approval",
                        style = MaterialTheme.typography.labelSmall,
                        color = JadsColors.AmberYellow
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Completed PA Card -- for flight log upload
// ---------------------------------------------------------------------------

@Composable
private fun CompletedPACard(
    item:        PAItem,
    onTap:       () -> Unit,
    onUpload:    () -> Unit,
    isUploading: Boolean
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onTap),
        shape  = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment     = Alignment.CenterVertically
            ) {
                Text(
                    text  = item.applicationId,
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontFamily = FontFamily.Monospace,
                        fontSize   = 11.sp
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                StatusBadge(
                    label = "COMPLETED",
                    color = JadsColors.GreenClear
                )
            }

            Spacer(Modifier.height(8.dp))

            Text(
                text  = "UIN: ${item.droneUin.ifBlank { "N/A" }}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(10.dp))

            Button(
                onClick = onUpload,
                enabled = !isUploading,
                colors  = ButtonDefaults.buttonColors(
                    containerColor = JadsColors.GreenClear,
                    contentColor   = Color(0xFF001A0A)
                ),
                modifier       = Modifier.fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
            ) {
                if (isUploading) {
                    CircularProgressIndicator(
                        modifier    = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color       = Color(0xFF001A0A)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text("Uploading...", fontSize = 12.sp)
                } else {
                    Icon(
                        Icons.Default.UploadFile,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text("Upload Flight Log", fontSize = 12.sp)
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// PA Detail Bottom Sheet content
// ---------------------------------------------------------------------------

@Composable
private fun PADetailContent(item: PAItem) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 8.dp)
    ) {
        // Title
        Text(
            text  = "Permission Artefact Detail",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            color = MaterialTheme.colorScheme.onSurface
        )

        Spacer(Modifier.height(16.dp))

        // Status + zone
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatusBadge(
                label = item.status.displayLabel,
                color = statusColor(item.status)
            )
            StatusBadge(
                label = "${item.zone.name} ZONE",
                color = zoneAccentColor(item.zone)
            )
        }

        Spacer(Modifier.height(16.dp))
        Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
        Spacer(Modifier.height(12.dp))

        // XML-style attributes in monospace
        Text(
            text  = "Application Attributes",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(Modifier.height(8.dp))

        val attrs = buildList {
            add("applicationId" to item.applicationId)
            if (item.referenceNumber != null) add("referenceNumber" to item.referenceNumber)
            add("status" to item.status.displayLabel)
            add("zone" to item.zone.name)
            add("droneUIN" to item.droneUin)
            add("pilotName" to item.pilotName)
            add("operationType" to item.operationType)
            add("altitude" to "${item.altitude}m AGL")
            add("flightWindowStart" to item.flightWindowStart)
            add("flightWindowEnd" to item.flightWindowEnd)
            if (item.submittedAt.isNotBlank()) add("submittedAt" to item.submittedAt)
            if (item.updatedAt != null) add("updatedAt" to item.updatedAt)
            if (item.remarks != null) add("remarks" to item.remarks)
            add("hasCachedPA" to item.hasCachedPA.toString())
        }

        Card(
            shape  = RoundedCornerShape(6.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                attrs.forEach { (key, value) ->
                    Text(
                        text = "$key=\"$value\"",
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontFamily = FontFamily.Monospace,
                            fontSize   = 11.sp
                        ),
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(vertical = 1.dp)
                    )
                }
            }
        }

        // Simplified polygon canvas
        if (item.polygon.isNotEmpty() && item.polygon.size >= 3) {
            Spacer(Modifier.height(16.dp))
            Divider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
            Spacer(Modifier.height(12.dp))

            Text(
                text  = "Flight Area Polygon",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))

            PolygonCanvas(
                polygon   = item.polygon,
                zoneColor = zoneAccentColor(item.zone),
                modifier  = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .background(
                        MaterialTheme.colorScheme.surfaceVariant,
                        RoundedCornerShape(8.dp)
                    )
            )

            Spacer(Modifier.height(8.dp))

            // Vertex list
            item.polygon.forEachIndexed { idx, pt ->
                Text(
                    text = "V$idx: (${String.format("%.6f", pt.latitude)}, ${String.format("%.6f", pt.longitude)})",
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontFamily = FontFamily.Monospace,
                        fontSize   = 10.sp
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(Modifier.height(32.dp))
    }
}

// ---------------------------------------------------------------------------
// Simplified polygon canvas -- draws the flight area polygon
// ---------------------------------------------------------------------------

@Composable
private fun PolygonCanvas(
    polygon:   List<LatLng>,
    zoneColor: Color,
    modifier:  Modifier = Modifier
) {
    Canvas(modifier = modifier.padding(16.dp)) {
        if (polygon.size < 3) return@Canvas

        val lats = polygon.map { it.latitude }
        val lngs = polygon.map { it.longitude }
        val minLat = lats.min()
        val maxLat = lats.max()
        val minLng = lngs.min()
        val maxLng = lngs.max()

        val latRange = (maxLat - minLat).coerceAtLeast(0.0001)
        val lngRange = (maxLng - minLng).coerceAtLeast(0.0001)

        val padding = 20f
        val drawWidth  = size.width  - padding * 2
        val drawHeight = size.height - padding * 2

        fun toCanvas(lat: Double, lng: Double): Offset {
            val x = padding + ((lng - minLng) / lngRange * drawWidth).toFloat()
            val y = padding + ((maxLat - lat) / latRange * drawHeight).toFloat()  // flip Y
            return Offset(x, y)
        }

        // Fill polygon
        val fillPath = Path().apply {
            val first = toCanvas(polygon[0].latitude, polygon[0].longitude)
            moveTo(first.x, first.y)
            for (i in 1 until polygon.size) {
                val pt = toCanvas(polygon[i].latitude, polygon[i].longitude)
                lineTo(pt.x, pt.y)
            }
            close()
        }
        drawPath(fillPath, color = zoneColor.copy(alpha = 0.15f))

        // Stroke polygon outline
        drawPath(fillPath, color = zoneColor, style = Stroke(width = 2f))

        // Draw vertices as circles
        polygon.forEach { pt ->
            val offset = toCanvas(pt.latitude, pt.longitude)
            drawCircle(
                color  = zoneColor,
                radius = 4f,
                center = offset
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

@Composable
private fun EmptyPAState(modifier: Modifier = Modifier) {
    Column(
        modifier            = modifier.padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            Icons.Default.VerifiedUser,
            contentDescription = null,
            tint     = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
            modifier = Modifier.size(64.dp)
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text  = "No Permission Artefacts",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text  = "Submitted flight permissions will appear here.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
        )
    }
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

private fun zoneAccentColor(zone: ZoneColour): Color = when (zone) {
    ZoneColour.GREEN  -> JadsColors.GreenClear
    ZoneColour.YELLOW -> JadsColors.OrangeConditional
    ZoneColour.RED    -> JadsColors.RedBlocked
}

private fun statusColor(status: PAStatus): Color = when (status) {
    PAStatus.APPROVED   -> JadsColors.GreenClear
    PAStatus.ACTIVE     -> JadsColors.SkyBlue
    PAStatus.DOWNLOADED -> JadsColors.GreenClear
    PAStatus.PENDING    -> JadsColors.AmberYellow
    PAStatus.EXPIRED    -> JadsColors.TextSecondary
    PAStatus.REJECTED   -> JadsColors.RedBlocked
    PAStatus.COMPLETED  -> JadsColors.GreenClear
}
