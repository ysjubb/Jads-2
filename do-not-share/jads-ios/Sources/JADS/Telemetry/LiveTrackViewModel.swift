// T07 — ViewModel for live drone tracking on iOS
import Foundation
import Combine
import CoreLocation

class LiveTrackViewModel: ObservableObject {
    @Published var dronePosition: CLLocationCoordinate2D?
    @Published var heading: Double = 0
    @Published var altAGL: Double = 0
    @Published var batteryPct: Double = 0
    @Published var speedKmh: Double = 0
    @Published var uin: String = ""
    @Published var connectionStatus: String = "CONNECTING"
    @Published var violations: [ViolationAlertItem] = []
    @Published var trackHistory: [CLLocationCoordinate2D] = []

    private var wsClient: JadsWebSocketClient
    private var cancellables = Set<AnyCancellable>()

    struct ViolationAlertItem: Identifiable {
        let id = UUID()
        let type: String
        let lat: Double
        let lon: Double
        let ts: Int64
        var dismissed: Bool = false
    }

    init(wsClient: JadsWebSocketClient) {
        self.wsClient = wsClient

        wsClient.events.sink { [weak self] event in
            DispatchQueue.main.async {
                self?.handleEvent(event)
            }
        }.store(in: &cancellables)

        wsClient.connect()
    }

    private func handleEvent(_ event: WsEvent) {
        switch event {
        case .connected:
            connectionStatus = "LIVE"
        case .disconnected:
            connectionStatus = "RECONNECTING"
        case .telemetryPoint(let p):
            dronePosition = CLLocationCoordinate2D(latitude: p.lat, longitude: p.lon)
            heading = p.headingDeg
            altAGL = p.altAGL
            batteryPct = p.batteryPct
            speedKmh = p.speedKmh
            uin = p.uin
            trackHistory.append(CLLocationCoordinate2D(latitude: p.lat, longitude: p.lon))
            if trackHistory.count > 500 { trackHistory.removeFirst() }
        case .geofenceViolation(let v):
            violations.append(ViolationAlertItem(type: v.violationType, lat: v.point.lat, lon: v.point.lon, ts: v.ts))
        case .batteryCritical(let p):
            violations.append(ViolationAlertItem(type: "BATTERY_CRITICAL", lat: p.lat, lon: p.lon, ts: p.ts))
        }
    }

    func dismissViolation(_ item: ViolationAlertItem) {
        if let idx = violations.firstIndex(where: { $0.id == item.id }) {
            violations[idx].dismissed = true
        }
    }

    deinit {
        wsClient.disconnect()
    }
}
