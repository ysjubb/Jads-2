// EgcaModels.swift
// JADS
//
// Codable structs matching eGCA API v2 DTOs.
// All types mirror the backend TypeScript definitions in adapters/egca/types.ts.
//
// Date format conventions:
//   - eGCA legacy (Digital Sky): "dd-MM-yyyy HH:mm:ss" IST
//   - Permission Artefact timestamps: ISO 8601

import Foundation

// MARK: - Date Formatters

/// Shared date formatters for eGCA API communication.
///
/// eGCA uses two date formats:
/// 1. Digital Sky legacy: "dd-MM-yyyy HH:mm:ss" in IST (India Standard Time, UTC+05:30)
/// 2. ISO 8601 for Permission Artefact timestamps and general API responses
enum EgcaDateFormatters {

    /// Formatter for the Digital Sky legacy format: "dd-MM-yyyy HH:mm:ss".
    ///
    /// Used for `startDateTime`, `endDateTime`, `registrationDate`, `validFrom`, `validTo`
    /// fields in flight permission payloads and validation results.
    static let digitalSky: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "dd-MM-yyyy HH:mm:ss"
        formatter.locale = Locale(identifier: "en_IN")
        formatter.timeZone = TimeZone(identifier: "Asia/Kolkata")!
        return formatter
    }()

    /// Formatter for ISO 8601 timestamps.
    ///
    /// Used for `submittedAt`, `updatedAt`, `expiresAt` fields in API responses
    /// and Permission Artefact metadata.
    static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    /// Fallback ISO 8601 formatter without fractional seconds.
    static let iso8601NoFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    /// Parse an ISO 8601 string, trying with and without fractional seconds.
    /// - Parameter string: The date string to parse.
    /// - Returns: The parsed `Date`, or `nil` if parsing fails.
    static func parseISO8601(_ string: String) -> Date? {
        return iso8601.date(from: string) ?? iso8601NoFractional.date(from: string)
    }
}

// MARK: - Coordinate

/// A geographic coordinate used in fly area definitions.
struct LatLng: Codable, Sendable, Equatable, Hashable {
    let latitude: Double
    let longitude: Double
}

// MARK: - Authentication

/// JWT authentication token returned by the eGCA identity provider.
struct AuthToken: Codable, Sendable {
    /// The JWT bearer token string.
    let token: String

    /// The token expiration timestamp (ISO 8601).
    let expiresAt: Date

    enum CodingKeys: String, CodingKey {
        case token
        case expiresAt
        case expiresIn = "expires_in"
        case accessToken = "access_token"
    }

    init(token: String, expiresAt: Date) {
        self.token = token
        self.expiresAt = expiresAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        // The eGCA API may return the token as "token" or "access_token"
        if let t = try container.decodeIfPresent(String.self, forKey: .token) {
            self.token = t
        } else if let t = try container.decodeIfPresent(String.self, forKey: .accessToken) {
            self.token = t
        } else {
            throw DecodingError.keyNotFound(
                CodingKeys.token,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Neither 'token' nor 'access_token' found in response"
                )
            )
        }

        // Expiry can be an absolute date or a relative seconds value
        if let expiresAtString = try container.decodeIfPresent(String.self, forKey: .expiresAt),
           let date = EgcaDateFormatters.parseISO8601(expiresAtString) {
            self.expiresAt = date
        } else if let expiresIn = try container.decodeIfPresent(Int.self, forKey: .expiresIn) {
            self.expiresAt = Date().addingTimeInterval(TimeInterval(expiresIn))
        } else {
            // Default to 1 hour from now if no expiry information is provided
            self.expiresAt = Date().addingTimeInterval(3600)
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(token, forKey: .token)
        let isoString = EgcaDateFormatters.iso8601.string(from: expiresAt)
        try container.encode(isoString, forKey: .expiresAt)
    }
}

// MARK: - Flight Permission Payload

/// The request payload for submitting a new flight permission application.
///
/// All datetime fields use the Digital Sky legacy format: "dd-MM-yyyy HH:mm:ss" IST.
/// Field names match the eGCA API v2 schema.
struct FlightPermissionPayload: Codable, Sendable {
    /// The pilot's business identifier registered with eGCA.
    let pilotBusinessIdentifier: String

    /// The eGCA internal drone ID (integer, not the UIN string).
    let droneId: Int

    /// The drone's Unique Identification Number (for display/logging).
    let uinNumber: String

    /// The polygon defining the flight area as an array of coordinates.
    let flyArea: [LatLng]

    /// The payload weight in kilograms.
    let payloadWeightInKg: Double

    /// Description of the payload being carried.
    let payloadDetails: String

    /// The purpose of the flight (e.g., "SURVEY", "DELIVERY", "PHOTOGRAPHY").
    let flightPurpose: String

    /// Flight start time in Digital Sky format: "dd-MM-yyyy HH:mm:ss" IST.
    let startDateTime: String

    /// Flight end time in Digital Sky format: "dd-MM-yyyy HH:mm:ss" IST.
    let endDateTime: String

    /// Maximum altitude above ground level in meters.
    let maxAltitudeInMeters: Double

    /// The type of drone operation.
    let typeOfOperation: OperationType

    /// Whether the drone has flight termination or return-to-home capability.
    let flightTerminationOrReturnHomeCapability: Bool

    /// Whether the drone has geo-fencing capability.
    let geoFencingCapability: Bool

    /// Whether the drone has detect-and-avoid capability.
    let detectAndAvoidCapability: Bool

    /// Self-declaration by the operator confirming compliance.
    let selfDeclaration: Bool

    /// Optional CRON_QUARTZ expression for recurring flights.
    let recurringTimeExpression: String?

    /// Optional duration in minutes for recurring flights.
    let recurringTimeDurationInMinutes: Int?
}

/// Type of drone operation, matching eGCA classifications.
enum OperationType: String, Codable, Sendable, CaseIterable {
    case vlos = "VLOS"
    case bvlos = "BVLOS"
    case night = "NIGHT"
    case agricultural = "AGRICULTURAL"

    /// Human-readable display name.
    var displayName: String {
        switch self {
        case .vlos: return "Visual Line of Sight"
        case .bvlos: return "Beyond Visual Line of Sight"
        case .night: return "Night Operation"
        case .agricultural: return "Agricultural"
        }
    }
}

// MARK: - Permission Application

/// Response from submitting a flight permission application.
struct PermissionApplication: Codable, Sendable {
    /// The eGCA-assigned application identifier.
    let applicationId: String

    /// The current status of the application.
    let status: PermissionStatusValue

    /// Timestamp when the application was submitted (ISO 8601).
    let submittedAt: String

    /// The eGCA tracking/reference number, if assigned.
    let referenceNumber: String?
}

// MARK: - Permission Status

/// The current status of a flight permission application.
struct PermissionStatus: Codable, Sendable {
    /// The current status value.
    let status: PermissionStatusValue

    /// The ID of the Permission Artefact, if available (only when APPROVED).
    let permissionArtifactId: String?

    /// Remarks from the reviewing authority.
    let remarks: String?

    /// Timestamp when the status was last updated (ISO 8601).
    let updatedAt: String?
}

/// Possible status values for a flight permission application.
enum PermissionStatusValue: String, Codable, Sendable {
    case submitted = "SUBMITTED"
    case pending = "PENDING"
    case approved = "APPROVED"
    case rejected = "REJECTED"
    case expired = "EXPIRED"

    /// Human-readable display name.
    var displayName: String {
        switch self {
        case .submitted: return "Submitted"
        case .pending: return "Pending Review"
        case .approved: return "Approved"
        case .rejected: return "Rejected"
        case .expired: return "Expired"
        }
    }

    /// Whether this status represents a terminal state.
    var isTerminal: Bool {
        switch self {
        case .approved, .rejected, .expired:
            return true
        case .submitted, .pending:
            return false
        }
    }
}

// MARK: - Flight Permission (List Item)

/// A flight permission as returned in paginated list responses.
struct FlightPermission: Codable, Sendable, Identifiable {
    let applicationId: String
    let uinNumber: String
    let pilotBusinessId: String
    let flightPurpose: String
    let status: PermissionStatusValue
    let startDateTime: String
    let endDateTime: String
    let maxAltitudeInMeters: Double
    let typeOfOperation: OperationType
    let submittedAt: String
    let updatedAt: String

    /// Identifiable conformance for SwiftUI list rendering.
    var id: String { applicationId }

    /// Parse the start datetime from Digital Sky format.
    var parsedStartDateTime: Date? {
        EgcaDateFormatters.digitalSky.date(from: startDateTime)
    }

    /// Parse the end datetime from Digital Sky format.
    var parsedEndDateTime: Date? {
        EgcaDateFormatters.digitalSky.date(from: endDateTime)
    }

    /// Parse the submission timestamp from ISO 8601.
    var parsedSubmittedAt: Date? {
        EgcaDateFormatters.parseISO8601(submittedAt)
    }

    /// Parse the last-updated timestamp from ISO 8601.
    var parsedUpdatedAt: Date? {
        EgcaDateFormatters.parseISO8601(updatedAt)
    }
}

// MARK: - Paginated Permissions

/// A paginated response containing flight permissions.
struct PaginatedPermissions: Codable, Sendable {
    /// The permission items on this page.
    let items: [FlightPermission]

    /// The total number of permissions across all pages.
    let total: Int

    /// The current page number (1-indexed).
    let page: Int

    /// The number of items per page.
    let pageSize: Int

    /// The total number of pages.
    let totalPages: Int

    /// Whether there are more pages after this one.
    var hasNextPage: Bool {
        page < totalPages
    }

    /// Whether there are pages before this one.
    var hasPreviousPage: Bool {
        page > 1
    }
}

// MARK: - Permission Artefact Download Response

/// Metadata wrapper for a downloaded Permission Artefact.
///
/// The actual ZIP data is returned separately; this struct captures
/// any metadata the API provides alongside the download.
struct PADownloadResponse: Codable, Sendable {
    /// The application ID this artefact belongs to.
    let applicationId: String

    /// The artefact creation timestamp (ISO 8601).
    let createdAt: String?

    /// The artefact expiry timestamp (ISO 8601).
    let expiresAt: String?

    /// SHA-256 hash of the ZIP content for integrity verification.
    let sha256Hash: String?

    /// Parse the expiry timestamp from ISO 8601.
    var parsedExpiresAt: Date? {
        guard let expiresAt else { return nil }
        return EgcaDateFormatters.parseISO8601(expiresAt)
    }
}

// MARK: - Zone Classification

/// Airspace zone classification result for a given polygon.
///
/// Maps to DGCA UAS Rules 2021 zone definitions:
/// - GREEN: Open operations, no additional permission required.
/// - YELLOW: Controlled airspace, requires DGCA permission.
/// - RED: Restricted/no-fly zone, operations prohibited.
struct ZoneClassification: Codable, Sendable {
    /// The zone classification.
    let zone: ZoneType

    /// Reasons for the classification (e.g., "Within 5km of airport", "Military airspace").
    let reasons: [String]

    /// The responsible ATC authority, if applicable.
    let atcAuthority: String?
}

/// DGCA UAS Rules 2021 drone zone classifications.
enum ZoneType: String, Codable, Sendable {
    case green = "GREEN"
    case yellow = "YELLOW"
    case red = "RED"

    /// Human-readable display name.
    var displayName: String {
        switch self {
        case .green: return "Green Zone (Open)"
        case .yellow: return "Yellow Zone (Controlled)"
        case .red: return "Red Zone (Restricted)"
        }
    }

    /// Whether operations in this zone require explicit DGCA permission.
    var requiresPermission: Bool {
        switch self {
        case .green: return false
        case .yellow: return true
        case .red: return true
        }
    }
}

// MARK: - Yellow Zone Permission Payload

/// Request payload for submitting a yellow zone ATC permission request.
struct YellowZonePermissionPayload: Codable, Sendable {
    let polygon: [LatLng]
    let altitudeMeters: Double
    let startTime: Date
    let endTime: Date
    let operationType: String
    let rthCapability: Bool
    let geoFencing: Bool
    let daaSystem: Bool
    let authority: String
    let expedited: Bool

    enum CodingKeys: String, CodingKey {
        case polygon, altitudeMeters, startTime, endTime, operationType
        case rthCapability, geoFencing, daaSystem, authority, expedited
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(polygon, forKey: .polygon)
        try container.encode(altitudeMeters, forKey: .altitudeMeters)
        try container.encode(EgcaDateFormatters.iso8601.string(from: startTime), forKey: .startTime)
        try container.encode(EgcaDateFormatters.iso8601.string(from: endTime), forKey: .endTime)
        try container.encode(operationType, forKey: .operationType)
        try container.encode(rthCapability, forKey: .rthCapability)
        try container.encode(geoFencing, forKey: .geoFencing)
        try container.encode(daaSystem, forKey: .daaSystem)
        try container.encode(authority, forKey: .authority)
        try container.encode(expedited, forKey: .expedited)
    }
}

// MARK: - Cached Permission Artefact

/// Metadata for a locally cached Permission Artefact ZIP file.
struct CachedPA: Sendable, Identifiable {
    /// The application ID this artefact belongs to.
    let applicationId: String

    /// The local file URL where the ZIP is stored.
    let fileURL: URL

    /// The size of the cached file in bytes.
    let fileSizeBytes: Int64

    /// When the file was cached locally.
    let cachedAt: Date

    /// The flight end time parsed from the permission, used for expiry cleanup.
    let endDateTime: Date?

    /// Identifiable conformance for SwiftUI list rendering.
    var id: String { applicationId }

    /// Whether this PA has expired (endDateTime is in the past).
    var isExpired: Bool {
        guard let endDateTime else { return false }
        return endDateTime < Date()
    }
}
