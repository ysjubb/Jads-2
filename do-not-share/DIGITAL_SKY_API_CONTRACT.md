# DIGITAL_SKY_API_CONTRACT.md

**Source**: iSPIRT/digital-sky-api (GitHub reference implementation)
**Audit date**: 2026-03-15
**Audited by**: DS-01 automated extraction from controllers, domain models, service impls, API docs, and Freemarker templates.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [API Endpoint Table](#3-api-endpoint-table)
4. [Domain Models](#4-domain-models)
5. [Permission Artefact XML Schema](#5-permission-artefact-xml-schema)
6. [Flight Log Format](#6-flight-log-format)
7. [PKI / Certificate Chain](#7-pki--certificate-chain)
8. [Auto-Approval Decision Tree](#8-auto-approval-decision-tree)
9. [Airspace Zone System](#9-airspace-zone-system)
10. [FIR Boundaries](#10-fir-boundaries)
11. [Enumerations](#11-enumerations)
12. [Hardcoded Thresholds](#12-hardcoded-thresholds)
13. [Controller vs Docs Discrepancies](#13-controller-vs-docs-discrepancies)
14. [JADS Implementation Notes](#14-jads-implementation-notes)

---

## 1. Overview

Digital Sky is DGCA's drone registration and compliance platform. The iSPIRT reference implementation is a Java Spring Boot application with:

- **Backend**: Spring Boot 1.x, JPA (MySQL for relational), MongoDB (for application forms)
- **Auth**: JWT (RSA256 signed) for user endpoints; X.509 PKI for device register/deregister
- **Port**: 9000 (default)
- **File storage**: Local filesystem via Spring `StorageService`
- **Template engine**: Freemarker (for Permission Artefact XML generation)

### Architecture

| Component | Technology |
|-----------|------------|
| Relational DB | MySQL 5 (InnoDB) via JPA/Hibernate |
| Document DB | MongoDB (application forms, flight permissions) |
| Auth | JWT with RSA256 signing |
| PKI | X.509 certificates, BouncyCastle PKIX validation |
| XML Signing | Java XML Digital Signature API (RSA-SHA1 enveloped) |
| GeoJSON | GeoTools + JTS for polygon intersection/containment |
| Migrations | Flyway |

---

## 2. Authentication

### 2.1 User Authentication (JWT)

- **Login**: `POST /api/auth/token` with `{username, password}`
- **Response**: `{accessToken, id, username, pilotProfileId, individualOperatorProfileId, organizationOperatorProfileId, tokenType: "Bearer", isAdmin}`
- **Usage**: `Authorization: Bearer <accessToken>` header on all authenticated endpoints
- **Signing**: RSA256 (from keystore.jks)

### 2.2 Device Authentication (PKI)

Used exclusively by `POST /api/droneDevice/register/{mbi}` and `PATCH /api/droneDevice/deregister/{mbi}`.

- No JWT required
- Request contains:
  - `drone` object (device data)
  - `signature`: Base64-encoded SHA256withRSA signature of the `drone` JSON
  - `digitalCertificate`: Base64-encoded X.509 certificate of the manufacturer
- Server validates:
  1. Certificate chain against manufacturer's stored chain (PKIX validation via BouncyCastle)
  2. DN matching (CN + O attributes) between client cert issuer and chain certs
  3. Digital signature verification against the certificate's public key
  4. Manufacturer business identifier matches certificate subject organization

### 2.3 Roles

| Role | Access Level |
|------|-------------|
| `ADMIN` | Full system admin — approve/reject all application types, view all data |
| `ATC_ADMIN` | ATC-specific approval of fly drone permissions (FIC issuance) |
| `AFMLU_ADMIN` | AFMLU-specific approval of fly drone permissions (ADC issuance + PA generation) |
| `VIEWER_ADMIN` | Read-only admin access |
| `ATC_VIEWER_ADMIN` | Read-only ATC data |
| `AFMLU_VIEWER_ADMIN` | Read-only AFMLU data |

---

## 3. API Endpoint Table

### 3.1 Authentication & User Management

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/auth/token` | None | JSON | Login, returns JWT |
| POST | `/api/user` | None | JSON | Register new user |
| POST | `/api/user/resetPasswordLink` | None | JSON | Request password reset email |
| POST | `/api/user/resetPassword` | None | JSON | Reset password with token |
| POST | `/api/user/verify` | None | JSON | Verify email with token |
| GET | `/api/user/applications` | Bearer | — | List all applications for user |

### 3.2 Pilot Profile

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/pilot` | Bearer | JSON | Create pilot profile |
| PUT | `/api/pilot/{id}` | Bearer | JSON | Update pilot profile |

**Fields**: name, mobileNumber, dateOfBirth (dd-MM-yyyy), country, addressList (array of Address)

### 3.3 Operator Profiles

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/operator` | Bearer | JSON | Create individual operator |
| PUT | `/api/operator/{id}` | Bearer | JSON | Update individual operator |
| POST | `/api/orgOperator` | Bearer | JSON | Create organization operator |
| PUT | `/api/orgOperator/{id}` | Bearer | JSON | Update organization operator |

### 3.4 Manufacturer Profile

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/manufacturer` | Bearer | multipart/form-data | Create manufacturer (JSON + trustedCertificateDoc) |
| PUT | `/api/manufacturer/{id}` | Bearer | multipart/form-data | Update manufacturer |

### 3.5 Drone Type (Admin)

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/droneType` | Bearer | JSON | Create drone type definition |
| PATCH | `/api/droneType/{id}` | Bearer | JSON | Update drone type |
| GET | `/api/droneType/getAll` | Bearer | — | List all drone types |

### 3.6 Drone Device Registration (M2M / PKI)

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/droneDevice/register/{mbi}` | PKI (cert+sig) | JSON | Register drone device |
| PATCH | `/api/droneDevice/deregister/{mbi}` | PKI (cert+sig) | JSON | Deregister drone device |

**Register request**:
```json
{
  "drone": {
    "version": "string",
    "txn": "string (max 50)",
    "deviceId": "string",
    "deviceModelId": "string",
    "operatorBusinessIdentifier": "string (max 36)"
  },
  "signature": "Base64(SHA256withRSA(drone_json))",
  "digitalCertificate": "Base64(X.509)"
}
```

**Register response codes**: REGISTERED, OPERATOR_BUSINESS_IDENTIFIER_INVALID, OPERATOR_BUSINESS_IDENTIFIER_MISSING, INVALID_SIGNATURE, INVALID_DIGITAL_CERTIFICATE, DRONE_ALREADY_REGISTERED, INVALID_MANUFACTURER, MANUFACTURER_BUSINESS_IDENTIFIER_INVALID, BAD_REQUEST_PAYLOAD

**Deregister response codes**: DEREGISTERED, DRONE_NOT_FOUND, DRONE_NOT_REGISTERED, INVALID_SIGNATURE, INVALID_DIGITAL_CERTIFICATE, INVALID_MANUFACTURER, MANUFACTURER_BUSINESS_IDENTIFIER_INVALID, BAD_REQUEST_PAYLOAD

### 3.7 Fly Drone Permission

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/applicationForm/flyDronePermissionApplication` | Bearer | JSON | Create fly permission application |
| PATCH | `/api/applicationForm/flyDronePermissionApplication/{id}` | Bearer | JSON | Update application |
| PATCH | `/api/applicationForm/flyDronePermissionApplication/approve/{id}` | Admin | multipart/json | Approve/reject (single-stage) |
| GET | `/api/applicationForm/flyDronePermissionApplication/getAll` | Admin | — | List all (non-DRAFT) |
| GET | `/api/applicationForm/flyDronePermissionApplication/list?droneId=` | Bearer | — | List user's applications |
| POST | `/api/applicationForm/flyDronePermissionApplication/{id}//document/flightLog` | Bearer | JSON+multipart | Upload flight log |

**Key request fields**:
```json
{
  "pilotBusinessIdentifier": "string",
  "flyArea": [{"latitude": 0.0, "longitude": 0.0}],
  "droneId": 0,
  "payloadWeightInKg": 0.0,
  "payloadDetails": "string",
  "flightPurpose": "string",
  "startDateTime": "dd-MM-yyyy HH:mm:ss",
  "endDateTime": "dd-MM-yyyy HH:mm:ss",
  "recurringTimeExpression": "cron (Quartz format)",
  "recurringTimeDurationInMinutes": 0,
  "recurringTimeExpressionType": "CRON_QUARTZ"
}
```

### 3.8 UIN (Unique Identification Number)

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/applicationForm/uinApplication` | Bearer | multipart/form-data | Create UIN application (9 file uploads) |
| PATCH | `/api/applicationForm/uinApplication/{id}` | Bearer | multipart/form-data | Update UIN application |
| PATCH | `/api/applicationForm/uinApplication/approve/{id}` | Admin | multipart/json | Approve/reject |
| GET | `/api/applicationForm/uinApplication/getAll` | Admin | — | List all |
| GET | `/api/applicationForm/uinApplication/list` | Bearer | — | List user's |

**File uploads**: importPermissionDoc, cinDoc, gstinDoc, panCardDoc, dotPermissionDoc, securityClearanceDoc, etaDoc, opManualDoc, maintenanceGuidelinesDoc

### 3.9 UAOP (Unmanned Aircraft Operator Permit)

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/applicationForm/uaopApplication` | Bearer | multipart/form-data | Create UAOP (4 file uploads) |
| PATCH | `/api/applicationForm/uaopApplication/{id}` | Bearer | multipart/form-data | Update |
| PATCH | `/api/applicationForm/uaopApplication/approve/{id}` | Admin | multipart/json | Approve/reject |
| GET | `/api/applicationForm/uaopApplication/getAll` | Admin | — | List all |
| GET | `/api/applicationForm/uaopApplication/list` | Bearer | — | List user's |

**File uploads**: securityProgramDoc, insuranceDoc, landOwnerPermissionDoc, sopDoc

### 3.10 Import Drone Acquisition

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/applicationForm/importDroneApplication` | Bearer | form-data (acquisitionForm JSON) | Create |
| PATCH | `/api/applicationForm/importDroneApplication/{id}` | Bearer | multipart/form-data | Update (+ securityClearanceDoc) |
| PATCH | `/api/applicationForm/importDroneApplication/approve/{id}` | Admin | multipart/json | Approve/reject |
| GET | `/api/applicationForm/importDroneApplication/getAll` | Admin | — | List all |
| GET | `/api/applicationForm/importDroneApplication/list` | Bearer | — | List user's |

### 3.11 Local Drone Acquisition

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/applicationForm/localDroneAcquisitionApplication` | Bearer | form-data (acquisitionForm JSON) | Create |
| PATCH | `/api/applicationForm/localDroneAcquisitionApplication/{id}` | Bearer | multipart/form-data | Update |
| PATCH | `/api/applicationForm/localDroneAcquisitionApplication/approve/{id}` | Admin | multipart/json | Approve/reject |
| GET | `/api/applicationForm/localDroneAcquisitionApplication/getAll` | Admin | — | List all |
| GET | `/api/applicationForm/localDroneAcquisitionApplication/list` | Bearer | — | List user's |

### 3.12 Airspace Category (Admin)

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/airspaceCategory` | Admin | JSON | Create zone (GeoJSON FeatureCollection) |
| PUT | `/api/airspaceCategory/{id}` | Admin | JSON | Update zone |
| GET | `/api/airspaceCategory/{id}` | Admin | — | Get single zone |
| GET | `/api/airspaceCategory/getAll` | Admin | — | List all zones |

### 3.13 Blog

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/blog` | Admin | JSON | Create blog post |
| PATCH | `/api/blog/{id}` | Admin | JSON | Update blog post |
| GET | `/api/blog/getAll` | None | — | List all (public) |

### 3.14 Occurrence Report

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/occurrenceReport` | Bearer | multipart/form-data | Submit occurrence report |
| GET | `/api/occurrenceReport/list` | Bearer | — | List user's reports |
| GET | `/api/occurrenceReport/getAll` | Admin | — | List all reports |
| GET | `/api/occurrenceReport/{id}` | Admin | — | Get specific report |

### 3.15 Director (Admin)

| Method | Path | Auth | Content-Type | Purpose |
|--------|------|------|-------------|---------|
| POST | `/api/admin/director` | Admin | JSON | Create admin user |
| GET | `/api/admin/director/{id}` | Admin | — | Get admin user |
| PUT | `/api/admin/director/{id}` | Admin | JSON | Update admin user |
| GET | `/api/admin/director/all/{page}` | Admin | — | List admins (paged) |

---

## 4. Domain Models

### 4.1 Core Entities (MySQL/JPA)

**User**
| Field | Type | Notes |
|-------|------|-------|
| id | long | Auto-generated |
| fullName | String | Alphabets + space |
| email | String | Unique, used as username |
| password | String | BCrypt hash |
| resetPasswordToken | String | UUID for password reset |
| accountVerificationToken | String | UUID for email verification |
| accountVerified | boolean | |
| reCaptchaToken | String | @Transient (not persisted) |

**Pilot**
| Field | Type | Notes |
|-------|------|-------|
| id | long | |
| businessIdentifier | String | UUID, auto-generated on persist |
| resourceOwnerId | long | Links to User.id |
| name | String | |
| email | String | |
| mobileNumber | String | |
| dateOfBirth | LocalDate | |
| droneCategory | DroneCategoryType | |
| trainingCertificateDocName | String | |
| status | ApprovalStatus | |
| addressList | List<Address> | @OneToMany cascade ALL |

**OperatorDrone**
| Field | Type | Notes |
|-------|------|-------|
| id | long | |
| operatorId | long | |
| operatorType | ApplicantType | INDIVIDUAL or ORGANISATION |
| droneTypeId | long | FK to DroneType |
| isRegistered | boolean | |
| UIN | String | Unique Identification Number |
| deviceId | String | |
| registrationStatus | RegisterDroneResponseCode | |
| acquisitionApplicationId | String | MongoDB ObjectId |

**DroneType**
| Field | Type | Notes |
|-------|------|-------|
| id | long | |
| modelName | String | |
| modelNo | String | |
| manufacturer | String | |
| manufacturerAddress | Address | @OneToOne |
| wingType | String | FIXED or ROTARY |
| maxTakeOffWeight | float | |
| droneCategoryType | DroneCategoryType | NANO, MICRO, SMALL, MEDIUM, LARGE |
| maxEndurance | float | |
| maxRange | float | |
| maxSpeed | float | |
| maxHeightOfOperation | float | |
| engineType | String | |
| enginePower | float | |
| engineCount | int | |
| fuelCapacity | float | |
| propellerDetails | String | |
| dimensions | Dimension | @Embedded (length, breadth, height) |
| hasGNSS | boolean | |

**AirspaceCategory**
| Field | Type | Notes |
|-------|------|-------|
| id | long | |
| name | String | |
| type | AirspaceCategoryType | GREEN, AMBER, RED |
| geoJson | String | GeoJSON FeatureCollection (only Polygons) |
| minAltitude | long | Meters AGL |
| tempStartTime | LocalDateTime | Optional temporal restriction start |
| tempEndTime | LocalDateTime | Optional temporal restriction end |

**FlightLogEntry**
| Field | Type | Notes |
|-------|------|-------|
| id | long | |
| uin | String | Drone UIN (links log chain) |
| signature | String | Hash of previous entry (chain link) |
| hash | String | This entry's hash |

### 4.2 Application Form Documents (MongoDB)

**FlyDronePermissionApplication**
| Field | Type | Notes |
|-------|------|-------|
| id | String | MongoDB ObjectId |
| applicant | String | |
| applicantId | long | |
| status | ApplicationStatus | DRAFT → SUBMITTED → APPROVED/REJECTED/APPROVEDBYATC/APPROVEDBYAFMLU |
| pilotBusinessIdentifier | String | Resolves to Pilot entity |
| flyArea | List<LatLong> | Polygon vertices |
| droneId | long | FK to OperatorDrone |
| operatorId | long | |
| payloadWeightInKg | float | |
| payloadDetails | String | |
| flightPurpose | String | |
| startDateTime | Date | dd-MM-yyyy HH:mm:ss |
| endDateTime | Date | |
| maxAltitude | long | Feet AGL |
| fir | String | Determined by fly area location |
| ficNumber | String | Set on ATC approval |
| adcNumber | String | Set on AFMLU approval |
| recurringTimeExpression | String | Quartz cron |
| recurringTimeDurationInMinutes | int | |
| recurringTimeExpressionType | String | "CRON_QUARTZ" |
| permissionArtifactStoragePath | String | Path to signed PA XML |

**Common Application Wrapper** (inherited by all form types)
| Field | Type | Notes |
|-------|------|-------|
| id | String | ObjectId |
| applicationNumber | String | Auto-generated on submit |
| createdDate | Date | |
| submittedDate | Date | |
| lastModifiedDate | Date | |
| status | ApplicationStatus | |
| applicant / applicantId | String / long | |
| applicantAddress | Address | |
| applicantEmail, applicantPhone, applicantNationality, applicantType | String | |
| approver / approverId | String / long | |
| approvedDate | Date | |
| approverComments | String | |

---

## 5. Permission Artefact XML Schema

### 5.1 Basic PA (Auto-Approved / Single-Stage)

```xml
<UAPermission>
  <Permission>
    <Owner operatorID="{operatorBusinessIdentifier}">
      <Pilot id="{pilotBusinessIdentifier}" validTo="NA"/>
    </Owner>
    <FlightDetails>
      <UADetails uinNo="{droneUIN}"/>
      <FlightPurpose shortDesc="{flightPurpose}"/>
      <PayloadDetails payLoadWeightInKg="{weight}" payloadDetails="{details}"/>
      <FlightParameters
          flightStartTime="{ISO datetime}"
          flightEndTime="{ISO datetime}"
          recurrenceTimeExpression="{cron}"
          recurrenceTimeExpressionType="CRON_QUARTZ"
          recurringTimeDurationInMinutes="{minutes}"
          maxAltitude="{feet AGL}">
        <Coordinates>
          <Coordinate latitude="{lat}" longitude="{lon}"/>
          <!-- ... polygon vertices, closed ring -->
        </Coordinates>
      </FlightParameters>
    </FlightDetails>
  </Permission>
</UAPermission>
```

### 5.2 PA with FIC + ADC (Two-Stage Approval)

Same structure, but `<FlightParameters>` includes two additional attributes:

```xml
<FlightParameters ... ficNumber="{ficNumber}" adcNumber="{adcNumber}">
```

### 5.3 XML Digital Signature

The PA XML is signed using **enveloped XML Digital Signature**:

| Property | Value |
|----------|-------|
| Signature method | RSA-SHA1 (`http://www.w3.org/2000/09/xmldsig#rsa-sha1`) |
| Digest method | SHA-1 (`http://www.w3.org/2000/09/xmldsig#sha1`) |
| Canonicalization | Inclusive C14N (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`) |
| Transform | Enveloped signature (`http://www.w3.org/2000/09/xmldsig#enveloped-signature`) |
| KeyInfo | X509SubjectName + X509Certificate |
| Reference URI | `""` (entire document) |

> **JADS NOTE**: iSPIRT source uses RSA-SHA1. UFAMS spec mandates SHA-256. JADS should **generate SHA-256** but **accept SHA-1** for backward compatibility with existing Digital Sky deployments.

---

## 6. Flight Log Format

### 6.1 JSON Schema

```json
{
  "PermissionArtefact": "string (permission artefact UUID)",
  "previous_log_hash": "string (Base64 hash of most recent flight log)",
  "LogEntries": [
    {
      "Entry_type": "TAKEOFF/ARM | GEOFENCE_BREACH | TIME_BREACH | LAND/DISARM",
      "TimeStamp": 1234567890,
      "Longitude": 77.5994,
      "Latitude": 12.9799,
      "Altitude": 50.0,
      "CRC": 0
    }
  ]
}
```

### 6.2 Entry Types (EntryType enum)

| Value | Description |
|-------|-------------|
| `TAKEOFF_OR_ARM` | Drone armed / took off |
| `GEOFENCE_BREACH` | Drone exited permitted fly area |
| `TIME_BREACH` | Flight exceeded permitted time window |
| `LAND_OR_DISARM` | Drone landed / disarmed |

### 6.3 Hash Chain Verification

- Each flight log includes `previous_log_hash` — the hash of the drone's most recent flight log
- Server verifies: `previous_log_hash == stored_hash(latest_log_for_UIN)`
- First log for a UIN: `previous_log_hash` check is skipped
- Logs are immutable: re-upload for same application ID is rejected

---

## 7. PKI / Certificate Chain

### 7.1 Trust Hierarchy

```
CCA Root Certificate (Controller of Certifying Authorities, India)
  └── Intermediate CA (optional)
       └── Manufacturer Certificate (end entity)
            └── Signs: drone registration/deregistration payloads
```

### 7.2 Validation Process

1. Load manufacturer's certificate chain from stored PEM file
2. Build PKIX trust anchors from CCA root (or self-signed if `self-signed-validity=true`)
3. Validate certificate path using BouncyCastle PKIX validator
4. **Revocation checking is DISABLED** in the reference implementation
5. Verify DN matching: client cert issuer CN/O must match a chain cert's subject CN/O
6. Verify digital signature on the `drone` JSON payload using cert's public key

### 7.3 Certificate Storage

- CCA root: `src/main/resources/CCAcertificate.pem`
- Manufacturer chains: uploaded during manufacturer profile creation (`trustedCertificateDoc`)
- Server signing key: `src/main/resources/key.pem` (PKCS8 RSA private key)
- Server certificate: `src/main/resources/cert.pem` (X.509 for PA signing)
- Keystore: `src/main/resources/keystore.jks` (for JWT signing)

---

## 8. Auto-Approval Decision Tree

```
FlyDronePermissionApplication submitted
│
├── Is fly area WITHIN a GREEN zone?
│   └── NO → ValidationException: fly area not within green zone
│
├── Does fly area INTERSECT a RED zone?
│   └── YES → ValidationException: fly area intersects red zone
│
├── Does fly area intersect any AMBER zone?
│   ├── YES → Requires manual approval (stays SUBMITTED)
│   │         Operator must have approved UAOP if drone is SMALL/MEDIUM/LARGE
│   │
│   └── NO → Check drone category regulations
│             │
│             ├── NANO drone, altitude ≤ 50 ft AGL?
│             │   └── YES → AUTO-APPROVED (status=APPROVED, PA generated)
│             │       comment: "Self approval, within green zone"
│             │
│             ├── MICRO drone, altitude ≤ 200 ft AGL?
│             │   └── YES → AUTO-APPROVED (status=APPROVED, PA generated)
│             │
│             └── SMALL / MEDIUM / LARGE, or above altitude thresholds?
│                 └── Requires manual approval (stays SUBMITTED)
│                     Must have approved UAOP

Manual Approval Paths:
A) Single-stage: Admin → APPROVED (generates PA with FIC + ADC numbers)
B) Two-stage:
   1. ATC_ADMIN → APPROVEDBYATC (generates FIC number only, NO PA)
   2. AFMLU_ADMIN → APPROVED (generates ADC number + signed PA)
```

---

## 9. Airspace Zone System

### 9.1 Zone Types

| Type | Color | Behavior |
|------|-------|----------|
| GREEN | Green | Unrestricted. Fly area must be within a green zone. |
| AMBER | Amber | Conditional. Intersection triggers manual approval requirement. |
| RED | Red | Prohibited. Any intersection blocks the application. |

### 9.2 Zone Properties

- Each zone is a GeoJSON FeatureCollection containing Polygon features (only Polygons accepted)
- Zones have a `minAltitude` (long, meters AGL) — zone only applies above this altitude
- Zones can be time-limited: `tempStartTime` / `tempEndTime` (LocalDateTime)
- Zone queries filter by altitude and time window

### 9.3 Geometry Operations

- **Intersection check**: JTS `Geometry.intersects()` — does fly area polygon touch any zone polygon?
- **Containment check**: JTS `Geometry.contains()` — is fly area polygon entirely within a green zone?
- **Area computation**: JTS `Geometry.getArea()` on spherical coordinates (converts deg→rad, scales by earth radius)
- **FIR detection**: Iterates over 4 FIR GeoJSON files, tests which FIR contains the fly area

---

## 10. FIR Boundaries

Four GeoJSON files defining Indian Flight Information Region boundaries:

| FIR | ICAO Code | File | Size |
|-----|-----------|------|------|
| Chennai | VOMF | `chennaiFir.json` | 993 bytes |
| Delhi | VIDF | `delhiFir.json` | 76,716 bytes |
| Kolkata | VECF | `kolkataFir.json` | 109,947 bytes |
| Mumbai | VABF | `mumbaiFir.json` | 6,948 bytes |

All files are GeoJSON FeatureCollection with Polygon geometry. Copied to `jads-backend/src/data/fir/`.

**Note**: In some git versions of the iSPIRT repo, Delhi and Mumbai FIR files were empty (0 bytes) and Kolkata was commented out. The current clone has valid data in all 4 files.

---

## 11. Enumerations

### ApplicationStatus
```
DRAFT, SUBMITTED, APPROVED, REJECTED,
APPROVEDBYATC, APPROVEDBYAFMLU, REJECTEDBYAFMLU, REJECTEDBYATC
```

### DroneCategoryType
```
NANO, MICRO, SMALL, MEDIUM, LARGE
```

### ApplicantType
```
INDIVIDUAL, ORGANISATION
```

### RegisterDroneResponseCode
```
REGISTERED, DEREGISTERED,
OPERATOR_BUSINESS_IDENTIFIER_INVALID, OPERATOR_BUSINESS_IDENTIFIER_MISSING,
INVALID_SIGNATURE, INVALID_DIGITAL_CERTIFICATE,
DRONE_ALREADY_REGISTERED, DRONE_NOT_FOUND, DRONE_NOT_REGISTERED,
INVALID_MANUFACTURER, MANUFACTURER_BUSINESS_IDENTIFIER_INVALID,
MANUFACTURER_TRUSTED_CERTIFICATE_NOT_FOUND,
BAD_REQUEST_PAYLOAD, DRONE_TYPE_NOT_APPROVED,
OPERATOR_HAS_NO_VALID_UAOP_PERMIT, EMPTY_DEVICE_ID
```

### AirspaceCategoryType
```
GREEN, AMBER, RED
```

### ApprovalStatus (for Pilot/Operator profiles)
```
APPROVED, REJECTED, PENDING
```

### WingType
```
FIXED, ROTARY
```

### EntryType (Flight Log)
```
GEO_FENCE_BREACH, TAKEOFF_OR_ARM, TIME_BREACH, LAND_OR_DISARM
```

---

## 12. Hardcoded Thresholds

| Constant | Value | Context |
|----------|-------|---------|
| SUNRISE_HOUR | 5 | Flight operations start (05:30) |
| SUNRISE_SUNSET_MINUTE | 30 | Added to sunrise/sunset hours |
| SUNSET_HOUR | 19 | Flight operations end (19:30) |
| MINIMUM_DAYS_BEFORE_PERMISSION_APPLY | 1 | Must apply at least 1 day ahead |
| MAXIMUM_DAYS_FOR_PERMISSION_APPLY | 5 | Cannot apply more than 5 days ahead |
| MAXIMUM_FLIGHT_AGL_IN_FT | 400 | Absolute altitude ceiling (all drones) |
| MAXIMUM_AUTO_PERM_MICRO_ALTITUDE_AGL_FT | 200 | Auto-approval ceiling for MICRO |
| MAXIMUM_AUTO_PERM_NANO_ALTITUDE_AGL_FT | 50 | Auto-approval ceiling for NANO |
| MAXIMUM_FLIGHT_AREA_SQ_KM | 3.14159 (pi) | Maximum fly area |
| Max file size | 10 MB | Per file upload |
| Max request size | 10 MB | Total multipart request |

---

## 13. Controller vs Docs Discrepancies

Cross-referencing the Java controller source code against the API markdown documentation reveals these discrepancies:

### 13.1 Content-Type Mismatches

| Endpoint | Docs say | Controller actually uses |
|----------|----------|------------------------|
| Manufacturer Add | Not specified as multipart | `@RequestPart("manufacturer")` + `@RequestPart("trustedCertificateDoc")` = multipart/form-data |
| UIN Add | Not specified as multipart | `@RequestPart("uinApplication")` + 9 `@RequestPart` file params = multipart/form-data |
| Import Drone Add | JSON | `@RequestPart("acquisitionForm")` = form-data with JSON part |
| Local Drone Add | JSON | `@RequestPart("acquisitionForm")` = form-data with JSON part |
| All Approve endpoints | Docs say "multipart/json" | Controller uses `@RequestBody` mapping = actually JSON |

### 13.2 Missing Endpoints in Docs

| Endpoint | Present in Controller | In Docs? |
|----------|----------------------|----------|
| `GET /api/airspaceCategory/{id}` | Yes (AirspaceCategoryController) | No |
| `GET /api/airspaceCategory/getAll` | Yes | No |
| `POST /api/occurrenceReport` | Yes (OccurrenceReportController) | No |
| `GET /api/occurrenceReport/{id}` | Yes | No |
| `GET /api/occurrenceReport/list` | Yes | No |
| `GET /api/occurrenceReport/getAll` | Yes | No |
| `POST /api/admin/director` | Yes (DirectorController) | No |
| `PUT /api/admin/director/{id}` | Yes | No |
| `GET /api/admin/director/{id}` | Yes | No |
| `GET /api/admin/director/all/{page}` | Yes | No |
| `POST /api/blog` | Yes (BlogController) | No |
| `PATCH /api/blog/{id}` | Yes | No |
| `GET /api/blog/getAll` | Yes | No |

### 13.3 Field Name Mismatches

| Context | Docs | Source Code |
|---------|------|-------------|
| Fly permission datetime | `startDateTime` (dd-MM-yyyy HH:mm:ss) | Domain uses `java.util.Date` with Jackson deserialization |
| Flight log entry type | `TAKEOFF/ARM`, `LAND/DISARM` (with slash) | Enum: `TAKEOFF_OR_ARM`, `LAND_OR_DISARM` (with underscore) |
| Drone type date of manufacture | `mm-dd-yyyy` in docs | `@JsonFormat(shape = Shape.STRING, pattern = "dd-MM-yyyy")` in source |
| Flight log `Entry_type` | PascalCase in docs | Enum uses UPPER_SNAKE_CASE |

### 13.4 Status Values

- Docs only mention: DRAFT, APPROVED, REJECTED
- Source code has 8 values: DRAFT, SUBMITTED, APPROVED, REJECTED, APPROVEDBYATC, APPROVEDBYAFMLU, REJECTEDBYAFMLU, REJECTEDBYATC
- The multi-stage ATC/AFMLU statuses are completely undocumented

### 13.5 Authentication

- Docs don't mention that drone register/deregister use PKI instead of JWT
- Docs don't document the `SecurityConfig` whitelist (which paths are public vs authenticated)
- The roles system (ADMIN, ATC_ADMIN, AFMLU_ADMIN, etc.) is undocumented in the API docs

### 13.6 Signing Algorithm

- Source code uses **RSA-SHA1** for PA XML signing
- UFAMS specification mandates **RSA-SHA256**
- This is a known divergence in the reference implementation

### 13.7 Double-Slash URL Bug

- Flight log upload endpoint in docs: `/api/applicationForm/flyDronePermissionApplication/{id}//document/flightLog`
- The double slash `//` appears in both docs and source — appears intentional (or consistently buggy)

---

## 14. JADS Implementation Notes

### 14.1 What JADS Needs from Digital Sky

| Feature | DS Endpoint | JADS Integration |
|---------|-------------|-----------------|
| Drone registration | POST `/api/droneDevice/register/{mbi}` | JADS generates PKI-signed registration payloads |
| Flight permission | POST `/api/.../flyDronePermissionApplication` | JADS files drone flight plans to Digital Sky |
| PA download | Returned as signed XML on approval | JADS stores and verifies PA before allowing drone arm |
| Flight log upload | POST `/api/.../flightLog` | JADS submits post-flight logs with hash chain |
| UIN application | POST `/api/.../uinApplication` | Forward UIN applications to DGCA |
| Zone data | GET `/api/airspaceCategory/getAll` | Sync airspace zones into JADS zone database |

### 14.2 Cryptographic Alignment

| Operation | Digital Sky (iSPIRT) | JADS Target |
|-----------|---------------------|-------------|
| PA signing | RSA-SHA1 | Generate: RSA-SHA256. Accept: both SHA-1 and SHA-256 |
| Device registration signature | SHA256withRSA | Align: SHA256withRSA |
| Flight log hash chain | SHA (unspecified in source) | Use SHA-256, align with JADS existing chain format |
| Certificate validation | PKIX, revocation disabled | PKIX with optional OCSP/CRL when available |

### 14.3 Data Format Alignment

| Field | DS Format | JADS Format | Action |
|-------|-----------|-------------|--------|
| Dates | dd-MM-yyyy or dd-MM-yyyy HH:mm:ss | UTC milliseconds (BigInt string) | Convert at adapter boundary |
| Coordinates | `{latitude, longitude}` objects | JADS uses decimal degrees | Direct mapping |
| Altitude | Feet AGL (in permissions) | JADS uses meters internally | Convert at adapter boundary |
| IDs | Long (JPA) / String (MongoDB ObjectId) | JADS uses UUID strings | Map at adapter boundary |
| Drone category | NANO/MICRO/SMALL/MEDIUM/LARGE | Align with existing JADS weight categories | Direct mapping |

### 14.4 FIR GeoJSON Integration

The 4 FIR GeoJSON files have been copied to `jads-backend/src/data/fir/`. These will be used by:
- `FlyDronePermissionService` to determine which FIR a flight area falls within
- `RoutePlanningService` to identify FIR crossings for manned flight plans
- `DataSourceReconciliationService` for cross-referencing eAIP and Jeppesen data per FIR

### 14.5 Adapter Stub Strategy

The `DigitalSkyAdapterStub` should implement all endpoints as local in-memory operations:
- Device registration: validate signature format, store in memory, return REGISTERED
- Flight permission: accept application, run auto-approval logic locally
- PA generation: generate and sign PA XML using JADS server keys
- Flight log: accept and verify hash chain locally
- Zone data: return zones from JADS database

When `USE_LIVE_ADAPTERS=true`, the live adapter will make HTTP calls to the actual Digital Sky API at `DIGITAL_SKY_BASE_URL`.
