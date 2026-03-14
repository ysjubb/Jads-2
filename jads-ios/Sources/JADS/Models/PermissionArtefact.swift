// PermissionArtefact.swift
// JADS
//
// Codable model representing a Permission Artefact (PA) as defined
// by the eGCA NPNT (No Permission No Takeoff) specification.
//
// A PA is the signed XML document that authorizes a specific drone
// to operate within a defined polygon, altitude, and time window.
// The drone firmware will not arm unless a valid PA is loaded.
//
// Fields align with the backend Prisma schema and eGCA API v2 DTOs.

import Foundation

// MARK: - PermissionArtefact

/// A Permission Artefact representing an authorized drone flight.
///
/// Contains the full metadata for a single PA: the flight window,
/// permitted area polygon, drone identification, and current status.
/// The actual signed XML ZIP is stored separately via ``PAStorage``.
struct PermissionArtefact: Codable, Sendable, Identifiable, Equatable, Hashable {

    /// The eGCA-assigned application identifier.
    let applicationId: String

    /// The drone's Unique Identification Number (e.g., "UA-12345-ABCDE").
    let uinNumber: String

    /// The pilot's business identifier registered with eGCA.
    let pilotBusinessId: String

    /// The purpose of the flight (e.g., "SURVEY", "DELIVERY", "PHOTOGRAPHY").
    let flightPurpose: String

    /// The current status of this permission.
    let status: PermissionStatusValue

    /// Flight window start time in Digital Sky format: "dd-MM-yyyy HH:mm:ss" IST.
    let startDateTime: String

    /// Flight window end time in Digital Sky format: "dd-MM-yyyy HH:mm:ss" IST.
    let endDateTime: String

    /// Maximum altitude above ground level in meters.
    let maxAltitudeInMeters: Double

    /// The type of drone operation (VLOS, BVLOS, etc.).
    let typeOfOperation: OperationType

    /// The polygon defining the permitted flight area.
    let flyArea: [LatLng]

    /// The eGCA tracking/reference number, if assigned.
    let referenceNumber: String?

    /// Timestamp when the application was submitted (ISO 8601).
    let submittedAt: String

    /// Timestamp when the status was last updated (ISO 8601).
    let updatedAt: String

    /// Remarks from the reviewing authority, if any.
    let remarks: String?

    /// The responsible ATC authority (e.g., "AAI", "IAF").
    let atcAuthority: String?

    /// The airspace zone classification for the permitted area.
    let zoneType: ZoneType?

    /// The ID of the Permission Artefact ZIP, if available (only when APPROVED).
    let permissionArtifactId: String?

    // MARK: - Identifiable

    var id: String { applicationId }

    // MARK: - Computed Properties

    /// Parse the start datetime from Digital Sky format to a `Date`.
    var parsedStartDateTime: Date? {
        EgcaDateFormatters.digitalSky.date(from: startDateTime)
    }

    /// Parse the end datetime from Digital Sky format to a `Date`.
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

    /// Whether this PA has expired (endDateTime is in the past).
    var isExpired: Bool {
        guard let end = parsedEndDateTime else { return false }
        return end < Date()
    }

    /// Whether the flight window is currently active (between start and end).
    var isActive: Bool {
        guard let start = parsedStartDateTime, let end = parsedEndDateTime else { return false }
        let now = Date()
        return now >= start && now <= end
    }

    /// Whether the PA has been downloaded locally.
    var isDownloaded: Bool {
        PAStorage.exists(applicationId: applicationId)
    }

    /// Formatted flight window string in IST: "dd MMM yyyy, HH:mm -- HH:mm".
    var formattedFlightWindow: String {
        guard let start = parsedStartDateTime, let end = parsedEndDateTime else {
            return "\(startDateTime) -- \(endDateTime)"
        }

        let dateFormatter = DateFormatter()
        dateFormatter.timeZone = TimeZone(identifier: "Asia/Kolkata")

        // Format: "09 Mar 2026, 10:00 -- 11:30"
        dateFormatter.dateFormat = "dd MMM yyyy, HH:mm"
        let startStr = dateFormatter.string(from: start)

        dateFormatter.dateFormat = "HH:mm"
        let endStr = dateFormatter.string(from: end)

        return "\(startStr) \u{2014} \(endStr)"
    }

    /// Time remaining until the flight window ends, or nil if expired.
    var timeRemaining: TimeInterval? {
        guard let end = parsedEndDateTime else { return nil }
        let remaining = end.timeIntervalSinceNow
        return remaining > 0 ? remaining : nil
    }

    /// Time remaining until the flight window starts, or nil if already started.
    var timeUntilStart: TimeInterval? {
        guard let start = parsedStartDateTime else { return nil }
        let remaining = start.timeIntervalSinceNow
        return remaining > 0 ? remaining : nil
    }
}

// MARK: - PermissionArtefact + FlightPermission Conversion

extension PermissionArtefact {

    /// Create a PermissionArtefact from a ``FlightPermission`` list item.
    ///
    /// This is used when converting paginated list responses into the richer
    /// PermissionArtefact model. Fields not present in the list item are set
    /// to nil or default values.
    ///
    /// - Parameter permission: The ``FlightPermission`` from a list response.
    init(from permission: FlightPermission) {
        self.applicationId = permission.applicationId
        self.uinNumber = permission.uinNumber
        self.pilotBusinessId = permission.pilotBusinessId
        self.flightPurpose = permission.flightPurpose
        self.status = permission.status
        self.startDateTime = permission.startDateTime
        self.endDateTime = permission.endDateTime
        self.maxAltitudeInMeters = permission.maxAltitudeInMeters
        self.typeOfOperation = permission.typeOfOperation
        self.flyArea = []
        self.referenceNumber = nil
        self.submittedAt = permission.submittedAt
        self.updatedAt = permission.updatedAt
        self.remarks = nil
        self.atcAuthority = nil
        self.zoneType = nil
        self.permissionArtifactId = nil
    }
}

// MARK: - PermissionFilter

/// Filter segments for the permissions list view.
enum PermissionFilter: String, CaseIterable, Identifiable {
    case active = "Active"
    case pending = "Pending"
    case history = "History"

    var id: String { rawValue }

    /// The status values that belong to this filter segment.
    var matchingStatuses: Set<PermissionStatusValue> {
        switch self {
        case .active:
            return [.approved]
        case .pending:
            return [.submitted, .pending]
        case .history:
            return [.rejected, .expired]
        }
    }

    /// SF Symbol icon name for this filter segment.
    var iconName: String {
        switch self {
        case .active: return "checkmark.circle.fill"
        case .pending: return "clock.fill"
        case .history: return "archivebox.fill"
        }
    }
}
