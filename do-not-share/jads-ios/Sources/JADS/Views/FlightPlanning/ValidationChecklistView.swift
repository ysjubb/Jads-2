// ValidationChecklistView.swift
// JADS
//
// P36 Pre-Submission Validation Checklist for iOS.
//
// Displays the results of POST /api/drone/validate-flight-plan
// grouped into three List sections:
//   1. Required Checks  -- must all pass before submission
//   2. Advisories       -- warnings with Toggle for acknowledgement
//   3. Information       -- read-only context items
//
// Bottom button: "Submit to eGCA" enabled when all required checks pass
// and all advisory warnings are either passed or acknowledged.
//
// Uses @ObservedObject FlightPlanViewModel for state management,
// consistent with YellowZoneSubmissionSheet.swift.

import SwiftUI

// MARK: - ValidationChecklistView

/// Pre-submission validation checklist screen.
///
/// Displays validation results from the backend, allows the operator
/// to acknowledge advisory warnings, and gates eGCA submission on
/// full readiness.
struct ValidationChecklistView: View {

    @ObservedObject var viewModel: FlightPlanViewModel
    @Environment(\.dismiss) private var dismiss

    /// Tracks whether the submission success alert is visible.
    @State private var showSuccessAlert = false

    /// The application ID returned after successful submission.
    @State private var submittedApplicationId: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Main checklist content
                checklistContent

                // Bottom submission bar
                submissionBar
            }
            .navigationTitle("Pre-Submission Checklist")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Back") { dismiss() }
                }
            }
        }
        .task {
            await viewModel.runValidation()
        }
        .alert("Submission Successful", isPresented: $showSuccessAlert) {
            Button("OK") { dismiss() }
        } message: {
            Text("Application ID: \(submittedApplicationId ?? "N/A")\n\nYour flight plan has been submitted to eGCA for processing.")
        }
        .alert("Submission Failed", isPresented: .init(
            get: { viewModel.validationSubmitError != nil },
            set: { if !$0 { viewModel.validationSubmitError = nil } }
        )) {
            Button("OK") { viewModel.validationSubmitError = nil }
        } message: {
            Text(viewModel.validationSubmitError ?? "")
        }
    }

    // MARK: - Checklist Content

    @ViewBuilder
    private var checklistContent: some View {
        if viewModel.isValidating {
            loadingState
        } else if let error = viewModel.validationError {
            errorState(message: error)
        } else if viewModel.failures.isEmpty && viewModel.warnings.isEmpty && viewModel.infoItems.isEmpty {
            emptyState
        } else {
            List {
                // Section 1: Required Checks
                if !viewModel.failures.isEmpty {
                    Section {
                        ForEach(viewModel.failures) { item in
                            ValidationItemRow(
                                item: item,
                                isAcknowledged: false,
                                onToggle: nil
                            )
                        }
                    } header: {
                        Label("Required Checks", systemImage: "exclamationmark.shield.fill")
                    }
                }

                // Section 2: Advisories
                if !viewModel.warnings.isEmpty {
                    Section {
                        ForEach(viewModel.warnings) { item in
                            let isAcked = viewModel.acknowledgedWarnings.contains(item.code)
                            ValidationItemRow(
                                item: item,
                                isAcknowledged: isAcked,
                                onToggle: item.passed ? nil : {
                                    viewModel.acknowledge(item.code)
                                }
                            )
                        }
                    } header: {
                        Label("Advisories", systemImage: "exclamationmark.triangle.fill")
                    }
                }

                // Section 3: Information
                if !viewModel.infoItems.isEmpty {
                    Section {
                        ForEach(viewModel.infoItems) { item in
                            ValidationItemRow(
                                item: item,
                                isAcknowledged: false,
                                onToggle: nil
                            )
                        }
                    } header: {
                        Label("Information", systemImage: "info.circle.fill")
                    }
                }
            }
            .listStyle(.insetGrouped)
        }
    }

    // MARK: - Submission Bar

    private var submissionBar: some View {
        VStack(spacing: 8) {
            Divider()

            // Progress text
            let totalChecks = viewModel.failures.count + viewModel.warnings.count + viewModel.infoItems.count
            let passedChecks = viewModel.validationPassedCount
            Text("\(passedChecks) of \(totalChecks) checks passed")
                .font(.subheadline)
                .foregroundColor(viewModel.isReadyToSubmit ? .green : .secondary)

            // Progress bar
            ProgressView(value: totalChecks > 0 ? Double(passedChecks) / Double(totalChecks) : 0)
                .tint(viewModel.isReadyToSubmit ? .green : .orange)
                .padding(.horizontal, 16)

            // Submit button
            Button {
                Task {
                    let appId = await viewModel.submitValidatedPlan()
                    if let appId {
                        submittedApplicationId = appId
                        showSuccessAlert = true
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    if viewModel.isSubmittingValidation {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.black)
                    } else {
                        Image(systemName: "paperplane.fill")
                    }
                    Text(viewModel.isSubmittingValidation ? "Submitting..." : "Submit to eGCA")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 1.0, green: 0.72, blue: 0.0)) // JADS Amber
            .foregroundColor(.black)
            .disabled(!viewModel.isReadyToSubmit || viewModel.isSubmittingValidation)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .background(.ultraThinMaterial)
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: 16) {
            Spacer()
            ProgressView()
                .controlSize(.large)
            Text("Running pre-submission checks...")
                .font(.subheadline)
                .foregroundColor(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Error State

    private func errorState(message: String) -> some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(.red)
            Text("Validation Failed")
                .font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Button {
                Task { await viewModel.runValidation() }
            } label: {
                Label("Retry", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.bordered)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "checklist")
                .font(.system(size: 48))
                .foregroundColor(.secondary.opacity(0.6))
            Text("No Checks Available")
                .font(.headline)
            Text("Submit a flight plan to run pre-submission validation.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - ValidationItemRow

/// A single validation check row within the checklist.
///
/// Displays:
/// - SF Symbol status icon (colour-coded by severity and pass/fail state)
/// - Check name and description
/// - Remediation hint when the check has failed
/// - Toggle for acknowledging advisory warnings
struct ValidationItemRow: View {

    let item: ValidationItem
    let isAcknowledged: Bool
    let onToggle: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Status icon
            Image(systemName: item.statusIconName(acknowledged: isAcknowledged))
                .font(.title3)
                .foregroundColor(colorForStatus(item.statusColor(acknowledged: isAcknowledged)))
                .frame(width: 28, height: 28)

            // Content
            VStack(alignment: .leading, spacing: 4) {
                Text(item.name)
                    .font(.subheadline)
                    .fontWeight(.semibold)

                Text(item.description)
                    .font(.caption)
                    .foregroundColor(.secondary)

                // Remediation hint for failed items
                if !item.passed, let remediation = item.remediation {
                    HStack(alignment: .top, spacing: 4) {
                        Image(systemName: "lightbulb.fill")
                            .font(.caption2)
                            .foregroundColor(.orange)
                        Text(remediation)
                            .font(.caption2)
                            .foregroundColor(.orange)
                    }
                    .padding(.top, 2)
                }
            }

            Spacer()

            // Toggle for advisory warnings
            if let onToggle, item.severity == .advisory && !item.passed {
                Toggle(isOn: .init(
                    get: { isAcknowledged },
                    set: { _ in onToggle() }
                )) {
                    EmptyView()
                }
                .labelsHidden()
                .tint(.orange)
            }
        }
        .padding(.vertical, 4)
    }

    /// Map StatusColor to SwiftUI Color.
    private func colorForStatus(_ status: StatusColor) -> Color {
        switch status {
        case .red:   return .red
        case .amber: return .orange
        case .green: return .green
        case .blue:  return .blue
        }
    }
}

// MARK: - Preview

#if DEBUG
struct ValidationChecklistView_Previews: PreviewProvider {
    static var previews: some View {
        ValidationChecklistView(viewModel: FlightPlanViewModel())
    }
}
#endif
