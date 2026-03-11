// PermissionCard.swift
// JADS
//
// A compact card view for displaying a Permission Artefact in a list.
//
// Features:
//   - Left colour stripe (green/yellow/red) based on zone classification
//   - Title showing the drone UIN
//   - Subtitle with the flight window in IST format
//   - Status badge with SF Symbol and text
//   - Context menu: Download PA, Share PA, View Details, Upload Log

import SwiftUI

// MARK: - PermissionCard

/// A card view displaying a single ``PermissionArtefact`` in the permissions list.
///
/// The card features a coloured left stripe indicating the zone type,
/// the drone UIN as the title, the flight window as a subtitle, and
/// a status badge with an appropriate SF Symbol.
///
/// A context menu provides quick actions: Download PA, Share PA,
/// View Details, and Upload Flight Log.
struct PermissionCard: View {

    /// The permission artefact to display.
    let artefact: PermissionArtefact

    /// Whether a PA download is in progress for this artefact.
    let isDownloading: Bool

    /// Whether a flight log upload is in progress for this artefact.
    let isUploadingLog: Bool

    /// Callback invoked when the user selects "Download PA".
    var onDownloadPA: () -> Void

    /// Callback invoked when the user selects "Share PA".
    var onSharePA: () -> Void

    /// Callback invoked when the user selects "View Details".
    var onViewDetails: () -> Void

    /// Callback invoked when the user selects "Upload Log".
    var onUploadLog: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            // Left colour stripe
            zoneStripe

            // Card content
            VStack(alignment: .leading, spacing: 6) {
                // Top row: UIN + status badge
                HStack {
                    Text("UIN: \(artefact.uinNumber)")
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    Spacer()

                    statusBadge
                }

                // Flight window
                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Text(artefact.formattedFlightWindow)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }

                // Bottom row: purpose + operation type
                HStack(spacing: 8) {
                    Label(artefact.flightPurpose, systemImage: "airplane")
                        .font(.caption2)
                        .foregroundColor(.secondary)

                    Text("\u{2022}")
                        .font(.caption2)
                        .foregroundColor(.secondary)

                    Text(artefact.typeOfOperation.displayName)
                        .font(.caption2)
                        .foregroundColor(.secondary)

                    Spacer()

                    // Download indicator
                    if isDownloading {
                        ProgressView()
                            .controlSize(.mini)
                    } else if artefact.isDownloaded {
                        Image(systemName: "arrow.down.circle.fill")
                            .font(.caption)
                            .foregroundColor(.green)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .contextMenu {
            contextMenuItems
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityDescription)
    }

    // MARK: - Zone Stripe

    /// The left colour stripe indicating the zone classification.
    private var zoneStripe: some View {
        Rectangle()
            .fill(zoneColor)
            .frame(width: 5)
    }

    /// The colour for the zone stripe based on the artefact's zone type.
    private var zoneColor: Color {
        guard let zone = artefact.zoneType else {
            // Default to green if zone type is not available
            return Color(UIColor.systemGreen)
        }

        switch zone {
        case .green: return Color(UIColor.systemGreen)
        case .yellow: return Color(UIColor.systemOrange)
        case .red: return Color(UIColor.systemRed)
        }
    }

    // MARK: - Status Badge

    /// A badge showing the current status with an SF Symbol.
    private var statusBadge: some View {
        HStack(spacing: 4) {
            Image(systemName: statusIconName)
                .font(.caption2.weight(.bold))
            Text(artefact.status.displayName)
                .font(.caption2.weight(.semibold))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(statusColor.opacity(0.15))
        .foregroundColor(statusColor)
        .clipShape(Capsule())
    }

    /// The SF Symbol name for the current status.
    private var statusIconName: String {
        switch artefact.status {
        case .submitted:
            return "paperplane.fill"
        case .pending:
            return "clock.fill"
        case .approved:
            return artefact.isExpired ? "clock.badge.exclamationmark" : "checkmark.circle.fill"
        case .rejected:
            return "xmark.circle.fill"
        case .expired:
            return "clock.badge.exclamationmark"
        }
    }

    /// The colour for the status badge.
    private var statusColor: Color {
        switch artefact.status {
        case .submitted:
            return .blue
        case .pending:
            return .orange
        case .approved:
            return artefact.isExpired ? .gray : .green
        case .rejected:
            return .red
        case .expired:
            return .gray
        }
    }

    // MARK: - Context Menu

    @ViewBuilder
    private var contextMenuItems: some View {
        // View Details
        Button {
            onViewDetails()
        } label: {
            Label("View Details", systemImage: "doc.text.magnifyingglass")
        }

        Divider()

        // Download PA (only for approved, non-expired)
        if artefact.status == .approved && !artefact.isExpired {
            Button {
                onDownloadPA()
            } label: {
                Label(
                    artefact.isDownloaded ? "Re-download PA" : "Download PA",
                    systemImage: "arrow.down.doc"
                )
            }
            .disabled(isDownloading)
        }

        // Share PA (only if downloaded)
        if artefact.isDownloaded {
            Button {
                onSharePA()
            } label: {
                Label("Share PA", systemImage: "square.and.arrow.up")
            }
        }

        Divider()

        // Upload Flight Log (only for approved)
        if artefact.status == .approved {
            Button {
                onUploadLog()
            } label: {
                Label("Upload Flight Log", systemImage: "arrow.up.doc")
            }
            .disabled(isUploadingLog)
        }
    }

    // MARK: - Accessibility

    /// Combined accessibility description for the card.
    private var accessibilityDescription: String {
        var parts: [String] = []
        parts.append("Permission for drone \(artefact.uinNumber)")
        parts.append("Status: \(artefact.status.displayName)")
        parts.append("Flight window: \(artefact.formattedFlightWindow)")
        parts.append("Purpose: \(artefact.flightPurpose)")

        if artefact.isDownloaded {
            parts.append("PA downloaded")
        }

        return parts.joined(separator: ". ")
    }
}

// MARK: - Preview

#if DEBUG
struct PermissionCard_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 12) {
            PermissionCard(
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
                    flyArea: [],
                    referenceNumber: "REF-001",
                    submittedAt: "2026-03-08T10:00:00Z",
                    updatedAt: "2026-03-08T12:00:00Z",
                    remarks: nil,
                    atcAuthority: nil,
                    zoneType: .green,
                    permissionArtifactId: "PA-001"
                ),
                isDownloading: false,
                isUploadingLog: false,
                onDownloadPA: {},
                onSharePA: {},
                onViewDetails: {},
                onUploadLog: {}
            )

            PermissionCard(
                artefact: PermissionArtefact(
                    applicationId: "APP-002",
                    uinNumber: "UA-67890-FGHIJ",
                    pilotBusinessId: "PBI-002",
                    flightPurpose: "PHOTOGRAPHY",
                    status: .pending,
                    startDateTime: "10-03-2026 14:00:00",
                    endDateTime: "10-03-2026 15:00:00",
                    maxAltitudeInMeters: 60,
                    typeOfOperation: .bvlos,
                    flyArea: [],
                    referenceNumber: nil,
                    submittedAt: "2026-03-09T08:00:00Z",
                    updatedAt: "2026-03-09T08:00:00Z",
                    remarks: nil,
                    atcAuthority: "AAI",
                    zoneType: .yellow,
                    permissionArtifactId: nil
                ),
                isDownloading: false,
                isUploadingLog: false,
                onDownloadPA: {},
                onSharePA: {},
                onViewDetails: {},
                onUploadLog: {}
            )

            PermissionCard(
                artefact: PermissionArtefact(
                    applicationId: "APP-003",
                    uinNumber: "UA-11111-KLMNO",
                    pilotBusinessId: "PBI-003",
                    flightPurpose: "DELIVERY",
                    status: .rejected,
                    startDateTime: "07-03-2026 09:00:00",
                    endDateTime: "07-03-2026 10:00:00",
                    maxAltitudeInMeters: 30,
                    typeOfOperation: .vlos,
                    flyArea: [],
                    referenceNumber: "REF-003",
                    submittedAt: "2026-03-06T10:00:00Z",
                    updatedAt: "2026-03-07T14:00:00Z",
                    remarks: "Rejected: restricted military airspace",
                    atcAuthority: "IAF",
                    zoneType: .red,
                    permissionArtifactId: nil
                ),
                isDownloading: false,
                isUploadingLog: false,
                onDownloadPA: {},
                onSharePA: {},
                onViewDetails: {},
                onUploadLog: {}
            )
        }
        .padding()
    }
}
#endif
