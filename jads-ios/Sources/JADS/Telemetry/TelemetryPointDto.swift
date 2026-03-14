// T07 — Telemetry point model for live streaming
import Foundation

struct TelemetryPointDto: Codable {
    let missionId: String
    let uin: String
    let lat: Double
    let lon: Double
    let altAGL: Double
    let altMSL: Double
    let speedKmh: Double
    let headingDeg: Double
    let batteryPct: Double
    let satelliteCount: Int
    let source: String
    let ts: Int64
}

struct ViolationDto: Codable {
    let point: TelemetryPointDto
    let violationType: String
    let distanceToEdge: Double
    let ts: Int64
}
