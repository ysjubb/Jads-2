// PermissionDetailView.swift
// JADS
//
// Detailed view for a single Permission Artefact.
//
// Features:
//   - ScrollView with multiple sections
//   - "Permitted Area" polygon drawn via SwiftUI Path
//   - "Time Window" with live countdown timer
//   - "Status Timeline" (VStack + vertical lines)
//   - "Actions" section with Download PA, Share PA, Upload Flight Log
//   - Download PA: async button with progress indicator
//   - Share PA: via ShareLink (UIActivityViewController)
//   - Upload Flight Log: via fileImporter

import SwiftUI

// MARK: - PermissionDetailView

/// Detail view showing full information about a single ``PermissionArtefact``.
///
/// Displays the permitted area polygon, time window with countdown,
/// a status timeline, and action buttons for PA download, sharing,
/// and flight log upload.
struct PermissionDetailView: View {

    /// The permission artefact being displayed.
    let artefact: PermissionArtefact

    /// The shared PermissionsViewModel for performing actions.
    @ObservedObject var viewModel: PermissionsViewModel

    /// Timer for updating the countdown display.
    @State private var countdownText = ""

    /// Timer publisher for the countdown.
    @State private var timer: Timer? = nil

    /// Controls visibility of the flight log file importer.
    @State private var showLogImporter = false

    /// URL of the downloaded PA for sharing.
    @State private var shareURL: URL?

    /// Whether the share sheet is presented.
    @State private var showShareSheet = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header card
                headerCard

                // Permitted Area polygon
                permittedAreaSection

                // Time Window with countdown
                timeWindowSection

                // Status Timeline
                statusTimelineSection

                // Flight Details
                flightDetailsSection

                // Actions
                actionsSection
            }
            .padding(16)
        }
        .navigationTitle("Permission Details")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { startCountdown() }
        .onDisappear { stopCountdown() }
        .fileImporter(
            isPresented: $showLogImporter,
            allowedContentTypes: [.data],
            allowsMultipleSelection: false
        ) { result in
            handleLogFileImport(result: result)
        }
        .sheet(isPresented: $showShareSheet) {
            if let shareURL {
                ShareSheet(items: [shareURL])
            }
        }
    }

    // MARK: - Header Card

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("UIN: \(artefact.uinNumber)")
                        .font(.title3.weight(.bold))

                    if let ref = artefact.referenceNumber {
                        Text("Ref: \(ref)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                Spacer()

                // Status badge
                HStack(spacing: 4) {
                    Image(systemName: statusIconName)
                        .font(.body.weight(.bold))
                    Text(artefact.status.displayName)
                        .font(.subheadline.weight(.semibold))
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(statusColor.opacity(0.15))
                .foregroundColor(statusColor)
                .clipShape(Capsule())
            }

            // Application ID
            HStack(spacing: 4) {
                Text("Application ID:")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(artefact.applicationId)
                    .font(.caption.monospaced())
                    .foregroundColor(.secondary)
            }
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Permitted Area Section

    private var permittedAreaSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Permitted Area", systemImage: "map")
                .font(.headline)

            if artefact.flyArea.count >= 3 {
                // Draw the polygon using SwiftUI Path
                GeometryReader { geometry in
                    polygonPath(in: geometry.size)
                        .stroke(polygonStrokeColor, lineWidth: 2)
                        .background(
                            polygonPath(in: geometry.size)
                                .fill(polygonFillColor)
                        )
                }
                .frame(height: 200)
                .background(Color(.tertiarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                )

                // Vertex count
                Text("\(artefact.flyArea.count) vertices")
                    .font(.caption)
                    .foregroundColor(.secondary)
            } else {
                Text("Polygon data not available")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color(.tertiarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    /// Build a SwiftUI Path for the permitted area polygon.
    ///
    /// Normalizes coordinates to fit within the given size with padding.
    private func polygonPath(in size: CGSize) -> Path {
        let coords = artefact.flyArea
        guard coords.count >= 3 else { return Path() }

        let padding: CGFloat = 20

        // Find bounds
        let lats = coords.map(\.latitude)
        let lngs = coords.map(\.longitude)
        let minLat = lats.min() ?? 0
        let maxLat = lats.max() ?? 0
        let minLng = lngs.min() ?? 0
        let maxLng = lngs.max() ?? 0

        let latRange = max(maxLat - minLat, 0.0001)
        let lngRange = max(maxLng - minLng, 0.0001)

        let drawWidth = size.width - 2 * padding
        let drawHeight = size.height - 2 * padding

        // Scale to fit, maintaining aspect ratio
        let scale = min(drawWidth / lngRange, drawHeight / latRange)

        // Center the polygon
        let scaledWidth = lngRange * scale
        let scaledHeight = latRange * scale
        let offsetX = padding + (drawWidth - scaledWidth) / 2
        let offsetY = padding + (drawHeight - scaledHeight) / 2

        return Path { path in
            for (index, coord) in coords.enumerated() {
                let x = offsetX + (coord.longitude - minLng) * scale
                // Invert Y axis (latitude increases upward, but screen Y increases downward)
                let y = offsetY + (maxLat - coord.latitude) * scale

                if index == 0 {
                    path.move(to: CGPoint(x: x, y: y))
                } else {
                    path.addLine(to: CGPoint(x: x, y: y))
                }
            }
            path.closeSubpath()
        }
    }

    /// Stroke colour for the polygon, based on zone type.
    private var polygonStrokeColor: Color {
        guard let zone = artefact.zoneType else { return .blue }
        switch zone {
        case .green: return Color(UIColor.systemGreen)
        case .yellow: return Color(UIColor.systemOrange)
        case .red: return Color(UIColor.systemRed)
        }
    }

    /// Fill colour for the polygon, based on zone type.
    private var polygonFillColor: Color {
        guard let zone = artefact.zoneType else { return .blue.opacity(0.1) }
        switch zone {
        case .green: return Color(UIColor.systemGreen).opacity(0.15)
        case .yellow: return Color(UIColor.systemOrange).opacity(0.15)
        case .red: return Color(UIColor.systemRed).opacity(0.15)
        }
    }

    // MARK: - Time Window Section

    private var timeWindowSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Time Window", systemImage: "clock")
                .font(.headline)

            VStack(spacing: 12) {
                // Flight window times
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Start")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(formatDateIST(artefact.parsedStartDateTime))
                            .font(.subheadline.weight(.medium))
                    }

                    Spacer()

                    Image(systemName: "arrow.right")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Spacer()

                    VStack(alignment: .trailing, spacing: 4) {
                        Text("End")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(formatDateIST(artefact.parsedEndDateTime))
                            .font(.subheadline.weight(.medium))
                    }
                }

                Divider()

                // Countdown
                HStack {
                    Image(systemName: countdownIcon)
                        .font(.title2)
                        .foregroundColor(countdownColor)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(countdownLabel)
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(countdownText)
                            .font(.title3.weight(.bold).monospacedDigit())
                            .foregroundColor(countdownColor)
                    }

                    Spacer()
                }
            }
            .padding(16)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    /// Icon for the countdown timer based on state.
    private var countdownIcon: String {
        if artefact.isExpired {
            return "clock.badge.exclamationmark"
        } else if artefact.isActive {
            return "timer"
        } else {
            return "clock.badge.checkmark"
        }
    }

    /// Label for the countdown timer.
    private var countdownLabel: String {
        if artefact.isExpired {
            return "Expired"
        } else if artefact.isActive {
            return "Time Remaining"
        } else {
            return "Starts In"
        }
    }

    /// Colour for the countdown display.
    private var countdownColor: Color {
        if artefact.isExpired {
            return .gray
        } else if artefact.isActive {
            if let remaining = artefact.timeRemaining, remaining < 600 {
                return .red // Less than 10 minutes
            }
            return .green
        } else {
            return .blue
        }
    }

    // MARK: - Status Timeline Section

    private var statusTimelineSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Status Timeline", systemImage: "list.bullet")
                .font(.headline)

            VStack(alignment: .leading, spacing: 0) {
                // Submitted
                timelineEntry(
                    title: "Submitted",
                    date: artefact.parsedSubmittedAt,
                    icon: "paperplane.fill",
                    color: .blue,
                    isCompleted: true,
                    isLast: artefact.status == .submitted
                )

                // Pending Review
                if artefact.status != .submitted {
                    timelineEntry(
                        title: "Pending Review",
                        date: artefact.status == .pending ? artefact.parsedUpdatedAt : artefact.parsedSubmittedAt,
                        icon: "clock.fill",
                        color: .orange,
                        isCompleted: artefact.status != .pending,
                        isLast: artefact.status == .pending
                    )
                }

                // Terminal state
                if artefact.status.isTerminal {
                    timelineEntry(
                        title: terminalStatusTitle,
                        date: artefact.parsedUpdatedAt,
                        icon: terminalStatusIcon,
                        color: terminalStatusColor,
                        isCompleted: true,
                        isLast: true
                    )
                }

                // Remarks
                if let remarks = artefact.remarks, !remarks.isEmpty {
                    HStack(alignment: .top, spacing: 12) {
                        // Vertical line connector
                        Rectangle()
                            .fill(Color.clear)
                            .frame(width: 24)

                        VStack(alignment: .leading, spacing: 4) {
                            Text("Remarks")
                                .font(.caption.weight(.semibold))
                                .foregroundColor(.secondary)
                            Text(remarks)
                                .font(.caption)
                                .foregroundColor(.primary)
                        }
                        .padding(10)
                        .background(Color(.tertiarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .padding(.leading, 4)
                }
            }
            .padding(16)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    /// A single entry in the status timeline.
    private func timelineEntry(
        title: String,
        date: Date?,
        icon: String,
        color: Color,
        isCompleted: Bool,
        isLast: Bool
    ) -> some View {
        HStack(alignment: .top, spacing: 12) {
            // Timeline indicator (dot + line)
            VStack(spacing: 0) {
                // Dot
                ZStack {
                    Circle()
                        .fill(isCompleted ? color : Color.secondary.opacity(0.3))
                        .frame(width: 24, height: 24)
                    Image(systemName: icon)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                }

                // Connecting line
                if !isLast {
                    Rectangle()
                        .fill(color.opacity(0.3))
                        .frame(width: 2, height: 24)
                }
            }

            // Content
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(isCompleted ? .primary : .secondary)

                if let date {
                    Text(formatDateIST(date))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.bottom, isLast ? 0 : 8)

            Spacer()
        }
    }

    /// Title for the terminal status in the timeline.
    private var terminalStatusTitle: String {
        switch artefact.status {
        case .approved: return "Approved"
        case .rejected: return "Rejected"
        case .expired: return "Expired"
        default: return artefact.status.displayName
        }
    }

    /// Icon for the terminal status in the timeline.
    private var terminalStatusIcon: String {
        switch artefact.status {
        case .approved: return "checkmark"
        case .rejected: return "xmark"
        case .expired: return "clock.badge.exclamationmark"
        default: return "questionmark"
        }
    }

    /// Colour for the terminal status in the timeline.
    private var terminalStatusColor: Color {
        switch artefact.status {
        case .approved: return .green
        case .rejected: return .red
        case .expired: return .gray
        default: return .secondary
        }
    }

    // MARK: - Flight Details Section

    private var flightDetailsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Flight Details", systemImage: "airplane")
                .font(.headline)

            VStack(spacing: 8) {
                detailRow("Purpose", artefact.flightPurpose)
                detailRow("Operation Type", artefact.typeOfOperation.displayName)
                detailRow("Max Altitude", "\(Int(artefact.maxAltitudeInMeters))m AGL")

                if let zone = artefact.zoneType {
                    detailRow("Zone", zone.displayName)
                }

                if let authority = artefact.atcAuthority {
                    detailRow("ATC Authority", authority)
                }

                detailRow("Pilot ID", artefact.pilotBusinessId)
            }
            .padding(16)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    /// A single key-value detail row.
    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .frame(width: 130, alignment: .leading)
            Text(value)
                .font(.subheadline.weight(.medium))
                .foregroundColor(.primary)
            Spacer()
        }
    }

    // MARK: - Actions Section

    private var actionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Actions", systemImage: "hand.tap")
                .font(.headline)

            VStack(spacing: 10) {
                // Download PA button
                if artefact.status == .approved && !artefact.isExpired {
                    Button {
                        Task {
                            let url = await viewModel.downloadPA(for: artefact)
                            if url != nil {
                                // PA downloaded successfully
                            }
                        }
                    } label: {
                        HStack {
                            if viewModel.downloadingPAIds.contains(artefact.applicationId) {
                                ProgressView()
                                    .controlSize(.small)
                                    .tint(.white)
                            } else {
                                Image(systemName: "arrow.down.doc.fill")
                            }
                            Text(artefact.isDownloaded ? "Re-download PA" : "Download PA")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(viewModel.downloadingPAIds.contains(artefact.applicationId))
                }

                // Share PA button
                if artefact.isDownloaded {
                    Button {
                        if let url = viewModel.cachedPAURL(for: artefact.applicationId) {
                            shareURL = url
                            showShareSheet = true
                        }
                    } label: {
                        HStack {
                            Image(systemName: "square.and.arrow.up")
                            Text("Share PA")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }

                // Upload Flight Log button
                if artefact.status == .approved {
                    Button {
                        showLogImporter = true
                    } label: {
                        HStack {
                            if viewModel.uploadingLogIds.contains(artefact.applicationId) {
                                ProgressView()
                                    .controlSize(.small)
                            } else {
                                Image(systemName: "arrow.up.doc.fill")
                            }
                            Text("Upload Flight Log")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .disabled(viewModel.uploadingLogIds.contains(artefact.applicationId))
                }
            }
        }
    }

    // MARK: - Countdown Timer

    /// Start the countdown timer that updates every second.
    private func startCountdown() {
        updateCountdown()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            Task { @MainActor in
                updateCountdown()
            }
        }
    }

    /// Stop the countdown timer.
    private func stopCountdown() {
        timer?.invalidate()
        timer = nil
    }

    /// Update the countdown text based on the current time.
    private func updateCountdown() {
        if artefact.isExpired {
            countdownText = "Flight window has ended"
        } else if artefact.isActive {
            if let remaining = artefact.timeRemaining {
                countdownText = formatTimeInterval(remaining)
            } else {
                countdownText = "--:--:--"
            }
        } else if let until = artefact.timeUntilStart {
            countdownText = formatTimeInterval(until)
        } else {
            countdownText = "--:--:--"
        }
    }

    /// Format a time interval as "HH:mm:ss" or "Xd HH:mm:ss".
    private func formatTimeInterval(_ interval: TimeInterval) -> String {
        let totalSeconds = Int(interval)
        let days = totalSeconds / 86400
        let hours = (totalSeconds % 86400) / 3600
        let minutes = (totalSeconds % 3600) / 60
        let seconds = totalSeconds % 60

        if days > 0 {
            return String(format: "%dd %02d:%02d:%02d", days, hours, minutes, seconds)
        } else {
            return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
        }
    }

    // MARK: - Date Formatting

    /// Format a Date as IST: "dd MMM yyyy, HH:mm".
    private func formatDateIST(_ date: Date?) -> String {
        guard let date else { return "N/A" }
        let formatter = DateFormatter()
        formatter.dateFormat = "dd MMM yyyy, HH:mm"
        formatter.timeZone = TimeZone(identifier: "Asia/Kolkata")
        return formatter.string(from: date) + " IST"
    }

    // MARK: - Status Helpers

    private var statusIconName: String {
        switch artefact.status {
        case .submitted: return "paperplane.fill"
        case .pending: return "clock.fill"
        case .approved: return artefact.isExpired ? "clock.badge.exclamationmark" : "checkmark.circle.fill"
        case .rejected: return "xmark.circle.fill"
        case .expired: return "clock.badge.exclamationmark"
        }
    }

    private var statusColor: Color {
        switch artefact.status {
        case .submitted: return .blue
        case .pending: return .orange
        case .approved: return artefact.isExpired ? .gray : .green
        case .rejected: return .red
        case .expired: return .gray
        }
    }

    // MARK: - File Import Handler

    private func handleLogFileImport(result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let fileURL = urls.first else { return }

            guard fileURL.startAccessingSecurityScopedResource() else {
                viewModel.errorMessage = "Unable to access the selected file."
                return
            }

            defer { fileURL.stopAccessingSecurityScopedResource() }

            do {
                let logData = try Data(contentsOf: fileURL)
                Task {
                    await viewModel.uploadFlightLog(for: artefact, logData: logData)
                }
            } catch {
                viewModel.errorMessage = "Failed to read the log file: \(error.localizedDescription)"
            }

        case .failure(let error):
            viewModel.errorMessage = "File selection failed: \(error.localizedDescription)"
        }
    }
}

// MARK: - Preview

#if DEBUG
struct PermissionDetailView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationStack {
            PermissionDetailView(
                artefact: PermissionArtefact(
                    applicationId: "APP-001",
                    uinNumber: "UA-12345-ABCDE",
                    pilotBusinessId: "PBI-001",
                    flightPurpose: "SURVEY",
                    status: .approved,
                    startDateTime: "09-03-2026 10:00:00",
                    endDateTime: "09-03-2026 11:30:00",
                    maxAltitudeInMeters: 120,
                    typeOfOperation: .vlos,
                    flyArea: [
                        LatLng(latitude: 28.6139, longitude: 77.2090),
                        LatLng(latitude: 28.6200, longitude: 77.2090),
                        LatLng(latitude: 28.6200, longitude: 77.2150),
                        LatLng(latitude: 28.6139, longitude: 77.2150)
                    ],
                    referenceNumber: "REF-2026-001",
                    submittedAt: "2026-03-08T10:00:00Z",
                    updatedAt: "2026-03-08T12:00:00Z",
                    remarks: "Approved for survey operations within the defined area.",
                    atcAuthority: "AAI",
                    zoneType: .green,
                    permissionArtifactId: "PA-001"
                ),
                viewModel: PermissionsViewModel()
            )
        }
    }
}
#endif
