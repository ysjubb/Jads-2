// T07 — DJI SDK v4 iOS telemetry bridge (field phone mode)
// Reads live position from DJIFlightControllerDelegate at 2Hz
// and POSTs to JADS backend via URLSession.
import Foundation

class DjiTelemetryBridge {
    private let missionId: String
    private let uin: String
    private let backendUrl: String
    private let authToken: String
    private var timer: Timer?
    private let session = URLSession.shared

    init(missionId: String, uin: String, backendUrl: String, authToken: String) {
        self.missionId = missionId
        self.uin = uin
        self.backendUrl = backendUrl
        self.authToken = authToken
    }

    func startStreaming() {
        // Timer fires at 2Hz on main thread
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.readAndUpload()
        }
    }

    func stopStreaming() {
        timer?.invalidate()
        timer = nil
    }

    private func readAndUpload() {
        // In production, read from DJIFlightController.currentState()
        // For now, this is the integration point template
        guard let state = readDjiState() else { return }

        let point = TelemetryPointDto(
            missionId: missionId,
            uin: uin,
            lat: state.lat,
            lon: state.lon,
            altAGL: state.altitude,
            altMSL: state.altitude,
            speedKmh: state.speed * 3.6,
            headingDeg: state.heading,
            batteryPct: state.battery,
            satelliteCount: state.satellites,
            source: "DJI_MSDK",
            ts: Int64(Date().timeIntervalSince1970 * 1000)
        )

        uploadPoint(point)
    }

    private struct DjiState {
        let lat: Double
        let lon: Double
        let altitude: Double
        let speed: Double
        let heading: Double
        let battery: Double
        let satellites: Int
    }

    private func readDjiState() -> DjiState? {
        // TODO: Wire to actual DJI SDK v4 delegate
        // DJIFlightController.currentState.aircraftLocation
        // DJIFlightController.currentState.altitude
        // DJIFlightController.currentState.heading
        // DJIBattery.remainingChargePercent
        return nil
    }

    private func uploadPoint(_ point: TelemetryPointDto) {
        guard let url = URL(string: "\(backendUrl)/api/missions/\(missionId)/telemetry") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("4.0", forHTTPHeaderField: "X-JADS-Version")

        let encoder = JSONEncoder()
        request.httpBody = try? encoder.encode(point)

        session.dataTask(with: request).resume()
    }
}
