package com.jads.drone

// NPNT (No Permission, No Takeoff) compliance gate.
// MUST run FIRST — before NTP sync, before cert check, before mission start.
//
// Three independent checks run in sequence:
//   1. Drone weight category (NANO/MICRO/SMALL/MEDIUM/LARGE per DGCA UAS Rules 2021)
//   2. Zone classification (GREEN/YELLOW/RED from Digital Sky)
//   3. Airport proximity (exclusion zones per UAS Rules 2021)
//
// Category-aware NPNT exemptions:
//   NANO (< 250g):    NPNT-EXEMPT in GREEN zones. No UIN needed. Only acknowledgement number.
//   MICRO (250g-2kg): NPNT required only in YELLOW zones. Simplified UIN.
//   SMALL+ (> 2kg):   Full NPNT compliance. UIN + pilot license + permission artefact.
//
// Both zone and proximity checks can independently block a mission.
// A GREEN zone location can still be inside a 5km airport exclusion.
//
// RED zone:           HARD STOP. blocked=true. No override. No government exemption.
// YELLOW zone:        Block until Digital Sky permission token received and verified.
// GREEN zone:         Proceed if AGL <= 400ft. Token required above 400ft.
// Airport PROHIBITED: HARD STOP. Within 5km ARP, below 1000ft AGL.
// Airport COORD_REQ:  Block unless ATC coordination confirmed.

// DGCA UAS Rules 2021 — drone weight categories
enum class DroneWeightCategory {
    NANO,       // < 250g — NPNT-exempt in GREEN zones
    MICRO,      // 250g – 2kg — NPNT in controlled airspace only
    SMALL,      // 2kg – 25kg — full NPNT compliance
    MEDIUM,     // 25kg – 150kg — full NPNT + type certificate
    LARGE,      // > 150kg — treated as manned aircraft
    UNKNOWN;    // category not specified

    companion object {
        fun fromWeightGrams(grams: Int): DroneWeightCategory = when {
            grams < 250    -> NANO
            grams < 2000   -> MICRO
            grams < 25000  -> SMALL
            grams < 150000 -> MEDIUM
            else           -> LARGE
        }
    }
}

// Category-specific compliance rules per DGCA UAS Rules 2021
data class CategoryComplianceRules(
    val npntRequired:         Boolean,
    val uinRequired:          Boolean,
    val nanoAckRequired:      Boolean,
    val permissionArtefact:   Boolean,   // PA needed in YELLOW zones
    val pilotLicenseRequired: Boolean,
    val maxAglFt:             Int = 400
)

object CategoryRulesTable {
    private val rules = mapOf(
        DroneWeightCategory.NANO to CategoryComplianceRules(
            npntRequired = false, uinRequired = false, nanoAckRequired = true,
            permissionArtefact = false, pilotLicenseRequired = false
        ),
        DroneWeightCategory.MICRO to CategoryComplianceRules(
            npntRequired = true, uinRequired = true, nanoAckRequired = false,
            permissionArtefact = false, pilotLicenseRequired = false
        ),
        DroneWeightCategory.SMALL to CategoryComplianceRules(
            npntRequired = true, uinRequired = true, nanoAckRequired = false,
            permissionArtefact = true, pilotLicenseRequired = true
        ),
        DroneWeightCategory.MEDIUM to CategoryComplianceRules(
            npntRequired = true, uinRequired = true, nanoAckRequired = false,
            permissionArtefact = true, pilotLicenseRequired = true
        ),
        DroneWeightCategory.LARGE to CategoryComplianceRules(
            npntRequired = true, uinRequired = true, nanoAckRequired = false,
            permissionArtefact = true, pilotLicenseRequired = true
        ),
        DroneWeightCategory.UNKNOWN to CategoryComplianceRules(
            npntRequired = true, uinRequired = true, nanoAckRequired = false,
            permissionArtefact = true, pilotLicenseRequired = true
        ),
    )
    fun forCategory(cat: DroneWeightCategory): CategoryComplianceRules =
        rules[cat] ?: rules[DroneWeightCategory.UNKNOWN]!!
}

data class NpntGateResult(
    val classification:        ZoneType,
    val blocked:               Boolean,
    val blockingReasons:       List<String>,
    val permissionRequired:    Boolean,
    val permissionToken:       String?,
    val complianceScore:       ComplianceScore,
    // Airport proximity result — always populated
    val proximityRestriction:  AirportProximityResult,
    // Approved operating polygon for geofence enforcement during flight.
    // null = no polygon constraint (GREEN zone, AGL <= 400ft, no token required).
    // Non-null = MissionController must check every GPS fix against this polygon.
    val approvedPolygon:       List<LatLon>? = null,
    // Category-aware compliance info
    val droneCategory:         DroneWeightCategory = DroneWeightCategory.UNKNOWN,
    val npntExempt:            Boolean = false,
    val categoryWarnings:      List<String> = emptyList()
)

enum class ZoneType         { RED, YELLOW, GREEN }
enum class ComplianceScore  { BLOCKED, CONDITIONAL, CLEAR }

// A lat/lon vertex in decimal degrees — used for geofence polygons
data class LatLon(val latDeg: Double, val lonDeg: Double)

interface IDigitalSkyAdapter {
    suspend fun classifyLocation(latDeg: Double, lonDeg: Double, altFt: Double): ZoneResult
    suspend fun validatePermissionToken(token: String): TokenValidationResult
}

data class ZoneResult(
    val zoneType:         ZoneType,
    val zoneId:           String,
    val maxAglFt:         Int?,
    // Approved operating polygon. null = no boundary (GREEN unrestricted).
    // YELLOW: polygon from permission artefact. RED: irrelevant (always blocked).
    val approvedPolygon:  List<LatLon>? = null
)
data class TokenValidationResult(val valid: Boolean, val reason: String?)

// Airport proximity result returned alongside zone classification
data class AirportProximityResult(
    val clear:            Boolean,
    val restriction:      ProximityRestriction,
    val nearestIcaoCode:  String,
    val nearestName:      String,
    val distanceKm:       Double,
    val message:          String
)

enum class ProximityRestriction { NONE, COORDINATION_REQUIRED, PROHIBITED }

class NpntComplianceGate(
    private val digitalSkyAdapter:    IDigitalSkyAdapter,
    private val proximityChecker:     IAirportProximityChecker,
    private val maxGreenAglFt:        Int = 400,
    private val prohibitedAglThreshFt: Int = 1000
) {
    /**
     * Category-aware NPNT evaluation.
     *
     * @param droneCategory  DGCA weight category — determines NPNT exemptions
     * @param droneWeightGrams  actual weight in grams (optional, used to auto-derive category)
     */
    suspend fun evaluate(
        latDeg:          Double,
        lonDeg:          Double,
        plannedAglFt:    Double,
        permissionToken: String? = null,
        droneCategory:   DroneWeightCategory = DroneWeightCategory.UNKNOWN,
        droneWeightGrams: Int? = null
    ): NpntGateResult {

        // Resolve effective category — auto-derive from weight if UNKNOWN
        val effectiveCategory = if (droneCategory == DroneWeightCategory.UNKNOWN && droneWeightGrams != null) {
            DroneWeightCategory.fromWeightGrams(droneWeightGrams)
        } else {
            droneCategory
        }
        val categoryRules   = CategoryRulesTable.forCategory(effectiveCategory)
        val categoryWarnings = mutableListOf<String>()

        val zone      = digitalSkyAdapter.classifyLocation(latDeg, lonDeg, plannedAglFt)
        val proximity = proximityChecker.check(latDeg, lonDeg, plannedAglFt)
        val reasons   = mutableListOf<String>()

        // ── Category-aware NPNT exemption ─────────────────────────────────
        // NANO drones (< 250g) are NPNT-exempt in GREEN zones per DGCA UAS Rules 2021.
        // They still cannot fly in RED zones or violate airport proximity.
        val npntExempt = !categoryRules.npntRequired && zone.zoneType == ZoneType.GREEN

        if (npntExempt) {
            categoryWarnings.add("NANO drone — NPNT-exempt in GREEN zone (DGCA UAS Rules 2021)")
        }

        // ── Zone classification result ─────────────────────────────────────
        val (zoneBlocked, zoneConditional) = when (zone.zoneType) {

            ZoneType.RED -> {
                // RED zone blocks ALL categories — no exemption
                reasons.add("Location is in a RED zone. Operations are strictly prohibited.")
                reasons.add("Zone ID: ${zone.zoneId}")
                Pair(true, false)
            }

            ZoneType.YELLOW -> {
                if (npntExempt) {
                    // NANO in YELLOW — still needs permission (exemption only for GREEN)
                    categoryWarnings.add("NANO drone NPNT exemption does NOT apply in YELLOW zones")
                }
                if (permissionToken == null) {
                    // MICRO drones don't need PA in YELLOW but still need NPNT check
                    if (effectiveCategory == DroneWeightCategory.MICRO && !categoryRules.permissionArtefact) {
                        categoryWarnings.add("MICRO drone — NPNT check required but no permission artefact needed")
                        Pair(false, true)
                    } else {
                        reasons.add("Yellow zone requires a Digital Sky permission token.")
                        reasons.add("Zone ID: ${zone.zoneId}")
                        Pair(true, false)
                    }
                } else {
                    val tokenResult = digitalSkyAdapter.validatePermissionToken(permissionToken)
                    if (!tokenResult.valid) {
                        reasons.add("Permission token invalid: ${tokenResult.reason}")
                        Pair(true, false)
                    } else {
                        Pair(false, true)   // conditional — token valid
                    }
                }
            }

            ZoneType.GREEN -> {
                if (npntExempt) {
                    // NANO in GREEN — fully exempt, no token needed even above 400ft
                    // (though 400ft AGL limit still applies as hard safety cap)
                    Pair(false, false)
                } else if (plannedAglFt > maxGreenAglFt && permissionToken == null) {
                    reasons.add("Planned AGL ${plannedAglFt}ft exceeds ${maxGreenAglFt}ft in Green zone.")
                    reasons.add("Digital Sky permission token required for AGL > ${maxGreenAglFt}ft.")
                    Pair(true, false)
                } else {
                    Pair(false, false)
                }
            }
        }

        // ── Airport proximity check (independent of zone AND category) ─────
        // Even NANO drones cannot fly inside airport exclusion zones.
        val proximityBlocked = when (proximity.restriction) {
            ProximityRestriction.PROHIBITED -> {
                reasons.add(proximity.message)
                reasons.add("Within 5km of ${proximity.nearestName} (${proximity.nearestIcaoCode}), below ${prohibitedAglThreshFt}ft AGL — operations PROHIBITED.")
                true
            }
            ProximityRestriction.COORDINATION_REQUIRED -> {
                reasons.add(proximity.message)
                reasons.add("ATC coordination with ${proximity.nearestName} (${proximity.nearestIcaoCode}) required before flight.")
                true   // Block until coordination confirmed — TODO: accept coordination token
            }
            ProximityRestriction.NONE -> false
        }

        val finalBlocked = zoneBlocked || proximityBlocked
        val score = when {
            finalBlocked     -> ComplianceScore.BLOCKED
            zoneConditional  -> ComplianceScore.CONDITIONAL
            else             -> ComplianceScore.CLEAR
        }

        // For NPNT-exempt drones, permissionRequired is always false in GREEN zones
        val permissionRequired = if (npntExempt) {
            false
        } else {
            zone.zoneType != ZoneType.GREEN || plannedAglFt > maxGreenAglFt
        }

        return NpntGateResult(
            classification       = zone.zoneType,
            blocked              = finalBlocked,
            blockingReasons      = reasons,
            permissionRequired   = permissionRequired,
            permissionToken      = if (!finalBlocked) permissionToken else null,
            complianceScore      = score,
            proximityRestriction = proximity,
            approvedPolygon      = if (!finalBlocked) zone.approvedPolygon else null,
            droneCategory        = effectiveCategory,
            npntExempt           = npntExempt,
            categoryWarnings     = categoryWarnings
        )
    }
}

// Interface — implemented by AirportProximityChecker (Android) + AirportProximityGate.ts (backend)
interface IAirportProximityChecker {
    fun check(latDeg: Double, lonDeg: Double, plannedAglFt: Double): AirportProximityResult
}

// Android implementation — uses embedded aerodrome_proximity.json asset
class AirportProximityChecker(
    private val aerodromes: List<AerodromeProximityEntry>
) : IAirportProximityChecker {

    override fun check(latDeg: Double, lonDeg: Double, plannedAglFt: Double): AirportProximityResult {

        var nearestDist = Double.MAX_VALUE
        var nearest: AerodromeProximityEntry? = null

        for (a in aerodromes) {
            val dist = haversineKm(latDeg, lonDeg, a.arpLat, a.arpLon)
            if (dist < nearestDist) {
                nearestDist = dist
                nearest     = a
            }
        }

        if (nearest == null) {
            return AirportProximityResult(
                clear = true, restriction = ProximityRestriction.NONE,
                nearestIcaoCode = "NONE", nearestName = "none", distanceKm = 0.0,
                message = "No aerodrome data available — proximity check skipped"
            )
        }

        val prohibitedAglThreshFt = 1000.0
        val restriction = when {
            nearestDist <= nearest.exclusionInnerKm && plannedAglFt < prohibitedAglThreshFt ->
                ProximityRestriction.PROHIBITED
            nearestDist <= nearest.exclusionOuterKm ->
                ProximityRestriction.COORDINATION_REQUIRED
            else ->
                ProximityRestriction.NONE
        }

        val msg = when (restriction) {
            ProximityRestriction.PROHIBITED ->
                "Within ${String.format("%.1f", nearestDist)}km of ${nearest.name} (${nearest.icaoCode}), " +
                "below ${prohibitedAglThreshFt.toInt()}ft AGL — PROHIBITED per UAS Rules 2021."
            ProximityRestriction.COORDINATION_REQUIRED ->
                "Within ${String.format("%.1f", nearestDist)}km of ${nearest.name} (${nearest.icaoCode}) — " +
                "ATC coordination required before flight."
            ProximityRestriction.NONE ->
                "${String.format("%.1f", nearestDist)}km from nearest aerodrome ${nearest.name} — clear."
        }

        return AirportProximityResult(
            clear           = restriction == ProximityRestriction.NONE,
            restriction     = restriction,
            nearestIcaoCode = nearest.icaoCode,
            nearestName     = nearest.name,
            distanceKm      = nearestDist,
            message         = msg
        )
    }

    private fun haversineKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val R    = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a    = Math.sin(dLat / 2).let { it * it } +
                   Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                   Math.sin(dLon / 2).let { it * it }
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }
}

data class AerodromeProximityEntry(
    val icaoCode:        String,
    val name:            String,
    val arpLat:          Double,
    val arpLon:          Double,
    val type:            String,   // INTERNATIONAL | DOMESTIC | MILITARY | HELIPORT
    val exclusionInnerKm: Double,  // hard prohibition below threshold AGL (default 5)
    val exclusionOuterKm: Double   // coordination required any altitude (default 8)
)
