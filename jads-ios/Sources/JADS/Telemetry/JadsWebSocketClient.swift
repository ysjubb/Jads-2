// T07 — iOS WebSocket client using URLSessionWebSocketTask
import Foundation
import Combine

enum WsEvent {
    case telemetryPoint(TelemetryPointDto)
    case geofenceViolation(ViolationDto)
    case batteryCritical(TelemetryPointDto)
    case connected
    case disconnected
}

class JadsWebSocketClient: NSObject, ObservableObject {
    let events = PassthroughSubject<WsEvent, Never>()

    private var task: URLSessionWebSocketTask?
    private var retryDelay: TimeInterval = 1.0
    private let wsUrl: String
    private let token: String
    private let missionIds: [String]

    init(wsUrl: String, token: String, missionIds: [String]) {
        self.wsUrl = wsUrl
        self.token = token
        self.missionIds = missionIds
    }

    func connect() {
        let ids = missionIds.joined(separator: ",")
        guard let url = URL(string: "\(wsUrl)/ws/missions?token=\(token)&subscribe=\(ids)") else { return }

        task = URLSession.shared.webSocketTask(with: url)
        task?.resume()
        events.send(.connected)
        retryDelay = 1.0
        receiveLoop()
    }

    private func receiveLoop() {
        task?.receive { [weak self] result in
            switch result {
            case .success(let msg):
                if case .string(let text) = msg {
                    self?.parse(text)
                }
                self?.receiveLoop()
            case .failure:
                self?.events.send(.disconnected)
                DispatchQueue.main.asyncAfter(deadline: .now() + (self?.retryDelay ?? 1)) {
                    self?.retryDelay = min((self?.retryDelay ?? 1) * 2, 30)
                    self?.connect()
                }
            }
        }
    }

    private func parse(_ text: String) {
        guard let data = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = obj["type"] as? String else { return }

        let decoder = JSONDecoder()
        guard let innerData = obj["data"],
              let dataBytes = try? JSONSerialization.data(withJSONObject: innerData) else { return }

        switch type {
        case "TELEMETRY_POINT":
            if let p = try? decoder.decode(TelemetryPointDto.self, from: dataBytes) {
                events.send(.telemetryPoint(p))
            }
        case "GEOFENCE_VIOLATION":
            if let v = try? decoder.decode(ViolationDto.self, from: dataBytes) {
                events.send(.geofenceViolation(v))
            }
        case "BATTERY_CRITICAL":
            if let p = try? decoder.decode(TelemetryPointDto.self, from: dataBytes) {
                events.send(.batteryCritical(p))
            }
        default:
            break
        }
    }

    func disconnect() {
        task?.cancel(with: .normalClosure, reason: nil)
    }
}
