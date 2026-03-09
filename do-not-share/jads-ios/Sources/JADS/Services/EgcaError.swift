// EgcaError.swift
// JADS
//
// Typed error enum for eGCA API failures.
// Each case provides a user-facing message suitable for display in alerts.

import Foundation

/// Errors originating from eGCA API interactions.
///
/// Every case carries a ``userFacingMessage`` that is safe to display
/// directly in UI alerts without leaking implementation details.
enum EgcaError: Error, Sendable {

    /// Authentication failed -- invalid credentials or expired session.
    case unauthorized

    /// The requested resource (application, artefact, etc.) was not found.
    case notFound

    /// The eGCA server returned an error response.
    /// - Parameters:
    ///   - statusCode: The HTTP status code.
    ///   - message: The server-provided error message.
    case serverError(Int, String)

    /// A network-level failure occurred (no connectivity, DNS failure, etc.).
    /// - Parameter underlyingError: The original system error.
    case networkError(Error)

    /// The request payload failed server-side validation.
    /// - Parameter reason: A description of what was invalid.
    case invalidPayload(String)

    /// The Permission Artefact is not yet available for download.
    /// The application may still be pending approval.
    case paNotReady

    /// The request timed out before the server responded.
    case timeout

    /// A human-readable message suitable for display in the UI.
    ///
    /// These messages avoid exposing internal details while providing
    /// actionable guidance to the user.
    var userFacingMessage: String {
        switch self {
        case .unauthorized:
            return "Your session has expired. Please sign in again."

        case .notFound:
            return "The requested permission application was not found. It may have been removed or the ID is incorrect."

        case .serverError(let statusCode, let message):
            return "The eGCA server encountered an error (HTTP \(statusCode)). \(message)"

        case .networkError:
            return "Unable to reach the eGCA server. Please check your internet connection and try again."

        case .invalidPayload(let reason):
            return "The flight permission request contains invalid data: \(reason)"

        case .paNotReady:
            return "The Permission Artefact is not yet available. The application may still be under review."

        case .timeout:
            return "The request timed out. The eGCA server may be experiencing high load. Please try again shortly."
        }
    }
}

// MARK: - LocalizedError Conformance

extension EgcaError: LocalizedError {

    var errorDescription: String? {
        return userFacingMessage
    }
}

// MARK: - Equatable Conformance (for testing)

extension EgcaError: Equatable {

    static func == (lhs: EgcaError, rhs: EgcaError) -> Bool {
        switch (lhs, rhs) {
        case (.unauthorized, .unauthorized):
            return true
        case (.notFound, .notFound):
            return true
        case (.serverError(let lCode, let lMsg), .serverError(let rCode, let rMsg)):
            return lCode == rCode && lMsg == rMsg
        case (.networkError, .networkError):
            // Network errors are equal by case only; underlying errors are not compared.
            return true
        case (.invalidPayload(let lReason), .invalidPayload(let rReason)):
            return lReason == rReason
        case (.paNotReady, .paNotReady):
            return true
        case (.timeout, .timeout):
            return true
        default:
            return false
        }
    }
}
