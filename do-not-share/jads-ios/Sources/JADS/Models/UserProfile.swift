// UserProfile.swift
// JADS
//
// Codable model for the operator's user profile, used for progressive
// disclosure routing in the flight planning flow.
//
// Stored securely in the Keychain via KeychainStorage.
// The drone category and operator type determine which flight form
// variant is presented by FlightFormRouter.
//
// DGCA UAS Rules 2021 weight categories:
//   Nano:   < 250 g   (no eGCA submission, recreational only)
//   Micro:  250 g - 2 kg
//   Small:  2 - 25 kg
//   Medium: 25 - 150 kg
//   Large:  > 150 kg  (currently not permitted under UAS Rules 2021)

import Foundation
import Security

// MARK: - DroneCategory

/// DGCA UAS Rules 2021 drone weight categories.
///
/// Each category has different regulatory requirements for flight planning
/// and determines which form variant is shown in the progressive disclosure flow.
enum DroneCategory: String, Codable, CaseIterable, Sendable {
    case nano   = "NANO"
    case micro  = "MICRO"
    case small  = "SMALL"
    case medium = "MEDIUM"

    /// Human-readable display name with weight range.
    var displayName: String {
        switch self {
        case .nano:   return "Nano (< 250 g)"
        case .micro:  return "Micro (250 g -- 2 kg)"
        case .small:  return "Small (2 -- 25 kg)"
        case .medium: return "Medium (25 -- 150 kg)"
        }
    }

    /// Short label for compact UI elements.
    var shortLabel: String {
        switch self {
        case .nano:   return "NANO"
        case .micro:  return "MICRO"
        case .small:  return "SMALL"
        case .medium: return "MEDIUM"
        }
    }

    /// Whether eGCA submission is required for this category.
    var requiresEgcaSubmission: Bool {
        switch self {
        case .nano: return false
        case .micro, .small, .medium: return true
        }
    }

    /// Whether a UIN (Unique Identification Number) is required.
    var requiresUin: Bool {
        switch self {
        case .nano: return false
        case .micro, .small, .medium: return true
        }
    }

    /// Whether an RPC (Remote Pilot Certificate) is required.
    var requiresRpc: Bool {
        switch self {
        case .nano, .micro: return false
        case .small, .medium: return true
        }
    }
}

// MARK: - OperatorType

/// The type of drone operator, determining applicable regulations.
enum OperatorType: String, Codable, CaseIterable, Sendable {
    case recreational   = "RECREATIONAL"
    case commercial     = "COMMERCIAL"
    case government     = "GOVERNMENT"
    case research       = "RESEARCH"
    case agricultural   = "AGRICULTURAL"

    /// Human-readable display name.
    var displayName: String {
        switch self {
        case .recreational: return "Recreational / Hobby"
        case .commercial:   return "Commercial Operations"
        case .government:   return "Government / Defence"
        case .research:     return "Research & Development"
        case .agricultural: return "Agricultural"
        }
    }
}

// MARK: - UsageType

/// Usage types for multi-select during onboarding.
enum UsageType: String, Codable, CaseIterable, Sendable {
    case photography    = "PHOTOGRAPHY"
    case survey         = "SURVEY"
    case delivery       = "DELIVERY"
    case inspection     = "INSPECTION"
    case agriculture    = "AGRICULTURE"
    case emergency      = "EMERGENCY"
    case training       = "TRAINING"
    case research       = "RESEARCH"

    /// Human-readable display name.
    var displayName: String {
        switch self {
        case .photography:  return "Photography / Video"
        case .survey:       return "Survey & Mapping"
        case .delivery:     return "Delivery"
        case .inspection:   return "Infrastructure Inspection"
        case .agriculture:  return "Agriculture / Spraying"
        case .emergency:    return "Emergency / Medical"
        case .training:     return "Training / Education"
        case .research:     return "Research & Development"
        }
    }

    /// SF Symbol name for the usage chip icon.
    var iconName: String {
        switch self {
        case .photography:  return "camera.fill"
        case .survey:       return "map.fill"
        case .delivery:     return "shippingbox.fill"
        case .inspection:   return "building.2.fill"
        case .agriculture:  return "leaf.fill"
        case .emergency:    return "cross.case.fill"
        case .training:     return "graduationcap.fill"
        case .research:     return "flask.fill"
        }
    }
}

// MARK: - UserProfile

/// The operator's profile, stored in the Keychain for secure persistence.
///
/// Populated during onboarding and used by ``FlightFormRouter`` to determine
/// which flight planning form variant to present.
struct UserProfile: Codable, Sendable, Equatable {

    /// The drone weight category selected during onboarding.
    var droneCategory: DroneCategory

    /// The operator type (recreational, commercial, etc.).
    var operatorType: OperatorType

    /// The Remote Pilot Certificate ID, if applicable.
    /// Required for Small and Medium category drones.
    var rpcId: String?

    /// The selected usage types (multi-select during onboarding).
    var usageTypes: [UsageType]

    /// Whether the user has completed the onboarding flow.
    var onboardingCompleted: Bool

    /// The date when the profile was last updated.
    var lastUpdated: Date

    /// Whether this profile requires agricultural flight form fields.
    var isAgriculturalOperator: Bool {
        operatorType == .agricultural || usageTypes.contains(.agriculture)
    }

    /// Whether this profile requires special operations (BVLOS) form fields.
    var requiresSpecialOpsForm: Bool {
        droneCategory == .medium
    }

    /// Create a default (empty) profile.
    static var empty: UserProfile {
        UserProfile(
            droneCategory: .micro,
            operatorType: .recreational,
            rpcId: nil,
            usageTypes: [],
            onboardingCompleted: false,
            lastUpdated: Date()
        )
    }
}

// MARK: - KeychainStorage

/// Secure storage for the UserProfile in the iOS Keychain.
///
/// Uses `kSecClassGenericPassword` with a fixed service + account key.
/// The profile is JSON-encoded before storage.
enum KeychainStorage {

    /// The Keychain service identifier for JADS user profile.
    private static let service = "com.jads.userprofile"

    /// The Keychain account key.
    private static let account = "operator_profile"

    /// Save the user profile to the Keychain.
    ///
    /// - Parameter profile: The ``UserProfile`` to store.
    /// - Throws: An error if Keychain write fails.
    static func save(_ profile: UserProfile) throws {
        let data = try JSONEncoder().encode(profile)

        // Delete any existing item first
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        // Add the new item
        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]

        let status = SecItemAdd(addQuery as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.saveFailed(status)
        }
    }

    /// Load the user profile from the Keychain.
    ///
    /// - Returns: The stored ``UserProfile``, or `nil` if none exists.
    static func load() -> UserProfile? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }

        return try? JSONDecoder().decode(UserProfile.self, from: data)
    }

    /// Delete the user profile from the Keychain.
    static func delete() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }

    /// Errors that can occur during Keychain operations.
    enum KeychainError: Error, LocalizedError {
        case saveFailed(OSStatus)

        var errorDescription: String? {
            switch self {
            case .saveFailed(let status):
                return "Keychain save failed with status: \(status)"
            }
        }
    }
}
