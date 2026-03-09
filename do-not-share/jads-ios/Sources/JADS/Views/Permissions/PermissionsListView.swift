// PermissionsListView.swift
// JADS
//
// Main PA lifecycle list view showing all flight permissions
// segmented by Active / Pending / History.
//
// Features:
//   - NavigationStack with title "Flight Permissions"
//   - Segmented picker: Active | Pending | History
//   - Each segment shows a List of PermissionCard views
//   - Pull-to-refresh for manual reload
//   - Automatic polling via PermissionsViewModel
//   - Navigation to PermissionDetailView on card tap

import SwiftUI

// MARK: - PermissionsListView

/// The main Flight Permissions list screen.
///
/// Displays a segmented view of all permission artefacts, organized
/// into Active, Pending, and History tabs. Each permission is rendered
/// as a ``PermissionCard`` with context menu actions.
///
/// Uses `@StateObject` ``PermissionsViewModel`` for data management
/// and automatic polling of pending permission status updates.
struct PermissionsListView: View {

    @StateObject private var viewModel = PermissionsViewModel()

    /// Controls presentation of the file importer for flight log upload.
    @State private var showLogImporter = false

    /// The application ID for which a flight log upload is pending.
    @State private var logUploadTargetId: String?

    /// The artefact selected for detail navigation.
    @State private var selectedArtefact: PermissionArtefact?

    /// The PA file URL to share via the share sheet.
    @State private var shareURL: URL?

    /// Whether the share sheet is presented.
    @State private var showShareSheet = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Segmented picker
                segmentedPicker

                // Permission list
                permissionList
            }
            .navigationTitle("Flight Permissions")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await viewModel.refreshPermissions() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(viewModel.isLoading)
                    .accessibilityLabel("Refresh permissions")
                }
            }
            .navigationDestination(item: $selectedArtefact) { artefact in
                PermissionDetailView(
                    artefact: artefact,
                    viewModel: viewModel
                )
            }
        }
        .task {
            await viewModel.start()
        }
        .onDisappear {
            viewModel.stop()
        }
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
        .alert("Error", isPresented: .init(
            get: { viewModel.errorMessage != nil },
            set: { if !$0 { viewModel.errorMessage = nil } }
        )) {
            Button("OK") { viewModel.errorMessage = nil }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        .alert("Success", isPresented: .init(
            get: { viewModel.successMessage != nil },
            set: { if !$0 { viewModel.successMessage = nil } }
        )) {
            Button("OK") { viewModel.successMessage = nil }
        } message: {
            Text(viewModel.successMessage ?? "")
        }
    }

    // MARK: - Segmented Picker

    private var segmentedPicker: some View {
        Picker("Filter", selection: $viewModel.selectedFilter) {
            ForEach(PermissionFilter.allCases) { filter in
                HStack(spacing: 4) {
                    Text(filter.rawValue)
                    Text(badgeCount(for: filter))
                        .font(.caption2)
                }
                .tag(filter)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    /// Badge count string for a filter segment.
    private func badgeCount(for filter: PermissionFilter) -> String {
        let count: Int
        switch filter {
        case .active: count = viewModel.activeCount
        case .pending: count = viewModel.pendingCount
        case .history: count = viewModel.historyCount
        }
        return count > 0 ? "(\(count))" : ""
    }

    // MARK: - Permission List

    private var permissionList: some View {
        Group {
            if viewModel.isLoading && viewModel.permissions.isEmpty {
                // Initial loading state
                VStack(spacing: 16) {
                    Spacer()
                    ProgressView()
                        .controlSize(.large)
                    Text("Loading permissions...")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else if viewModel.filteredPermissions.isEmpty {
                // Empty state
                emptyState
            } else {
                // Permission cards list
                List {
                    ForEach(viewModel.filteredPermissions) { artefact in
                        PermissionCard(
                            artefact: artefact,
                            isDownloading: viewModel.downloadingPAIds.contains(artefact.applicationId),
                            isUploadingLog: viewModel.uploadingLogIds.contains(artefact.applicationId),
                            onDownloadPA: {
                                Task { await viewModel.downloadPA(for: artefact) }
                            },
                            onSharePA: {
                                sharePA(for: artefact)
                            },
                            onViewDetails: {
                                selectedArtefact = artefact
                            },
                            onUploadLog: {
                                logUploadTargetId = artefact.applicationId
                                showLogImporter = true
                            }
                        )
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                        .onTapGesture {
                            selectedArtefact = artefact
                        }
                    }

                    // Load more indicator
                    if viewModel.hasMorePages {
                        HStack {
                            Spacer()
                            ProgressView()
                                .controlSize(.small)
                            Text("Loading more...")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Spacer()
                        }
                        .listRowSeparator(.hidden)
                        .onAppear {
                            Task { await viewModel.loadNextPage() }
                        }
                    }
                }
                .listStyle(.plain)
                .refreshable {
                    await viewModel.refreshPermissions()
                }
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: emptyStateIcon)
                .font(.system(size: 48))
                .foregroundColor(.secondary.opacity(0.6))

            Text(emptyStateTitle)
                .font(.headline)
                .foregroundColor(.primary)

            Text(emptyStateSubtitle)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var emptyStateIcon: String {
        switch viewModel.selectedFilter {
        case .active: return "checkmark.circle"
        case .pending: return "clock"
        case .history: return "archivebox"
        }
    }

    private var emptyStateTitle: String {
        switch viewModel.selectedFilter {
        case .active: return "No Active Permissions"
        case .pending: return "No Pending Applications"
        case .history: return "No History"
        }
    }

    private var emptyStateSubtitle: String {
        switch viewModel.selectedFilter {
        case .active: return "Approved flight permissions will appear here. Submit a new flight plan to get started."
        case .pending: return "Applications awaiting review will appear here."
        case .history: return "Expired and rejected permissions will appear here."
        }
    }

    // MARK: - Actions

    /// Share the cached PA ZIP file for the given artefact.
    private func sharePA(for artefact: PermissionArtefact) {
        if let url = viewModel.cachedPAURL(for: artefact.applicationId) {
            shareURL = url
            showShareSheet = true
        } else {
            // Download first, then share
            Task {
                if let url = await viewModel.downloadPA(for: artefact) {
                    shareURL = url
                    showShareSheet = true
                }
            }
        }
    }

    /// Handle the result of the file importer for flight log upload.
    private func handleLogFileImport(result: Result<[URL], Error>) {
        guard let targetId = logUploadTargetId,
              let artefact = viewModel.permissions.first(where: { $0.applicationId == targetId }) else {
            return
        }

        switch result {
        case .success(let urls):
            guard let fileURL = urls.first else { return }

            // Read the file data
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
            viewModel.errorMessage = "File selection cancelled: \(error.localizedDescription)"
        }

        logUploadTargetId = nil
    }
}

// MARK: - ShareSheet (UIActivityViewController Wrapper)

/// UIViewControllerRepresentable wrapping UIActivityViewController for sharing.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Preview

#if DEBUG
struct PermissionsListView_Previews: PreviewProvider {
    static var previews: some View {
        PermissionsListView()
    }
}
#endif
