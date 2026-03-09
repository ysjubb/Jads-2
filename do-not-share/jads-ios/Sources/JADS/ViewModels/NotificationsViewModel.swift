// NotificationsViewModel.swift
// JADS
//
// @MainActor ObservableObject that manages the notification list.
//
// Responsibilities:
//   - Fetch notifications from /api/drone/notifications
//   - Mark single / all notifications as read
//   - Category tab filtering (All / Expiry / Permission / Compliance / System)
//   - Automatic polling every 30 seconds for new notifications
//   - Expose unread count for badge display
//
// All network calls use URLSession directly (no EgcaService dependency).

import Foundation
import Combine

// MARK: - NotificationsViewModel

@MainActor
final class NotificationsViewModel: ObservableObject {

    // MARK: - Constants

    private static let pollingIntervalSeconds: TimeInterval = 30
    private static let pageSize = 50

    // MARK: - Published Properties

    @Published var notifications: [NotificationItem] = []
    @Published var selectedCategory: NotificationCategory? = nil
    @Published var isLoading = false
    @Published var unreadCount = 0
    @Published var errorMessage: String?
    @Published var showUnreadOnly = false

    // MARK: - Filtered notifications

    var filteredNotifications: [NotificationItem] {
        var items = notifications

        if let category = selectedCategory {
            items = items.filter { $0.category == category }
        }

        if showUnreadOnly {
            items = items.filter { !$0.read }
        }

        return items
    }

    // MARK: - Private

    private var pollingTimer: Timer?
    private let baseURL: String
    private let token: String

    // MARK: - Init

    init(baseURL: String = "", token: String = "") {
        self.baseURL = baseURL
        self.token = token
    }

    // MARK: - Lifecycle

    func start() async {
        await refreshNotifications()
        startPolling()
    }

    func stop() {
        pollingTimer?.invalidate()
        pollingTimer = nil
    }

    // MARK: - Data Fetching

    func refreshNotifications() async {
        isLoading = true
        errorMessage = nil

        do {
            var urlComponents = URLComponents(string: "\(baseURL)/api/drone/notifications")!
            var queryItems: [URLQueryItem] = [
                URLQueryItem(name: "limit", value: "\(Self.pageSize)"),
                URLQueryItem(name: "page", value: "1"),
            ]
            if showUnreadOnly {
                queryItems.append(URLQueryItem(name: "unread", value: "true"))
            }
            if let category = selectedCategory {
                queryItems.append(URLQueryItem(name: "category", value: category.rawValue))
            }
            urlComponents.queryItems = queryItems

            guard let url = urlComponents.url else {
                errorMessage = "Invalid URL"
                isLoading = false
                return
            }

            var request = URLRequest(url: url)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("4.0", forHTTPHeaderField: "X-JADS-Version")

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                errorMessage = "Server error"
                isLoading = false
                return
            }

            let decoder = JSONDecoder()
            let apiResponse = try decoder.decode(NotificationsApiResponse.self, from: data)

            notifications = apiResponse.notifications
            unreadCount = apiResponse.unreadCount
            isLoading = false

        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }

    // MARK: - Mark Read

    func markRead(_ notificationId: String) async {
        // Optimistic update
        if let index = notifications.firstIndex(where: { $0.id == notificationId && !$0.read }) {
            notifications[index].read = true
            unreadCount = max(0, unreadCount - 1)
        }

        guard let url = URL(string: "\(baseURL)/api/drone/notifications/\(notificationId)/read") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("4.0", forHTTPHeaderField: "X-JADS-Version")

        _ = try? await URLSession.shared.data(for: request)
    }

    func markAllRead() async {
        // Optimistic update
        notifications = notifications.map { var n = $0; n.read = true; return n }
        unreadCount = 0

        guard let url = URL(string: "\(baseURL)/api/drone/notifications/read-all") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("4.0", forHTTPHeaderField: "X-JADS-Version")

        _ = try? await URLSession.shared.data(for: request)
    }

    // MARK: - Category Selection

    func selectCategory(_ category: NotificationCategory?) {
        selectedCategory = category
        Task { await refreshNotifications() }
    }

    // MARK: - Polling

    private func startPolling() {
        pollingTimer?.invalidate()
        pollingTimer = Timer.scheduledTimer(
            withTimeInterval: Self.pollingIntervalSeconds,
            repeats: true
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.refreshNotifications()
            }
        }
    }
}
