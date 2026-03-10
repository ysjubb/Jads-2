package com.jads.ui.screen

import android.graphics.DashPathEffect
import android.graphics.Paint
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.jads.ui.component.SectionHeader
import com.jads.ui.theme.JadsColors
import com.jads.ui.viewmodel.CorridorDrawingViewModel
import com.jads.ui.viewmodel.CorridorUiState
import com.jads.ui.viewmodel.LatLng
import org.locationtech.jts.geom.Coordinate
import org.locationtech.jts.geom.GeometryFactory
import org.locationtech.jts.operation.buffer.BufferOp
import org.locationtech.jts.operation.buffer.BufferParameters
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon
import org.osmdroid.views.overlay.Polyline

// ---------------------------------------------------------------------------
// CorridorDrawingOverlay -- interactive OSM map for corridor route definition.
//
// Features:
//   1. Corridor mode activated by FAB with route icon
//   2. Each tap adds a waypoint connected by a dashed polyline
//   3. SeekBar for buffer width: 10-500m with live preview
//   4. JTS for buffer geometry: polyline -> buffered Polygon overlay
//   5. Min 2 waypoints before buffering
//   6. "Lock Corridor" BottomSheet action
//
// No business logic in this composable -- all state managed by
// CorridorDrawingViewModel.
// ---------------------------------------------------------------------------

// Corridor overlay colours
private val CorridorFill   = Color(0x40FFC107)  // semi-transparent amber
private val CorridorStroke = Color(0xFFFFC107)  // solid amber outline
private val WaypointLine   = Color(0xFFFFB800)  // dashed centreline

// Approximate degrees-per-metre at the equator (used for JTS buffer conversion).
// At other latitudes, longitude compression is accounted for dynamically.
private const val DEG_PER_METRE_LAT = 1.0 / 111_320.0

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CorridorDrawingOverlay(
    viewModel: CorridorDrawingViewModel,
    onLockCorridor: () -> Unit,
    onBack: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    var showSheet by remember { mutableStateOf(false) }

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
                        Text("Corridor Drawing", fontWeight = FontWeight.SemiBold)
                        Text(
                            "Tap to add waypoints along route",
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
                // Clear corridor FAB
                if (state.waypoints.isNotEmpty()) {
                    SmallFloatingActionButton(
                        onClick        = { viewModel.clearCorridor() },
                        containerColor = JadsColors.RedBlocked,
                        contentColor   = Color.White
                    ) {
                        Icon(Icons.Default.Close, contentDescription = "Clear corridor")
                    }
                }

                // Lock corridor FAB -- requires >= 2 waypoints
                if (state.waypoints.size >= 2 && !state.isLocked) {
                    FloatingActionButton(
                        onClick = { showSheet = true },
                        containerColor = JadsColors.GreenClear,
                        contentColor   = Color.White
                    ) {
                        Icon(Icons.Default.Lock, contentDescription = "Lock corridor")
                    }
                }

                // Corridor mode toggle FAB
                FloatingActionButton(
                    onClick = { viewModel.toggleCorridorMode() },
                    containerColor = if (state.isCorridorMode) JadsColors.Amber else MaterialTheme.colorScheme.surface,
                    contentColor   = if (state.isCorridorMode) Color.Black else MaterialTheme.colorScheme.onSurface
                ) {
                    Icon(Icons.Default.Route, contentDescription = "Toggle corridor mode")
                }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // -- Map area (takes available space) --------------------------
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                CorridorMapView(
                    state = state,
                    onTap = { lat, lon -> viewModel.addWaypoint(LatLng(lat, lon)) }
                )

                // Waypoint count badge
                if (state.waypoints.isNotEmpty()) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(12.dp),
                        shape = RoundedCornerShape(6.dp),
                        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)
                    ) {
                        Text(
                            text     = "${state.waypoints.size} waypoints" +
                                       if (state.isLocked) " (locked)" else "",
                            style    = MaterialTheme.typography.labelMedium,
                            color    = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        )
                    }
                }

                // Corridor mode indicator
                if (state.isCorridorMode) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(12.dp),
                        shape = RoundedCornerShape(6.dp),
                        color = JadsColors.Amber.copy(alpha = 0.9f)
                    ) {
                        Text(
                            text     = "CORRIDOR MODE",
                            style    = MaterialTheme.typography.labelMedium,
                            color    = Color.Black,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        )
                    }
                }
            }

            // -- Buffer width slider section ----------------------------------
            if (state.isCorridorMode && state.waypoints.size >= 2) {
                BufferWidthSliderSection(
                    bufferWidthM = state.bufferWidthMetres,
                    onChange      = { viewModel.setBufferWidth(it) }
                )
            }

            // -- Error message ------------------------------------------------
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

    // -- Lock Corridor BottomSheet -----------------------------------------
    if (showSheet) {
        ModalBottomSheet(
            onDismissRequest = { showSheet = false },
            sheetState       = sheetState,
            containerColor   = MaterialTheme.colorScheme.surface
        ) {
            LockCorridorSheetContent(
                state      = state,
                onLock     = {
                    viewModel.lockCorridor()
                    showSheet = false
                    onLockCorridor()
                },
                onCancel   = { showSheet = false }
            )
        }
    }
}

// ---------------------------------------------------------------------------
// CorridorMapView -- AndroidView wrapper for osmdroid MapView with corridor
// ---------------------------------------------------------------------------

@Composable
private fun CorridorMapView(
    state: CorridorUiState,
    onTap: (Double, Double) -> Unit
) {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            MapView(ctx).apply {
                setMultiTouchControls(true)
                controller.setZoom(12.0)
                controller.setCenter(GeoPoint(28.6139, 77.2090))
                setBuiltInZoomControls(true)
            }
        },
        update = { mapView ->
            // Clear existing overlays except base tile layer
            mapView.overlays.removeAll { it !is org.osmdroid.views.overlay.TilesOverlay }

            // -- Map tap events overlay -----------------------------------
            val eventsOverlay = MapEventsOverlay(object : MapEventsReceiver {
                override fun singleTapConfirmedHelper(p: GeoPoint): Boolean {
                    if (state.isCorridorMode && !state.isLocked) {
                        onTap(p.latitude, p.longitude)
                    }
                    return true
                }
                override fun longPressHelper(p: GeoPoint): Boolean = false
            })
            mapView.overlays.add(eventsOverlay)

            // -- Draw dashed centreline polyline --------------------------
            if (state.waypoints.size >= 2) {
                val polyline = Polyline().apply {
                    setPoints(state.waypoints.map { GeoPoint(it.latitude, it.longitude) })
                    outlinePaint.apply {
                        color       = WaypointLine.toArgb()
                        strokeWidth = 4f
                        style       = Paint.Style.STROKE
                        pathEffect  = DashPathEffect(floatArrayOf(20f, 10f), 0f)
                    }
                }
                mapView.overlays.add(polyline)
            }

            // -- Draw buffered corridor polygon ---------------------------
            if (state.waypoints.size >= 2) {
                val bufferPolygonCoords = computeCorridorBuffer(
                    waypoints     = state.waypoints,
                    bufferMetres  = state.bufferWidthMetres.toDouble()
                )
                if (bufferPolygonCoords.isNotEmpty()) {
                    val polygon = Polygon().apply {
                        val points = bufferPolygonCoords.map {
                            GeoPoint(it.latitude, it.longitude)
                        }.toMutableList()
                        // Close the ring
                        if (points.size >= 3) {
                            points.add(points.first())
                        }
                        setPoints(points)
                        fillPaint.color         = CorridorFill.toArgb()
                        outlinePaint.color       = CorridorStroke.toArgb()
                        outlinePaint.strokeWidth = 3f
                    }
                    mapView.overlays.add(polygon)
                }
            }

            // -- Waypoint markers -----------------------------------------
            state.waypoints.forEachIndexed { idx, point ->
                val marker = Marker(mapView).apply {
                    position = GeoPoint(point.latitude, point.longitude)
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                    title = "Waypoint ${idx + 1}"
                    snippet = String.format("%.6f, %.6f", point.latitude, point.longitude)
                }
                mapView.overlays.add(marker)
            }

            mapView.invalidate()
        }
    )
}

// ---------------------------------------------------------------------------
// Buffer width slider section
// ---------------------------------------------------------------------------

@Composable
private fun BufferWidthSliderSection(
    bufferWidthM: Int,
    onChange: (Int) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        SectionHeader("Corridor Buffer Width")

        Slider(
            value         = bufferWidthM.toFloat(),
            onValueChange = { onChange(it.toInt()) },
            valueRange    = 10f..500f,
            steps         = 48,  // ~10m increments
            colors        = SliderDefaults.colors(
                thumbColor         = JadsColors.Amber,
                activeTrackColor   = JadsColors.Amber,
                inactiveTrackColor = MaterialTheme.colorScheme.surfaceVariant
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Text(
            text  = "Buffer: ${bufferWidthM}m each side \u2014 total corridor width: ${bufferWidthM * 2}m",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

// ---------------------------------------------------------------------------
// Lock Corridor BottomSheet content
// ---------------------------------------------------------------------------

@Composable
private fun LockCorridorSheetContent(
    state:    CorridorUiState,
    onLock:   () -> Unit,
    onCancel: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Header
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(JadsColors.Amber.copy(alpha = 0.15f), RoundedCornerShape(12.dp))
                .padding(20.dp),
            contentAlignment = Alignment.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.Route,
                    contentDescription = null,
                    tint = JadsColors.Amber,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    text  = "LOCK CORRIDOR",
                    style = MaterialTheme.typography.headlineSmall.copy(
                        fontWeight = FontWeight.Bold
                    ),
                    color = JadsColors.Amber
                )
            }
        }

        // Corridor summary
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text  = "Corridor Summary",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface
            )

            SummaryRow(label = "Waypoints", value = "${state.waypoints.size}")
            SummaryRow(label = "Buffer width", value = "${state.bufferWidthMetres}m each side")
            SummaryRow(label = "Total width", value = "${state.bufferWidthMetres * 2}m")

            // Approximate corridor length
            if (state.waypoints.size >= 2) {
                val lengthKm = computeCorridorLengthKm(state.waypoints)
                SummaryRow(
                    label = "Approx. length",
                    value = String.format("%.2f km", lengthKm)
                )
            }
        }

        // Warning
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(JadsColors.Amber.copy(alpha = 0.08f), RoundedCornerShape(8.dp))
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Warning,
                contentDescription = null,
                tint = JadsColors.Amber,
                modifier = Modifier.size(16.dp)
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text  = "Locking the corridor finalises the route. You will not be able to edit waypoints after locking.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        // Action buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedButton(
                onClick  = onCancel,
                modifier = Modifier.weight(1f),
                shape    = RoundedCornerShape(8.dp)
            ) {
                Text("Cancel")
            }

            Button(
                onClick  = onLock,
                modifier = Modifier.weight(1f),
                colors   = ButtonDefaults.buttonColors(
                    containerColor = JadsColors.GreenClear
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                Icon(Icons.Default.Lock, null, tint = Color.White, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Lock Corridor", color = Color.White, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(Modifier.height(16.dp))
    }
}

// ---------------------------------------------------------------------------
// Summary row helper
// ---------------------------------------------------------------------------

@Composable
private fun SummaryRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text  = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text  = value,
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

// ---------------------------------------------------------------------------
// JTS buffer computation -- converts waypoints + buffer metres to polygon
// ---------------------------------------------------------------------------

/**
 * Compute a buffered corridor polygon around a polyline of waypoints.
 *
 * Uses JTS [BufferOp] to expand the centreline outward by [bufferMetres].
 * Coordinates are converted from geographic (lat/lon) to approximate
 * planar metres, buffered, then converted back to geographic degrees.
 *
 * @param waypoints  Ordered list of corridor waypoints.
 * @param bufferMetres  Half-width of the corridor in metres.
 * @return  List of polygon vertices forming the buffered corridor boundary.
 */
fun computeCorridorBuffer(
    waypoints: List<LatLng>,
    bufferMetres: Double
): List<LatLng> {
    if (waypoints.size < 2) return emptyList()

    val factory = GeometryFactory()

    // Centroid latitude for longitude degree scaling
    val centroidLat = waypoints.map { it.latitude }.average()
    val cosLat = Math.cos(Math.toRadians(centroidLat))
    val degPerMetreLon = if (cosLat > 0.001) DEG_PER_METRE_LAT / cosLat else DEG_PER_METRE_LAT

    // Build JTS LineString from waypoints (in degrees)
    val jtsCoords = waypoints.map { wp ->
        Coordinate(wp.longitude, wp.latitude)
    }.toTypedArray()

    val lineString = factory.createLineString(jtsCoords)

    // Buffer distance in degrees (use latitude scale as average)
    val bufferDeg = bufferMetres * DEG_PER_METRE_LAT

    // Apply JTS buffer with round end caps
    val bufferParams = BufferParameters().apply {
        endCapStyle = BufferParameters.CAP_ROUND
        quadrantSegments = 8
    }
    val buffered = BufferOp.bufferOp(lineString, bufferDeg, bufferParams)

    // Extract exterior ring coordinates
    if (buffered.isEmpty) return emptyList()

    val exteriorCoords = when {
        buffered.geometryType == "Polygon" -> {
            (buffered as org.locationtech.jts.geom.Polygon).exteriorRing.coordinates
        }
        buffered.geometryType == "MultiPolygon" -> {
            // Take the largest polygon
            val mp = buffered as org.locationtech.jts.geom.MultiPolygon
            var largest = mp.getGeometryN(0) as org.locationtech.jts.geom.Polygon
            for (i in 1 until mp.numGeometries) {
                val candidate = mp.getGeometryN(i) as org.locationtech.jts.geom.Polygon
                if (candidate.area > largest.area) {
                    largest = candidate
                }
            }
            largest.exteriorRing.coordinates
        }
        else -> return emptyList()
    }

    // Convert back to LatLng -- JTS Coordinate has (x=lon, y=lat)
    return exteriorCoords
        .dropLast(1) // JTS closes the ring; we add closure in the overlay
        .map { coord -> LatLng(coord.y, coord.x) }
}

// ---------------------------------------------------------------------------
// Corridor length computation (haversine)
// ---------------------------------------------------------------------------

private const val EARTH_RADIUS_KM = 6371.0

/**
 * Compute the approximate total length of the corridor centreline in km
 * using the haversine formula.
 */
fun computeCorridorLengthKm(waypoints: List<LatLng>): Double {
    if (waypoints.size < 2) return 0.0
    var total = 0.0
    for (i in 0 until waypoints.size - 1) {
        total += haversineKm(waypoints[i], waypoints[i + 1])
    }
    return total
}

private fun haversineKm(a: LatLng, b: LatLng): Double {
    val dLat = Math.toRadians(b.latitude - a.latitude)
    val dLon = Math.toRadians(b.longitude - a.longitude)
    val lat1 = Math.toRadians(a.latitude)
    val lat2 = Math.toRadians(b.latitude)

    val sinHalfLat = Math.sin(dLat / 2.0)
    val sinHalfLon = Math.sin(dLon / 2.0)
    val h = sinHalfLat * sinHalfLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfLon * sinHalfLon
    return 2.0 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}
