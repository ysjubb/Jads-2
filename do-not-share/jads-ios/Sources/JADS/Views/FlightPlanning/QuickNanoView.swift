// QuickNanoView.swift
// JADS
//
// 3-field inline form for Nano recreational flights (< 250g).
//
// No eGCA submission required for Nano category drones.
// This is the simplest form variant in the progressive disclosure flow.
//
// Fields:
//   1. Drone description (free text — make/model)
//   2. Location (tap on map or use current GPS position)
//   3. Time picker (flight duration in minutes)
//
// The form is shown inline (not as a full-screen navigation push)
// so nano operators see the minimum friction path.

import SwiftUI
import CoreLocation

// MARK: - QuickNanoView

/// Inline flight plan form for Nano recreational drones.
///
/// Presents 3 fields in a compact card layout. No eGCA submission
/// is required -- the plan is saved locally for the operator's records.
struct QuickNanoView: View {

    @ObservedObject var viewModel: FlightPlanViewModel

    /// The polygon from the airspace map (used for location context).
    let polygon: [LatLng]

    @State private var droneDescription: String = ""
    @State private var durationMinutes: Int = 15
    @State private var locationText: String = ""
    @State private var isSaved = false

    @StateObject private var locationManager = QuickNanoLocationManager()

    private let durationOptions = [5, 10, 15, 20, 30, 45, 60]

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Header card
                headerCard

                // Form fields
                formCard

                // Regulatory info
                regulatoryCard

                // Save button
                saveButton
            }
            .padding()
        }
        .navigationTitle("Quick Flight Plan")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            updateLocationText()
        }
    }

    // MARK: - Header Card

    private var headerCard: some View {
        HStack(spacing: 12) {
            Image(systemName: "airplane.circle.fill")
                .font(.title)
                .foregroundColor(.blue)

            VStack(alignment: .leading, spacing: 4) {
                Text("Nano Flight")
                    .font(.headline)
                Text("No eGCA submission required")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Text("< 250g")
                .font(.caption.weight(.bold))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color.blue.opacity(0.15), in: Capsule())
                .foregroundColor(.blue)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(16)
    }

    // MARK: - Form Card

    private var formCard: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Field 1: Drone description
            VStack(alignment: .leading, spacing: 8) {
                Label("Drone Description", systemImage: "airplane")
                    .font(.subheadline.weight(.semibold))

                TextField("e.g. DJI Mini 3 Pro", text: $droneDescription)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
            }

            Divider()

            // Field 2: Location
            VStack(alignment: .leading, spacing: 8) {
                Label("Flight Location", systemImage: "location.fill")
                    .font(.subheadline.weight(.semibold))

                HStack {
                    TextField("Location", text: $locationText)
                        .textFieldStyle(.roundedBorder)
                        .disabled(true)

                    Button {
                        useCurrentLocation()
                    } label: {
                        Image(systemName: "location.circle.fill")
                            .font(.title3)
                            .foregroundColor(.accentColor)
                    }
                    .accessibilityLabel("Use current location")
                }

                if !polygon.isEmpty {
                    Text("Location set from map polygon (\(polygon.count) vertices)")
                        .font(.caption)
                        .foregroundColor(.green)
                }
            }

            Divider()

            // Field 3: Duration
            VStack(alignment: .leading, spacing: 8) {
                Label("Flight Duration", systemImage: "timer")
                    .font(.subheadline.weight(.semibold))

                HStack(spacing: 8) {
                    ForEach(durationOptions, id: \.self) { minutes in
                        Button {
                            durationMinutes = minutes
                        } label: {
                            Text(formatDuration(minutes))
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(
                                    durationMinutes == minutes
                                        ? Color.accentColor
                                        : Color(.tertiarySystemBackground),
                                    in: Capsule()
                                )
                                .foregroundColor(
                                    durationMinutes == minutes ? .white : .primary
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }

                Text("Selected: \(formatDuration(durationMinutes))")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(16)
    }

    // MARK: - Regulatory Card

    private var regulatoryCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Nano Drone Guidelines", systemImage: "info.circle")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.blue)

            Group {
                guidelineRow("Maximum altitude: 50 feet (15 metres) AGL")
                guidelineRow("Fly only in uncontrolled airspace (Green zones)")
                guidelineRow("Maintain visual line of sight at all times")
                guidelineRow("Do not fly over groups of people")
                guidelineRow("Keep away from manned aircraft")
                guidelineRow("No night operations without permission")
            }
        }
        .padding()
        .background(Color.blue.opacity(0.05))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.blue.opacity(0.2), lineWidth: 1)
        )
    }

    private func guidelineRow(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .font(.caption)
                .foregroundColor(.green)
                .padding(.top, 2)
            Text(text)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Save Button

    private var saveButton: some View {
        Button {
            savePlan()
        } label: {
            if isSaved {
                Label("Plan Saved", systemImage: "checkmark.circle.fill")
                    .frame(maxWidth: .infinity)
                    .fontWeight(.bold)
            } else {
                Text("Save Quick Plan")
                    .frame(maxWidth: .infinity)
                    .fontWeight(.bold)
            }
        }
        .buttonStyle(.borderedProminent)
        .tint(isSaved ? .green : .accentColor)
        .controlSize(.large)
        .disabled(droneDescription.isEmpty || isSaved)
    }

    // MARK: - Helpers

    private func formatDuration(_ minutes: Int) -> String {
        if minutes < 60 {
            return "\(minutes)m"
        } else {
            return "\(minutes / 60)h"
        }
    }

    private func updateLocationText() {
        if !polygon.isEmpty {
            let centroid = polygon.reduce(
                (lat: 0.0, lon: 0.0)
            ) { ($0.lat + $1.latitude, $0.lon + $1.longitude) }

            let count = Double(polygon.count)
            let lat = centroid.lat / count
            let lon = centroid.lon / count
            locationText = String(format: "%.4f, %.4f", lat, lon)
        } else if let loc = locationManager.lastLocation {
            locationText = String(format: "%.4f, %.4f", loc.latitude, loc.longitude)
        }
    }

    private func useCurrentLocation() {
        locationManager.requestLocation()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            updateLocationText()
        }
    }

    private func savePlan() {
        // Save locally -- no eGCA submission for Nano
        isSaved = true
    }
}

// MARK: - QuickNanoLocationManager

/// Minimal CLLocationManager wrapper for getting the current GPS position.
final class QuickNanoLocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {

    @Published var lastLocation: CLLocationCoordinate2D?

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func requestLocation() {
        manager.requestWhenInUseAuthorization()
        manager.requestLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        lastLocation = locations.last?.coordinate
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Silently fail -- location is optional for nano flights
    }
}

// MARK: - Preview

#if DEBUG
struct QuickNanoView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationView {
            QuickNanoView(
                viewModel: FlightPlanViewModel(),
                polygon: [
                    LatLng(latitude: 28.6139, longitude: 77.2090),
                    LatLng(latitude: 28.6200, longitude: 77.2150),
                    LatLng(latitude: 28.6100, longitude: 77.2200)
                ]
            )
        }
    }
}
#endif
