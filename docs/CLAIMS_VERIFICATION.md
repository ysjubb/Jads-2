# JADS Claims Verification Register

Every public claim about JADS capabilities must be listed here
with its verification status. This register prevents overclaims.

## Verified Claims (backed by source code)

| Claim | Source file | Status |
|-------|------------|--------|
| AFTN FPL messages generated per ICAO Doc 4444 | AftnMessageBuilder.ts | ✓ Verified |
| 96-byte canonical telemetry payload | CanonicalSerializer.kt | ✓ Verified |
| RFC 6979 deterministic ECDSA P-256 signatures | EcdsaSigner.kt | ✓ Verified |
| SHA-256 hash chain linking telemetry records | HashChainEngine.kt | ✓ Verified |
| Two-person rule for drone zone changes | AirspaceVersioningService.ts | ✓ Verified |
| No-delete invariant on airspace records | AirspaceVersioningService.ts | ✓ Verified |
| CRC32 self-verification on each telemetry frame | CanonicalSerializer.kt | ✓ Verified |
| Indian AIP transition altitudes (127 aerodromes) | indiaAIP.ts | ✓ Verified |
| ML-DSA-65 hybrid signing | MlDsaSigner.kt | ✓ Verified (software-only) |
| ADC/FIC clearance tracking with SSE push | ClearanceService.ts | ✓ Verified |
| Admin lineage collusion prevention | AirspaceVersioningService.ts | ✓ Verified |

## Stub Claims (architecture exists, not production-ready)

| Claim | Stub file | What is missing |
|-------|----------|----------------|
| RFC 3161 forensic timestamping | EvidenceLedgerService.ts | Real TSA endpoint |
| AFTN transmission to AAI AMHS | AftnGatewayStub.ts | BEL partnership |
| NPNT Permission Artefact verification | NpntVerificationService.ts | DSP cert + DGCA PKI |
| Digital Sky integration | DigitalSkyStub.ts | DSP certification |
| NOTAM/METAR live data | stub adapters | Government data feed MoU |

## Claims That Must Never Be Made

| Claim | Reason |
|-------|--------|
| Forensic timestamps are externally verifiable | TSA is a stub |
| NPNT is enforced | PA signature verification is a stub |
| Compliant with all drones | MAVLink covers 15–25% only |
| AFTN messages are transmitted | Gateway is a stub |
| "PA signatures verified against DGCA PKI" | Stub — NpntVerificationService.verifyDgcaSignature() returns true |
| Hardware-backed ML-DSA keys | Android Keystore lacks FIPS 204 |
