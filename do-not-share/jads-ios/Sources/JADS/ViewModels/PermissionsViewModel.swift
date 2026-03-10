// PermissionsViewModel.swift
// JADS
//
// @MainActor ObservableObject that manages the PA lifecycle view.
//
// Responsibilities:
// - Paginated permission list fetching via EgcaServiceProtocol
// - Automatic polling every 30 seconds for pending permissions
// - PA download, share, and flight log upload actions
// - Filter segmentation (Active / Pending / History)
// - Status polling for individual applications
//
// All network calls are routed through EgcaServiceProtocol for testability.

import Foundation
import Combine

// MARK: - PermissionsViewModel

/// ViewModel for the Flight Permissions list and detail views.
///
/// Fetches permissions from the eGCA API with pagination, segments them
/// into Active / Pending / History tabs, and polls for status changes
/// on pending applications.
///
/// All `@Published` properties are updated on `@MainActor`.
@MainActor
final class PermissionsViewModel: ObservableObject {

    // MARK: - Constants

    /// Polling interval for pending permission status updates (30 seconds).
    private static let pollingIntervalSeconds: TimeInterval = 30

    /// Maximum pages to fetch in a single refresh cycle.
    private static let maxPagesToFetch = 10

    // MARK: - Published Properties

    /// All fetched permissions, keyed by application ID for deduplication.
    @Published var permissions: [PermissionArtefact] = []

    /// The currently selected filter segment.
    @Published var selectedFilter: PermissionFilter = .active

    /// Whether a list refresh is in progress.
    @Published var isLoading = false

    /// Whether a PA download is in progress, keyed by application ID.
    @Published var downloadingPAIds: Set<String> = []

    /// Whether a flight log upload is in progress, keyed by application ID.
    @Published var uploadingLogIds: Set<String> = []

    /// Error message from the most recent operation, if any.
    @Published var errorMessage: String?

    /// Success message from the most recent operation, if any.
    @Published var successMessage: String?

    /// The total number of permissions reported by the API.
    @Published var totalPermissions = 0

    /// Whether there are more pages available to load.
    @Published var hasMorePages = false

    // MARK: - Computed Properties

    /// Permissions filtered by the currently selected segment.
    var filteredPermissions: [PermissionArtefact] {
        let matchingStatuses = selectedFilter.matchingStatuses

        return permissions.filter { pa in
            switch selectedFilter {
            case .active:
                // Active = approved AND not expired
                return matchingStatuses.contains(pa.status) && !pa.isExpired
            case .pending:
                // Pending = submitted or pending review
                return matchingStatuses.contains(pa.status)
            case .history:
                // History = rejected, expired, OR approved but expired
                if matchingStatuses.contains(pa.status) {
                    return true
                }
                // Include expired approved PAs in history
                if pa.status == .approved && pa.isExpired {
                    return true
                }
                return false
            }
        }
        .sorted { a, b in
            // Sort by submission date, newest first
            guard let dateA = a.parsedSubmittedAt, let dateB = b.parsedSubmittedAt else {
                return false
            }
            return dateA > dateB
        }
    }

    /// Count of active (approved, non-expired) permissions.
    var activeCount: Int {
        permissions.filter { $0.status == .approved && !$0.isExpired }.count
    }

    /// Count of pending (submitted/pending) permissions.
    var pendingCount: Int {
        permissions.filter { $0.status == .submitted || $0.status == .pending }.count
    }

    /// Count of history (rejected, expired) permissions.
    var historyCount: Int {
        permissions.filter { pa in
            pa.status == .rejected || pa.status == .expired || (pa.status == .approved && pa.isExpired)
        }.count
    }

    // MARK: - Dependencies

    /// The eGCA service used for API calls.
    private let egcaService: any EgcaServiceProtocol

    /// Timer for periodic polling of pending permissions.
    private var pollingTimer: AnyCancellable?

    /// The current page for pagination.
    private var currentPage = 1

    // MARK: - Initialization

    /// Create a new PermissionsViewModel.
    ///
    /// - Parameter egcaService: The eGCA service to use for API calls.
    ///   Defaults to the production ``EgcaService`` singleton.
    init(egcaService: any EgcaServiceProtocol = EgcaService()) {
        self.egcaService = egcaService
    }

    // MARK: - Lifecycle

    /// Start the ViewModel: fetch initial data and begin polling.
    ///
    /// Call this from `.task` in the hosting SwiftUI view.
    func start() async {
        await refreshPermissions()
        startPolling()
    }

    /// Stop polling when the view disappears.
    func stop() {
        stopPolling()
    }

    // MARK: - Data Fetching

    /// Refresh the full list of permissions from the API.
    ///
    /// Fetches all pages and replaces the current list.
    func refreshPermissions() async {
        isLoading = true
        errorMessage = nil
        currentPage = 1

        do {
            var allPermissions: [PermissionArtefact] = []
            var page = 1
            var hasMore = true

            while hasMore && page <= Self.maxPagesToFetch {
                let response = try await egcaService.listMyPermissions(page: page)

                let artefacts = response.items.map { PermissionArtefact(from: $0) }
                allPermissions.append(contentsOf: artefacts)

                hasMore = response.hasNextPage
                totalPermissions = response.total
                page += 1
            }

            // Deduplicate by applicationId (keep the latest)
            var seen = Set<String>()
            var deduplicated: [PermissionArtefact] = []
            for pa in allPermissions {
                if !seen.contains(pa.applicationId) {
                    seen.insert(pa.applicationId)
                    deduplicated.append(pa)
                }
            }

            permissions = deduplicated
            hasMorePages = page <= Self.maxPagesToFetch && allPermissions.count < totalPermissions
            currentPage = page - 1

        } catch {
            errorMessage = (error as? EgcaError)?.userFacingMessage
                ?? "Failed to load permissions: \(error.localizedDescription)"
        }

        isLoading = false
    }

    /// Load the next page of permissions (for infinite scroll).
    func loadNextPage() async {
        guard hasMorePages, !isLoading else { return }

        isLoading = true
        let nextPage = currentPage + 1

        do {
            let response = try await egcaService.listMyPermissions(page: nextPage)

            let newArtefacts = response.items.map { PermissionArtefact(from: $0) }

            // Append only new items (deduplicate)
            let existingIds = Set(permissions.map(\.applicationId))
            let uniqueNew = newArtefacts.filter { !existingIds.contains($0.applicationId) }

            permissions.append(contentsOf: uniqueNew)
            hasMorePages = response.hasNextPage
            currentPage = nextPage

        } catch {
            errorMessage = (error as? EgcaError)?.userFacingMessage
                ?? "Failed to load more permissions: \(error.localizedDescription)"
        }

        isLoading = false
    }

    /// Refresh the status of a single permission by polling the API.
    ///
    /// - Parameter applicationId: The eGCA-assigned application identifier.
    func refreshStatus(for applicationId: String) async {
        do {
            let status = try await egcaService.getPermissionStatus(applicationId: applicationId)

            // Update the permission in our list
            if let index = permissions.firstIndex(where: { $0.applicationId == applicationId }) {
                var updated = permissions[index]
                // Create a new artefact with the updated status
                updated = PermissionArtefact(
                    applicationId: updated.applicationId,
                    uinNumber: updated.uinNumber,
                    pilotBusinessId: updated.pilotBusinessId,
                    flightPurpose: updated.flightPurpose,
                    status: status.status,
                    startDateTime: updated.startDateTime,
                    endDateTime: updated.endDateTime,
                    maxAltitudeInMeters: updated.maxAltitudeInMeters,
                    typeOfOperation: updated.typeOfOperation,
                    flyArea: updated.flyArea,
                    referenceNumber: updated.referenceNumber,
                    submittedAt: updated.submittedAt,
                    updatedAt: status.updatedAt ?? updated.updatedAt,
                    remarks: status.remarks ?? updated.remarks,
                    atcAuthority: updated.atcAuthority,
                    zoneType: updated.zoneType,
                    permissionArtifactId: status.permissionArtifactId ?? updated.permissionArtifactId
                )
                permissions[index] = updated
            }
        } catch {
            // Silent failure for individual status polling --
            // the list will be refreshed on the next full poll cycle.
            #if DEBUG
            print("[PermissionsVM] Status refresh failed for \(applicationId): \(error.localizedDescription)")
            #endif
        }
    }

    // MARK: - PA Download

    /// Download the Permission Artefact ZIP for an approved application.
    ///
    /// The ZIP is saved to local storage via ``PAStorage``.
    ///
    /// - Parameter artefact: The permission artefact to download.
    /// - Returns: The local file URL of the downloaded ZIP, or nil on failure.
    func downloadPA(for artefact: PermissionArtefact) async -> URL? {
        guard artefact.status == .approved else {
            errorMessage = "PA can only be downloaded for approved applications."
            return nil
        }

        downloadingPAIds.insert(artefact.applicationId)
        errorMessage = nil

        do {
            let data = try await egcaService.downloadPermissionArtefact(
                applicationId: artefact.applicationId
            )

            try PAStorage.save(
                pa: data,
                applicationId: artefact.applicationId,
                endDateTime: artefact.parsedEndDateTime
            )

            successMessage = "PA downloaded successfully."
            downloadingPAIds.remove(artefact.applicationId)

            // Return the file URL for sharing
            let cached = PAStorage.listCached()
            return cached.first(where: { $0.applicationId == artefact.applicationId })?.fileURL

        } catch {
            errorMessage = (error as? EgcaError)?.userFacingMessage
                ?? "Failed to download PA: \(error.localizedDescription)"
            downloadingPAIds.remove(artefact.applicationId)
            return nil
        }
    }

    /// Get the local file URL for a cached PA, if it exists.
    ///
    /// - Parameter applicationId: The eGCA-assigned application identifier.
    /// - Returns: The file URL if cached, or nil.
    func cachedPAURL(for applicationId: String) -> URL? {
        let cached = PAStorage.listCached()
        return cached.first(where: { $0.applicationId == applicationId })?.fileURL
    }

    // MARK: - Flight Log Upload

    /// Upload a post-flight log for the given permission.
    ///
    /// - Parameters:
    ///   - artefact: The permission artefact for the completed flight.
    ///   - logData: The flight log data bundle.
    func uploadFlightLog(for artefact: PermissionArtefact, logData: Data) async {
        uploadingLogIds.insert(artefact.applicationId)
        errorMessage = nil

        do {
            try await egcaService.uploadFlightLog(
                applicationId: artefact.applicationId,
                logData: logData
            )

            successMessage = "Flight log uploaded successfully."
        } catch {
            errorMessage = (error as? EgcaError)?.userFacingMessage
                ?? "Failed to upload flight log: \(error.localizedDescription)"
        }

        uploadingLogIds.remove(artefact.applicationId)
    }

    // MARK: - Polling

    /// Start the periodic polling timer for pending permission updates.
    private func startPolling() {
        stopPolling()

        pollingTimer = Timer.publish(
            every: Self.pollingIntervalSeconds,
            on: .main,
            in: .common
        )
        .autoconnect()
        .sink { [weak self] _ in
            guard let self else { return }
            Task { @MainActor [weak self] in
                await self?.pollPendingPermissions()
            }
        }
    }

    /// Stop the polling timer.
    private func stopPolling() {
        pollingTimer?.cancel()
        pollingTimer = nil
    }

    /// Poll status updates for all pending permissions.
    private func pollPendingPermissions() async {
        let pendingIds = permissions
            .filter { !$0.status.isTerminal }
            .map(\.applicationId)

        guard !pendingIds.isEmpty else { return }

        // Poll each pending permission concurrently (max 5 at a time)
        await withTaskGroup(of: Void.self) { group in
            for (index, id) in pendingIds.enumerated() {
                // Limit concurrency to 5
                if index >= 5 {
                    await group.next()
                }
                group.addTask { [weak self] in
                    await self?.refreshStatus(for: id)
                }
            }
        }
    }

    // MARK: - Cleanup

    /// Delete expired PA files from local storage.
    func cleanupExpiredPAs() {
        PAStorage.deleteExpired()
    }
}
