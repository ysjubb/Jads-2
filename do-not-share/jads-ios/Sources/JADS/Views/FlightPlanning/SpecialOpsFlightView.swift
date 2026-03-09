// SpecialOpsFlightView.swift
// JADS
//
// Multi-step flight planning form for BVLOS / Rule 70 exemption operations.
//
// Presented for Medium category drones and any operation requiring
// DGCA Rule 70 exemption (BVLOS, night ops, swarm operations).
//
// Steps:
//   1. Operation Details — exemption type, narrative, capabilities
//   2. Document Upload — SAF (Safety Assessment Form) PDF upload
//   3. Review & Submit — summary and eGCA submission
//
// Uses FlightPlanViewModel for map/zone state and adds its own
// @State properties for special-ops-specific fields.

import SwiftUI
import UniformTypeIdentifiers

// MARK: - SpecialOpsFlightView

/// Multi-step flight planning form for BVLOS and Rule 70 exemption operations.
///
/// Provides document upload capabilities for the Safety Assessment Form (SAF)
/// required under DGCA Rule 70 for special operations.
struct SpecialOpsFlightView: View {

    @ObservedObject var viewModel: FlightPlanViewModel

    @Binding var polygon: [LatLng]
    @Binding var altitude: Double
    @Binding var startTime: Date
    @Binding var endTime: Date

    let userProfile: UserProfile

    // Step navigation
    @State private var currentStep = 0

    // Operation details
    @State private var exemptionType: ExemptionType = .rule70
    @State private var operationNarrative: String = ""
    @State private var rthCapability = false
    @State private var geoFencing = false
    @State private var daaSystem = false

    // Document upload
    @State private var safDocumentURL: URL?
    @State private var safFileName: String?
    @State private var showFilePicker = false

    // Declaration & submission
    @State private var selfDeclared = false
    @State private var isSubmitting = false
    @State private var showSuccessAlert = false
    @State private var submissionError: String?

    private let totalSteps = 3

    var body: some View {
        VStack(spacing: 0) {
            // Step indicators
            stepIndicators

            // Step content
            TabView(selection: $currentStep) {
                operationDetailsStep.tag(0)
                documentUploadStep.tag(1)
                reviewSubmitStep.tag(2)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.easeInOut(duration: 0.3), value: currentStep)
        }
        .navigationTitle("Special Operations")
        .navigationBarTitleDisplayMode(.inline)
        .fileImporter(
            isPresented: $showFilePicker,
            allowedContentTypes: [UTType.pdf],
            allowsMultipleSelection: false
        ) { result in
            handleFileImport(result)
        }
        .alert("Submission Successful", isPresented: $showSuccessAlert) {
            Button("OK") {}
        } message: {
            Text("Your special operations application has been submitted to eGCA. You will be notified when a decision is made.")
        }
    }

    // MARK: - Step Indicators

    private var stepIndicators: some View {
        HStack(spacing: 20) {
            ForEach(0..<totalSteps, id: \.self) { step in
                VStack(spacing: 4) {
                    ZStack {
                        Circle()
                            .fill(step < currentStep ? Color.green :
                                    (step == currentStep ? Color.orange : Color.gray.opacity(0.3)))
                            .frame(width: 28, height: 28)

                        if step < currentStep {
                            Image(systemName: "checkmark")
                                .font(.caption.weight(.bold))
                                .foregroundColor(.white)
                        } else {
                            Text("\(step + 1)")
                                .font(.caption.weight(.bold))
                                .foregroundColor(step == currentStep ? .white : .gray)
                        }
                    }

                    Text(stepLabel(for: step))
                        .font(.caption2)
                        .foregroundColor(step == currentStep ? .primary : .secondary)
                }
            }
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
    }

    private func stepLabel(for step: Int) -> String {
        switch step {
        case 0: return "Operation"
        case 1: return "Documents"
        case 2: return "Review"
        default: return ""
        }
    }

    // MARK: - Step 1: Operation Details

    private var operationDetailsStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                HStack(spacing: 12) {
                    Image(systemName: "shield.checkered")
                        .font(.title)
                        .foregroundColor(.orange)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Special Operations")
                            .font(.headline)
                        Text("Rule 70 Exemption Application")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Spacer()
                }

                // Exemption type picker
                GroupBox {
                    Picker("Exemption Type", selection: $exemptionType) {
                        ForEach(ExemptionType.allCases, id: \.self) { type in
                            Text(type.displayName).tag(type)
                        }
                    }
                    .pickerStyle(.menu)
                } label: {
                    Label("Exemption Category", systemImage: "doc.badge.gearshape")
                        .font(.subheadline.weight(.semibold))
                }

                // Operation narrative
                GroupBox {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Describe the special operation in detail, including safety measures, risk mitigations, and operational procedures.")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        TextEditor(text: $operationNarrative)
                            .frame(minHeight: 120)
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                            )
                    }
                } label: {
                    Label("Operation Narrative", systemImage: "text.alignleft")
                        .font(.subheadline.weight(.semibold))
                }

                // Capabilities
                GroupBox {
                    VStack(spacing: 0) {
                        capabilityToggle("Return-to-Home / Flight Termination",
                                        icon: "house.fill",
                                        isOn: $rthCapability)

                        Divider().padding(.vertical, 4)

                        capabilityToggle("Active Geo-Fencing",
                                        icon: "rectangle.dashed",
                                        isOn: $geoFencing)

                        Divider().padding(.vertical, 4)

                        capabilityToggle("Detect and Avoid System",
                                        icon: "sensor.fill",
                                        isOn: $daaSystem)
                    }
                } label: {
                    Label("Drone Capabilities", systemImage: "gearshape.2")
                        .font(.subheadline.weight(.semibold))
                }

                // Continue button
                Button {
                    withAnimation { currentStep = 1 }
                } label: {
                    Text("Continue to Documents")
                        .frame(maxWidth: .infinity)
                        .fontWeight(.bold)
                }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
                .controlSize(.large)
                .disabled(operationNarrative.isEmpty)
            }
            .padding()
        }
    }

    private func capabilityToggle(_ label: String, icon: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            Label(label, systemImage: icon)
                .font(.subheadline)
        }
        .tint(.green)
    }

    // MARK: - Step 2: Document Upload

    private var documentUploadStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // SAF info card
                VStack(alignment: .leading, spacing: 10) {
                    Label("Safety Assessment Form (SAF)", systemImage: "doc.text.fill")
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(.orange)

                    Text("Under DGCA Rule 70, all special operations require submission of a completed Safety Assessment Form in PDF format.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding()
                .background(Color.orange.opacity(0.08))
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.orange.opacity(0.3), lineWidth: 1)
                )

                // File picker button
                Button {
                    showFilePicker = true
                } label: {
                    VStack(spacing: 12) {
                        Image(systemName: safDocumentURL != nil
                            ? "checkmark.circle.fill"
                            : "arrow.up.doc.fill")
                            .font(.title)
                            .foregroundColor(safDocumentURL != nil ? .green : .orange)

                        Text(safDocumentURL != nil
                            ? (safFileName ?? "Document selected")
                            : "Select PDF Document")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(safDocumentURL != nil ? .green : .primary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(
                                safDocumentURL != nil ? Color.green : Color.gray.opacity(0.3),
                                style: StrokeStyle(lineWidth: 2, dash: safDocumentURL != nil ? [] : [8, 4])
                            )
                    )
                }
                .buttonStyle(.plain)

                // Document checklist
                GroupBox {
                    VStack(alignment: .leading, spacing: 8) {
                        checklistItem("Safety Assessment Form (SAF)", completed: safDocumentURL != nil)
                        checklistItem("Operator Insurance Certificate", completed: false)
                        checklistItem("Operations Manual / SOP", completed: false)
                        if exemptionType == .bvlos {
                            checklistItem("SORA Assessment Report", completed: false)
                        }
                    }
                } label: {
                    Label("Required Documents", systemImage: "checklist")
                        .font(.subheadline.weight(.semibold))
                }

                Text("Additional documents can be submitted through the eGCA portal after initial application.")
                    .font(.caption)
                    .foregroundColor(.secondary)

                // Self-declaration
                Toggle(isOn: $selfDeclared) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Self-Declaration")
                            .font(.subheadline.weight(.semibold))
                        Text("I declare that this special UAS operation complies with DGCA Drone Rules 2021 (Rule 70 exemption provisions). The SAF and supporting documents are accurate.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .tint(.green)
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(12)

                // Navigation buttons
                HStack(spacing: 12) {
                    Button {
                        withAnimation { currentStep = 0 }
                    } label: {
                        Text("Back")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)

                    Button {
                        withAnimation { currentStep = 2 }
                    } label: {
                        Text("Review")
                            .frame(maxWidth: .infinity)
                            .fontWeight(.bold)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    .controlSize(.large)
                    .disabled(safDocumentURL == nil || !selfDeclared)
                }
            }
            .padding()
        }
    }

    private func checklistItem(_ label: String, completed: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: completed ? "checkmark.circle.fill" : "circle")
                .font(.body)
                .foregroundColor(completed ? .green : .gray)
            Text(label)
                .font(.subheadline)
                .foregroundColor(completed ? .primary : .secondary)
        }
    }

    // MARK: - Step 3: Review & Submit

    private var reviewSubmitStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Summary card
                GroupBox {
                    VStack(alignment: .leading, spacing: 8) {
                        summaryRow("Exemption", exemptionType.displayName)
                        summaryRow("Category", userProfile.droneCategory.displayName)
                        summaryRow("Zone", viewModel.zoneClassification?.zone.displayName ?? "Unknown")
                        summaryRow("Altitude", "\(Int(altitude))m AGL")
                        summaryRow("Polygon", "\(polygon.count) vertices")
                        summaryRow("Start", viewModel.startTime.formatted(date: .abbreviated, time: .shortened))
                        summaryRow("Duration", "\(viewModel.durationMinutes) min")

                        Divider()

                        summaryRow("RTH", rthCapability ? "Yes" : "No")
                        summaryRow("Geo-Fencing", geoFencing ? "Yes" : "No")
                        summaryRow("DAA", daaSystem ? "Yes" : "No")

                        Divider()

                        summaryRow("SAF Document", safFileName ?? "Not uploaded")
                        summaryRow("Declaration", selfDeclared ? "Accepted" : "Not accepted")
                    }
                } label: {
                    Label("Application Summary", systemImage: "doc.plaintext")
                        .font(.subheadline.weight(.semibold))
                }

                // Operation narrative
                if !operationNarrative.isEmpty {
                    GroupBox {
                        Text(operationNarrative)
                            .font(.caption)
                    } label: {
                        Label("Operation Narrative", systemImage: "text.alignleft")
                            .font(.caption.weight(.semibold))
                    }
                }

                // Error display
                if let error = submissionError {
                    HStack(spacing: 10) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.red)
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                    .padding()
                    .background(Color.red.opacity(0.1))
                    .cornerRadius(10)
                }

                // Navigation buttons
                HStack(spacing: 12) {
                    Button {
                        withAnimation { currentStep = 1 }
                    } label: {
                        Text("Back")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)

                    Button {
                        submitToEgca()
                    } label: {
                        if isSubmitting {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Label("Submit", systemImage: "arrow.up.circle.fill")
                                .frame(maxWidth: .infinity)
                                .fontWeight(.bold)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .controlSize(.large)
                    .disabled(!isFormValid || isSubmitting)
                }
            }
            .padding()
        }
    }

    private func summaryRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
                .frame(width: 100, alignment: .leading)
            Text(value)
                .font(.caption.weight(.medium))
            Spacer()
        }
    }

    // MARK: - Validation

    private var isFormValid: Bool {
        selfDeclared
            && safDocumentURL != nil
            && !operationNarrative.isEmpty
            && polygon.count >= 3
    }

    // MARK: - File Import Handler

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            if let url = urls.first {
                safDocumentURL = url
                safFileName = url.lastPathComponent
            }
        case .failure(let error):
            submissionError = "File import failed: \(error.localizedDescription)"
        }
    }

    // MARK: - Submission

    private func submitToEgca() {
        isSubmitting = true
        submissionError = nil

        Task {
            // In production, this would call the eGCA API with the SAF document
            try? await Task.sleep(nanoseconds: 2_000_000_000)

            await MainActor.run {
                isSubmitting = false
                showSuccessAlert = true
            }
        }
    }
}

// MARK: - ExemptionType

/// DGCA Rule 70 exemption categories for special operations.
enum ExemptionType: String, CaseIterable, Sendable {
    case rule70 = "RULE_70"
    case bvlos  = "BVLOS"
    case night  = "NIGHT"
    case swarm  = "SWARM"

    var displayName: String {
        switch self {
        case .rule70: return "Rule 70 -- General Exemption"
        case .bvlos:  return "BVLOS Operations"
        case .night:  return "Night Operations"
        case .swarm:  return "Swarm Operations"
        }
    }
}

// MARK: - Preview

#if DEBUG
struct SpecialOpsFlightView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationView {
            SpecialOpsFlightView(
                viewModel: FlightPlanViewModel(),
                polygon: .constant([
                    LatLng(latitude: 28.6139, longitude: 77.2090),
                    LatLng(latitude: 28.6200, longitude: 77.2150),
                    LatLng(latitude: 28.6100, longitude: 77.2200)
                ]),
                altitude: .constant(120),
                startTime: .constant(Date()),
                endTime: .constant(Date().addingTimeInterval(7200)),
                userProfile: UserProfile(
                    droneCategory: .medium,
                    operatorType: .commercial,
                    rpcId: "RPC-5678",
                    usageTypes: [.inspection, .survey],
                    onboardingCompleted: true,
                    lastUpdated: Date()
                )
            )
        }
    }
}
#endif
