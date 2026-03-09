package com.jads.ui.screen

import android.view.MotionEvent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jads.network.ZoneClassificationResult
import com.jads.ui.component.SectionHeader
import com.jads.ui.theme.JadsColors
import com.jads.ui.viewmodel.AirspaceMapViewModel
import com.jads.ui.viewmodel.LatLng
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon

// ─────────────────────────────────────────────────────────────────────────────
// AirspaceMapScreen — interactive OSM map for drone flight area definition.
//
// Features:
//   1. OpenStreetMap tiles via osmdroid (default tile provider — not changed)
//   2. GeoJSON zone overlay with semi-transparent colour fills
//   3. Polygon drawing: single-tap adds vertex, double-tap closes, long-press drags
//   4. FABs: checkmark to confirm polygon, X to clear
//   5. Zone-check BottomSheet with status chip and reason list
//   6. Altitude slider (0–500m) with dynamic zone-impact label
//
// No business logic in this composable — all state managed by AirspaceMapViewModel.
// ─────────────────────────────────────────────────────────────────────────────

// Zone overlay colours (semi-transparent fills per spec)
private val ZoneGreen  = Color(0x804CAF50)   // #4CAF5080
private val ZoneYellow = Color(0x80FFC107)   // #FFC10780
private val ZoneRed    = Color(0x80F44336)   // #F4433680

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AirspaceMapScreen(
    viewModel:   AirspaceMapViewModel,
    onProceed:   () -> Unit,
    onBack:      () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    var showSheet by remember { mutableStateOf(false) }

    // Show sheet automatically when zone result arrives
    LaunchedEffect(state.zoneResult) {
        if (state.zoneResult != null) {
            showSheet = true
        }
    }

    // Initialise osmdroid configuration once
    LaunchedEffect(Unit) {
        Configuration.getInstance().load(
            context,
            context.getSharedPreferences("osmdroid", 0)
        )
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Airspace Map", fontWeight = FontWeight.SemiBold)
                        Text(
                            "Draw flight area polygon",
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
        },
        floatingActionButton = {
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Clear polygon FAB
                if (state.drawnPolygon.isNotEmpty()) {
                    SmallFloatingActionButton(
                        onClick        = { viewModel.clearPolygon() },
                        containerColor = JadsColors.RedBlocked,
                        contentColor   = Color.White
                    ) {
                        Icon(Icons.Default.Close, contentDescription = "Clear polygon")
                    }
                }
                // Confirm polygon FAB
                if (state.drawnPolygon.size >= 3) {
                    FloatingActionButton(
                        onClick = {
                            if (viewModel.confirmPolygon()) {
                                showSheet = true
                            }
                        },
                        containerColor = JadsColors.GreenClear,
                        contentColor   = Color.White
                    ) {
                        Icon(Icons.Default.Check, contentDescription = "Confirm polygon")
                    }
                }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // ── Map area (takes available space) ─────────────────────────
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                OsmMapView(
                    polygon       = state.drawnPolygon,
                    polygonClosed = state.polygonClosed,
                    zoneResult    = state.zoneResult,
                    onTap         = { lat, lon -> viewModel.addVertex(LatLng(lat, lon)) },
                    onDoubleTap   = { viewModel.closePolygon() },
                    onVertexDrag  = { idx, lat, lon -> viewModel.moveVertex(idx, LatLng(lat, lon)) }
                )

                // Loading indicator overlay
                if (state.isLoading) {
                    CircularProgressIndicator(
                        modifier    = Modifier
                            .align(Alignment.TopEnd)
                            .padding(12.dp)
                            .size(32.dp),
                        color       = JadsColors.Amber,
                        strokeWidth = 3.dp
                    )
                }

                // Vertex count badge
                if (state.drawnPolygon.isNotEmpty()) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(12.dp),
                        shape = RoundedCornerShape(6.dp),
                        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)
                    ) {
                        Text(
                            text     = "${state.drawnPolygon.size} vertices" +
                                       if (state.polygonClosed) " (closed)" else "",
                            style    = MaterialTheme.typography.labelMedium,
                            color    = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        )
                    }
                }
            }

            // ── Altitude slider section ──────────────────────────────────
            AltitudeSliderSection(
                altitude   = state.altitude,
                zoneResult = state.zoneResult,
                onChange    = { viewModel.onAltitudeChanged(it) }
            )

            // ── Error message ────────────────────────────────────────────
            if (state.errorMessage != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            JadsColors.RedBlocked.copy(alpha = 0.1f),
                            RoundedCornerShape(0.dp)
                        )
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Error,
                        contentDescription = null,
                        tint     = JadsColors.RedBlocked,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text  = state.errorMessage!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = JadsColors.RedBlocked
                    )
                }
            }
        }
    }

    // ── Zone result BottomSheet ──────────────────────────────────────────────
    if (showSheet && state.zoneResult != null) {
        ModalBottomSheet(
            onDismissRequest = { showSheet = false },
            sheetState       = sheetState,
            containerColor   = MaterialTheme.colorScheme.surface
        ) {
            ZoneResultSheetContent(
                zoneResult      = state.zoneResult!!,
                redAcknowledged = state.redAcknowledged,
                canProceed      = viewModel.canProceed(),
                onAcknowledgeRed = { viewModel.acknowledgeRedZone() },
                onProceed       = {
                    showSheet = false
                    onProceed()
                }
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// OsmMapView — AndroidView wrapper for osmdroid MapView
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun OsmMapView(
    polygon:       List<LatLng>,
    polygonClosed: Boolean,
    zoneResult:    ZoneClassificationResult?,
    onTap:         (Double, Double) -> Unit,
    onDoubleTap:   () -> Unit,
    onVertexDrag:  (Int, Double, Double) -> Unit
) {
    // Track last tap time for double-tap detection
    var lastTapTimeMs by remember { mutableLongStateOf(0L) }

    // Track which vertex is being dragged (-1 = none)
    var dragVertexIndex by remember { mutableIntStateOf(-1) }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            MapView(ctx).apply {
                setMultiTouchControls(true)
                // Default India view — New Delhi
                controller.setZoom(12.0)
                controller.setCenter(GeoPoint(28.6139, 77.2090))
                // Enable built-in zoom controls
                setBuiltInZoomControls(true)
            }
        },
        update = { mapView ->
            // Clear existing overlays except base tile layer
            mapView.overlays.removeAll { it !is org.osmdroid.views.overlay.TilesOverlay }

            // ── Map tap events overlay ───────────────────────────────────
            val eventsOverlay = MapEventsOverlay(object : MapEventsReceiver {
                override fun singleTapConfirmedHelper(p: GeoPoint): Boolean {
                    val now = System.currentTimeMillis()
                    if (now - lastTapTimeMs < 350) {
                        // Double tap detected
                        onDoubleTap()
                        lastTapTimeMs = 0L
                    } else {
                        lastTapTimeMs = now
                        onTap(p.latitude, p.longitude)
                    }
                    return true
                }

                override fun longPressHelper(p: GeoPoint): Boolean {
                    // Find nearest vertex for drag initiation
                    if (polygon.isNotEmpty()) {
                        val nearest = polygon.withIndex().minByOrNull { (_, v) ->
                            val dx = v.latitude - p.latitude
                            val dy = v.longitude - p.longitude
                            dx * dx + dy * dy
                        }
                        if (nearest != null) {
                            val dist = Math.sqrt(
                                Math.pow(nearest.value.latitude - p.latitude, 2.0) +
                                Math.pow(nearest.value.longitude - p.longitude, 2.0)
                            )
                            // Only initiate drag if within ~500m (~0.005 degrees)
                            if (dist < 0.005) {
                                dragVertexIndex = nearest.index
                            }
                        }
                    }
                    return true
                }
            })
            mapView.overlays.add(eventsOverlay)

            // ── Handle vertex dragging via touch listener ────────────────
            mapView.setOnTouchListener { v, event ->
                if (dragVertexIndex >= 0) {
                    when (event.action) {
                        MotionEvent.ACTION_MOVE -> {
                            val proj = mapView.projection
                            val geo  = proj.fromPixels(event.x.toInt(), event.y.toInt()) as GeoPoint
                            onVertexDrag(dragVertexIndex, geo.latitude, geo.longitude)
                            mapView.invalidate()
                            true
                        }
                        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                            dragVertexIndex = -1
                            v.performClick()
                            true
                        }
                        else -> false
                    }
                } else {
                    false
                }
            }

            // ── Draw polygon overlay ─────────────────────────────────────
            if (polygon.size >= 2) {
                val fillColor = when (zoneResult?.zone) {
                    "RED"    -> ZoneRed
                    "YELLOW" -> ZoneYellow
                    "GREEN"  -> ZoneGreen
                    else     -> Color(0x40808080)  // grey while no result
                }
                val strokeColor = when (zoneResult?.zone) {
                    "RED"    -> Color(0xFFF44336)
                    "YELLOW" -> Color(0xFFFFC107)
                    "GREEN"  -> Color(0xFF4CAF50)
                    else     -> Color(0xFF808080)
                }

                val osmPolygon = Polygon().apply {
                    val points = polygon.map { GeoPoint(it.latitude, it.longitude) }.toMutableList()
                    if (polygonClosed && points.size >= 3) {
                        points.add(points.first()) // close the ring
                    }
                    setPoints(points)
                    fillPaint.color       = fillColor.toArgb()
                    outlinePaint.color     = strokeColor.toArgb()
                    outlinePaint.strokeWidth = 4f
                }
                mapView.overlays.add(osmPolygon)
            }

            // ── Vertex markers ───────────────────────────────────────────
            polygon.forEachIndexed { idx, point ->
                val marker = Marker(mapView).apply {
                    position = GeoPoint(point.latitude, point.longitude)
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                    title = "Vertex ${idx + 1}"
                    snippet = String.format("%.6f, %.6f", point.latitude, point.longitude)
                    isDraggable = true
                    setOnMarkerDragListener(object : Marker.OnMarkerDragListener {
                        override fun onMarkerDrag(marker: Marker) {}
                        override fun onMarkerDragEnd(marker: Marker) {
                            onVertexDrag(idx, marker.position.latitude, marker.position.longitude)
                        }
                        override fun onMarkerDragStart(marker: Marker) {}
                    })
                }
                mapView.overlays.add(marker)
            }

            mapView.invalidate()
        }
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Altitude slider section
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun AltitudeSliderSection(
    altitude:   Int,
    zoneResult: ZoneClassificationResult?,
    onChange:    (Int) -> Unit
) {
    val zoneImpact = when {
        zoneResult == null       -> "No zone data"
        altitude > 400 && zoneResult.zone == "GREEN" ->
            "Exceeds 400m AGL limit in GREEN zone — permission required"
        zoneResult.zone == "RED" -> "RED zone — operations prohibited regardless of altitude"
        zoneResult.zone == "YELLOW" ->
            "YELLOW zone — DGCA permission required"
        altitude <= 120          -> "Within standard operating altitude"
        else                     -> "Within permissible limits"
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        SectionHeader("Altitude")

        Slider(
            value         = altitude.toFloat(),
            onValueChange = { onChange(it.toInt()) },
            valueRange    = 0f..500f,
            steps         = 49,   // 10m increments
            colors        = SliderDefaults.colors(
                thumbColor            = JadsColors.Amber,
                activeTrackColor      = JadsColors.Amber,
                inactiveTrackColor    = MaterialTheme.colorScheme.surfaceVariant
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Text(
            text  = "AGL altitude: ${altitude}m \u2014 $zoneImpact",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Zone result BottomSheet content
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun ZoneResultSheetContent(
    zoneResult:       ZoneClassificationResult,
    redAcknowledged:  Boolean,
    canProceed:       Boolean,
    onAcknowledgeRed: () -> Unit,
    onProceed:        () -> Unit
) {
    val (zoneColor, zoneLabel) = when (zoneResult.zone) {
        "RED"    -> JadsColors.RedBlocked        to "RED ZONE"
        "YELLOW" -> JadsColors.OrangeConditional to "YELLOW ZONE"
        else     -> JadsColors.GreenClear        to "GREEN ZONE"
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // ── Large status chip ────────────────────────────────────────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(zoneColor.copy(alpha = 0.15f), RoundedCornerShape(12.dp))
                .padding(20.dp),
            contentAlignment = Alignment.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(16.dp)
                        .background(zoneColor, CircleShape)
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    text  = zoneLabel,
                    style = MaterialTheme.typography.headlineSmall.copy(
                        fontWeight = FontWeight.Bold
                    ),
                    color = zoneColor
                )
            }
        }

        // ── ATC Authority ────────────────────────────────────────────────
        if (zoneResult.atcAuthority != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.AdminPanelSettings,
                    contentDescription = null,
                    tint     = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text  = "ATC Authority: ${zoneResult.atcAuthority}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        // ── Bulleted reasons list ────────────────────────────────────────
        if (zoneResult.reasons.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text  = "Zone Assessment",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface
                )
                zoneResult.reasons.forEach { reason ->
                    Row(
                        modifier          = Modifier.padding(start = 4.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Text(
                            text     = "\u2022",
                            style    = MaterialTheme.typography.bodyMedium,
                            color    = zoneColor,
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

        // ── RED zone acknowledgement ─────────────────────────────────────
        if (zoneResult.zone == "RED" && !redAcknowledged) {
            OutlinedButton(
                onClick  = onAcknowledgeRed,
                modifier = Modifier.fillMaxWidth(),
                shape    = RoundedCornerShape(8.dp),
                colors   = OutlinedButtonDefaults.outlinedButtonColors(
                    contentColor = JadsColors.RedBlocked
                ),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    JadsColors.RedBlocked.copy(alpha = 0.6f)
                )
            ) {
                Icon(Icons.Default.Warning, null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("I acknowledge RED zone restrictions")
            }
        }

        // ── Proceed button ───────────────────────────────────────────────
        Button(
            onClick  = onProceed,
            enabled  = canProceed,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            colors   = ButtonDefaults.buttonColors(
                containerColor         = JadsColors.GreenClear,
                disabledContainerColor = JadsColors.GreenClear.copy(alpha = 0.3f)
            ),
            shape = RoundedCornerShape(8.dp)
        ) {
            Icon(Icons.Default.ArrowForward, null, tint = Color.White)
            Spacer(Modifier.width(8.dp))
            Text(
                text       = "Proceed to Details",
                color      = Color.White,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(Modifier.height(16.dp))
    }
}
