// NotificationItem.swift
// JADS
//
// Codable model for in-app notifications fetched from the
// /api/drone/notifications endpoint.
//
// Maps to the backend NotificationRecord Prisma model.
// Categories derived from the NotificationType enum:
//   EXPIRY (N01-N05), PERMISSION (N06-N10),
//   COMPLIANCE (N11-N12), SYSTEM (N13).

import Foundation
import SwiftUI

// MARK: - NotificationCategory

/// Broad category for colour coding and tab filtering.
enum NotificationCategory: String, CaseIterable, Codable, Sendable {
    case expiry     = "EXPIRY"
    case permission = "PERMISSION"
    case compliance = "COMPLIANCE"
    case system     = "SYSTEM"

    /// Resolve category from the raw NotificationType string.
    static func from(type: String) -> NotificationCategory {
        if type.hasPrefix("EXPIRY")     { return .expiry }
        if type.hasPrefix("PERMISSION") { return .permission }
        if type == "VIOLATION_DETECTED" || type == "COMPLIANCE_WARNING" {
            return .compliance
        }
        return .system
    }

    /// SwiftUI colour for this category.
    var color: Color {
        switch self {
        case .expiry:     return Color.orange
        case .permission: return Color.blue
        case .compliance: return Color.red
        case .system:     return Color.purple
        }
    }

    /// SF Symbol name for the category.
    var iconName: String {
        switch self {
        case .expiry:     return "clock.badge.exclamationmark"
        case .permission: return "checkmark.shield"
        case .compliance: return "exclamationmark.triangle"
        case .system:     return "megaphone"
        }
    }

    /// Human-readable label.
    var label: String {
        switch self {
        case .expiry:     return "Expiry"
        case .permission: return "Permissions"
        case .compliance: return "Compliance"
        case .system:     return "System"
        }
    }
}

// MARK: - NotificationItem

/// A single notification record from the backend.
struct NotificationItem: Codable, Sendable, Identifiable, Equatable {

    let id:        String
    let type:      String
    let title:     String
    let body:      String
    var read:      Bool
    let createdAt: String
    let readAt:    String?

    /// Derived category from the type field.
    var category: NotificationCategory {
        NotificationCategory.from(type: type)
    }

    /// Formatted relative time string (e.g., "2h ago", "3d ago").
    var timeAgo: String {
        guard let date = ISO8601DateFormatter().date(from: createdAt) else {
            return createdAt
        }
        let diff = Date().timeIntervalSince(date)
        let mins = Int(diff / 60)
        if mins < 1  { return "just now" }
        if mins < 60 { return "\(mins)m ago" }
        let hrs = mins / 60
        if hrs < 24  { return "\(hrs)h ago" }
        let days = hrs / 24
        if days < 30 { return "\(days)d ago" }
        return DateFormatter.localizedString(from: date, dateStyle: .short, timeStyle: .none)
    }

    /// Human-readable type label.
    var typeLabel: String {
        type.replacingOccurrences(of: "_", with: " ")
    }
}

// MARK: - API Response

/// Response shape from GET /api/drone/notifications.
struct NotificationsApiResponse: Codable, Sendable {
    let notifications: [NotificationItem]
    let total:         Int
    let unreadCount:   Int
    let page:          Int
    let limit:         Int
}
