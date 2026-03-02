package com.jads.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jads.ui.theme.JadsColors

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge — coloured pill for NPNT zone, upload status, mission state
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun StatusBadge(
    label: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .background(color.copy(alpha = 0.15f), RoundedCornerShape(4.dp))
            .border(1.dp, color.copy(alpha = 0.5f), RoundedCornerShape(4.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(
            text  = label,
            color = color,
            style = MaterialTheme.typography.labelMedium
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// NpntStatusCard — full NPNT result display with zone colour and reasons
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun NpntStatusCard(
    zoneType:   String,   // "GREEN" | "YELLOW" | "RED"
    blocked:    Boolean,
    reasons:    List<String>,
    modifier:   Modifier = Modifier
) {
    val (accent, zoneName) = when (zoneType) {
        "RED"    -> JadsColors.RedBlocked        to "RED ZONE"
        "YELLOW" -> JadsColors.OrangeConditional to "YELLOW ZONE"
        else     -> JadsColors.GreenClear        to "GREEN ZONE"
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape    = RoundedCornerShape(8.dp),
        colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                verticalAlignment    = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier             = Modifier.fillMaxWidth()
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .background(accent, CircleShape)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text  = zoneName,
                        color = accent,
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
                    )
                }
                StatusBadge(
                    label = if (blocked) "BLOCKED" else "CLEAR",
                    color = if (blocked) JadsColors.RedBlocked else JadsColors.GreenClear
                )
            }

            if (reasons.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                reasons.forEach { reason ->
                    Row(
                        modifier             = Modifier.padding(vertical = 2.dp),
                        verticalAlignment    = Alignment.Top
                    ) {
                        Icon(
                            imageVector = if (blocked) Icons.Default.Warning else Icons.Default.Info,
                            contentDescription = null,
                            tint    = accent,
                            modifier = Modifier.size(14.dp).padding(top = 2.dp)
                        )
                        Spacer(Modifier.width(6.dp))
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
}

// ─────────────────────────────────────────────────────────────────────────────
// ViolationCard — individual violation alert on active mission screen
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun ViolationCard(
    type:     String,
    severity: String,
    detail:   String,
    modifier: Modifier = Modifier
) {
    val (color, icon) = when (severity) {
        "CRITICAL" -> JadsColors.RedBlocked        to Icons.Default.GppBad
        "WARNING"  -> JadsColors.OrangeConditional to Icons.Default.Warning
        else       -> JadsColors.SkyBlue           to Icons.Default.Info
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape    = RoundedCornerShape(6.dp),
        colors   = CardDefaults.cardColors(
            containerColor = color.copy(alpha = 0.08f)
        )
    ) {
        Row(
            Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text  = type.replace("_", " "),
                    style = MaterialTheme.typography.labelMedium,
                    color = color
                )
                Text(
                    text  = detail,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Monospaced value display — missionId, hash excerpts, etc.
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun MonoValue(
    label: String,
    value: String,
    color: Color = MaterialTheme.colorScheme.onSurface,
    modifier: Modifier = Modifier
) {
    Column(modifier) {
        Text(
            text  = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text  = value,
            style = MaterialTheme.typography.bodySmall.copy(
                fontFamily = FontFamily.Monospace,
                fontSize   = 11.sp
            ),
            color = color
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// InfoRow — labelled value pair for forensic summary cards
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun InfoRow(
    label:    String,
    value:    String,
    icon:     ImageVector? = null,
    valueColor: Color = MaterialTheme.colorScheme.onSurface,
    modifier: Modifier = Modifier
) {
    Row(
        modifier             = modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment    = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) {
                Icon(
                    imageVector        = icon,
                    contentDescription = null,
                    tint               = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier           = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(8.dp))
            }
            Text(
                text  = label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Text(
            text  = value,
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
            color = valueColor
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionHeader — divider with label
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier) {
    Row(
        modifier          = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text  = title.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.width(8.dp))
        Divider(
            Modifier.weight(1f),
            color     = MaterialTheme.colorScheme.outline,
            thickness = 0.5.dp
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AltitudeGauge — vertical bar showing altitude vs 400ft limit
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun AltitudeGauge(
    altitudeFt:  Double,
    limitFt:     Double = 400.0,
    modifier:    Modifier = Modifier
) {
    val fraction  = (altitudeFt / limitFt).coerceIn(0.0, 1.0).toFloat()
    val barColor  = when {
        fraction > 0.9f -> JadsColors.RedBlocked
        fraction > 0.7f -> JadsColors.OrangeConditional
        else            -> JadsColors.SkyBlue
    }

    Column(
        modifier          = modifier.width(56.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text  = "${altitudeFt.toInt()}ft",
            style = MaterialTheme.typography.labelMedium,
            color = barColor
        )
        Spacer(Modifier.height(4.dp))

        Box(
            modifier = Modifier
                .width(20.dp)
                .height(120.dp)
                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(10.dp))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(fraction)
                    .background(barColor, RoundedCornerShape(10.dp))
                    .align(Alignment.BottomCenter)
            )
        }

        Spacer(Modifier.height(4.dp))
        Text(
            text  = "${limitFt.toInt()}ft max",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
