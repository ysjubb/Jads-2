// NotificationService.swift
// JADS
//
// Manages UNUserNotificationCenter registration and local reminder
// scheduling for JADS notification categories.
//
// Responsibilities:
//   1. Request notification permission from the user
//   2. Schedule local expiry reminder notifications
//   3. Create notification categories for actionable alerts
//   4. Handle notification responses (mark as read, open detail)
//
// This service does NOT handle push notifications (APNs) — all
// notifications are local, triggered by the app or background fetch.

import Foundation
import UserNotifications

// MARK: - NotificationService

final class NotificationService: NSObject, UNUserNotificationCenterDelegate, Sendable {

    // MARK: - Shared instance

    static let shared = NotificationService()

    // MARK: - Category identifiers (match backend NotificationType grouping)

    static let categoryPermissions = "JADS_PERMISSIONS"
    static let categoryExpiry      = "JADS_EXPIRY"
    static let categoryViolations  = "JADS_VIOLATIONS"

    // MARK: - Action identifiers

    static let actionMarkRead = "MARK_READ"
    static let actionViewDetail = "VIEW_DETAIL"

    // MARK: - Init

    private override init() {
        super.init()
    }

    // MARK: - Registration

    /// Request notification permission and register categories.
    /// Call this once at app launch (e.g., in AppDelegate or @main App init).
    func requestAuthorization() async -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self

        do {
            let granted = try await center.requestAuthorization(
                options: [.alert, .badge, .sound]
            )

            if granted {
                await registerCategories()
            }

            return granted
        } catch {
            print("[NotificationService] Authorization failed: \(error.localizedDescription)")
            return false
        }
    }

    /// Register actionable notification categories.
    private func registerCategories() async {
        let markReadAction = UNNotificationAction(
            identifier: Self.actionMarkRead,
            title: "Mark as Read",
            options: []
        )

        let viewDetailAction = UNNotificationAction(
            identifier: Self.actionViewDetail,
            title: "View Details",
            options: [.foreground]
        )

        let permissionsCategory = UNNotificationCategory(
            identifier: Self.categoryPermissions,
            actions: [viewDetailAction, markReadAction],
            intentIdentifiers: [],
            options: []
        )

        let expiryCategory = UNNotificationCategory(
            identifier: Self.categoryExpiry,
            actions: [viewDetailAction, markReadAction],
            intentIdentifiers: [],
            options: []
        )

        let violationsCategory = UNNotificationCategory(
            identifier: Self.categoryViolations,
            actions: [viewDetailAction, markReadAction],
            intentIdentifiers: [],
            options: []
        )

        UNUserNotificationCenter.current().setNotificationCategories([
            permissionsCategory,
            expiryCategory,
            violationsCategory,
        ])
    }

    // MARK: - Local Notification Scheduling

    /// Schedule a local notification for an expiry reminder.
    ///
    /// - Parameters:
    ///   - id: Unique identifier for the notification (prevents duplicates).
    ///   - title: Notification title.
    ///   - body: Notification body text.
    ///   - date: The date/time to fire the notification.
    ///   - category: The notification category (determines actions).
    func scheduleReminder(
        id:       String,
        title:    String,
        body:     String,
        date:     Date,
        category: String = categoryExpiry
    ) async {
        // Don't schedule in the past
        guard date > Date() else { return }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.categoryIdentifier = category
        content.userInfo = ["notificationId": id]

        let components = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: date
        )
        let trigger = UNCalendarNotificationTrigger(
            dateMatching: components,
            repeats: false
        )

        let request = UNNotificationRequest(
            identifier: "jads_reminder_\(id)",
            content: content,
            trigger: trigger
        )

        do {
            try await UNUserNotificationCenter.current().add(request)
            print("[NotificationService] Scheduled reminder: \(id) at \(date)")
        } catch {
            print("[NotificationService] Failed to schedule: \(error.localizedDescription)")
        }
    }

    /// Schedule expiry reminders at standard intervals (90, 60, 30, 7 days).
    ///
    /// - Parameters:
    ///   - licenseId: Identifier for deduplication.
    ///   - licenseNumber: Human-readable licence number.
    ///   - expiryDate: The expiry date.
    func scheduleExpiryReminders(
        licenseId:      String,
        licenseNumber:  String,
        expiryDate:     Date
    ) async {
        let reminders: [(days: Int, suffix: String)] = [
            (90, "90d"),
            (60, "60d"),
            (30, "30d"),
            (7,  "7d"),
        ]

        for reminder in reminders {
            guard let reminderDate = Calendar.current.date(
                byAdding: .day,
                value: -reminder.days,
                to: expiryDate
            ) else { continue }

            await scheduleReminder(
                id:    "\(licenseId)_\(reminder.suffix)",
                title: "Licence Expiry in \(reminder.days) days",
                body:  "Your DGCA licence \(licenseNumber) expires in \(reminder.days) days. Please renew promptly.",
                date:  reminderDate
            )
        }
    }

    /// Cancel all pending JADS reminders.
    func cancelAllReminders() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
        print("[NotificationService] All pending reminders cancelled")
    }

    /// Show an immediate local notification (for background fetch results).
    func showImmediateNotification(
        title:    String,
        body:     String,
        type:     String,
        category: String? = nil
    ) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        // Resolve category from type if not explicitly provided
        let resolvedCategory = category ?? resolveCategory(from: type)
        content.categoryIdentifier = resolvedCategory

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: trigger
        )

        try? await UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Category Resolution

    private func resolveCategory(from type: String) -> String {
        if type.hasPrefix("PERMISSION") { return Self.categoryPermissions }
        if type.hasPrefix("EXPIRY")     { return Self.categoryExpiry }
        return Self.categoryViolations
    }

    // MARK: - UNUserNotificationCenterDelegate

    /// Handle notification when app is in foreground — show it anyway.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        return [.banner, .badge, .sound]
    }

    /// Handle notification response (user tapped or used an action).
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let actionId = response.actionIdentifier
        let userInfo = response.notification.request.content.userInfo

        switch actionId {
        case Self.actionMarkRead:
            if let notifId = userInfo["notificationId"] as? String {
                print("[NotificationService] Mark read action for: \(notifId)")
                // Post a notification so the app can mark it read via the API
                await MainActor.run {
                    NotificationCenter.default.post(
                        name: .jadsNotificationMarkRead,
                        object: nil,
                        userInfo: ["notificationId": notifId]
                    )
                }
            }

        case Self.actionViewDetail, UNNotificationDefaultActionIdentifier:
            // Open the notifications screen
            await MainActor.run {
                NotificationCenter.default.post(
                    name: .jadsNotificationOpenDetail,
                    object: nil,
                    userInfo: userInfo
                )
            }

        default:
            break
        }
    }
}

// MARK: - Notification Names

extension Notification.Name {
    /// Posted when the user taps "Mark as Read" on a local notification.
    static let jadsNotificationMarkRead = Notification.Name("jads.notification.markRead")

    /// Posted when the user taps a notification to view details.
    static let jadsNotificationOpenDetail = Notification.Name("jads.notification.openDetail")
}
