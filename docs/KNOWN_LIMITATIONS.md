# JADS Known Limitations

## 1. RFC 3161 Timestamping (Phase 1 — Months 1–3)
EvidenceLedgerService.requestTsaToken() is a stub.
All rfc3161TimestampToken fields in EvidenceLedger are populated
with STUB_TSA_TOKEN. Forensic timestamps are not externally verifiable
until a real TSA endpoint is integrated.
Production fix: HTTP POST to eMudhra or CDAC TSA per RFC 3161.

## 2. DGCA PKI Verification (Phase 2 — Months 3–6)
NpntVerificationService.verifyDgcaSignature() is a stub returning true.
Permission Artefact signatures are NOT verified against DGCA root CA.
No NPNT enforcement is active in production.
Production fix: XML-DSig verification against DGCA root CA certificate.
Requires DSP certification before live DGCA PKI access is granted.

## 3. AFTN Transmission (Current)
AftnGatewayStub returns stubMode: true on every call.
FPL messages are built correctly per ICAO Doc 4444 but not transmitted
to AAI AMHS network. stubMode is visible in all gateway result fields.
Production fix: BEL partnership for AMHS network access.

## 4. Digital Sky Integration (Phase 2 — Months 3–6)
DigitalSkyStub returns stubMode: true on all three methods.
Flight logs are not submitted to Digital Sky.
UAS registration is not active.
Production fix: Requires DSP certification (6–12 months from application).

## 5. ML-DSA Private Key Storage (Phase 2)
MlDsaSigner.generateKeyPair() returns raw private key bytes.
Android Keystore does not yet support FIPS 204 (ML-DSA).
Interim mitigation: wrapPrivateKey() uses AES-256-GCM with
a Keystore-held wrapping key. Phase 2 will use hardware-backed
PQC keys when Android Keystore adds FIPS 204 support.

## 6. MAVLink Telemetry Coverage
MAVLink protocol covers approximately 15–25% of commercial drones
(open-source platforms: ArduPilot, PX4).
DJI drones use a proprietary closed protocol — MAVLink telemetry
is not available from DJI hardware.
ideaForge and Asteria use proprietary protocols.
A formal MoU with ideaForge is required for SDK access.
JADS telemetry capture is currently limited to MAVLink-compatible hardware.

## 7. FIPS 140-2 HSM
No HSM is deployed. Backend signing keys are software-held.
Production requirement: FIPS 140-2 Level 3+ HSM for backend
ECDSA private keys used in EvidenceLedger signing.

## 8. StrongBox Attestation Challenge
KeyStoreSigningProvider uses a static attestation challenge string.
Static challenges do not provide replay protection.
Production fix: Server-issued nonce per device registration session,
verified by backend before trusting the attestation chain.
