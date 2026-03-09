// FlightFormRouter.swift
// JADS
//
// @ViewBuilder routing for progressive disclosure in the flight planning flow.
//
// Routes the user to the appropriate form variant based on their UserProfile:
//   NANO        -> QuickNanoView        (3-field inline, no eGCA)
//   MICRO/SMALL -> FlightPlannerView    (standard eGCA form)
//   AGRICULTURAL-> AgriculturalFlightView (pesticide, crop, CIB&RC fields)
//   BVLOS/MEDIUM-> SpecialOpsFlightView  (multi-step, SAF upload)
//
// If the user has not completed onboarding, the router presents
// OnboardingView first to collect the UserProfile.

import SwiftUI

// MARK: - FlightFormRouter

/// Routes to the appropriate flight planning form based on the operator's profile.
///
/// This view acts as the entry point for the flight planning flow.
/// It loads the ``UserProfile`` from the Keychain and selects the
/// correct form variant using `@ViewBuilder` routing.
///
/// ## Routing Rules
/// | DroneCategory   | OperatorType  | Form                    |
/// |-----------------|---------------|-------------------------|
/// | `.nano`         | any           | ``QuickNanoView``       |
/// | `.micro`/`.small`| `.agricultural` | ``AgriculturalFlightView`` |
/// | `.micro`/`.small`| other         | `FlightPlannerView`     |
/// | `.medium`       | any           | ``SpecialOpsFlightView``|
struct FlightFormRouter: View {

    /// The ViewModel for the flight planning flow (shared across form variants).
    @ObservedObject var viewModel: FlightPlanViewModel

    /// Polygon coordinates from the airspace map.
    @Binding var selectedPolygon: [LatLng]

    /// Selected altitude in meters.
    @Binding var selectedAltitude: Double

    /// Flight start time.
    @Binding var selectedStartTime: Date

    /// Flight end time.
    @Binding var selectedEndTime: Date

    /// The loaded or newly created user profile.
    @State private var userProfile: UserProfile?

    /// Whether to show the onboarding flow.
    @State private var showOnboarding = false

    var body: some View {
        Group {
            if let profile = userProfile, profile.onboardingCompleted {
                routedFormView(for: profile)
            } else {
                // Profile not loaded yet or onboarding not completed
                loadingOrOnboarding
            }
        }
        .onAppear {
            loadProfile()
        }
        .sheet(isPresented: $showOnboarding) {
            OnboardingView { profile in
                userProfile = profile
                showOnboarding = false
            }
        }
    }

    // MARK: - Loading / Onboarding Gate

    private var loadingOrOnboarding: some View {
        VStack(spacing: 24) {
            Image(systemName: "airplane.circle")
                .font(.system(size: 60))
                .foregroundColor(.accentColor)

            Text("Flight Planning")
                .font(.title2.weight(.bold))

            Text("Set up your operator profile to get started with flight planning.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Button {
                showOnboarding = true
            } label: {
                Text("Set Up Profile")
                    .frame(maxWidth: .infinity)
                    .fontWeight(.bold)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - @ViewBuilder Routing

    /// Select the appropriate form view based on the user's profile.
    @ViewBuilder
    private func routedFormView(for profile: UserProfile) -> some View {
        switch profile.droneCategory {
        case .nano:
            // NANO -> QuickNanoView (3-field inline, no eGCA submission)
            QuickNanoView(
                viewModel: viewModel,
                polygon: selectedPolygon
            )

        case .micro, .small:
            if profile.isAgriculturalOperator {
                // Agricultural operator -> AgriculturalFlightView
                AgriculturalFlightView(
                    viewModel: viewModel,
                    polygon: $selectedPolygon,
                    altitude: $selectedAltitude,
                    startTime: $selectedStartTime,
                    endTime: $selectedEndTime,
                    userProfile: profile
                )
            } else {
                // Standard MICRO/SMALL -> FlightPlannerView
                // (Uses AirspaceMapView as the primary planner for now)
                FlightPlannerView(
                    viewModel: viewModel,
                    polygon: $selectedPolygon,
                    altitude: $selectedAltitude,
                    startTime: $selectedStartTime,
                    endTime: $selectedEndTime,
                    userProfile: profile
                )
            }

        case .medium:
            // MEDIUM / BVLOS -> SpecialOpsFlightView (multi-step with SAF upload)
            SpecialOpsFlightView(
                viewModel: viewModel,
                polygon: $selectedPolygon,
                altitude: $selectedAltitude,
                startTime: $selectedStartTime,
                endTime: $selectedEndTime,
                userProfile: profile
            )
        }
    }

    // MARK: - Profile Loading

    private func loadProfile() {
        if let stored = KeychainStorage.load() {
            userProfile = stored
            if !stored.onboardingCompleted {
                showOnboarding = true
            }
        } else {
            showOnboarding = true
        }
    }
}

// MARK: - FlightPlannerView (Standard MICRO/SMALL Form)

/// Standard flight planning form for MICRO and SMALL category drones.
///
/// Wraps the existing ``AirspaceMapView`` with additional eGCA submission
/// context from the user profile.
struct FlightPlannerView: View {

    @ObservedObject var viewModel: FlightPlanViewModel

    @Binding var polygon: [LatLng]
    @Binding var altitude: Double
    @Binding var startTime: Date
    @Binding var endTime: Date

    let userProfile: UserProfile

    var body: some View {
        VStack(spacing: 0) {
            // Profile context banner
            profileBanner

            // Existing AirspaceMapView for the planning flow
            AirspaceMapView(
                selectedPolygon: $polygon,
                selectedAltitude: $altitude,
                selectedStartTime: $startTime,
                selectedEndTime: $endTime,
                onContinue: {
                    // Proceed to eGCA submission
                }
            )
        }
    }

    private var profileBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "person.badge.shield.checkmark")
                .font(.caption)
                .foregroundColor(.accentColor)

            Text("\(userProfile.droneCategory.shortLabel) | \(userProfile.operatorType.displayName)")
                .font(.caption.weight(.medium))

            Spacer()

            if userProfile.rpcId != nil {
                Label("RPC", systemImage: "checkmark.seal.fill")
                    .font(.caption2)
                    .foregroundColor(.green)
            }

            Text("eGCA")
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Color.orange.opacity(0.2), in: Capsule())
                .foregroundColor(.orange)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }
}

// MARK: - Preview

#if DEBUG
struct FlightFormRouter_Previews: PreviewProvider {
    static var previews: some View {
        NavigationView {
            FlightFormRouter(
                viewModel: FlightPlanViewModel(),
                selectedPolygon: .constant([]),
                selectedAltitude: .constant(120),
                selectedStartTime: .constant(Date()),
                selectedEndTime: .constant(Date().addingTimeInterval(1800))
            )
        }
    }
}
#endif
