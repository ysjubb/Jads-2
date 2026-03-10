// NotificationsView.swift
// JADS
//
// Main notification centre view with:
//   - NavigationStack with title "Notifications"
//   - Segmented picker for category filtering (All / Expiry / Permissions / Compliance / System)
//   - List of notification items with swipe actions (mark read)
//   - Pull-to-refresh
//   - "Mark All Read" toolbar button
//   - Unread badge count
//   - Empty state for no notifications

import SwiftUI

// MARK: - NotificationsView

struct NotificationsView: View {

    @StateObject private var viewModel = NotificationsViewModel()

    /// The currently selected segment index (0 = All, 1-4 = categories).
    @State private var selectedSegment = 0

    /// Segments for the picker.
    private let segments = ["All", "Expiry", "Permissions", "Compliance", "System"]

    /// Map segment index to NotificationCategory.
    private func categoryForSegment(_ index: Int) -> NotificationCategory? {
        switch index {
        case 1: return .expiry
        case 2: return .permission
        case 3: return .compliance
        case 4: return .system
        default: return nil
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Segmented picker
                Picker("Category", selection: $selectedSegment) {
                    ForEach(0..<segments.count, id: \.self) { index in
                        Text(segments[index]).tag(index)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .onChange(of: selectedSegment) { _, newValue in
                    viewModel.selectCategory(categoryForSegment(newValue))
                }

                Divider()

                // Notification list
                if viewModel.isLoading && viewModel.notifications.isEmpty {
                    Spacer()
                    ProgressView("Loading notifications...")
                        .foregroundStyle(.secondary)
                    Spacer()
                } else if viewModel.filteredNotifications.isEmpty {
                    Spacer()
                    emptyState
                    Spacer()
                } else {
                    List {
                        ForEach(viewModel.filteredNotifications) { notification in
                            NotificationRow(notification: notification)
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    if !notification.read {
                                        Button {
                                            Task { await viewModel.markRead(notification.id) }
                                        } label: {
                                            Label("Read", systemImage: "checkmark")
                                        }
                                        .tint(.blue)
                                    }
                                }
                                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                    if !notification.read {
                                        Button {
                                            Task { await viewModel.markRead(notification.id) }
                                        } label: {
                                            Label("Mark Read", systemImage: "envelope.open")
                                        }
                                        .tint(.green)
                                    }
                                }
                                .listRowBackground(
                                    notification.read
                                        ? Color.clear
                                        : notification.category.color.opacity(0.05)
                                )
                        }
                    }
                    .listStyle(.plain)
                    .refreshable {
                        await viewModel.refreshNotifications()
                    }
                }
            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: 12) {
                        // Unread badge
                        if viewModel.unreadCount > 0 {
                            Text("\(viewModel.unreadCount)")
                                .font(.caption2.bold())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.red, in: Capsule())
                        }

                        // Mark all read
                        Button {
                            Task { await viewModel.markAllRead() }
                        } label: {
                            Image(systemName: "checkmark.circle")
                        }
                        .disabled(viewModel.unreadCount == 0)
                        .accessibilityLabel("Mark all as read")

                        // Refresh
                        Button {
                            Task { await viewModel.refreshNotifications() }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                        .disabled(viewModel.isLoading)
                        .accessibilityLabel("Refresh notifications")
                    }
                }
            }
        }
        .task {
            await viewModel.start()
        }
        .onDisappear {
            viewModel.stop()
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "bell.slash")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)

            Text("No Notifications")
                .font(.headline)
                .foregroundStyle(.secondary)

            Text("You're all caught up.")
                .font(.subheadline)
                .foregroundStyle(.tertiary)
        }
    }
}

// MARK: - NotificationRow

private struct NotificationRow: View {

    let notification: NotificationItem

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Category colour indicator
            Circle()
                .fill(notification.read ? Color.gray.opacity(0.3) : notification.category.color)
                .frame(width: 8, height: 8)
                .padding(.top, 6)

            VStack(alignment: .leading, spacing: 4) {
                // Title
                Text(notification.title)
                    .font(.subheadline)
                    .fontWeight(notification.read ? .regular : .semibold)
                    .foregroundStyle(notification.read ? .secondary : .primary)
                    .lineLimit(1)

                // Body
                Text(notification.body)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)

                // Footer: time + type badge
                HStack(spacing: 6) {
                    Text(notification.timeAgo)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)

                    Text(notification.typeLabel)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(notification.category.color)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            notification.category.color.opacity(0.12),
                            in: RoundedRectangle(cornerRadius: 4)
                        )
                }
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Preview

#if DEBUG
#Preview {
    NotificationsView()
}
#endif
