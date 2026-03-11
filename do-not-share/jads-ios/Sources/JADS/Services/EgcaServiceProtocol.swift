// EgcaServiceProtocol.swift
// JADS
//
// Protocol defining the public interface for the eGCA API service.
// Implementations: EgcaService (production), mock implementations for tests.
// All methods are async throws and run on background tasks.

import Foundation

/// Protocol defining the eGCA (Electronic Governance of Civil Aviation) API service.
///
/// This protocol enables dependency injection and test mocking.
/// All methods execute on background tasks -- callers are responsible for
/// dispatching UI updates to the main actor.
protocol EgcaServiceProtocol: Sendable {

    /// Authenticate with the eGCA identity provider.
    /// - Parameters:
    ///   - email: The user's registered email address.
    ///   - password: The user's password.
    /// - Returns: An ``AuthToken`` containing the JWT and expiry information.
    /// - Throws: ``EgcaError/unauthorized`` if credentials are invalid.
    func authenticate(email: String, password: String) async throws -> AuthToken

    /// Submit a new flight permission application to eGCA.
    /// - Parameter payload: The ``FlightPermissionPayload`` with all required flight details.
    /// - Returns: A ``PermissionApplication`` with the assigned application ID and initial status.
    /// - Throws: ``EgcaError/invalidPayload(_:)`` if the payload fails server-side validation.
    func submitFlightPermission(_ payload: FlightPermissionPayload) async throws -> PermissionApplication

    /// Poll the current status of a submitted flight permission application.
    /// - Parameter applicationId: The eGCA-assigned application identifier.
    /// - Returns: The current ``PermissionStatus`` including approval/rejection details.
    /// - Throws: ``EgcaError/notFound`` if the application ID does not exist.
    func getPermissionStatus(applicationId: String) async throws -> PermissionStatus

    /// Download the Permission Artefact ZIP (signed XML) for an approved application.
    ///
    /// The ZIP contains NPNT-compliant signed XML that the drone firmware requires
    /// before takeoff ("No Permission No Takeoff").
    /// - Parameter applicationId: The eGCA-assigned application identifier.
    /// - Returns: Raw ZIP data containing the signed permission artefact.
    /// - Throws: ``EgcaError/paNotReady`` if the artefact is not yet available.
    func downloadPermissionArtefact(applicationId: String) async throws -> Data

    /// Upload a post-flight log bundle to eGCA for the given application.
    /// - Parameters:
    ///   - applicationId: The eGCA-assigned application identifier.
    ///   - logData: The flight log data bundle.
    /// - Throws: ``EgcaError/notFound`` if the application ID does not exist.
    func uploadFlightLog(applicationId: String, logData: Data) async throws

    /// List the current user's flight permissions with pagination.
    /// - Parameter page: The page number (1-indexed).
    /// - Returns: A ``PaginatedPermissions`` response with items and pagination metadata.
    func listMyPermissions(page: Int) async throws -> PaginatedPermissions

    /// Check the airspace zone classification for a given polygon.
    ///
    /// Sends the polygon vertices to the eGCA backend, which classifies the
    /// area as GREEN (open), YELLOW (controlled), or RED (restricted) per
    /// DGCA UAS Rules 2021.
    ///
    /// - Parameter polygon: An array of ``LatLng`` coordinates defining the polygon vertices.
    /// - Returns: A ``ZoneClassification`` with the zone type, reasons, and optional ATC authority.
    /// - Throws: ``EgcaError/invalidPayload(_:)`` if the polygon has fewer than 3 vertices.
    func checkAirspaceZone(polygon: [LatLng]) async throws -> ZoneClassification

    /// Submit a yellow zone ATC permission request.
    /// - Parameter payload: The ``YellowZonePermissionPayload`` with operation details.
    /// - Returns: The application ID assigned by the backend.
    func submitYellowZonePermission(payload: YellowZonePermissionPayload) async throws -> String

    /// Validate a flight plan before eGCA submission.
    ///
    /// Sends the flight plan parameters to the backend for pre-submission
    /// validation. Returns a ``ValidationResult`` containing individual checks
    /// grouped by severity (REQUIRED, ADVISORY, INFO).
    ///
    /// - Parameters:
    ///   - polygon: The flight area polygon vertices.
    ///   - altitudeMeters: The maximum altitude in meters.
    ///   - startTime: The planned flight start time.
    ///   - endTime: The planned flight end time.
    /// - Returns: A ``ValidationResult`` with readiness flag and individual checks.
    /// - Throws: ``EgcaError/invalidPayload(_:)`` if the parameters are invalid.
    func validateFlightPlan(
        polygon: [LatLng],
        altitudeMeters: Double,
        startTime: Date,
        endTime: Date
    ) async throws -> ValidationResult
}
