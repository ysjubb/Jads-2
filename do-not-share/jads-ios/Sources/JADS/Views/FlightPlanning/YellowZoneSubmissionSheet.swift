// YellowZoneSubmissionSheet.swift
// JADS
//
// A multi-step sheet for submitting yellow-zone ATC permission requests.
// Presented as a .sheet() when AirspaceMapView detects YELLOW zone status.

import SwiftUI

// MARK: - YellowZoneSubmissionSheet

struct YellowZoneSubmissionSheet: View {
    @ObservedObject var viewModel: FlightPlanViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var currentStep = 0
    @State private var showSuccessAlert = false
    @State private var submittedApplicationId: String?

    private let amberColor = Color(red: 1.0, green: 0.7, blue: 0.0)
    private let steps = 3

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Step indicators
                stepIndicators

                // Paged content
                TabView(selection: $currentStep) {
                    authorityStep.tag(0)
                    operationDetailsStep.tag(1)
                    reviewSubmitStep.tag(2)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.easeInOut, value: currentStep)
            }
            .navigationTitle("Yellow Zone Permission")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .alert("Submission Successful", isPresented: $showSuccessAlert) {
            Button("OK") { dismiss() }
        } message: {
            Text("Application ID: \(submittedApplicationId ?? "N/A")\n\nYour request has been submitted for ATC review. You will be notified when a decision is made.")
        }
    }

    // MARK: - Step Indicators

    private var stepIndicators: some View {
        HStack(spacing: 12) {
            ForEach(0..<steps, id: \.self) { step in
                Circle()
                    .fill(step == currentStep ? amberColor : Color.gray.opacity(0.4))
                    .frame(width: 10, height: 10)
                    .scaleEffect(step == currentStep ? 1.2 : 1.0)
                    .animation(.spring(response: 0.3), value: currentStep)
            }
        }
        .padding(.vertical, 12)
    }

    // MARK: - Step 1: Authority Info

    private var authorityStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Header
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(amberColor)
                        .font(.title2)
                    Text("ATC PERMISSION REQUIRED")
                        .font(.headline)
                        .foregroundColor(amberColor)
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(amberColor.opacity(0.15))
                .cornerRadius(10)

                // Authority card
                let authority = viewModel.zoneClassification?.atcAuthority ?? "AAI"
                VStack(alignment: .leading, spacing: 10) {
                    Label("Controlling Authority", systemImage: "building.2")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(authority)
                        .font(.title2)
                        .fontWeight(.bold)

                    Divider()

                    Label("Area of Responsibility", systemImage: "map")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(authorityAreaDescription(for: authority))
                        .font(.subheadline)

                    Divider()

                    Label("Contact", systemImage: "phone")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(authorityContact(for: authority))
                        .font(.subheadline)
                        .fontDesign(.monospaced)
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(10)

                // Expected timeline
                HStack {
                    Image(systemName: "clock")
                    Text("Expected Processing: \(viewModel.yellowZoneExpedited ? "1 business day" : "5-7 business days")")
                        .font(.subheadline)
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.tertiarySystemBackground))
                .cornerRadius(8)

                // Expedited badge
                if viewModel.yellowZoneExpedited {
                    Label("Expedited Processing Eligible", systemImage: "checkmark.seal.fill")
                        .font(.subheadline)
                        .foregroundColor(.green)
                        .padding(10)
                        .background(Color.green.opacity(0.1))
                        .cornerRadius(8)
                }

                // Required documents
                VStack(alignment: .leading, spacing: 6) {
                    Text("Required Documents")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                    Group {
                        Label("Insurance Certificate (PDF)", systemImage: "doc")
                        Label("Operations Manual / SOP (PDF)", systemImage: "doc.text")
                        if viewModel.yellowZoneOperationType == .bvlos {
                            Label("SORA Assessment (PDF)", systemImage: "doc.badge.gearshape")
                        }
                        if viewModel.yellowZoneOperationType == .agricultural {
                            Label("Pesticide Applicator Certificate", systemImage: "leaf")
                        }
                    }
                    .font(.caption)
                    .foregroundColor(.secondary)
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(8)

                // Next button
                Button {
                    withAnimation { currentStep = 1 }
                } label: {
                    Text("Continue to Operation Details")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(amberColor)
            }
            .padding()
        }
    }

    // MARK: - Step 2: Operation Details

    private var operationDetailsStep: some View {
        Form {
            Section("Operation Type") {
                Picker("Type of Operation", selection: $viewModel.yellowZoneOperationType) {
                    ForEach(YellowZoneOperationType.allCases, id: \.self) { type in
                        Text(type.displayName).tag(type)
                    }
                }
            }

            Section("Capabilities") {
                Toggle("Return-to-Home / Flight Termination", isOn: $viewModel.yellowZoneRTHCapability)
                Toggle("Active Geo-Fencing", isOn: $viewModel.yellowZoneGeoFencing)
                Toggle("Detect and Avoid System", isOn: $viewModel.yellowZoneDAA)
            }

            Section {
                Toggle(isOn: $viewModel.yellowZoneSelfDeclaration) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Self-Declaration")
                            .fontWeight(.semibold)
                        Text("I declare that this UAS operation complies with DGCA Drone Rules 2021, Rule 39, and all applicable provisions of the UAS Rules 2021. The information provided is true and accurate to the best of my knowledge.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            } header: {
                Text("Legal Declaration")
            }

            Section {
                Button {
                    withAnimation { currentStep = 2 }
                } label: {
                    Text("Continue to Review")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(amberColor)
                .disabled(!viewModel.yellowZoneSelfDeclaration)
            }
        }
    }

    // MARK: - Step 3: Review & Submit

    private var reviewSubmitStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Summary
                GroupBox("Flight Details") {
                    VStack(alignment: .leading, spacing: 8) {
                        summaryRow("Zone", viewModel.zoneClassification?.zone.rawValue ?? "YELLOW")
                        summaryRow("Authority", viewModel.zoneClassification?.atcAuthority ?? "AAI")
                        summaryRow("Operation", viewModel.yellowZoneOperationType.displayName)
                        summaryRow("Altitude", "\(Int(viewModel.altitudeMeters))m AGL")
                        summaryRow("Polygon Vertices", "\(viewModel.vertices.count)")
                        summaryRow("Start", viewModel.startTime.formatted(date: .abbreviated, time: .shortened))
                        summaryRow("Duration", "\(viewModel.durationMinutes) min")
                        summaryRow("End", viewModel.endTime.formatted(date: .abbreviated, time: .shortened))

                        Divider()

                        summaryRow("RTH Capability", viewModel.yellowZoneRTHCapability ? "Yes" : "No")
                        summaryRow("Geo-Fencing", viewModel.yellowZoneGeoFencing ? "Yes" : "No")
                        summaryRow("DAA System", viewModel.yellowZoneDAA ? "Yes" : "No")
                        summaryRow("Self-Declaration", viewModel.yellowZoneSelfDeclaration ? "Accepted" : "Not accepted")
                    }
                }

                // Expected approval
                let expectedDays = viewModel.yellowZoneExpedited ? 1 : 7
                let expectedDate = Calendar.current.date(byAdding: .day, value: expectedDays, to: Date())
                HStack {
                    Image(systemName: "calendar.badge.clock")
                    Text("Expected Approval: \(expectedDate?.formatted(date: .abbreviated, time: .omitted) ?? "N/A")")
                        .font(.subheadline)
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(8)

                // Error display
                if let error = viewModel.yellowZoneSubmitError {
                    HStack {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.red)
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                    .padding()
                    .background(Color.red.opacity(0.1))
                    .cornerRadius(8)
                }

                // Submit button
                Button {
                    Task {
                        let appId = await viewModel.submitYellowZonePermission()
                        if let appId {
                            submittedApplicationId = appId
                            showSuccessAlert = true
                        }
                    }
                } label: {
                    if viewModel.yellowZoneSubmitting {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Submit for ATC Permission")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(amberColor)
                .disabled(!viewModel.isReadyToSubmitYellowZone || viewModel.yellowZoneSubmitting)
            }
            .padding()
        }
    }

    // MARK: - Helpers

    private func summaryRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
                .frame(width: 120, alignment: .leading)
            Text(value)
                .font(.caption)
                .fontWeight(.medium)
            Spacer()
        }
    }

    private func authorityAreaDescription(for authority: String) -> String {
        switch authority {
        case "AAI": return "Airport Authority of India — civilian airport airspace"
        case "IAF": return "Indian Air Force — military airfield perimeter"
        case "NAVY": return "Indian Navy — naval air station and coastal zones"
        case "HAL": return "Hindustan Aeronautics Limited — defence production facility airspace"
        default: return "Airspace authority for the selected zone"
        }
    }

    private func authorityContact(for authority: String) -> String {
        switch authority {
        case "AAI": return "NOF: +91-11-2465-5441\nnof@aai.aero"
        case "IAF": return "AFMC: +91-11-2301-4001\nafmc@iaf.nic.in"
        case "NAVY": return "DNAS: +91-11-2379-5260\ndnas@navy.gov.in"
        case "HAL": return "HAL ATC: +91-80-2232-0701\natc@hal-india.co.in"
        default: return "Contact local ATC authority"
        }
    }
}

// MARK: - YellowZoneOperationType

enum YellowZoneOperationType: String, CaseIterable {
    case vlos = "VLOS"
    case bvlos = "BVLOS"
    case agricultural = "AGRICULTURAL"
    case survey = "SURVEY"
    case photography = "PHOTOGRAPHY"
    case emergencyMedical = "EMERGENCY_MEDICAL"
    case infrastructure = "INFRASTRUCTURE"

    var displayName: String {
        switch self {
        case .vlos: return "Visual Line of Sight (VLOS)"
        case .bvlos: return "Beyond Visual Line of Sight (BVLOS)"
        case .agricultural: return "Agricultural Operations"
        case .survey: return "Survey & Mapping"
        case .photography: return "Aerial Photography"
        case .emergencyMedical: return "Emergency / Medical"
        case .infrastructure: return "Infrastructure Inspection"
        }
    }
}
