// T07 — SwiftUI Map view for live drone tracking
import SwiftUI
import MapKit

struct LiveTrackView: View {
    @ObservedObject var viewModel: LiveTrackViewModel

    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 28.5562, longitude: 77.1000),
        span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
    )

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                // ── Status bar ──
                HStack {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 8, height: 8)
                    Text(viewModel.connectionStatus)
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundColor(statusColor)

                    Spacer()

                    if !viewModel.uin.isEmpty {
                        Text(viewModel.uin)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.cyan)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(white: 0.05))

                // ── Violation banners ──
                ForEach(viewModel.violations.filter { !$0.dismissed }) { v in
                    HStack {
                        Text("\(v.type) | \(v.lat, specifier: "%.4f"), \(v.lon, specifier: "%.4f")")
                            .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        Spacer()
                        Button("X") {
                            viewModel.dismissViolation(v)
                        }
                        .font(.system(size: 12, weight: .bold))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(v.type == "BATTERY_CRITICAL" ? Color.orange.opacity(0.85) : Color.red.opacity(0.85))
                    .foregroundColor(.black)
                }

                // ── Map ──
                Map(coordinateRegion: $region, annotationItems: droneAnnotations) { item in
                    MapAnnotation(coordinate: item.coordinate) {
                        Image(systemName: "airplane")
                            .rotationEffect(.degrees(viewModel.heading))
                            .foregroundColor(.cyan)
                            .font(.system(size: 20))
                    }
                }
                .ignoresSafeArea()
                .onChange(of: viewModel.dronePosition) { newPos in
                    if let pos = newPos {
                        withAnimation {
                            region.center = pos
                        }
                    }
                }

                // ── Telemetry panel ──
                HStack(spacing: 16) {
                    telemetryItem("ALT", "\(Int(viewModel.altAGL))m")
                    telemetryItem("SPD", "\(Int(viewModel.speedKmh))km/h")
                    telemetryItem("HDG", "\(Int(viewModel.heading))°")
                    telemetryItem("BAT", "\(Int(viewModel.batteryPct))%",
                                  color: viewModel.batteryPct > 50 ? .green :
                                         viewModel.batteryPct > 20 ? .orange : .red)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(white: 0.05))
            }
        }
    }

    private var statusColor: Color {
        switch viewModel.connectionStatus {
        case "LIVE": return .green
        case "RECONNECTING": return .orange
        default: return .red
        }
    }

    private var droneAnnotations: [DroneAnnotation] {
        if let pos = viewModel.dronePosition {
            return [DroneAnnotation(coordinate: pos)]
        }
        return []
    }

    private func telemetryItem(_ label: String, _ value: String, color: Color = .cyan) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 9, design: .monospaced))
                .foregroundColor(.gray)
            Text(value)
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundColor(color)
        }
    }
}

struct DroneAnnotation: Identifiable {
    let id = UUID()
    let coordinate: CLLocationCoordinate2D
}
