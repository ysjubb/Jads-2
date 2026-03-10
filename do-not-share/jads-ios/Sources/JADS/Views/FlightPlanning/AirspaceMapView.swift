// AirspaceMapView.swift
// JADS
//
// Airspace Map screen for the JADS iOS flight planning flow.
//
// Features:
//   - Apple Maps via MKMapView (UIViewRepresentable)
//   - Airspace zone polygon overlays with colour-coded fills
//   - User polygon drawing via tap gesture
//   - Draggable vertex handles via long-press + pan gesture
//   - Debounced zone classification with floating result card
//   - Altitude picker with snap presets (30 / 60 / 120 m)
//   - Time window picker with sunset warning banner
//   - "Continue" button gated on valid polygon + zone acknowledgement

import SwiftUI
import MapKit
import CoreLocation
import UIKit

// MARK: - AirspaceMapView

/// The main Airspace Map screen for drone flight planning.
///
/// Uses `@StateObject` ``FlightPlanViewModel`` for all business logic.
/// The view is purely declarative -- no API calls are made directly.
///
/// ## Navigation
/// When the user taps "Continue", the polygon coordinates, altitude,
/// start time, and end time are passed to `FlightDetailsView` via
/// the provided bindings.
struct AirspaceMapView: View {

    @StateObject private var viewModel = FlightPlanViewModel()

    /// Binding to receive the final polygon coordinates when continuing.
    @Binding var selectedPolygon: [LatLng]

    /// Binding to receive the selected altitude in meters.
    @Binding var selectedAltitude: Double

    /// Binding to receive the flight start time.
    @Binding var selectedStartTime: Date

    /// Binding to receive the flight end time.
    @Binding var selectedEndTime: Date

    /// Callback invoked when the user taps "Continue" with valid data.
    var onContinue: () -> Void

    /// Controls visibility of the altitude picker sheet.
    @State private var showAltitudePicker = false

    /// Controls visibility of the time window picker sheet.
    @State private var showTimePicker = false

    /// Animation state for the zone card appearance.
    @State private var zoneCardVisible = false

    var body: some View {
        ZStack(alignment: .bottom) {
            // Layer 1: Full-screen map
            AirspaceMapRepresentable(viewModel: viewModel)
                .ignoresSafeArea()

            // Layer 2: Top toolbar (Undo / Clear / Close Polygon)
            VStack {
                topToolbar
                Spacer()
            }

            // Layer 3: Bottom controls stack
            VStack(spacing: 0) {
                Spacer()

                // Sunset warning banner
                if viewModel.showSunsetWarning {
                    sunsetWarningBanner
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                // Zone classification floating card
                if let zone = viewModel.zoneClassification {
                    zoneClassificationCard(zone)
                        .transition(.asymmetric(
                            insertion: .scale(scale: 0.8).combined(with: .opacity),
                            removal: .opacity
                        ))
                } else if viewModel.isCheckingZone {
                    zoneCheckingIndicator
                        .transition(.opacity)
                } else if let error = viewModel.zoneCheckError {
                    zoneErrorCard(error)
                        .transition(.opacity)
                }

                // Bottom action bar
                bottomActionBar
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.75), value: viewModel.zoneClassification?.zone)
        .animation(.easeInOut(duration: 0.3), value: viewModel.showSunsetWarning)
        .animation(.easeInOut(duration: 0.2), value: viewModel.isCheckingZone)
        .sheet(isPresented: $showAltitudePicker) {
            altitudePickerSheet
        }
        .sheet(isPresented: $showTimePicker) {
            timeWindowPickerSheet
        }
        .navigationTitle("Airspace Map")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Top Toolbar

    private var topToolbar: some View {
        HStack(spacing: 12) {
            // Vertex count indicator
            if !viewModel.vertices.isEmpty {
                Label("\(viewModel.vertices.count) vertices", systemImage: "mappin.and.ellipse")
                    .font(.caption)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.ultraThinMaterial, in: Capsule())
            }

            Spacer()

            // Undo button
            if !viewModel.vertices.isEmpty {
                Button {
                    viewModel.undoLastVertex()
                } label: {
                    Image(systemName: "arrow.uturn.backward")
                        .font(.body.weight(.medium))
                        .padding(10)
                        .background(.ultraThinMaterial, in: Circle())
                }
                .accessibilityLabel("Undo last vertex")
            }

            // Clear button
            if viewModel.vertices.count > 1 {
                Button {
                    viewModel.clearAllVertices()
                } label: {
                    Image(systemName: "trash")
                        .font(.body.weight(.medium))
                        .padding(10)
                        .background(.ultraThinMaterial, in: Circle())
                }
                .accessibilityLabel("Clear all vertices")
            }

            // Close Polygon button
            if viewModel.vertices.count >= FlightPlanViewModel.minimumVertices && !viewModel.isPolygonClosed {
                Button {
                    viewModel.closePolygon()
                } label: {
                    Label("Close", systemImage: "checkmark.circle")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.accentColor, in: Capsule())
                        .foregroundColor(.white)
                }
                .accessibilityLabel("Close polygon")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // MARK: - Zone Classification Card

    private func zoneClassificationCard(_ zone: ZoneClassification) -> some View {
        Button {
            viewModel.acknowledgeZone()
        } label: {
            HStack(spacing: 12) {
                // Zone icon
                Image(systemName: zoneIcon(for: zone.zone))
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)

                VStack(alignment: .leading, spacing: 2) {
                    Text(zoneTitle(for: zone))
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(.white)

                    Text(zoneSubtitle(for: zone))
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.9))
                        .lineLimit(2)
                }

                Spacer()

                if !viewModel.zoneAcknowledged {
                    Image(systemName: "hand.tap")
                        .font(.body)
                        .foregroundColor(.white.opacity(0.8))
                } else {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.body)
                        .foregroundColor(.white)
                }
            }
            .padding(16)
            .background(zoneCardColor(for: zone.zone), in: RoundedRectangle(cornerRadius: 16))
            .shadow(color: zoneCardColor(for: zone.zone).opacity(0.4), radius: 8, y: 4)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .accessibilityLabel("Zone classification: \(zoneTitle(for: zone)). \(zoneSubtitle(for: zone)). Tap to acknowledge.")
    }

    private func zoneIcon(for zone: ZoneType) -> String {
        switch zone {
        case .green: return "checkmark.shield.fill"
        case .yellow: return "exclamationmark.triangle.fill"
        case .red: return "xmark.octagon.fill"
        }
    }

    private func zoneTitle(for zone: ZoneClassification) -> String {
        switch zone.zone {
        case .green: return "GREEN ZONE -- Auto-approval eligible"
        case .yellow: return "YELLOW ZONE -- ATC permission required"
        case .red: return "RED ZONE -- Central Government permission required"
        }
    }

    private func zoneSubtitle(for zone: ZoneClassification) -> String {
        switch zone.zone {
        case .green:
            return zone.reasons.first ?? "Open for operations per DGCA UAS Rules 2021"
        case .yellow:
            let authority = zone.atcAuthority ?? "Local ATC"
            return "Authority: \(authority)"
        case .red:
            return zone.reasons.first ?? "Restricted airspace -- no-fly zone"
        }
    }

    private func zoneCardColor(for zone: ZoneType) -> Color {
        switch zone {
        case .green: return Color(UIColor.systemGreen)
        case .yellow: return Color(UIColor.systemOrange)
        case .red: return Color(UIColor.systemRed)
        }
    }

    // MARK: - Zone Checking Indicator

    private var zoneCheckingIndicator: some View {
        HStack(spacing: 12) {
            ProgressView()
                .tint(.white)
            Text("Checking airspace zone...")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.white)
        }
        .padding(16)
        .background(Color.secondary.opacity(0.8), in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Zone Error Card

    private func zoneErrorCard(_ error: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.title3)
                .foregroundColor(.white)

            VStack(alignment: .leading, spacing: 2) {
                Text("Zone Check Failed")
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(.white)
                Text(error)
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.9))
                    .lineLimit(2)
            }

            Spacer()

            Button {
                viewModel.checkZoneNow()
            } label: {
                Text("Retry")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(.white.opacity(0.25), in: Capsule())
                    .foregroundColor(.white)
            }
        }
        .padding(16)
        .background(Color.red.opacity(0.85), in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Sunset Warning Banner

    private var sunsetWarningBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "sun.horizon.fill")
                .font(.body)
                .foregroundColor(.orange)

            Text("Night operations require special DGCA permission")
                .font(.caption.weight(.medium))
                .foregroundColor(.primary)

            Spacer()
        }
        .padding(12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.orange.opacity(0.5), lineWidth: 1)
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    // MARK: - Bottom Action Bar

    private var bottomActionBar: some View {
        VStack(spacing: 12) {
            // Quick-access buttons row
            HStack(spacing: 12) {
                // Altitude button
                Button {
                    showAltitudePicker = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.up.and.down")
                            .font(.caption.weight(.bold))
                        Text("\(Int(viewModel.altitudeMeters))m")
                            .font(.subheadline.weight(.semibold))
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: Capsule())
                }
                .accessibilityLabel("Altitude: \(Int(viewModel.altitudeMeters)) meters. Tap to change.")

                // Time window button
                Button {
                    showTimePicker = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "clock")
                            .font(.caption.weight(.bold))
                        Text(timeWindowLabel)
                            .font(.subheadline.weight(.semibold))
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: Capsule())
                }
                .accessibilityLabel("Time window: \(timeWindowLabel). Tap to change.")

                Spacer()

                // Continue button
                Button {
                    commitSelections()
                    onContinue()
                } label: {
                    HStack(spacing: 6) {
                        Text("Continue")
                            .font(.subheadline.weight(.bold))
                        Image(systemName: "arrow.right")
                            .font(.caption.weight(.bold))
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(
                        viewModel.canContinue ? Color.accentColor : Color.gray.opacity(0.5),
                        in: Capsule()
                    )
                    .foregroundColor(.white)
                }
                .disabled(!viewModel.canContinue)
                .accessibilityLabel("Continue to flight details")
                .accessibilityHint(viewModel.canContinue
                    ? "Proceeds to the next step"
                    : "Draw and close a polygon, then acknowledge the zone to continue")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
    }

    // MARK: - Time Window Label

    private var timeWindowLabel: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        formatter.timeZone = TimeZone(identifier: "Asia/Kolkata")
        let start = formatter.string(from: viewModel.startTime)
        return "\(start) / \(viewModel.durationMinutes)min"
    }

    // MARK: - Altitude Picker Sheet

    private var altitudePickerSheet: some View {
        NavigationView {
            VStack(spacing: 24) {
                // Current altitude display
                Text("\(Int(viewModel.altitudeMeters)) m AGL")
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)

                // Wheel picker
                Picker("Altitude", selection: Binding(
                    get: { Int(viewModel.altitudeMeters) },
                    set: { viewModel.setAltitude(Double($0)) }
                )) {
                    ForEach(0...500, id: \.self) { value in
                        Text("\(value) m").tag(value)
                    }
                }
                .pickerStyle(.wheel)
                .frame(height: 180)

                // Snap preset buttons
                HStack(spacing: 16) {
                    ForEach(FlightPlanViewModel.altitudeSnapValues, id: \.self) { preset in
                        Button {
                            viewModel.setAltitude(preset)
                        } label: {
                            Text("\(Int(preset))m")
                                .font(.subheadline.weight(.semibold))
                                .padding(.horizontal, 20)
                                .padding(.vertical, 10)
                                .background(
                                    Int(viewModel.altitudeMeters) == Int(preset)
                                        ? Color.accentColor
                                        : Color.secondary.opacity(0.15),
                                    in: Capsule()
                                )
                                .foregroundColor(
                                    Int(viewModel.altitudeMeters) == Int(preset)
                                        ? .white
                                        : .primary
                                )
                        }
                        .accessibilityLabel("Set altitude to \(Int(preset)) meters")
                    }
                }

                // Altitude impact label
                Text(viewModel.altitudeImpactText)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)

                Spacer()
            }
            .padding(.top, 24)
            .navigationTitle("Altitude")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        showAltitudePicker = false
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }

    // MARK: - Time Window Picker Sheet

    private var timeWindowPickerSheet: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Start time picker
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Start Time (IST)", systemImage: "clock")
                            .font(.subheadline.weight(.semibold))

                        DatePicker(
                            "Start Time",
                            selection: Binding(
                                get: { viewModel.startTime },
                                set: { viewModel.setStartTime($0) }
                            ),
                            in: Date()...,
                            displayedComponents: [.date, .hourAndMinute]
                        )
                        .datePickerStyle(.graphical)
                        .environment(\.timeZone, TimeZone(identifier: "Asia/Kolkata")!)
                    }

                    Divider()

                    // Duration picker
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Duration", systemImage: "timer")
                            .font(.subheadline.weight(.semibold))

                        Picker("Duration", selection: Binding(
                            get: { viewModel.durationMinutes },
                            set: { viewModel.setDuration($0) }
                        )) {
                            ForEach(durationOptions, id: \.self) { minutes in
                                Text(formatDuration(minutes)).tag(minutes)
                            }
                        }
                        .pickerStyle(.wheel)
                        .frame(height: 140)

                        // Display computed end time
                        HStack {
                            Text("End Time:")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(formattedEndTime)
                                .font(.caption.weight(.semibold))
                                .foregroundColor(.primary)
                        }
                    }

                    // Sunset warning inline
                    if viewModel.showSunsetWarning {
                        HStack(spacing: 10) {
                            Image(systemName: "sun.horizon.fill")
                                .foregroundColor(.orange)
                            Text("Night operations require special DGCA permission")
                                .font(.caption)
                                .foregroundColor(.orange)
                        }
                        .padding(12)
                        .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                    }
                }
                .padding(16)
            }
            .navigationTitle("Time Window")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        showTimePicker = false
                    }
                }
            }
        }
        .presentationDetents([.large])
    }

    // MARK: - Duration Helpers

    private var durationOptions: [Int] {
        // 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480 minutes
        [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480]
    }

    private func formatDuration(_ minutes: Int) -> String {
        if minutes < 60 {
            return "\(minutes) min"
        } else {
            let hours = minutes / 60
            let remaining = minutes % 60
            if remaining == 0 {
                return "\(hours) hr"
            } else {
                return "\(hours) hr \(remaining) min"
            }
        }
    }

    private var formattedEndTime: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "dd MMM yyyy, HH:mm"
        formatter.timeZone = TimeZone(identifier: "Asia/Kolkata")
        return formatter.string(from: viewModel.endTime) + " IST"
    }

    // MARK: - Commit Selections

    /// Copy ViewModel state into the output bindings for the next screen.
    private func commitSelections() {
        selectedPolygon = viewModel.polygonLatLng
        selectedAltitude = viewModel.altitudeMeters
        selectedStartTime = viewModel.startTime
        selectedEndTime = viewModel.endTime
    }
}

// MARK: - AirspaceMapRepresentable

/// UIViewRepresentable wrapping MKMapView for the airspace map.
///
/// Handles:
/// - Apple Maps base tiles
/// - Zone polygon overlays (green/yellow/red fills)
/// - User polygon rendering (vertices + edges)
/// - Tap gesture for adding vertices
/// - Long-press + pan gesture for dragging vertex handles
struct AirspaceMapRepresentable: UIViewRepresentable {

    @ObservedObject var viewModel: FlightPlanViewModel

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = context.coordinator
        mapView.mapType = .standard
        mapView.showsUserLocation = true
        mapView.isRotateEnabled = false
        mapView.showsCompass = true
        mapView.showsScale = true

        // Set the initial region
        mapView.setRegion(FlightPlanViewModel.defaultRegion, animated: false)

        // Tap gesture for adding vertices
        let tapGesture = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleTap(_:))
        )
        tapGesture.delegate = context.coordinator
        mapView.addGestureRecognizer(tapGesture)

        // Long-press gesture for initiating vertex drag
        let longPressGesture = UILongPressGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleLongPress(_:))
        )
        longPressGesture.minimumPressDuration = 0.3
        longPressGesture.delegate = context.coordinator
        mapView.addGestureRecognizer(longPressGesture)

        // Pan gesture for dragging vertices (enabled only during long-press)
        let panGesture = UIPanGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handlePan(_:))
        )
        panGesture.delegate = context.coordinator
        mapView.addGestureRecognizer(panGesture)

        context.coordinator.mapView = mapView

        return mapView
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        context.coordinator.updateOverlays(on: mapView)
        context.coordinator.updateAnnotations(on: mapView)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(viewModel: viewModel)
    }

    // MARK: - Coordinator

    /// Coordinator managing MKMapView delegate callbacks and gesture handling.
    class Coordinator: NSObject, MKMapViewDelegate, UIGestureRecognizerDelegate {

        let viewModel: FlightPlanViewModel
        weak var mapView: MKMapView?

        /// Whether a vertex drag is currently in progress.
        private var isDragging = false

        /// The index of the vertex currently being dragged.
        private var draggingIndex: Int?

        /// Identifier for user polygon overlay.
        private static let userPolygonID = "userPolygon"

        /// Identifier for zone overlays.
        private static let zoneOverlayPrefix = "zone_"

        /// Identifier for vertex annotations.
        private static let vertexAnnotationPrefix = "vertex_"

        init(viewModel: FlightPlanViewModel) {
            self.viewModel = viewModel
            super.init()
        }

        // MARK: - Overlay Updates

        /// Rebuild all overlays on the map from current ViewModel state.
        func updateOverlays(on mapView: MKMapView) {
            // Remove all existing overlays
            mapView.removeOverlays(mapView.overlays)

            // Add zone overlays
            for zoneOverlay in viewModel.zoneOverlays {
                let polygon = MKPolygon(
                    coordinates: zoneOverlay.coordinates,
                    count: zoneOverlay.coordinates.count
                )
                polygon.title = "\(Self.zoneOverlayPrefix)\(zoneOverlay.zoneType.rawValue)"
                polygon.subtitle = zoneOverlay.name
                mapView.addOverlay(polygon, level: .aboveRoads)
            }

            // Add user polygon if we have 2+ vertices
            if viewModel.vertices.count >= 2 {
                let coords = viewModel.isPolygonClosed
                    ? viewModel.vertices
                    : viewModel.vertices

                if viewModel.isPolygonClosed {
                    // Render as filled polygon
                    let polygon = MKPolygon(
                        coordinates: coords,
                        count: coords.count
                    )
                    polygon.title = Self.userPolygonID
                    mapView.addOverlay(polygon, level: .aboveLabels)
                } else {
                    // Render as polyline (open path)
                    let polyline = MKPolyline(
                        coordinates: coords,
                        count: coords.count
                    )
                    polyline.title = Self.userPolygonID
                    mapView.addOverlay(polyline, level: .aboveLabels)
                }
            }
        }

        // MARK: - Annotation Updates

        /// Rebuild vertex annotations from current ViewModel state.
        func updateAnnotations(on mapView: MKMapView) {
            // Remove existing vertex annotations
            let existingVertexAnnotations = mapView.annotations.compactMap { $0 as? VertexAnnotation }
            mapView.removeAnnotations(existingVertexAnnotations)

            // Add vertex annotations
            for (index, coordinate) in viewModel.vertices.enumerated() {
                let annotation = VertexAnnotation(
                    coordinate: coordinate,
                    index: index,
                    isFirst: index == 0,
                    isLast: index == viewModel.vertices.count - 1
                )
                mapView.addAnnotation(annotation)
            }
        }

        // MARK: - MKMapViewDelegate

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let polygon = overlay as? MKPolygon {
                let renderer = MKPolygonRenderer(polygon: polygon)

                if polygon.title == Self.userPolygonID {
                    // User-drawn polygon
                    renderer.fillColor = UIColor.systemBlue.withAlphaComponent(0.15)
                    renderer.strokeColor = UIColor.systemBlue.withAlphaComponent(0.8)
                    renderer.lineWidth = 2.5
                    renderer.lineDashPattern = nil
                } else if let title = polygon.title, title.hasPrefix(Self.zoneOverlayPrefix) {
                    // Zone overlay
                    let zoneStr = String(title.dropFirst(Self.zoneOverlayPrefix.count))
                    let zoneType = ZoneType(rawValue: zoneStr) ?? .green

                    switch zoneType {
                    case .green:
                        renderer.fillColor = UIColor.systemGreen.withAlphaComponent(0.3)
                        renderer.strokeColor = UIColor.systemGreen.withAlphaComponent(0.7)
                    case .yellow:
                        renderer.fillColor = UIColor.systemYellow.withAlphaComponent(0.3)
                        renderer.strokeColor = UIColor.systemYellow.withAlphaComponent(0.7)
                    case .red:
                        renderer.fillColor = UIColor.systemRed.withAlphaComponent(0.3)
                        renderer.strokeColor = UIColor.systemRed.withAlphaComponent(0.7)
                    }

                    renderer.lineWidth = 1.5
                }

                return renderer
            }

            if let polyline = overlay as? MKPolyline {
                let renderer = MKPolylineRenderer(polyline: polyline)
                renderer.strokeColor = UIColor.systemBlue.withAlphaComponent(0.8)
                renderer.lineWidth = 2.5
                renderer.lineDashPattern = [8, 4]
                return renderer
            }

            return MKOverlayRenderer(overlay: overlay)
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard let vertex = annotation as? VertexAnnotation else {
                return nil
            }

            let reuseID = "VertexHandle"
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: reuseID)
                ?? MKAnnotationView(annotation: annotation, reuseIdentifier: reuseID)

            view.annotation = annotation
            view.canShowCallout = false
            view.isDraggable = false

            // Configure the vertex handle appearance
            let size: CGFloat = vertex.isFirst ? 18 : 14
            let color = vertex.isFirst
                ? UIColor.systemGreen
                : (vertex.isLast ? UIColor.systemOrange : UIColor.systemBlue)

            let circle = UIView(frame: CGRect(x: 0, y: 0, width: size, height: size))
            circle.backgroundColor = color
            circle.layer.cornerRadius = size / 2
            circle.layer.borderWidth = 2.5
            circle.layer.borderColor = UIColor.white.cgColor
            circle.layer.shadowColor = UIColor.black.cgColor
            circle.layer.shadowOffset = CGSize(width: 0, height: 1)
            circle.layer.shadowRadius = 2
            circle.layer.shadowOpacity = 0.3

            // Convert to image for the annotation view
            let renderer = UIGraphicsImageRenderer(size: CGSize(width: size + 4, height: size + 4))
            view.image = renderer.image { ctx in
                circle.layer.render(in: ctx.cgContext)
            }
            view.centerOffset = CGPoint(x: 0, y: 0)
            view.frame.size = CGSize(width: size + 4, height: size + 4)

            return view
        }

        // MARK: - Gesture Handlers

        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let mapView, !isDragging else { return }
            guard !viewModel.isPolygonClosed else { return }

            let point = gesture.location(in: mapView)
            let coordinate = mapView.convert(point, toCoordinateFrom: mapView)

            Task { @MainActor in
                viewModel.addVertex(at: coordinate)
            }
        }

        @objc func handleLongPress(_ gesture: UILongPressGestureRecognizer) {
            guard let mapView else { return }

            switch gesture.state {
            case .began:
                let point = gesture.location(in: mapView)

                // Find the nearest vertex within a threshold
                if let index = findNearestVertexIndex(at: point, in: mapView, threshold: 44) {
                    isDragging = true
                    draggingIndex = index
                    viewModel.draggingVertexIndex = index

                    // Disable map scrolling during drag
                    mapView.isScrollEnabled = false
                }

            case .ended, .cancelled, .failed:
                if isDragging {
                    isDragging = false
                    draggingIndex = nil
                    mapView.isScrollEnabled = true

                    Task { @MainActor in
                        viewModel.endVertexDrag()
                    }
                }

            default:
                break
            }
        }

        @objc func handlePan(_ gesture: UIPanGestureRecognizer) {
            guard let mapView, isDragging, let index = draggingIndex else { return }

            switch gesture.state {
            case .changed:
                let point = gesture.location(in: mapView)
                let coordinate = mapView.convert(point, toCoordinateFrom: mapView)

                Task { @MainActor in
                    viewModel.moveVertex(at: index, to: coordinate)
                }

            case .ended, .cancelled, .failed:
                isDragging = false
                draggingIndex = nil
                mapView.isScrollEnabled = true

                Task { @MainActor in
                    viewModel.endVertexDrag()
                }

            default:
                break
            }
        }

        // MARK: - UIGestureRecognizerDelegate

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
        ) -> Bool {
            // Allow long-press and pan to work together for vertex dragging
            if gestureRecognizer is UILongPressGestureRecognizer && otherGestureRecognizer is UIPanGestureRecognizer {
                return true
            }
            if gestureRecognizer is UIPanGestureRecognizer && otherGestureRecognizer is UILongPressGestureRecognizer {
                return true
            }
            return false
        }

        // MARK: - Helpers

        /// Find the nearest vertex annotation to a screen point.
        ///
        /// - Parameters:
        ///   - point: The screen point to search near.
        ///   - mapView: The map view for coordinate conversion.
        ///   - threshold: The maximum distance in points to consider a match.
        /// - Returns: The index of the nearest vertex, or nil if none is within the threshold.
        private func findNearestVertexIndex(
            at point: CGPoint,
            in mapView: MKMapView,
            threshold: CGFloat
        ) -> Int? {
            var nearestIndex: Int?
            var nearestDistance: CGFloat = .greatestFiniteMagnitude

            for (index, coordinate) in viewModel.vertices.enumerated() {
                let vertexPoint = mapView.convert(coordinate, toPointTo: mapView)
                let dx = point.x - vertexPoint.x
                let dy = point.y - vertexPoint.y
                let distance = sqrt(dx * dx + dy * dy)

                if distance < threshold, distance < nearestDistance {
                    nearestDistance = distance
                    nearestIndex = index
                }
            }

            return nearestIndex
        }
    }
}

// MARK: - VertexAnnotation

/// Custom annotation representing a polygon vertex on the map.
final class VertexAnnotation: NSObject, MKAnnotation {

    /// The geographic coordinate of this vertex.
    @objc dynamic var coordinate: CLLocationCoordinate2D

    /// The index of this vertex in the polygon's vertex array.
    let index: Int

    /// Whether this is the first vertex (shown in green).
    let isFirst: Bool

    /// Whether this is the last vertex (shown in orange).
    let isLast: Bool

    var title: String? {
        if isFirst {
            return "Start"
        } else {
            return "Vertex \(index + 1)"
        }
    }

    init(coordinate: CLLocationCoordinate2D, index: Int, isFirst: Bool, isLast: Bool) {
        self.coordinate = coordinate
        self.index = index
        self.isFirst = isFirst
        self.isLast = isLast
        super.init()
    }
}

// MARK: - Preview

#if DEBUG
struct AirspaceMapView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationView {
            AirspaceMapView(
                selectedPolygon: .constant([]),
                selectedAltitude: .constant(120),
                selectedStartTime: .constant(Date()),
                selectedEndTime: .constant(Date().addingTimeInterval(1800)),
                onContinue: {}
            )
        }
    }
}
#endif
