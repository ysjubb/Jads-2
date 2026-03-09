// AgriculturalFlightView.swift
// JADS
//
// Agricultural drone flight planning form with pesticide-specific fields.
//
// Extends the standard flight planning flow with fields required for
// agricultural drone operations under DGCA UAS Rules 2021:
//   - Pesticide name
//   - CIB&RC registration number
//   - Crop type
//   - Spray volume (litres)
//   - Field owner contact information
//
// All agricultural operations require eGCA submission.
// Uses FlightPlanViewModel for map/zone state and adds its own
// @State properties for agricultural-specific fields.

import SwiftUI

// MARK: - AgriculturalFlightView

/// Flight planning form for agricultural drone operations.
///
/// Presents all standard fields (zone, altitude, time window) plus
/// agriculture-specific inputs for pesticide application compliance.
struct AgriculturalFlightView: View {

    @ObservedObject var viewModel: FlightPlanViewModel

    @Binding var polygon: [LatLng]
    @Binding var altitude: Double
    @Binding var startTime: Date
    @Binding var endTime: Date

    let userProfile: UserProfile

    // Agricultural-specific fields
    @State private var pesticideName: String = ""
    @State private var cibrcNumber: String = ""
    @State private var cropType: String = ""
    @State private var sprayVolumeLitres: String = ""
    @State private var fieldOwnerName: String = ""
    @State private var fieldOwnerPhone: String = ""
    @State private var selfDeclared: Bool = false

    // Submission state
    @State private var isSubmitting = false
    @State private var showSuccessAlert = false
    @State private var submissionError: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                headerSection

                // Zone context
                zoneContextSection

                // Pesticide information
                pesticideSection

                // Crop & field information
                cropFieldSection

                // Field owner contact
                fieldOwnerSection

                // Flight parameters summary
                flightParametersSection

                // Self-declaration
                selfDeclarationSection

                // Error display
                if let error = submissionError {
                    errorBanner(error)
                }

                // Submit button
                submitButton
            }
            .padding()
        }
        .navigationTitle("Agricultural Flight")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Submission Successful", isPresented: $showSuccessAlert) {
            Button("OK") {}
        } message: {
            Text("Your agricultural flight plan has been submitted to eGCA for review.")
        }
    }

    // MARK: - Sections

    private var headerSection: some View {
        HStack(spacing: 12) {
            Image(systemName: "leaf.circle.fill")
                .font(.title)
                .foregroundColor(.green)

            VStack(alignment: .leading, spacing: 4) {
                Text("Agricultural Operation")
                    .font(.headline)
                Text("Pesticide / Crop Spraying")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Text(userProfile.droneCategory.shortLabel)
                .font(.caption.weight(.bold))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color.green.opacity(0.15), in: Capsule())
                .foregroundColor(.green)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(16)
    }

    private var zoneContextSection: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 8) {
                if let zone = viewModel.zoneClassification {
                    HStack {
                        Text("Zone:")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(zone.zone.displayName)
                            .font(.caption.weight(.semibold))
                            .foregroundColor(zoneColor(for: zone.zone))
                    }
                }

                HStack {
                    Text("Altitude:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("\(Int(altitude))m AGL")
                        .font(.caption.weight(.semibold))
                }

                HStack {
                    Text("Polygon:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("\(polygon.count) vertices")
                        .font(.caption.weight(.semibold))
                }
            }
        } label: {
            Label("Flight Area", systemImage: "map")
                .font(.subheadline.weight(.semibold))
        }
    }

    private var pesticideSection: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                // Regulatory notice
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundColor(.orange)
                    Text("As per the Insecticides Act 1968, only CIB&RC-registered pesticides may be applied via drone.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(10)
                .background(Color.orange.opacity(0.08))
                .cornerRadius(8)

                TextField("Pesticide / Chemical Name", text: $pesticideName)
                    .textFieldStyle(.roundedBorder)

                TextField("CIB&RC Registration Number", text: $cibrcNumber)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
            }
        } label: {
            Label("Pesticide Information", systemImage: "flask.fill")
                .font(.subheadline.weight(.semibold))
        }
    }

    private var cropFieldSection: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                TextField("Crop Type (e.g. Wheat, Rice, Cotton)", text: $cropType)
                    .textFieldStyle(.roundedBorder)

                TextField("Spray Volume (litres)", text: $sprayVolumeLitres)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.decimalPad)
            }
        } label: {
            Label("Crop & Spray Details", systemImage: "leaf.fill")
                .font(.subheadline.weight(.semibold))
        }
    }

    private var fieldOwnerSection: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                TextField("Field Owner Name", text: $fieldOwnerName)
                    .textFieldStyle(.roundedBorder)

                TextField("Field Owner Phone (+91-XXXXXXXXXX)", text: $fieldOwnerPhone)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.phonePad)
            }
        } label: {
            Label("Field Owner Contact", systemImage: "person.fill")
                .font(.subheadline.weight(.semibold))
        }
    }

    private var flightParametersSection: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 8) {
                parameterRow("Start Time", viewModel.startTime.formatted(date: .abbreviated, time: .shortened))
                parameterRow("Duration", "\(viewModel.durationMinutes) min")
                parameterRow("End Time", viewModel.endTime.formatted(date: .abbreviated, time: .shortened))
                parameterRow("Altitude", "\(Int(altitude))m AGL")
            }
        } label: {
            Label("Flight Parameters", systemImage: "clock")
                .font(.subheadline.weight(.semibold))
        }
    }

    private func parameterRow(_ label: String, _ value: String) -> some View {
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

    private var selfDeclarationSection: some View {
        Toggle(isOn: $selfDeclared) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Self-Declaration")
                    .font(.subheadline.weight(.semibold))
                Text("I declare that this agricultural UAS operation complies with DGCA Drone Rules 2021 (Rule 39), Insecticides Act 1968, and all applicable CIB&RC guidelines. The pesticide being applied is registered and approved for drone-based aerial application.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .tint(.green)
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    private func errorBanner(_ error: String) -> some View {
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

    private var submitButton: some View {
        Button {
            submitToEgca()
        } label: {
            if isSubmitting {
                ProgressView()
                    .frame(maxWidth: .infinity)
            } else {
                Label("Submit Agricultural Flight Plan", systemImage: "arrow.up.circle.fill")
                    .frame(maxWidth: .infinity)
                    .fontWeight(.bold)
            }
        }
        .buttonStyle(.borderedProminent)
        .tint(.green)
        .controlSize(.large)
        .disabled(!isFormValid || isSubmitting)
    }

    // MARK: - Validation

    private var isFormValid: Bool {
        selfDeclared
            && !pesticideName.isEmpty
            && !cibrcNumber.isEmpty
            && !cropType.isEmpty
            && !sprayVolumeLitres.isEmpty
            && !fieldOwnerName.isEmpty
            && !fieldOwnerPhone.isEmpty
            && polygon.count >= 3
    }

    // MARK: - Submission

    private func submitToEgca() {
        isSubmitting = true
        submissionError = nil

        // Simulate eGCA submission via FlightPlanViewModel
        Task {
            // In production, this would call the eGCA API
            try? await Task.sleep(nanoseconds: 1_500_000_000)

            await MainActor.run {
                isSubmitting = false
                showSuccessAlert = true
            }
        }
    }

    // MARK: - Helpers

    private func zoneColor(for zone: ZoneType) -> Color {
        switch zone {
        case .green: return .green
        case .yellow: return .orange
        case .red: return .red
        }
    }
}

// MARK: - Preview

#if DEBUG
struct AgriculturalFlightView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationView {
            AgriculturalFlightView(
                viewModel: FlightPlanViewModel(),
                polygon: .constant([
                    LatLng(latitude: 28.6139, longitude: 77.2090),
                    LatLng(latitude: 28.6200, longitude: 77.2150),
                    LatLng(latitude: 28.6100, longitude: 77.2200)
                ]),
                altitude: .constant(30),
                startTime: .constant(Date()),
                endTime: .constant(Date().addingTimeInterval(3600)),
                userProfile: UserProfile(
                    droneCategory: .small,
                    operatorType: .agricultural,
                    rpcId: "RPC-1234",
                    usageTypes: [.agriculture],
                    onboardingCompleted: true,
                    lastUpdated: Date()
                )
            )
        }
    }
}
#endif
