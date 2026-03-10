// ValidationItem.swift
// JADS
//
// Codable model representing a single pre-submission validation check
// returned by POST /api/drone/validate-flight-plan.
//
// Each item belongs to one of three severity categories:
//   - REQUIRED:  Must pass before eGCA submission is allowed.
//   - ADVISORY:  Warning that can be acknowledged by the operator.
//   - INFO:      Read-only informational item (always passes).
//
// Fields mirror the backend validation response DTO.

import Foundation

// MARK: - ValidationItem

/// A single validation check result for a flight plan.
///
/// Contains the check code, human-readable name, description,
/// pass/fail status, and optional remediation guidance.
struct ValidationItem: Codable, Sendable, Identifiable, Equatable {

    /// Unique code identifying this check (e.g., "NPNT_PA_VALID", "PILOT_LICENCE_EXPIRY").
    let code: String

    /// The severity classification of this check.
    let severity: ValidationSeverity

    /// Human-readable name of the check (e.g., "NPNT Permission Artefact").
    let name: String

    /// Description of what this check verifies.
    let description: String

    /// Whether the check passed (`true`) or failed (`false`).
    let passed: Bool

    /// Optional reference to the form field that caused the failure.
    let field: String?

    /// Optional remediation hint explaining how to fix a failure.
    let remediation: String?

    // MARK: - Identifiable

    var id: String { code }
}

// MARK: - ValidationSeverity

/// Severity levels for validation checks.
///
/// Determines how each check affects submission readiness:
/// - `.required`: Blocks submission if failed.
/// - `.advisory`: Can be acknowledged by the user to proceed.
/// - `.info`: Informational only, does not affect readiness.
enum ValidationSeverity: String, Codable, Sendable, CaseIterable {
    case required = "REQUIRED"
    case advisory = "ADVISORY"
    case info     = "INFO"

    /// Human-readable display name for section headers.
    var displayName: String {
        switch self {
        case .required: return "Required Checks"
        case .advisory: return "Advisories"
        case .info:     return "Information"
        }
    }

    /// SF Symbol icon name for the section header.
    var sectionIcon: String {
        switch self {
        case .required: return "exclamationmark.shield.fill"
        case .advisory: return "exclamationmark.triangle.fill"
        case .info:     return "info.circle.fill"
        }
    }
}

// MARK: - ValidationResult

/// Top-level response from POST /api/drone/validate-flight-plan.
///
/// Contains the overall readiness flag and the list of individual checks.
struct ValidationResult: Codable, Sendable {

    /// Whether all required checks passed and the plan is ready for submission.
    let ready: Bool

    /// The individual validation checks, grouped by severity on the client.
    let checks: [ValidationItem]
}

// MARK: - ValidationItem Convenience

extension ValidationItem {

    /// SF Symbol name for the status icon.
    ///
    /// - Failed required: red X mark
    /// - Failed advisory (not acknowledged): amber warning triangle
    /// - Failed advisory (acknowledged): amber checkmark
    /// - Passed: green checkmark
    /// - Info: blue info circle
    func statusIconName(acknowledged: Bool = false) -> String {
        switch severity {
        case .info:
            return "info.circle.fill"
        case .required:
            return passed ? "checkmark.circle.fill" : "xmark.circle.fill"
        case .advisory:
            if passed { return "checkmark.circle.fill" }
            return acknowledged ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
        }
    }

    /// Colour name for the status icon (using SwiftUI Color names).
    ///
    /// Maps to the JADS colour palette:
    /// - Red:   failed required checks
    /// - Amber: advisory warnings
    /// - Green: passed checks
    /// - Blue:  informational items
    func statusColor(acknowledged: Bool = false) -> StatusColor {
        switch severity {
        case .info:
            return .blue
        case .required:
            return passed ? .green : .red
        case .advisory:
            if passed { return .green }
            return acknowledged ? .amber : .amber
        }
    }
}

// MARK: - StatusColor

/// Named colour tokens used by ValidationItemRow.
///
/// Maps to SwiftUI system colours and the JADS design system.
enum StatusColor: Sendable {
    case red
    case amber
    case green
    case blue
}
