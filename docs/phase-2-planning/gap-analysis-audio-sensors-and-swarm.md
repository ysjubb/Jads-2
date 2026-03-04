# JADS Phase 2 Gap Analysis — Audio Sensor Integration & Swarm Drone Readiness

**Status:** Phase 2 — Post-funding
**Date:** 2026-03-04
**Scope:** Architecture readiness assessment only. No implementation.

---

## 1. Audio Drone Detection Sensor + IACCS Dashboard Integration

### Current State: NOT READY — Adapter pattern is the right foundation, but structural gaps exist

### What Works Today

- **Adapter webhook pattern** (`adapterWebhookRoutes.ts`): External systems push to JADS with pre-shared keys — an audio sensor mesh fits this model
- **AuditLog with tamper-detection hashes**: Detection events get forensic integrity
- **AI agent pattern** (`agentRoutes.ts`): NOTAM interpreter, forensic narrator — an acoustic classifier agent fits naturally

### Structural Gaps

| Gap | Why It Matters |
|-----|---------------|
| **No `SensorDetection` model** | Nowhere to store "drone heard at lat/lon at time T with confidence 0.87" |
| **No non-cooperative track concept** | JADS only knows about *cooperative* drones (running the app). Audio sensors detect *unknown* ones — fundamentally different entity |
| **No spatiotemporal correlation** | No way to cross-reference audio hits with active `DroneMission` records to determine: compliant or rogue? |
| **No real-time event stream** | Current architecture is request-response (REST). A live ops dashboard needs WebSocket/SSE |
| **No IACCS interface** | IACCS is IAF's classified C2 system — needs a secure gateway adapter, not direct integration |

### Payload Constraint

The **96-byte canonical telemetry payload is frozen**:
- Bytes 0-87: mission/telemetry/hash fields
- Bytes 88-91: reserved zeros (CRC32 integrity invariant)
- Bytes 92-95: CRC32 self-check

Audio sensor data **cannot** be injected into the existing chain without breaking every forensic invariant. It must flow as a **parallel data stream** with timestamp-based correlation.

### Sensor Health Flags Field (Partial Opportunity)

Current `sensorHealthFlags` (32-bit):
- Bit 0 (0x00000001): `FLAG_GPS_OK`
- Bit 1 (0x00000002): `FLAG_GNSS_WARNING`
- **Bits 2-31: UNUSED** — could be claimed for audio sensor health in future versions

### Proposed Architecture (Phase 2)

1. `POST /api/adapter/sensor/push` — audio nodes push detections
2. New `SensorDetection` model with lat/lon/time/confidence/sensorNodeId
3. Correlation service matching detections against known `DroneMission` records
4. Unmatched detections = **non-cooperative track alerts** → push to IACCS gateway + dashboard

### Violation Model Extension Needed

Current `ViolationType` enum covers: `GEOFENCE_BREACH`, `ALTITUDE_VIOLATION`, `SPEED_VIOLATION`, `TIME_WINDOW_VIOLATION`, `CHAIN_BREAK`, `REPLAY_ATTEMPT`, `GPS_SPOOFING_SUSPECTED`, `UNPERMITTED_ZONE`

**Missing for audio sensors:** `AUDIO_THRESHOLD_EXCEEDED`, `NOISE_ANOMALY`, `UNIDENTIFIED_DRONE_DETECTED`, `COMMUNICATION_LOSS`

---

## 2. Swarm Drone Logistics Readiness

### Current State: SINGLE-DRONE CENTRIC — Significant gaps for coordinated swarms

### Critical Gaps

| Gap | Current State | Swarm Needs |
|-----|--------------|-------------|
| **Mission grouping** | Each mission isolated. No `operationId` or `fleetId` | "Operation Alpha: 200 drones, Mumbai→Pune corridor" |
| **Fleet entity** | `CivilianUser` = one person | `Organization` → `Fleet` → `Drone[]` hierarchy |
| **missionId generation** | `System.currentTimeMillis()` per device | Coordinator-assigned IDs. 100 drones same ms = temporal clustering |
| **Geofencing** | Point-in-polygon (area) | **Corridor-based** — 50km flight path with 100m lateral tolerance |
| **Deconfliction** | Zero support | "Maintain 100m separation" / "alternate altitudes in formation" |
| **Rate limiting** | 20 uploads/min per operator | 100 drones landing simultaneously = instant throttle |
| **Spatial queries** | None — no PostGIS, no geo index | "Which drones flew within 1km of each other at overlapping times?" |
| **Real-time position** | Post-flight upload only | Swarm needs live position sharing for collision avoidance |

### What JADS Already Has That Supports Swarm

- **Forensic hash chain** works per-drone — each drone in a swarm gets its own tamper-evident chain
- **Weight category system** — delivery drones are typically MICRO/SMALL
- **Manufacturer push API** — fleet operators could push bulk telemetry via DEFERRED mode
- **NPNT gate** — validates per-drone, which is correct (each drone needs its own permission)

### Scale Concerns

100 drones × 30-min flights × 1Hz = **180,000 telemetry records per operation**

Current PostgreSQL + Prisma with default 10-connection pool gets saturated. Swarm needs either:
- Streaming ingestion pipeline
- Time-series DB (TimescaleDB/InfluxDB) alongside Postgres

### Mission Uniqueness Architecture Issue

Current `DroneMission.missionId` is globally unique per device (timestamp-based). No concept of:
- `operationId` (linking 100 missions to one operation)
- `fleetId` (grouping drones)
- `parentMissionId` (hierarchical operations)

Forensic auditors cannot easily answer: *"Which drones flew together?"*

---

## Gap Severity Summary

| Scenario | Feature | Gap Severity | Fix Effort |
|----------|---------|-------------|-----------|
| **Audio Sensors** | Payload extensibility | CRITICAL | High |
| | Sensor health flags expansion | HIGH | Medium |
| | External adapter pattern | HIGH | Medium |
| | Event/alert taxonomy | HIGH | Medium |
| | Rate limiting for streams | MEDIUM | Low |
| **Swarm Drones** | Fleet grouping model | CRITICAL | High |
| | Mission linking | CRITICAL | High |
| | Concurrent upload API | HIGH | Medium |
| | Corridor geofencing | HIGH | Medium |
| | Deconfliction logic | CRITICAL | Very High |
| | Real-time drone coordination | CRITICAL | Very High |
| | Geospatial queries | HIGH | High |
| | Batch operations | MEDIUM | Medium |

---

## Phase 2 Implementation Roadmap (Post-Funding)

### Shared Foundation (Both Scenarios)

1. **`Organization` + `Fleet` + `OperationGroup` models** — needed by both sensor network operators and logistics companies
2. **WebSocket/SSE real-time event layer** — needed by both live dashboard and live deconfliction
3. **`SensorDetection` model + correlation service** — needed for audio sensors, also useful for radar/RF detection later

### Audio Sensor Track (2-3 months)

1. Sensor adapter webhook endpoint + authentication
2. SensorDetection data model + storage
3. Spatiotemporal correlation service (match detections to known missions)
4. Non-cooperative track alert pipeline → IACCS gateway
5. Real-time dashboard (WebSocket/SSE)

### Swarm Drone Track (3-6 months)

1. `operationId` field on `DroneMission` (nullable, backward compatible)
2. `DroneFleet` + `FleetOperation` models
3. PostGIS extension + spatial indexes
4. Batch mission upload endpoint
5. Rate limiter overhaul (per-device, not per-operator)
6. Corridor-based geofencing
7. Deconfliction service (separate microservice)
8. Real-time position API (WebSocket)

---

*This document is for planning purposes only. No code changes have been made.*
