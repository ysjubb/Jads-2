// OnboardingView.swift
// JADS
//
// 3-step onboarding flow for new operators.
//
// Steps:
//   1. Drone size picker — Nano / Micro / Small / Medium / Multiple
//   2. Usage multi-select chips — Photography, Survey, Delivery, etc.
//   3. RPC (Remote Pilot Certificate) question — required for Small/Medium
//
// The result is stored as a UserProfile in the Keychain via KeychainStorage.
// On completion, FlightFormRouter uses the profile to determine which
// flight planning form variant to present.

import SwiftUI

// MARK: - OnboardingView

/// The main onboarding view presented to new operators.
///
/// Uses a `TabView` with `.page(indexDisplayMode: .never)` for
/// swipe-disabled step navigation. Step transitions are driven by
/// the "Continue" button at each step.
struct OnboardingView: View {

    /// Callback invoked when onboarding is completed with a valid profile.
    var onComplete: (UserProfile) -> Void

    @State private var currentStep = 0
    @State private var selectedCategory: DroneCategory = .micro
    @State private var hasMultipleDrones = false
    @State private var selectedUsages: Set<UsageType> = []
    @State private var selectedOperatorType: OperatorType = .recreational
    @State private var rpcId: String = ""
    @State private var hasRpc: Bool = false

    private let totalSteps = 3

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Step indicators
                stepIndicators
                    .padding(.top, 8)

                // Paged content
                TabView(selection: $currentStep) {
                    droneSizeStep.tag(0)
                    usageStep.tag(1)
                    rpcStep.tag(2)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.easeInOut(duration: 0.3), value: currentStep)
            }
            .navigationTitle("Welcome to JADS")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: - Step Indicators

    private var stepIndicators: some View {
        HStack(spacing: 16) {
            ForEach(0..<totalSteps, id: \.self) { step in
                VStack(spacing: 4) {
                    Circle()
                        .fill(stepColor(for: step))
                        .frame(width: step == currentStep ? 12 : 10,
                               height: step == currentStep ? 12 : 10)

                    Text(stepLabel(for: step))
                        .font(.caption2)
                        .foregroundColor(step == currentStep ? .primary : .secondary)
                        .fontWeight(step == currentStep ? .bold : .regular)
                }
            }
        }
        .padding(.vertical, 12)
    }

    private func stepColor(for step: Int) -> Color {
        if step < currentStep { return .green }
        if step == currentStep { return .accentColor }
        return Color.gray.opacity(0.4)
    }

    private func stepLabel(for step: Int) -> String {
        switch step {
        case 0: return "Drone"
        case 1: return "Usage"
        case 2: return "Certificate"
        default: return ""
        }
    }

    // MARK: - Step 1: Drone Size Picker

    private var droneSizeStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header
                VStack(alignment: .leading, spacing: 8) {
                    Text("What type of drone do you fly?")
                        .font(.title2.weight(.bold))

                    Text("Select your drone's weight category as defined by DGCA UAS Rules 2021.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                // Category cards
                ForEach(DroneCategory.allCases, id: \.self) { category in
                    categoryCard(category)
                }

                // Multiple drones toggle
                Toggle(isOn: $hasMultipleDrones) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("I fly multiple drone types")
                            .font(.subheadline.weight(.medium))
                        Text("We will show the most comprehensive form to cover all categories.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .tint(.accentColor)
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(12)

                // Continue button
                Button {
                    withAnimation { currentStep = 1 }
                } label: {
                    Text("Continue")
                        .frame(maxWidth: .infinity)
                        .fontWeight(.bold)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            .padding()
        }
    }

    private func categoryCard(_ category: DroneCategory) -> some View {
        Button {
            selectedCategory = category
        } label: {
            HStack(spacing: 16) {
                // Radio indicator
                Image(systemName: selectedCategory == category
                    ? "checkmark.circle.fill"
                    : "circle")
                    .font(.title3)
                    .foregroundColor(selectedCategory == category ? .accentColor : .gray)

                VStack(alignment: .leading, spacing: 4) {
                    Text(category.displayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.primary)

                    HStack(spacing: 8) {
                        if category.requiresEgcaSubmission {
                            Label("eGCA Required", systemImage: "checkmark.shield")
                                .font(.caption2)
                                .foregroundColor(.orange)
                        } else {
                            Label("No eGCA", systemImage: "checkmark")
                                .font(.caption2)
                                .foregroundColor(.green)
                        }

                        if category.requiresRpc {
                            Label("RPC Required", systemImage: "person.badge.key")
                                .font(.caption2)
                                .foregroundColor(.blue)
                        }
                    }
                }

                Spacer()
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(selectedCategory == category
                        ? Color.accentColor.opacity(0.08)
                        : Color(.secondarySystemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(selectedCategory == category
                        ? Color.accentColor
                        : Color.clear,
                        lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Step 2: Usage Multi-Select Chips

    private var usageStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header
                VStack(alignment: .leading, spacing: 8) {
                    Text("How will you use your drone?")
                        .font(.title2.weight(.bold))

                    Text("Select all that apply. This helps us show the right form fields for your operations.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                // Usage chips in a flow layout
                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 12),
                    GridItem(.flexible(), spacing: 12)
                ], spacing: 12) {
                    ForEach(UsageType.allCases, id: \.self) { usage in
                        usageChip(usage)
                    }
                }

                // Operator type
                VStack(alignment: .leading, spacing: 8) {
                    Text("Operator Category")
                        .font(.subheadline.weight(.semibold))

                    Picker("Operator Type", selection: $selectedOperatorType) {
                        ForEach(OperatorType.allCases, id: \.self) { type in
                            Text(type.displayName).tag(type)
                        }
                    }
                    .pickerStyle(.menu)
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(10)
                }

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
                        Text("Continue")
                            .frame(maxWidth: .infinity)
                            .fontWeight(.bold)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(selectedUsages.isEmpty)
                }
            }
            .padding()
        }
    }

    private func usageChip(_ usage: UsageType) -> some View {
        let isSelected = selectedUsages.contains(usage)

        return Button {
            if isSelected {
                selectedUsages.remove(usage)
            } else {
                selectedUsages.insert(usage)
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: usage.iconName)
                    .font(.caption)
                Text(usage.displayName)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(
                isSelected
                    ? Color.accentColor.opacity(0.15)
                    : Color(.secondarySystemBackground)
            )
            .foregroundColor(isSelected ? .accentColor : .primary)
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isSelected ? Color.accentColor : Color.clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Step 3: RPC Question

    private var rpcStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header
                VStack(alignment: .leading, spacing: 8) {
                    Text("Remote Pilot Certificate")
                        .font(.title2.weight(.bold))

                    if selectedCategory.requiresRpc || hasMultipleDrones {
                        Text("An RPC is required for Small and Medium category drones under DGCA UAS Rules 2021.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    } else {
                        Text("An RPC is not required for \(selectedCategory.displayName) drones, but you can add it for record.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }

                // RPC toggle
                Toggle(isOn: $hasRpc) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("I have an RPC")
                            .font(.subheadline.weight(.medium))
                        Text("Remote Pilot Certificate issued by a DGCA-authorised training organisation")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .tint(.accentColor)
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(12)

                // RPC ID field
                if hasRpc {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("RPC Number")
                            .font(.subheadline.weight(.semibold))

                        TextField("e.g. RPC-XXXX-YYYY", text: $rpcId)
                            .textFieldStyle(.roundedBorder)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                    }
                }

                // Summary card
                VStack(alignment: .leading, spacing: 12) {
                    Text("Profile Summary")
                        .font(.subheadline.weight(.semibold))

                    summaryRow("Drone Category", selectedCategory.displayName)
                    summaryRow("Operator Type", selectedOperatorType.displayName)
                    summaryRow("Usage", selectedUsages.map(\.displayName).joined(separator: ", "))
                    if hasRpc && !rpcId.isEmpty {
                        summaryRow("RPC", rpcId)
                    }
                    summaryRow("eGCA Required", effectiveCategory.requiresEgcaSubmission ? "Yes" : "No")
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(12)

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
                        completeOnboarding()
                    } label: {
                        Text("Get Started")
                            .frame(maxWidth: .infinity)
                            .fontWeight(.bold)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(selectedCategory.requiresRpc && hasRpc && rpcId.isEmpty)
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

    /// The effective drone category — if user has multiple drones, use medium
    /// (most comprehensive form) to cover all scenarios.
    private var effectiveCategory: DroneCategory {
        hasMultipleDrones ? .medium : selectedCategory
    }

    // MARK: - Complete Onboarding

    private func completeOnboarding() {
        let profile = UserProfile(
            droneCategory: effectiveCategory,
            operatorType: selectedOperatorType,
            rpcId: hasRpc ? rpcId : nil,
            usageTypes: Array(selectedUsages),
            onboardingCompleted: true,
            lastUpdated: Date()
        )

        // Persist to Keychain
        try? KeychainStorage.save(profile)

        onComplete(profile)
    }
}

// MARK: - Preview

#if DEBUG
struct OnboardingView_Previews: PreviewProvider {
    static var previews: some View {
        OnboardingView { profile in
            print("Onboarding complete: \(profile)")
        }
    }
}
#endif
