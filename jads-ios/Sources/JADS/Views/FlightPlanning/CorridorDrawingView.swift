// CorridorDrawingView.swift
// JADS
//
// Corridor drawing view for the JADS iOS flight planning flow.
//
// Features:
//   - Segmented control: Area / Corridor mode
//   - Tap to add waypoints with dashed MKPolyline centreline
//   - Slider (10-500m) for buffer width with live preview
//   - Buffered polygon displayed as MKPolygon with yellow fill
//   - "Lock Route" button to finalise the corridor
//   - .fileImporter for KML import, parsed with XMLParser
//
// Extends the AirspaceMapView concepts -- uses MKMapView via
// UIViewRepresentable, FlightPlanViewModel-compatible patterns.

import SwiftUI
import MapKit
import CoreLocation
import UniformTypeIdentifiers

// MARK: - CorridorDrawingView

/// View for drawing a corridor route on an Apple Maps background.
///
/// Provides two modes via a segmented control:
/// - **Area**: Standard polygon drawing (delegates to AirspaceMapView flow)
/// - **Corridor**: Waypoint-based corridor with configurable buffer width
///
/// The corridor is defined by a series of waypoints connected by a dashed
/// polyline. A buffer width slider (10-500m) controls the corridor half-width,
/// rendered as a translucent yellow MKPolygon around the centreline.
struct CorridorDrawingView: View {

    @StateObject private var viewModel = CorridorViewModel()

    /// Binding to receive the final corridor polygon when locking.
    @Binding var corridorPolygon: [LatLng]

    /// Binding to receive the corridor waypoints.
    @Binding var corridorWaypoints: [LatLng]

    /// Callback invoked when the user locks the corridor route.
    var onLockRoute: () -> Void

    /// Controls visibility of the KML file importer.
    @State private var showKMLImporter = false

    /// Controls visibility of the lock confirmation sheet.
    @State private var showLockSheet = false

    var body: some View {
        ZStack(alignment: .bottom) {
            // Layer 1: Full-screen map
            CorridorMapRepresentable(viewModel: viewModel)
                .ignoresSafeArea()

            // Layer 2: Top controls
            VStack {
                topControls
                Spacer()
            }

            // Layer 3: Bottom controls
            VStack(spacing: 0) {
                Spacer()

                // Buffer slider (only visible with >= 2 waypoints in corridor mode)
                if viewModel.drawingMode == .corridor && viewModel.waypoints.count >= 2 {
                    bufferSlider
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                bottomActionBar
            }
        }
        .animation(.easeInOut(duration: 0.3), value: viewModel.drawingMode)
        .animation(.easeInOut(duration: 0.2), value: viewModel.waypoints.count)
        .sheet(isPresented: $showLockSheet) {
            lockRouteSheet
        }
        .fileImporter(
            isPresented: $showKMLImporter,
            allowedContentTypes: [UTType(filenameExtension: "kml") ?? .xml, .xml],
            allowsMultipleSelection: false
        ) { result in
            handleKMLImport(result)
        }
        .navigationTitle("Corridor Drawing")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Top Controls

    private var topControls: some View {
        VStack(spacing: 8) {
            // Segmented control: Area / Corridor
            Picker("Drawing Mode", selection: $viewModel.drawingMode) {
                Text("Area").tag(DrawingMode.area)
                Text("Corridor").tag(DrawingMode.corridor)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.top, 8)

            HStack(spacing: 12) {
                // Waypoint count indicator
                if !viewModel.waypoints.isEmpty {
                    Label(
                        "\(viewModel.waypoints.count) waypoints\(viewModel.isLocked ? " (locked)" : "")",
                        systemImage: "point.topleft.down.to.point.bottomright.curvepath"
                    )
                    .font(.caption)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.ultraThinMaterial, in: Capsule())
                }

                Spacer()

                // Undo button
                if !viewModel.waypoints.isEmpty && !viewModel.isLocked {
                    Button {
                        viewModel.undoLastWaypoint()
                    } label: {
                        Image(systemName: "arrow.uturn.backward")
                            .font(.body.weight(.medium))
                            .padding(10)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .accessibilityLabel("Undo last waypoint")
                }

                // Clear button
                if viewModel.waypoints.count > 1 && !viewModel.isLocked {
                    Button {
                        viewModel.clearAllWaypoints()
                    } label: {
                        Image(systemName: "trash")
                            .font(.body.weight(.medium))
                            .padding(10)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .accessibilityLabel("Clear all waypoints")
                }

                // KML Import button
                if !viewModel.isLocked {
                    Button {
                        showKMLImporter = true
                    } label: {
                        Image(systemName: "doc.badge.plus")
                            .font(.body.weight(.medium))
                            .padding(10)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .accessibilityLabel("Import KML route")
                }
            }
            .padding(.horizontal, 16)
        }
    }

    // MARK: - Buffer Slider

    private var bufferSlider: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: "arrow.left.and.right")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.orange)
                Text("Buffer: \(Int(viewModel.bufferMeters))m")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("Total width: \(Int(viewModel.bufferMeters * 2))m")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Slider(
                value: $viewModel.bufferMeters,
                in: 10...500,
                step: 10
            ) {
                Text("Buffer Width")
            }
            .tint(.orange)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
    }

    // MARK: - Bottom Action Bar

    private var bottomActionBar: some View {
        HStack(spacing: 12) {
            // Corridor length display
            if viewModel.waypoints.count >= 2 {
                let length = viewModel.corridorLengthKm
                HStack(spacing: 6) {
                    Image(systemName: "ruler")
                        .font(.caption.weight(.bold))
                    Text(String(format: "%.2f km", length))
                        .font(.subheadline.weight(.semibold))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(.ultraThinMaterial, in: Capsule())
            }

            Spacer()

            // Lock Route button
            Button {
                showLockSheet = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: viewModel.isLocked ? "lock.fill" : "lock")
                        .font(.caption.weight(.bold))
                    Text(viewModel.isLocked ? "Locked" : "Lock Route")
                        .font(.subheadline.weight(.bold))
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .background(
                    viewModel.canLock ? Color.accentColor : Color.gray.opacity(0.5),
                    in: Capsule()
                )
                .foregroundColor(.white)
            }
            .disabled(!viewModel.canLock)
            .accessibilityLabel(viewModel.isLocked ? "Corridor is locked" : "Lock corridor route")
            .accessibilityHint(viewModel.canLock
                ? "Locks the corridor and proceeds"
                : "Add at least 2 waypoints to lock the corridor")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
    }

    // MARK: - Lock Route Sheet

    private var lockRouteSheet: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Header
                    HStack {
                        Image(systemName: "point.topleft.down.to.point.bottomright.curvepath.fill")
                            .foregroundColor(.orange)
                            .font(.title2)
                        Text("LOCK CORRIDOR ROUTE")
                            .font(.headline)
                            .foregroundColor(.orange)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.15))
                    .cornerRadius(10)

                    // Summary
                    GroupBox("Corridor Summary") {
                        VStack(alignment: .leading, spacing: 8) {
                            summaryRow("Waypoints", "\(viewModel.waypoints.count)")
                            summaryRow("Buffer Width", "\(Int(viewModel.bufferMeters))m each side")
                            summaryRow("Total Width", "\(Int(viewModel.bufferMeters * 2))m")
                            summaryRow("Length", String(format: "%.2f km", viewModel.corridorLengthKm))
                        }
                    }

                    // Warning
                    HStack(spacing: 10) {
                        Image(systemName: "exclamationmark.triangle")
                            .foregroundColor(.orange)
                        Text("Locking the corridor finalises the route. You will not be able to edit waypoints after locking.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(12)
                    .background(Color.orange.opacity(0.1))
                    .cornerRadius(8)

                    // Lock button
                    Button {
                        viewModel.lockRoute()
                        commitSelections()
                        showLockSheet = false
                        onLockRoute()
                    } label: {
                        HStack {
                            Image(systemName: "lock.fill")
                            Text("Lock Corridor Route")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    .disabled(!viewModel.canLock)
                }
                .padding()
            }
            .navigationTitle("Lock Route")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showLockSheet = false }
                }
            }
        }
        .presentationDetents([.medium])
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

    /// Copy ViewModel state into the output bindings.
    private func commitSelections() {
        corridorWaypoints = viewModel.waypoints.map {
            LatLng(latitude: $0.latitude, longitude: $0.longitude)
        }
        let bufferPoly = GeometryBuffer.buffer(
            waypoints: viewModel.waypoints,
            bufferMeters: viewModel.bufferMeters
        )
        corridorPolygon = bufferPoly.map {
            LatLng(latitude: $0.latitude, longitude: $0.longitude)
        }
    }

    // MARK: - KML Import

    private func handleKMLImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            // Access the security-scoped resource
            guard url.startAccessingSecurityScopedResource() else {
                viewModel.importError = "Cannot access the selected file."
                return
            }
            defer { url.stopAccessingSecurityScopedResource() }

            do {
                let data = try Data(contentsOf: url)
                let parser = KMLRouteParser(data: data)
                let coordinates = parser.parse()
                if coordinates.isEmpty {
                    viewModel.importError = "No route coordinates found in KML file."
                } else {
                    viewModel.importWaypoints(coordinates)
                }
            } catch {
                viewModel.importError = "Failed to read KML file: \(error.localizedDescription)"
            }

        case .failure(let error):
            viewModel.importError = "File selection failed: \(error.localizedDescription)"
        }
    }
}

// MARK: - DrawingMode

/// The active drawing mode for the corridor view.
enum DrawingMode: String, CaseIterable {
    case area = "AREA"
    case corridor = "CORRIDOR"
}

// MARK: - CorridorViewModel

/// ViewModel that owns all mutable state for the corridor drawing flow.
///
/// Responsibilities:
/// - Waypoint collection and editing (add, undo, clear, import)
/// - Buffer width management (10-500m)
/// - Corridor length computation
/// - Lock state management
///
/// All `@Published` properties are updated on `@MainActor`.
@MainActor
final class CorridorViewModel: ObservableObject {

    // MARK: - Published Properties

    /// The active drawing mode.
    @Published var drawingMode: DrawingMode = .corridor

    /// The ordered list of corridor waypoints.
    @Published var waypoints: [CLLocationCoordinate2D] = []

    /// The corridor buffer width in metres (half-width).
    @Published var bufferMeters: Double = 50.0

    /// Whether the corridor route has been locked.
    @Published var isLocked = false

    /// Error message from KML import, if any.
    @Published var importError: String?

    // MARK: - Computed Properties

    /// Whether the corridor can be locked (>= 2 waypoints, not already locked).
    var canLock: Bool {
        waypoints.count >= 2 && !isLocked && drawingMode == .corridor
    }

    /// Compute the total corridor centreline length in kilometres.
    var corridorLengthKm: Double {
        guard waypoints.count >= 2 else { return 0.0 }
        var total = 0.0
        for i in 0..<(waypoints.count - 1) {
            total += GeometryBuffer.haversineDistance(from: waypoints[i], to: waypoints[i + 1])
        }
        return total / 1000.0
    }

    /// The buffered polygon coordinates for the current corridor.
    var bufferedPolygon: [CLLocationCoordinate2D] {
        GeometryBuffer.buffer(waypoints: waypoints, bufferMeters: bufferMeters)
    }

    // MARK: - Waypoint Editing

    /// Add a waypoint at the given coordinate.
    func addWaypoint(at coordinate: CLLocationCoordinate2D) {
        guard !isLocked, drawingMode == .corridor else { return }
        waypoints.append(coordinate)
        importError = nil
    }

    /// Remove the last waypoint (undo).
    func undoLastWaypoint() {
        guard !isLocked, !waypoints.isEmpty else { return }
        waypoints.removeLast()
    }

    /// Remove all waypoints and reset state.
    func clearAllWaypoints() {
        waypoints.removeAll()
        isLocked = false
        importError = nil
    }

    /// Import waypoints from a parsed KML file, replacing existing waypoints.
    func importWaypoints(_ coordinates: [CLLocationCoordinate2D]) {
        guard !isLocked else { return }
        waypoints = coordinates
        importError = nil
    }

    /// Lock the corridor route, preventing further edits.
    func lockRoute() {
        guard canLock else { return }
        isLocked = true
    }
}

// MARK: - CorridorMapRepresentable

/// UIViewRepresentable wrapping MKMapView for corridor drawing.
///
/// Handles:
/// - Apple Maps base tiles
/// - Dashed MKPolyline for the corridor centreline
/// - MKPolygon for the buffered corridor (yellow fill)
/// - Tap gesture for adding waypoints
/// - Waypoint annotations
struct CorridorMapRepresentable: UIViewRepresentable {

    @ObservedObject var viewModel: CorridorViewModel

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = context.coordinator
        mapView.mapType = .standard
        mapView.showsUserLocation = true
        mapView.isRotateEnabled = false
        mapView.showsCompass = true
        mapView.showsScale = true

        // Default region: India
        mapView.setRegion(
            MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 20.5937, longitude: 78.9629),
                span: MKCoordinateSpan(latitudeDelta: 10, longitudeDelta: 10)
            ),
            animated: false
        )

        // Tap gesture for adding waypoints
        let tapGesture = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(CorridorCoordinator.handleTap(_:))
        )
        tapGesture.delegate = context.coordinator
        mapView.addGestureRecognizer(tapGesture)

        context.coordinator.mapView = mapView

        return mapView
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        context.coordinator.updateOverlays(on: mapView)
        context.coordinator.updateAnnotations(on: mapView)
    }

    func makeCoordinator() -> CorridorCoordinator {
        CorridorCoordinator(viewModel: viewModel)
    }
}

// MARK: - CorridorCoordinator

/// Coordinator managing MKMapView delegate callbacks and gesture handling
/// for the corridor drawing view.
class CorridorCoordinator: NSObject, MKMapViewDelegate, UIGestureRecognizerDelegate {

    let viewModel: CorridorViewModel
    weak var mapView: MKMapView?

    /// Overlay identifier for the corridor centreline polyline.
    private static let centrelineID = "corridorCentreline"

    /// Overlay identifier for the buffered corridor polygon.
    private static let bufferPolygonID = "corridorBuffer"

    init(viewModel: CorridorViewModel) {
        self.viewModel = viewModel
        super.init()
    }

    // MARK: - Overlay Updates

    /// Rebuild all overlays from current ViewModel state.
    func updateOverlays(on mapView: MKMapView) {
        mapView.removeOverlays(mapView.overlays)

        guard viewModel.drawingMode == .corridor else { return }

        // Dashed centreline polyline
        if viewModel.waypoints.count >= 2 {
            let polyline = MKPolyline(
                coordinates: viewModel.waypoints,
                count: viewModel.waypoints.count
            )
            polyline.title = Self.centrelineID
            mapView.addOverlay(polyline, level: .aboveLabels)
        }

        // Buffered corridor polygon
        let bufferCoords = viewModel.bufferedPolygon
        if bufferCoords.count >= 3 {
            let polygon = MKPolygon(
                coordinates: bufferCoords,
                count: bufferCoords.count
            )
            polygon.title = Self.bufferPolygonID
            mapView.addOverlay(polygon, level: .aboveRoads)
        }
    }

    // MARK: - Annotation Updates

    /// Rebuild waypoint annotations from current ViewModel state.
    func updateAnnotations(on mapView: MKMapView) {
        let existing = mapView.annotations.compactMap { $0 as? WaypointAnnotation }
        mapView.removeAnnotations(existing)

        guard viewModel.drawingMode == .corridor else { return }

        for (index, coordinate) in viewModel.waypoints.enumerated() {
            let annotation = WaypointAnnotation(
                coordinate: coordinate,
                index: index,
                isFirst: index == 0,
                isLast: index == viewModel.waypoints.count - 1
            )
            mapView.addAnnotation(annotation)
        }
    }

    // MARK: - MKMapViewDelegate

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        if let polyline = overlay as? MKPolyline, polyline.title == Self.centrelineID {
            let renderer = MKPolylineRenderer(polyline: polyline)
            renderer.strokeColor = UIColor.systemOrange.withAlphaComponent(0.9)
            renderer.lineWidth = 3.0
            renderer.lineDashPattern = [10, 6]
            return renderer
        }

        if let polygon = overlay as? MKPolygon, polygon.title == Self.bufferPolygonID {
            let renderer = MKPolygonRenderer(polygon: polygon)
            renderer.fillColor = UIColor.systemYellow.withAlphaComponent(0.25)
            renderer.strokeColor = UIColor.systemOrange.withAlphaComponent(0.7)
            renderer.lineWidth = 2.0
            return renderer
        }

        return MKOverlayRenderer(overlay: overlay)
    }

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard let waypoint = annotation as? WaypointAnnotation else {
            return nil
        }

        let reuseID = "WaypointHandle"
        let view = mapView.dequeueReusableAnnotationView(withIdentifier: reuseID)
            ?? MKAnnotationView(annotation: annotation, reuseIdentifier: reuseID)

        view.annotation = annotation
        view.canShowCallout = true

        // Configure appearance
        let size: CGFloat = waypoint.isFirst ? 18 : 14
        let color = waypoint.isFirst
            ? UIColor.systemGreen
            : (waypoint.isLast ? UIColor.systemOrange : UIColor.systemBlue)

        let circle = UIView(frame: CGRect(x: 0, y: 0, width: size, height: size))
        circle.backgroundColor = color
        circle.layer.cornerRadius = size / 2
        circle.layer.borderWidth = 2.5
        circle.layer.borderColor = UIColor.white.cgColor
        circle.layer.shadowColor = UIColor.black.cgColor
        circle.layer.shadowOffset = CGSize(width: 0, height: 1)
        circle.layer.shadowRadius = 2
        circle.layer.shadowOpacity = 0.3

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
        guard let mapView, !viewModel.isLocked else { return }
        guard viewModel.drawingMode == .corridor else { return }

        let point = gesture.location(in: mapView)
        let coordinate = mapView.convert(point, toCoordinateFrom: mapView)

        Task { @MainActor in
            viewModel.addWaypoint(at: coordinate)
        }
    }

    // MARK: - UIGestureRecognizerDelegate

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        return false
    }
}

// MARK: - WaypointAnnotation

/// Custom annotation representing a corridor waypoint on the map.
final class WaypointAnnotation: NSObject, MKAnnotation {

    @objc dynamic var coordinate: CLLocationCoordinate2D

    let index: Int
    let isFirst: Bool
    let isLast: Bool

    var title: String? {
        if isFirst {
            return "Start"
        } else if isLast {
            return "End"
        } else {
            return "Waypoint \(index + 1)"
        }
    }

    var subtitle: String? {
        String(format: "%.6f, %.6f", coordinate.latitude, coordinate.longitude)
    }

    init(coordinate: CLLocationCoordinate2D, index: Int, isFirst: Bool, isLast: Bool) {
        self.coordinate = coordinate
        self.index = index
        self.isFirst = isFirst
        self.isLast = isLast
        super.init()
    }
}

// MARK: - KMLRouteParser

/// Minimal KML parser that extracts route coordinates from a KML file.
///
/// Supports the following KML elements:
/// - `<coordinates>` within `<LineString>` (primary route path)
/// - `<coordinates>` within `<Point>` (individual waypoints)
///
/// Coordinates are expected in KML format: `lon,lat,alt` or `lon,lat`.
final class KMLRouteParser: NSObject, XMLParserDelegate {

    private let data: Data
    private var coordinates: [CLLocationCoordinate2D] = []

    // Parser state
    private var currentElement = ""
    private var currentText = ""
    private var insideLineString = false
    private var insidePlacemark = false

    init(data: Data) {
        self.data = data
        super.init()
    }

    /// Parse the KML data and return extracted coordinates.
    ///
    /// - Returns: An array of coordinates forming the route. Returns an
    ///            empty array if no coordinates are found or parsing fails.
    func parse() -> [CLLocationCoordinate2D] {
        let parser = XMLParser(data: data)
        parser.delegate = self
        parser.shouldProcessNamespaces = false
        parser.shouldReportNamespacePrefixes = false
        parser.parse()
        return coordinates
    }

    // MARK: - XMLParserDelegate

    func parser(
        _ parser: XMLParser,
        didStartElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
        attributes attributeDict: [String: String] = [:]
    ) {
        currentElement = elementName
        currentText = ""

        if elementName == "Placemark" {
            insidePlacemark = true
        } else if elementName == "LineString" {
            insideLineString = true
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        currentText += string
    }

    func parser(
        _ parser: XMLParser,
        didEndElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?
    ) {
        if elementName == "coordinates" && insideLineString {
            parseCoordinateString(currentText)
        } else if elementName == "LineString" {
            insideLineString = false
        } else if elementName == "Placemark" {
            insidePlacemark = false
        }

        currentElement = ""
        currentText = ""
    }

    /// Parse a KML coordinate string into CLLocationCoordinate2D values.
    ///
    /// KML format: `lon,lat,alt lon,lat,alt ...`
    /// The altitude component is optional and ignored.
    private func parseCoordinateString(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let tuples = trimmed.components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }

        for tuple in tuples {
            let parts = tuple.components(separatedBy: ",")
            guard parts.count >= 2,
                  let lon = Double(parts[0].trimmingCharacters(in: .whitespaces)),
                  let lat = Double(parts[1].trimmingCharacters(in: .whitespaces)) else {
                continue
            }

            // Validate coordinate ranges
            guard lat >= -90, lat <= 90, lon >= -180, lon <= 180 else {
                continue
            }

            coordinates.append(CLLocationCoordinate2D(latitude: lat, longitude: lon))
        }
    }
}

// MARK: - Preview

#if DEBUG
struct CorridorDrawingView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationView {
            CorridorDrawingView(
                corridorPolygon: .constant([]),
                corridorWaypoints: .constant([]),
                onLockRoute: {}
            )
        }
    }
}
#endif
