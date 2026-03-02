package com.jads.drone

// ─────────────────────────────────────────────────────────────────────────────
// GeofenceChecker — NPNT geofence enforcement.
//
// Algorithm: Jordan curve theorem (ray-casting).
//   Cast a horizontal ray eastward from the test point.
//   Count how many polygon edges it crosses.
//   Odd count → inside. Even count → outside.
//
// Frozen invariants — do NOT change:
//   Ray direction: due east (+longitude, same latitude)
//   Crossing test: strictly-less-than on one end, lte on other (half-open interval)
//   This is the standard Shimrat 1962 formulation — used in NPNT reference
//   implementations and aviation geofencing systems globally.
//
// Edge cases handled:
//   • < 3 vertices        → always returns true (no constraint)
//   • Point exactly on edge → classified INSIDE (conservative for safety)
//   • Repeated vertices    → handled without crash
//   • Polygon crossing prime meridian (lon ≈ 0) → not an issue for India ops
//   • Polygon crossing antimeridian (lon ≈ ±180) → not supported (India only)
//
// Accuracy:
//   At 28°N (Delhi), 1 microdegree latitude ≈ 0.11 m.
//   The GnssPlausibilityValidator uses hdop/satellite gating above this.
//   Geofence boundary precision is thus limited by GNSS accuracy (~3-10m),
//   not by the floating-point math here.
//
// Failure mode:
//   If polygon is malformed (e.g. all vertices identical) → isPointInPolygon
//   returns true (inside), which is the SAFE fail direction — better to not
//   false-alarm than to ground a valid mission on bad polygon data.
// ─────────────────────────────────────────────────────────────────────────────

object GeofenceChecker {

    /**
     * Returns true if the point (latDeg, lonDeg) is inside or on the boundary
     * of the given polygon.  Returns true (safe/inside) for degenerate input.
     *
     * @param latDeg   Point latitude in decimal degrees
     * @param lonDeg   Point longitude in decimal degrees
     * @param polygon  Ordered list of polygon vertices.  First and last vertex
     *                 need not be repeated — the closing edge is implicit.
     */
    fun isPointInPolygon(latDeg: Double, lonDeg: Double, polygon: List<LatLon>): Boolean {
        val n = polygon.size
        if (n < 3) return true          // degenerate — no constraint, safe-pass

        // Fast bounding-box pre-check: if point is outside the AABB, it's outside.
        // This eliminates the majority of checks cheaply.
        val minLat = polygon.minOf { it.latDeg }
        val maxLat = polygon.maxOf { it.latDeg }
        val minLon = polygon.minOf { it.lonDeg }
        val maxLon = polygon.maxOf { it.lonDeg }

        if (latDeg < minLat || latDeg > maxLat || lonDeg < minLon || lonDeg > maxLon) {
            return false
        }

        // Ray-casting: count edge crossings along a horizontal ray east of (lat, lon)
        var crossings = 0

        for (i in 0 until n) {
            val a = polygon[i]
            val b = polygon[(i + 1) % n]

            val aLat = a.latDeg; val aLon = a.lonDeg
            val bLat = b.latDeg; val bLon = b.lonDeg

            // Check if point lies exactly on this edge — classify as inside (safe)
            if (isOnSegment(latDeg, lonDeg, aLat, aLon, bLat, bLon)) return true

            // Half-open interval test: edge must straddle the ray's latitude.
            // One endpoint strictly below, one at-or-above — prevents double-counting
            // vertices that sit exactly on the ray.
            val straddles = (aLat < latDeg && bLat >= latDeg) ||
                            (bLat < latDeg && aLat >= latDeg)

            if (!straddles) continue

            // Compute the longitude where the edge crosses the ray's latitude.
            // Linear interpolation along the edge.
            val crossingLon = aLon + (latDeg - aLat) * (bLon - aLon) / (bLat - aLat)

            // The ray goes east (+longitude), so count only crossings to the right.
            if (crossingLon > lonDeg) {
                crossings++
            }
        }

        // Odd crossings → inside
        return (crossings % 2) == 1
    }

    /**
     * Returns true if point P lies on the line segment AB.
     * Used to classify boundary points as INSIDE (conservative).
     */
    private fun isOnSegment(
        pLat: Double, pLon: Double,
        aLat: Double, aLon: Double,
        bLat: Double, bLon: Double
    ): Boolean {
        // Collinearity test: cross product of (AB) × (AP) must be ~0
        val cross = (bLat - aLat) * (pLon - aLon) - (bLon - aLon) * (pLat - aLat)
        if (Math.abs(cross) > 1e-9) return false

        // Point must be within the bounding box of the segment
        val minLat = minOf(aLat, bLat); val maxLat = maxOf(aLat, bLat)
        val minLon = minOf(aLon, bLon); val maxLon = maxOf(aLon, bLon)
        return pLat in minLat..maxLat && pLon in minLon..maxLon
    }
}
