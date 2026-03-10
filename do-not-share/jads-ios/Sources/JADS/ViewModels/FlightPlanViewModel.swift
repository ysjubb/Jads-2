// FlightPlanViewModel.swift
// JADS
//
// MVVM ViewModel for the Airspace Map / Flight Planning flow.
// Manages polygon drawing state, zone classification checks,
// altitude selection, time window selection, and sunset detection.
//
// All API calls are routed through EgcaServiceProtocol for testability.
// Published properties drive the AirspaceMapView SwiftUI layer.

import Foundation
import CoreLocation
import Combine
import MapKit

// MARK: - FlightPlanViewModel

/// ViewModel that owns all mutable state for the flight planning flow.
///
/// Responsibilities:
/// - Polygon vertex collection and editing (add, undo, clear, drag)
/// - Debounced zone classification via ``EgcaServiceProtocol/checkAirspaceZone(polygon:)``
/// - Altitude selection with snap presets (30 / 60 / 120 m)
/// - Time window management with sunset warning detection
/// - Validation gating for the "Continue" action
///
/// All `@Published` properties are updated on `@MainActor`.
@MainActor
final class FlightPlanViewModel: ObservableObject {

    // MARK: - Constants

    /// Debounce interval for zone check requests after polygon changes.
    private static let zoneCheckDebounceSeconds: TimeInterval = 0.6

    /// Altitude snap presets in meters.
    static let altitudeSnapValues: [Double] = [30, 60, 120]

    /// Minimum and maximum altitude in meters.
    static let altitudeRange: ClosedRange<Double> = 0...500

    /// Minimum number of vertices to form a valid polygon.
    static let minimumVertices = 3

    /// Default map region: centered on India.
    static let defaultRegion = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 20.5937, longitude: 78.9629),
        span: MKCoordinateSpan(latitudeDelta: 10, longitudeDelta: 10)
    )

    // MARK: - Published Properties — Polygon

    /// The ordered list of polygon vertices placed by the user.
    @Published var vertices: [CLLocationCoordinate2D] = []

    /// Whether the polygon has been explicitly closed by the user.
    @Published var isPolygonClosed = false

    /// Index of the vertex currently being dragged, if any.
    @Published var draggingVertexIndex: Int?

    // MARK: - Published Properties — Zone Classification

    /// The current zone classification result (nil until first check).
    @Published var zoneClassification: ZoneClassification?

    /// Whether a zone check network request is in progress.
    @Published var isCheckingZone = false

    /// Error message from the most recent zone check, if any.
    @Published var zoneCheckError: String?

    // MARK: - Published Properties — Altitude

    /// The selected altitude in meters (0 to 500).
    @Published var altitudeMeters: Double = 120

    /// Dynamic label describing zone impact at the selected altitude.
    @Published var altitudeImpactText: String = "Select altitude for zone assessment"

    // MARK: - Published Properties — Time Window

    /// The planned flight start time.
    @Published var startTime: Date = {
        // Default to 1 hour from now, rounded to the next 15-minute mark
        let calendar = Calendar.current
        let now = Date()
        let future = now.addingTimeInterval(3600)
        let minute = calendar.component(.minute, from: future)
        let roundedMinute = ((minute + 14) / 15) * 15
        return calendar.date(bySetting: .minute, value: roundedMinute, of: future)
            ?? future
    }()

    /// The planned flight duration in minutes.
    @Published var durationMinutes: Int = 30

    /// Whether the planned time window overlaps with sunset (requiring DGCA night permission).
    @Published var showSunsetWarning = false

    // MARK: - Published Properties — Map

    /// The current visible map region.
    @Published var mapRegion = defaultRegion

    /// Overlay polygons loaded from the backend representing known airspace zones.
    @Published var zoneOverlays: [AirspaceZoneOverlay] = []

    // MARK: - Published Properties — Yellow Zone

    /// The selected operation type for yellow zone permission.
    @Published var yellowZoneOperationType: YellowZoneOperationType = .vlos

    /// Whether the drone has Return-to-Home / Flight Termination capability.
    @Published var yellowZoneRTHCapability = false

    /// Whether the drone has active geo-fencing capability.
    @Published var yellowZoneGeoFencing = false

    /// Whether the drone has Detect and Avoid system.
    @Published var yellowZoneDAA = false

    /// Whether the user has accepted the self-declaration.
    @Published var yellowZoneSelfDeclaration = false

    /// Whether the request qualifies for expedited processing.
    @Published var yellowZoneExpedited = false

    /// Whether a yellow zone submission is in progress.
    @Published var yellowZoneSubmitting = false

    /// Error from the most recent yellow zone submission attempt.
    @Published var yellowZoneSubmitError: String?

    /// Whether the yellow zone form is ready for submission.
    var isReadyToSubmitYellowZone: Bool {
        yellowZoneSelfDeclaration
            && isPolygonClosed
            && vertices.count >= Self.minimumVertices
            && zoneClassification?.zone == .yellow
    }

    // MARK: - Published Properties — Validation

    /// Whether the user has acknowledged the zone classification result.
    @Published var zoneAcknowledged = false

    /// Whether all conditions are met to proceed to FlightDetailsView.
    var canContinue: Bool {
        isPolygonClosed
            && vertices.count >= Self.minimumVertices
            && zoneClassification != nil
            && zoneAcknowledged
            && !isCheckingZone
    }

    // MARK: - Computed — Time Window

    /// The computed end time based on start time and duration.
    var endTime: Date {
        startTime.addingTimeInterval(TimeInterval(durationMinutes * 60))
    }

    /// The polygon as ``LatLng`` array for API calls.
    var polygonLatLng: [LatLng] {
        vertices.map { LatLng(latitude: $0.latitude, longitude: $0.longitude) }
    }

    // MARK: - Dependencies

    /// The eGCA service used for zone classification API calls.
    private let egcaService: any EgcaServiceProtocol

    /// Cancellable for the debounced zone check pipeline.
    private var zoneCheckCancellable: AnyCancellable?

    /// Subject used to trigger debounced zone checks on polygon changes.
    private let polygonChangedSubject = PassthroughSubject<Void, Never>()

    // MARK: - Initialization

    /// Create a new FlightPlanViewModel.
    ///
    /// - Parameter egcaService: The eGCA service to use for zone classification.
    ///   Defaults to the production ``EgcaService`` singleton.
    init(egcaService: any EgcaServiceProtocol = EgcaService()) {
        self.egcaService = egcaService
        setupZoneCheckDebounce()
    }

    // MARK: - Polygon Editing

    /// Add a vertex at the given coordinate.
    ///
    /// If the polygon is already closed, this is a no-op. Adding a vertex
    /// resets the zone acknowledgement and triggers a debounced zone check
    /// if the polygon has at least 3 vertices.
    ///
    /// - Parameter coordinate: The map coordinate to add.
    func addVertex(at coordinate: CLLocationCoordinate2D) {
        guard !isPolygonClosed else { return }
        vertices.append(coordinate)
        zoneAcknowledged = false
        notifyPolygonChanged()
    }

    /// Remove the last added vertex ("Undo").
    ///
    /// If the polygon was closed, it is reopened. Triggers a debounced
    /// zone check if 3+ vertices remain.
    func undoLastVertex() {
        guard !vertices.isEmpty else { return }
        vertices.removeLast()
        isPolygonClosed = false
        zoneAcknowledged = false

        if vertices.count < Self.minimumVertices {
            zoneClassification = nil
            zoneCheckError = nil
        } else {
            notifyPolygonChanged()
        }
    }

    /// Remove all vertices and reset polygon state.
    func clearAllVertices() {
        vertices.removeAll()
        isPolygonClosed = false
        zoneClassification = nil
        zoneCheckError = nil
        zoneAcknowledged = false
    }

    /// Close the polygon (connect last vertex to first).
    ///
    /// Requires at least 3 vertices. Triggers an immediate zone check.
    func closePolygon() {
        guard vertices.count >= Self.minimumVertices else { return }
        isPolygonClosed = true
        notifyPolygonChanged()
    }

    /// Move a vertex to a new coordinate during a drag operation.
    ///
    /// - Parameters:
    ///   - index: The index of the vertex to move.
    ///   - coordinate: The new coordinate for the vertex.
    func moveVertex(at index: Int, to coordinate: CLLocationCoordinate2D) {
        guard index >= 0, index < vertices.count else { return }
        vertices[index] = coordinate
        zoneAcknowledged = false
    }

    /// Called when a drag gesture ends. Triggers a debounced zone check.
    func endVertexDrag() {
        draggingVertexIndex = nil
        notifyPolygonChanged()
    }

    // MARK: - Altitude

    /// Update the altitude selection.
    ///
    /// - Parameter meters: The new altitude in meters (clamped to 0-500).
    func setAltitude(_ meters: Double) {
        altitudeMeters = min(max(meters, Self.altitudeRange.lowerBound), Self.altitudeRange.upperBound)
        updateAltitudeImpactText()
        zoneAcknowledged = false
    }

    /// Snap the altitude to the nearest preset value.
    func snapAltitudeToNearest() {
        let nearest = Self.altitudeSnapValues.min(by: {
            abs($0 - altitudeMeters) < abs($1 - altitudeMeters)
        }) ?? altitudeMeters
        setAltitude(nearest)
    }

    // MARK: - Time Window

    /// Update the start time and recheck sunset warning.
    func setStartTime(_ date: Date) {
        startTime = date
        checkSunsetWarning()
    }

    /// Update the duration and recheck sunset warning.
    func setDuration(_ minutes: Int) {
        durationMinutes = max(5, min(minutes, 480)) // 5 min to 8 hours
        checkSunsetWarning()
    }

    // MARK: - Zone Acknowledgement

    /// Mark the zone classification as acknowledged by the user.
    func acknowledgeZone() {
        guard zoneClassification != nil else { return }
        zoneAcknowledged = true
    }

    // MARK: - Zone Check

    /// Manually trigger a zone classification check.
    ///
    /// This bypasses the debounce timer and performs an immediate check.
    func checkZoneNow() {
        guard vertices.count >= Self.minimumVertices else { return }

        Task { [weak self] in
            await self?.performZoneCheck()
        }
    }

    // MARK: - Private — Zone Check Pipeline

    /// Set up the Combine pipeline for debounced zone classification.
    private func setupZoneCheckDebounce() {
        zoneCheckCancellable = polygonChangedSubject
            .debounce(for: .seconds(Self.zoneCheckDebounceSeconds), scheduler: RunLoop.main)
            .sink { [weak self] in
                guard let self else { return }
                Task { @MainActor [weak self] in
                    await self?.performZoneCheck()
                }
            }
    }

    /// Notify that the polygon has changed and a zone check should be scheduled.
    private func notifyPolygonChanged() {
        guard vertices.count >= Self.minimumVertices else { return }
        polygonChangedSubject.send()
    }

    /// Perform the actual zone classification API call.
    private func performZoneCheck() async {
        let polygon = polygonLatLng
        guard polygon.count >= Self.minimumVertices else { return }

        isCheckingZone = true
        zoneCheckError = nil

        do {
            let classification = try await egcaService.checkAirspaceZone(polygon: polygon)
            self.zoneClassification = classification
            self.zoneCheckError = nil
            updateAltitudeImpactText()
        } catch {
            self.zoneCheckError = (error as? EgcaError)?.userFacingMessage
                ?? "Zone check failed: \(error.localizedDescription)"
        }

        isCheckingZone = false
    }

    // MARK: - Private — Altitude Impact Text

    /// Update the altitude impact description based on current zone and altitude.
    private func updateAltitudeImpactText() {
        guard let zone = zoneClassification else {
            altitudeImpactText = "Select altitude for zone assessment"
            return
        }

        let altStr = String(format: "%.0f", altitudeMeters)

        switch zone.zone {
        case .green:
            if altitudeMeters <= 120 {
                altitudeImpactText = "\(altStr)m AGL -- Green zone, auto-approval eligible"
            } else {
                altitudeImpactText = "\(altStr)m AGL -- Green zone, above 120m may require additional clearance"
            }
        case .yellow:
            altitudeImpactText = "\(altStr)m AGL -- Yellow zone, ATC permission required from \(zone.atcAuthority ?? "local authority")"
        case .red:
            altitudeImpactText = "\(altStr)m AGL -- Red zone, flight restricted at all altitudes"
        }
    }

    // MARK: - Private — Sunset Warning

    /// Check whether the planned flight window extends past sunset.
    ///
    /// Uses Solar.approximateSunset for the polygon centroid to determine
    /// if a night operations warning should be shown.
    private func checkSunsetWarning() {
        guard !vertices.isEmpty else {
            showSunsetWarning = false
            return
        }

        // Compute centroid of the polygon
        let centroid = polygonCentroid()

        // Approximate sunset for this location and date
        let sunset = Solar.approximateSunset(
            latitude: centroid.latitude,
            longitude: centroid.longitude,
            date: startTime
        )

        // If the flight window includes sunset, show the warning
        if let sunset {
            let flightEnd = endTime
            showSunsetWarning = flightEnd > sunset || startTime > sunset
        } else {
            // Could not compute sunset (polar region) -- show warning to be safe
            showSunsetWarning = true
        }
    }

    // MARK: - Yellow Zone Submission

    /// Submit a yellow zone ATC permission request.
    ///
    /// - Returns: The application ID on success, or nil on failure.
    func submitYellowZonePermission() async -> String? {
        guard isReadyToSubmitYellowZone else { return nil }

        yellowZoneSubmitting = true
        yellowZoneSubmitError = nil

        do {
            let payload = YellowZonePermissionPayload(
                polygon: polygonLatLng,
                altitudeMeters: altitudeMeters,
                startTime: startTime,
                endTime: endTime,
                operationType: yellowZoneOperationType.rawValue,
                rthCapability: yellowZoneRTHCapability,
                geoFencing: yellowZoneGeoFencing,
                daaSystem: yellowZoneDAA,
                authority: zoneClassification?.atcAuthority ?? "AAI",
                expedited: yellowZoneExpedited
            )
            let applicationId = try await egcaService.submitYellowZonePermission(payload: payload)
            yellowZoneSubmitting = false
            return applicationId
        } catch {
            yellowZoneSubmitError = (error as? EgcaError)?.userFacingMessage
                ?? "Submission failed: \(error.localizedDescription)"
            yellowZoneSubmitting = false
            return nil
        }
    }

    // MARK: - Published Properties — Validation Checklist (P36)

    /// Validation checks that failed with REQUIRED severity.
    @Published var failures: [ValidationItem] = []

    /// Validation checks with ADVISORY severity.
    @Published var warnings: [ValidationItem] = []

    /// Validation checks with INFO severity.
    @Published var infoItems: [ValidationItem] = []

    /// Set of check codes the user has acknowledged (advisory only).
    @Published var acknowledgedWarnings: Set<String> = []

    /// Whether a validation request is in progress.
    @Published var isValidating = false

    /// Error from the most recent validation attempt.
    @Published var validationError: String?

    /// Whether a validated plan submission is in progress.
    @Published var isSubmittingValidation = false

    /// Error from the most recent submission attempt.
    @Published var validationSubmitError: String?

    /// Whether all conditions are met to submit the validated plan.
    ///
    /// True when:
    /// - All REQUIRED checks passed
    /// - All ADVISORY warnings are either passed or acknowledged
    /// - At least one check exists
    /// - Not currently submitting
    var isReadyToSubmit: Bool {
        let allRequiredPassed = failures.allSatisfy { $0.passed }
        let allWarningsHandled = warnings.allSatisfy { $0.passed || acknowledgedWarnings.contains($0.code) }
        let hasChecks = !failures.isEmpty || !warnings.isEmpty || !infoItems.isEmpty
        return allRequiredPassed && allWarningsHandled && hasChecks && !isSubmittingValidation
    }

    /// Number of checks that are passed or acknowledged.
    var validationPassedCount: Int {
        let requiredPassed = failures.count { $0.passed }
        let advisoryPassed = warnings.count { $0.passed || acknowledgedWarnings.contains($0.code) }
        let infoPassed = infoItems.count  // info items always count as passed
        return requiredPassed + advisoryPassed + infoPassed
    }

    // MARK: - Validation Actions

    /// Run pre-submission validation for the current flight plan.
    ///
    /// Sends the polygon, altitude, and time window to the backend
    /// and populates the three checklist sections from the response.
    func runValidation() async {
        guard vertices.count >= Self.minimumVertices else {
            validationError = "At least \(Self.minimumVertices) polygon vertices are required."
            return
        }

        isValidating = true
        validationError = nil

        do {
            let result = try await egcaService.validateFlightPlan(
                polygon: polygonLatLng,
                altitudeMeters: altitudeMeters,
                startTime: startTime,
                endTime: endTime
            )

            self.failures = result.checks.filter { $0.severity == .required }
            self.warnings = result.checks.filter { $0.severity == .advisory }
            self.infoItems = result.checks.filter { $0.severity == .info }
            self.validationError = nil
        } catch {
            self.validationError = (error as? EgcaError)?.userFacingMessage
                ?? "Validation failed: \(error.localizedDescription)"
        }

        isValidating = false
    }

    /// Toggle acknowledgement for an advisory warning.
    ///
    /// - Parameter code: The check code to acknowledge or un-acknowledge.
    func acknowledge(_ code: String) {
        if acknowledgedWarnings.contains(code) {
            acknowledgedWarnings.remove(code)
        } else {
            acknowledgedWarnings.insert(code)
        }
    }

    /// Submit the validated flight plan to eGCA.
    ///
    /// Only callable when ``isReadyToSubmit`` is true.
    ///
    /// - Returns: The application ID on success, or nil on failure.
    func submitValidatedPlan() async -> String? {
        guard isReadyToSubmit else { return nil }

        isSubmittingValidation = true
        validationSubmitError = nil

        do {
            let payload = FlightPermissionPayload(
                pilotBusinessIdentifier: "",  // Populated from session
                droneId: 1,
                uinNumber: "",
                flyArea: polygonLatLng,
                payloadWeightInKg: 0.0,
                payloadDetails: "Standard payload",
                flightPurpose: yellowZoneOperationType.rawValue,
                startDateTime: EgcaDateFormatters.digitalSky.string(from: startTime),
                endDateTime: EgcaDateFormatters.digitalSky.string(from: endTime),
                maxAltitudeInMeters: altitudeMeters,
                typeOfOperation: yellowZoneOperationType,
                flightTerminationOrReturnHomeCapability: yellowZoneRTHCapability,
                geoFencingCapability: yellowZoneGeoFencing,
                detectAndAvoidCapability: yellowZoneDAA,
                selfDeclaration: true,
                recurringTimeExpression: nil,
                recurringTimeDurationInMinutes: nil
            )
            let application = try await egcaService.submitFlightPermission(payload)
            isSubmittingValidation = false
            return application.applicationId
        } catch {
            validationSubmitError = (error as? EgcaError)?.userFacingMessage
                ?? "Submission failed: \(error.localizedDescription)"
            isSubmittingValidation = false
            return nil
        }
    }

    /// Clear all validation state.
    func clearValidation() {
        failures = []
        warnings = []
        infoItems = []
        acknowledgedWarnings = []
        validationError = nil
        validationSubmitError = nil
        isValidating = false
        isSubmittingValidation = false
    }

    // MARK: - Private — Centroid

    /// Compute the centroid of the current polygon vertices.
    private func polygonCentroid() -> CLLocationCoordinate2D {
        guard !vertices.isEmpty else {
            return CLLocationCoordinate2D(latitude: 20.5937, longitude: 78.9629)
        }

        let sumLat = vertices.reduce(0.0) { $0 + $1.latitude }
        let sumLon = vertices.reduce(0.0) { $0 + $1.longitude }
        let count = Double(vertices.count)

        return CLLocationCoordinate2D(
            latitude: sumLat / count,
            longitude: sumLon / count
        )
    }
}

// MARK: - AirspaceZoneOverlay

/// A polygon overlay representing a known airspace zone from the backend.
///
/// Used to render zone overlays on the MKMapView before the user draws
/// their own polygon.
struct AirspaceZoneOverlay: Identifiable {
    let id = UUID()
    let coordinates: [CLLocationCoordinate2D]
    let zoneType: ZoneType
    let name: String

    /// The fill colour for this zone overlay on the map.
    var fillColor: UIColor {
        switch zoneType {
        case .green: return UIColor.systemGreen.withAlphaComponent(0.3)
        case .yellow: return UIColor.systemYellow.withAlphaComponent(0.3)
        case .red: return UIColor.systemRed.withAlphaComponent(0.3)
        }
    }

    /// The stroke colour for this zone overlay on the map.
    var strokeColor: UIColor {
        switch zoneType {
        case .green: return UIColor.systemGreen.withAlphaComponent(0.7)
        case .yellow: return UIColor.systemYellow.withAlphaComponent(0.7)
        case .red: return UIColor.systemRed.withAlphaComponent(0.7)
        }
    }
}

// MARK: - Solar Utility

/// Minimal solar position calculator for sunset approximation.
///
/// Uses the simplified sunrise/sunset equation for drone flight
/// planning. Accuracy is within a few minutes, sufficient for
/// triggering the night-operations warning banner.
enum Solar {

    /// Approximate sunset time for a given location and date.
    ///
    /// Uses the NOAA simplified solar equations. Returns nil for
    /// polar regions where sunset does not occur on the given date.
    ///
    /// - Parameters:
    ///   - latitude: Latitude in decimal degrees.
    ///   - longitude: Longitude in decimal degrees.
    ///   - date: The date to compute sunset for.
    /// - Returns: The approximate sunset `Date`, or nil if no sunset occurs.
    static func approximateSunset(latitude: Double, longitude: Double, date: Date) -> Date? {
        let calendar = Calendar(identifier: .gregorian)
        let dayOfYear = calendar.ordinality(of: .day, in: .year, for: date) ?? 1

        let latRad = latitude * .pi / 180.0

        // Solar declination (simplified)
        let declination = -23.45 * cos(2.0 * .pi / 365.0 * Double(dayOfYear + 10)) * .pi / 180.0

        // Hour angle for sunset
        let cosHourAngle = -tan(latRad) * tan(declination)

        // No sunset (polar day or night)
        guard cosHourAngle >= -1.0, cosHourAngle <= 1.0 else {
            return nil
        }

        let hourAngle = acos(cosHourAngle)

        // Sunset time in hours from solar noon
        let solarNoonOffsetHours = hourAngle * 12.0 / .pi

        // Solar noon at this longitude (approximate: 12:00 + timezone correction)
        // Use IST (UTC+5:30) as default for India
        let timeZoneOffsetHours = 5.5
        let solarNoon = 12.0 - (longitude - timeZoneOffsetHours * 15.0) / 15.0

        let sunsetHour = solarNoon + solarNoonOffsetHours

        // Convert to Date
        var components = calendar.dateComponents(in: TimeZone(identifier: "Asia/Kolkata")!, from: date)
        components.hour = Int(sunsetHour)
        components.minute = Int((sunsetHour - Double(Int(sunsetHour))) * 60)
        components.second = 0

        return calendar.date(from: components)
    }
}
