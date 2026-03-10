// EgcaService.swift
// JADS
//
// Production implementation of EgcaServiceProtocol.
// URLSession-based HTTP client with async/await structured concurrency.
//
// Features:
//   - JWT token storage in Keychain (Security framework)
//   - Auto-refresh token when < 5 minutes from expiry
//   - Exponential backoff retry: 3 attempts at 1s / 2s / 4s
//   - 30-second request timeout
//   - Base URL from Info.plist key EGCA_API_BASE_URL
//   - No third-party dependencies

import Foundation
import Security

// MARK: - EgcaService

/// Production eGCA API service using URLSession.
///
/// This class manages JWT authentication with Keychain storage,
/// automatic token refresh, and typed error handling for all eGCA
/// API interactions.
///
/// ## Configuration
/// Set the `EGCA_API_BASE_URL` key in your app's Info.plist to configure
/// the eGCA API endpoint.
///
/// ## Thread Safety
/// This class is `Sendable`-compatible. All mutable state is protected
/// by an actor-based isolation strategy using `TokenManager`.
final class EgcaService: EgcaServiceProtocol, Sendable {

    // MARK: - Constants

    /// Request timeout in seconds.
    private static let requestTimeoutSeconds: TimeInterval = 30

    /// Maximum retry attempts for transient failures.
    private static let maxRetries = 3

    /// Base delay for exponential backoff (1 second).
    private static let retryBaseDelayNanoseconds: UInt64 = 1_000_000_000

    /// Refresh the token when it has fewer than 5 minutes remaining.
    private static let tokenRefreshMarginSeconds: TimeInterval = 5 * 60

    /// User-Agent header value.
    private static let userAgent = "JADS-iOS/4.0"

    /// Info.plist key for the eGCA API base URL.
    private static let baseURLPlistKey = "EGCA_API_BASE_URL"

    // MARK: - Properties

    /// The configured base URL for the eGCA API.
    private let baseURL: URL

    /// The URLSession used for all API requests.
    private let session: URLSession

    /// The token manager handles JWT storage, retrieval, and refresh logic.
    private let tokenManager: TokenManager

    // MARK: - Initialization

    /// Create a new EgcaService instance.
    ///
    /// - Parameters:
    ///   - baseURL: Override the base URL (defaults to Info.plist `EGCA_API_BASE_URL`).
    ///   - session: Override the URLSession (defaults to a configured ephemeral session).
    init(baseURL: URL? = nil, session: URLSession? = nil) {
        if let baseURL {
            self.baseURL = baseURL
        } else {
            guard let plistURL = Bundle.main.object(forInfoDictionaryKey: Self.baseURLPlistKey) as? String,
                  let url = URL(string: plistURL) else {
                fatalError(
                    "EGCA_API_BASE_URL not configured in Info.plist. "
                    + "Add the key with your eGCA API base URL."
                )
            }
            self.baseURL = url
        }

        if let session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.ephemeral
            config.timeoutIntervalForRequest = Self.requestTimeoutSeconds
            config.timeoutIntervalForResource = Self.requestTimeoutSeconds * 2
            config.waitsForConnectivity = false
            config.httpAdditionalHeaders = [
                "User-Agent": Self.userAgent,
                "Accept": "application/json"
            ]
            self.session = URLSession(configuration: config)
        }

        self.tokenManager = TokenManager()
    }

    // MARK: - EgcaServiceProtocol Implementation

    func authenticate(email: String, password: String) async throws -> AuthToken {
        let body: [String: String] = [
            "email": email,
            "password": password
        ]

        let data = try await performRequest(
            method: "POST",
            path: "/auth/login",
            body: body,
            requiresAuth: false
        )

        let authToken = try decodeJSON(AuthToken.self, from: data)

        // Store the token in Keychain
        await tokenManager.store(token: authToken)

        return authToken
    }

    func submitFlightPermission(_ payload: FlightPermissionPayload) async throws -> PermissionApplication {
        let body = try encodeJSON(payload)

        let data = try await authenticatedRequest(
            method: "POST",
            path: "/flight-permission/apply",
            bodyData: body
        )

        return try decodeJSON(PermissionApplication.self, from: data)
    }

    func getPermissionStatus(applicationId: String) async throws -> PermissionStatus {
        let encodedId = applicationId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? applicationId

        let data = try await authenticatedRequest(
            method: "GET",
            path: "/flight-permission/status/\(encodedId)"
        )

        return try decodeJSON(PermissionStatus.self, from: data)
    }

    func downloadPermissionArtefact(applicationId: String) async throws -> Data {
        let encodedId = applicationId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? applicationId

        let data = try await authenticatedRequest(
            method: "GET",
            path: "/flight-permission/artefact/\(encodedId)",
            acceptHeader: "application/octet-stream"
        )

        // Verify we got some data back
        guard !data.isEmpty else {
            throw EgcaError.paNotReady
        }

        return data
    }

    func uploadFlightLog(applicationId: String, logData: Data) async throws {
        let encodedId = applicationId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? applicationId

        _ = try await authenticatedRequest(
            method: "POST",
            path: "/flight-log/upload/\(encodedId)",
            bodyData: logData,
            contentType: "application/octet-stream"
        )
    }

    func listMyPermissions(page: Int) async throws -> PaginatedPermissions {
        let data = try await authenticatedRequest(
            method: "GET",
            path: "/flight-permission/list?page=\(page)"
        )

        return try decodeJSON(PaginatedPermissions.self, from: data)
    }

    func checkAirspaceZone(polygon: [LatLng]) async throws -> ZoneClassification {
        let body: [String: [LatLng]] = ["polygon": polygon]
        let bodyData = try encodeJSON(body)

        let data = try await authenticatedRequest(
            method: "POST",
            path: "/airspace/zone-check",
            bodyData: bodyData,
            contentType: "application/json"
        )

        return try decodeJSON(ZoneClassification.self, from: data)
    }

    func submitYellowZonePermission(payload: YellowZonePermissionPayload) async throws -> String {
        let bodyData = try encodeJSON(payload)

        let data = try await authenticatedRequest(
            method: "POST",
            path: "/airspace/yellow-zone/submit",
            bodyData: bodyData,
            contentType: "application/json"
        )

        struct SubmitResponse: Decodable {
            let applicationId: String
        }

        let response = try decodeJSON(SubmitResponse.self, from: data)
        return response.applicationId
    }

    func validateFlightPlan(
        polygon: [LatLng],
        altitudeMeters: Double,
        startTime: Date,
        endTime: Date
    ) async throws -> ValidationResult {
        struct ValidatePayload: Encodable {
            let polygon: [LatLng]
            let altitudeMeters: Double
            let startDateTime: String
            let endDateTime: String
        }

        let payload = ValidatePayload(
            polygon: polygon,
            altitudeMeters: altitudeMeters,
            startDateTime: EgcaDateFormatters.digitalSky.string(from: startTime),
            endDateTime: EgcaDateFormatters.digitalSky.string(from: endTime)
        )

        let bodyData = try encodeJSON(payload)

        let data = try await authenticatedRequest(
            method: "POST",
            path: "/drone/validate-flight-plan",
            bodyData: bodyData,
            contentType: "application/json"
        )

        return try decodeJSON(ValidationResult.self, from: data)
    }

    // MARK: - Authenticated Request (with token refresh)

    /// Perform an authenticated request, automatically refreshing the token if needed.
    ///
    /// If the token is within 5 minutes of expiry, it is refreshed before the request.
    /// If the request returns 401, the token is cleared and the request retried once
    /// after re-authentication.
    private func authenticatedRequest(
        method: String,
        path: String,
        bodyData: Data? = nil,
        contentType: String? = nil,
        acceptHeader: String? = nil
    ) async throws -> Data {
        // Ensure we have a valid token
        let token = try await ensureValidToken()

        do {
            return try await performRequest(
                method: method,
                path: path,
                bodyData: bodyData,
                contentType: contentType,
                acceptHeader: acceptHeader,
                requiresAuth: true,
                bearerToken: token
            )
        } catch EgcaError.unauthorized {
            // Token may have been invalidated server-side; clear and retry once
            await tokenManager.clear()
            let freshToken = try await ensureValidToken()
            return try await performRequest(
                method: method,
                path: path,
                bodyData: bodyData,
                contentType: contentType,
                acceptHeader: acceptHeader,
                requiresAuth: true,
                bearerToken: freshToken
            )
        }
    }

    /// Ensure we have a valid (non-expired) JWT token.
    /// - Returns: The current valid token string.
    /// - Throws: ``EgcaError/unauthorized`` if no credentials are available.
    private func ensureValidToken() async throws -> String {
        if let token = await tokenManager.validToken(
            marginSeconds: Self.tokenRefreshMarginSeconds
        ) {
            return token
        }

        // No valid token available -- caller must authenticate first
        throw EgcaError.unauthorized
    }

    // MARK: - HTTP Request Engine

    /// Core HTTP request method with exponential backoff retry.
    ///
    /// - Parameters:
    ///   - method: HTTP method (GET, POST, etc.).
    ///   - path: API path appended to baseURL.
    ///   - body: Optional Encodable body (will be JSON-encoded).
    ///   - bodyData: Optional raw body data (mutually exclusive with `body`).
    ///   - contentType: Override Content-Type header.
    ///   - acceptHeader: Override Accept header.
    ///   - requiresAuth: Whether to include Authorization header.
    ///   - bearerToken: The JWT token for Authorization header.
    /// - Returns: The response body data.
    /// - Throws: ``EgcaError`` for all failure cases.
    private func performRequest(
        method: String,
        path: String,
        body: (any Encodable)? = nil,
        bodyData: Data? = nil,
        contentType: String? = nil,
        acceptHeader: String? = nil,
        requiresAuth: Bool = true,
        bearerToken: String? = nil
    ) async throws -> Data {
        let url = baseURL.appendingPathComponent(path)

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = Self.requestTimeoutSeconds

        // Headers
        if let acceptHeader {
            request.setValue(acceptHeader, forHTTPHeaderField: "Accept")
        }

        if requiresAuth, let bearerToken {
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        }

        // Body
        if let body {
            let encoded = try encodeJSON(body)
            request.httpBody = encoded
            request.setValue(
                contentType ?? "application/json",
                forHTTPHeaderField: "Content-Type"
            )
        } else if let bodyData {
            request.httpBody = bodyData
            request.setValue(
                contentType ?? "application/octet-stream",
                forHTTPHeaderField: "Content-Type"
            )
        }

        // Retry loop with exponential backoff
        var lastError: EgcaError?

        for attempt in 1...Self.maxRetries {
            do {
                let (data, response) = try await session.data(for: request)

                guard let httpResponse = response as? HTTPURLResponse else {
                    throw EgcaError.networkError(
                        URLError(.badServerResponse, userInfo: [
                            NSLocalizedDescriptionKey: "Invalid server response"
                        ])
                    )
                }

                // Success range
                if (200..<300).contains(httpResponse.statusCode) {
                    return data
                }

                // Map HTTP errors to typed EgcaError
                let error = mapHTTPError(statusCode: httpResponse.statusCode, data: data, path: path)

                // Only retry on server errors (5xx)
                if httpResponse.statusCode >= 500 {
                    lastError = error
                    // Fall through to retry logic below
                } else {
                    // Client errors (4xx) are not retryable
                    throw error
                }

            } catch let error as EgcaError {
                // If it is a non-retryable EgcaError, throw immediately
                switch error {
                case .unauthorized, .notFound, .invalidPayload, .paNotReady:
                    throw error
                case .serverError, .networkError, .timeout:
                    lastError = error
                }
            } catch let urlError as URLError {
                if urlError.code == .timedOut {
                    lastError = .timeout
                } else {
                    lastError = .networkError(urlError)
                }
            } catch {
                lastError = .networkError(error)
            }

            // Exponential backoff before retry (1s, 2s, 4s)
            if attempt < Self.maxRetries {
                let delay = Self.retryBaseDelayNanoseconds * UInt64(1 << (attempt - 1))
                try await Task.sleep(nanoseconds: delay)
            }
        }

        // All retries exhausted
        throw lastError ?? EgcaError.networkError(
            URLError(.unknown, userInfo: [
                NSLocalizedDescriptionKey: "Request failed after \(Self.maxRetries) attempts"
            ])
        )
    }

    // MARK: - Error Mapping

    /// Map an HTTP status code to the appropriate ``EgcaError``.
    private func mapHTTPError(statusCode: Int, data: Data, path: String) -> EgcaError {
        // Try to extract a message from the response body
        let message = extractErrorMessage(from: data) ?? "HTTP \(statusCode)"

        switch statusCode {
        case 401:
            return .unauthorized
        case 404:
            return .notFound
        case 409 where path.contains("artefact"):
            return .paNotReady
        case 422:
            return .invalidPayload(message)
        case 500...599:
            return .serverError(statusCode, message)
        default:
            return .serverError(statusCode, message)
        }
    }

    /// Try to extract an error message from a JSON response body.
    private func extractErrorMessage(from data: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return (json["message"] as? String) ?? (json["error"] as? String)
    }

    // MARK: - JSON Encoding / Decoding

    /// Shared JSON encoder configured for eGCA API conventions.
    private static let jsonEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .useDefaultKeys
        return encoder
    }()

    /// Shared JSON decoder configured for eGCA API conventions.
    private static let jsonDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .useDefaultKeys
        return decoder
    }()

    /// Encode an Encodable value to JSON Data.
    private func encodeJSON(_ value: some Encodable) throws -> Data {
        do {
            return try Self.jsonEncoder.encode(value)
        } catch {
            throw EgcaError.invalidPayload("Failed to encode request: \(error.localizedDescription)")
        }
    }

    /// Decode JSON Data to a Decodable type.
    private func decodeJSON<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try Self.jsonDecoder.decode(type, from: data)
        } catch {
            throw EgcaError.serverError(
                0,
                "Failed to decode response: \(error.localizedDescription)"
            )
        }
    }
}

// MARK: - Token Manager (Actor)

/// Actor-based JWT token manager with Keychain persistence.
///
/// All mutable token state is isolated within this actor,
/// providing thread-safe access from concurrent tasks.
private actor TokenManager {

    // MARK: - Keychain Constants

    /// Keychain service identifier for eGCA tokens.
    private static let keychainService = "com.jads.egca.auth"

    /// Keychain account key for the JWT token.
    private static let keychainAccountToken = "egca_jwt_token"

    /// Keychain account key for the token expiry date.
    private static let keychainAccountExpiry = "egca_jwt_expiry"

    // MARK: - In-Memory Cache

    /// Cached token to avoid Keychain reads on every request.
    private var cachedToken: String?

    /// Cached expiry date.
    private var cachedExpiresAt: Date?

    // MARK: - Initialization

    init() {
        // Load from Keychain on init
        self.cachedToken = Self.readKeychainString(account: Self.keychainAccountToken)
        if let expiryString = Self.readKeychainString(account: Self.keychainAccountExpiry) {
            self.cachedExpiresAt = EgcaDateFormatters.parseISO8601(expiryString)
        }
    }

    // MARK: - Public Interface

    /// Store a new auth token in both memory and Keychain.
    func store(token: AuthToken) {
        cachedToken = token.token
        cachedExpiresAt = token.expiresAt

        Self.writeKeychainString(
            value: token.token,
            account: Self.keychainAccountToken
        )

        let expiryString = EgcaDateFormatters.iso8601.string(from: token.expiresAt)
        Self.writeKeychainString(
            value: expiryString,
            account: Self.keychainAccountExpiry
        )
    }

    /// Retrieve the current token if it is valid (not expired, considering the margin).
    ///
    /// - Parameter marginSeconds: How many seconds before actual expiry to consider
    ///   the token invalid (default: 300 = 5 minutes).
    /// - Returns: The token string if valid, or `nil` if expired or absent.
    func validToken(marginSeconds: TimeInterval = 300) -> String? {
        guard let token = cachedToken, let expiresAt = cachedExpiresAt else {
            return nil
        }

        let adjustedExpiry = expiresAt.addingTimeInterval(-marginSeconds)
        guard Date() < adjustedExpiry else {
            return nil
        }

        return token
    }

    /// Clear the stored token from both memory and Keychain.
    func clear() {
        cachedToken = nil
        cachedExpiresAt = nil

        Self.deleteKeychainItem(account: Self.keychainAccountToken)
        Self.deleteKeychainItem(account: Self.keychainAccountExpiry)
    }

    // MARK: - Keychain Operations

    /// Write a string value to the Keychain.
    private static func writeKeychainString(value: String, account: String) {
        guard let data = value.data(using: .utf8) else { return }

        // Delete any existing item first
        deleteKeychainItem(account: account)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        if status != errSecSuccess {
            // Log but do not throw -- Keychain failure is non-fatal,
            // the in-memory cache will still work for this session.
            #if DEBUG
            print("[EgcaService] Keychain write failed for \(account): OSStatus \(status)")
            #endif
        }
    }

    /// Read a string value from the Keychain.
    private static func readKeychainString(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let string = String(data: data, encoding: .utf8) else {
            return nil
        }

        return string
    }

    /// Delete a Keychain item.
    private static func deleteKeychainItem(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account
        ]

        SecItemDelete(query as CFDictionary)
    }
}
