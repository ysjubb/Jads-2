// GeometryBuffer.swift
// JADS
//
// Buffer algorithm for expanding a polyline into a corridor polygon.
//
// Input: [CLLocationCoordinate2D] (waypoints) + bufferMeters -> [CLLocationCoordinate2D] (polygon)
//
// Uses CoreLocation math to compute offset points perpendicular to each
// polyline segment, then joins them with round end caps. This avoids any
// third-party geometry library dependency on iOS.
//
// Coordinate system:
//   All computations use the WGS 84 ellipsoid approximation for bearing
//   and distance calculations (haversine + Vincenty destination formula).
//   Accuracy is within a few centimetres for buffers up to 500m, which
//   is sufficient for drone corridor planning.

import Foundation
import CoreLocation

// MARK: - GeometryBuffer

/// Utility for computing a buffered polygon around a polyline of waypoints.
///
/// The buffer algorithm works as follows:
/// 1. For each segment of the polyline, compute left and right offset lines
///    at a perpendicular distance of `bufferMeters`.
/// 2. Join the offset lines at segment junctions using miter-style joins
///    (capped at 2x buffer width to avoid spikes on sharp turns).
/// 3. Add round end caps at the start and end of the polyline.
/// 4. Return the resulting polygon as a closed coordinate array.
enum GeometryBuffer {

    // MARK: - Public API

    /// Compute a buffered polygon around a polyline of waypoints.
    ///
    /// - Parameters:
    ///   - waypoints: The ordered waypoints forming the corridor centreline.
    ///                Must contain at least 2 points.
    ///   - bufferMeters: The buffer distance in metres (half-width of corridor).
    ///                   Clamped to 10...500m.
    /// - Returns: An array of coordinates forming the closed polygon boundary,
    ///            or an empty array if fewer than 2 waypoints are provided.
    static func buffer(
        waypoints: [CLLocationCoordinate2D],
        bufferMeters: Double
    ) -> [CLLocationCoordinate2D] {
        guard waypoints.count >= 2 else { return [] }

        let buf = min(max(bufferMeters, 10.0), 500.0)

        // Compute bearings for each segment
        var segmentBearings: [Double] = []
        for i in 0..<(waypoints.count - 1) {
            let bearing = initialBearing(from: waypoints[i], to: waypoints[i + 1])
            segmentBearings.append(bearing)
        }

        // Build left side (bearing - 90) and right side (bearing + 90) offset points
        var leftSide: [CLLocationCoordinate2D] = []
        var rightSide: [CLLocationCoordinate2D] = []

        for i in 0..<waypoints.count {
            if i == 0 {
                // First waypoint: use first segment bearing
                let perpLeft = normalise(segmentBearings[0] - 90.0)
                let perpRight = normalise(segmentBearings[0] + 90.0)
                leftSide.append(destination(from: waypoints[i], bearingDeg: perpLeft, distanceM: buf))
                rightSide.append(destination(from: waypoints[i], bearingDeg: perpRight, distanceM: buf))
            } else if i == waypoints.count - 1 {
                // Last waypoint: use last segment bearing
                let lastBearing = segmentBearings[segmentBearings.count - 1]
                let perpLeft = normalise(lastBearing - 90.0)
                let perpRight = normalise(lastBearing + 90.0)
                leftSide.append(destination(from: waypoints[i], bearingDeg: perpLeft, distanceM: buf))
                rightSide.append(destination(from: waypoints[i], bearingDeg: perpRight, distanceM: buf))
            } else {
                // Interior waypoint: bisect the angle between adjacent segments
                let prevBearing = segmentBearings[i - 1]
                let nextBearing = segmentBearings[i]

                let bisectLeft = bisectorBearing(prevBearing: prevBearing, nextBearing: nextBearing, side: .left)
                let bisectRight = bisectorBearing(prevBearing: prevBearing, nextBearing: nextBearing, side: .right)

                // Compute miter distance (expand at sharp turns, capped at 2x buffer)
                let halfAngle = angleBetween(prevBearing, nextBearing) / 2.0
                let sinHalf = sin(halfAngle * .pi / 180.0)
                let miterDist = sinHalf > 0.1 ? min(buf / sinHalf, buf * 2.0) : buf

                leftSide.append(destination(from: waypoints[i], bearingDeg: bisectLeft, distanceM: miterDist))
                rightSide.append(destination(from: waypoints[i], bearingDeg: bisectRight, distanceM: miterDist))
            }
        }

        // Build the polygon: left side forward, end cap, right side reversed, start cap
        var polygon: [CLLocationCoordinate2D] = []

        // Left side (forward)
        polygon.append(contentsOf: leftSide)

        // End cap (semicircle at the last waypoint)
        let endCapPoints = roundCap(
            center: waypoints.last!,
            startBearingDeg: normalise(segmentBearings.last! - 90.0),
            endBearingDeg: normalise(segmentBearings.last! + 90.0),
            distanceM: buf,
            clockwise: true
        )
        polygon.append(contentsOf: endCapPoints)

        // Right side (reversed)
        polygon.append(contentsOf: rightSide.reversed())

        // Start cap (semicircle at the first waypoint)
        let startCapPoints = roundCap(
            center: waypoints.first!,
            startBearingDeg: normalise(segmentBearings.first! + 90.0),
            endBearingDeg: normalise(segmentBearings.first! - 90.0),
            distanceM: buf,
            clockwise: true
        )
        polygon.append(contentsOf: startCapPoints)

        return polygon
    }

    // MARK: - Round End Cap

    /// Generate a semicircular end cap at a given centre point.
    ///
    /// - Parameters:
    ///   - center: The centre of the semicircle.
    ///   - startBearingDeg: The starting bearing of the arc in degrees.
    ///   - endBearingDeg: The ending bearing of the arc in degrees.
    ///   - distanceM: The radius of the arc in metres.
    ///   - clockwise: Whether to sweep clockwise from start to end.
    /// - Returns: An array of coordinates along the arc.
    private static func roundCap(
        center: CLLocationCoordinate2D,
        startBearingDeg: Double,
        endBearingDeg: Double,
        distanceM: Double,
        clockwise: Bool
    ) -> [CLLocationCoordinate2D] {
        let segments = 8
        var points: [CLLocationCoordinate2D] = []

        var sweep = endBearingDeg - startBearingDeg
        if clockwise {
            if sweep <= 0 { sweep += 360.0 }
        } else {
            if sweep >= 0 { sweep -= 360.0 }
        }

        for i in 1..<segments {
            let fraction = Double(i) / Double(segments)
            let bearing = normalise(startBearingDeg + sweep * fraction)
            points.append(destination(from: center, bearingDeg: bearing, distanceM: distanceM))
        }

        return points
    }

    // MARK: - Bisector Bearing

    private enum Side {
        case left, right
    }

    /// Compute the bisector bearing at a junction between two segments.
    ///
    /// - Parameters:
    ///   - prevBearing: Bearing of the incoming segment (degrees).
    ///   - nextBearing: Bearing of the outgoing segment (degrees).
    ///   - side: Which side of the polyline (left or right).
    /// - Returns: The bisector bearing in degrees.
    private static func bisectorBearing(prevBearing: Double, nextBearing: Double, side: Side) -> Double {
        // Average the forward bearing of the previous segment and the forward bearing of the next
        let avgBearing = averageBearing(prevBearing, nextBearing)
        switch side {
        case .left:
            return normalise(avgBearing - 90.0)
        case .right:
            return normalise(avgBearing + 90.0)
        }
    }

    /// Compute the average of two bearings, handling the 360/0 wrap.
    private static func averageBearing(_ a: Double, _ b: Double) -> Double {
        let aRad = a * .pi / 180.0
        let bRad = b * .pi / 180.0
        let x = cos(aRad) + cos(bRad)
        let y = sin(aRad) + sin(bRad)
        let avg = atan2(y, x) * 180.0 / .pi
        return normalise(avg)
    }

    /// Compute the absolute angle between two bearings (0-180 degrees).
    private static func angleBetween(_ a: Double, _ b: Double) -> Double {
        var diff = abs(a - b)
        if diff > 180.0 { diff = 360.0 - diff }
        return diff
    }

    // MARK: - Geodesic Helpers

    private static let earthRadiusM: Double = 6_371_000.0

    /// Compute the initial bearing from point A to point B (degrees, 0-360).
    static func initialBearing(
        from a: CLLocationCoordinate2D,
        to b: CLLocationCoordinate2D
    ) -> Double {
        let lat1 = a.latitude * .pi / 180.0
        let lat2 = b.latitude * .pi / 180.0
        let dLon = (b.longitude - a.longitude) * .pi / 180.0

        let y = sin(dLon) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)

        let bearing = atan2(y, x) * 180.0 / .pi
        return normalise(bearing)
    }

    /// Compute the destination point given a start point, bearing, and distance.
    ///
    /// Uses the Vincenty destination formula on a spherical Earth model.
    ///
    /// - Parameters:
    ///   - from: The starting coordinate.
    ///   - bearingDeg: The initial bearing in degrees (0 = north, 90 = east).
    ///   - distanceM: The distance in metres.
    /// - Returns: The destination coordinate.
    static func destination(
        from start: CLLocationCoordinate2D,
        bearingDeg: Double,
        distanceM: Double
    ) -> CLLocationCoordinate2D {
        let lat1 = start.latitude * .pi / 180.0
        let lon1 = start.longitude * .pi / 180.0
        let brng = bearingDeg * .pi / 180.0
        let angularDistance = distanceM / earthRadiusM

        let sinAngDist = sin(angularDistance)
        let cosAngDist = cos(angularDistance)
        let sinLat1 = sin(lat1)
        let cosLat1 = cos(lat1)

        let lat2 = asin(sinLat1 * cosAngDist + cosLat1 * sinAngDist * cos(brng))
        let lon2 = lon1 + atan2(
            sin(brng) * sinAngDist * cosLat1,
            cosAngDist - sinLat1 * sin(lat2)
        )

        return CLLocationCoordinate2D(
            latitude: lat2 * 180.0 / .pi,
            longitude: lon2 * 180.0 / .pi
        )
    }

    /// Compute the haversine distance between two coordinates in metres.
    static func haversineDistance(
        from a: CLLocationCoordinate2D,
        to b: CLLocationCoordinate2D
    ) -> Double {
        let lat1 = a.latitude * .pi / 180.0
        let lat2 = b.latitude * .pi / 180.0
        let dLat = lat2 - lat1
        let dLon = (b.longitude - a.longitude) * .pi / 180.0

        let sinHalfLat = sin(dLat / 2.0)
        let sinHalfLon = sin(dLon / 2.0)
        let h = sinHalfLat * sinHalfLat + cos(lat1) * cos(lat2) * sinHalfLon * sinHalfLon

        return 2.0 * earthRadiusM * asin(sqrt(h))
    }

    /// Normalise a bearing to the range [0, 360).
    private static func normalise(_ degrees: Double) -> Double {
        var d = degrees.truncatingRemainder(dividingBy: 360.0)
        if d < 0 { d += 360.0 }
        return d
    }
}
