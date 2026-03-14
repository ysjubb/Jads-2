// PAStorage.swift
// JADS
//
// Local storage manager for downloaded Permission Artefact ZIP files.
// Files are stored in the app's Documents/PermitArtefacts/ directory.
// Expired PAs (endDateTime in the past) can be cleaned up automatically.

import Foundation

/// Manages local storage of Permission Artefact ZIP files.
///
/// PA ZIPs are stored in `Documents/PermitArtefacts/` with filenames
/// derived from the application ID: `{applicationId}.zip`.
///
/// Thread safety: All methods are synchronous and use `FileManager.default`.
/// Callers should dispatch to a background queue for bulk operations.
final class PAStorage: Sendable {

    // MARK: - Constants

    /// The subdirectory name within the app's Documents directory.
    private static let directoryName = "PermitArtefacts"

    /// File extension for stored PA files.
    private static let fileExtension = "zip"

    /// Key prefix for storing end-datetime metadata alongside PA files.
    private static let metadataExtension = "meta.json"

    // MARK: - Directory Management

    /// Returns the URL for the PermitArtefacts directory, creating it if necessary.
    /// - Throws: If the directory cannot be created.
    private static func permitArtefactsDirectory() throws -> URL {
        let documentsURL = try FileManager.default.url(
            for: .documentDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )

        let artefactsURL = documentsURL.appendingPathComponent(directoryName, isDirectory: true)

        if !FileManager.default.fileExists(atPath: artefactsURL.path) {
            try FileManager.default.createDirectory(
                at: artefactsURL,
                withIntermediateDirectories: true,
                attributes: [
                    // Protect PA files with complete file protection
                    .protectionKey: FileProtectionType.complete
                ]
            )
        }

        return artefactsURL
    }

    /// Returns the file URL for a PA ZIP given its application ID.
    private static func fileURL(for applicationId: String) throws -> URL {
        let directory = try permitArtefactsDirectory()
        let sanitized = sanitizeFilename(applicationId)
        return directory.appendingPathComponent("\(sanitized).\(fileExtension)")
    }

    /// Returns the file URL for the metadata JSON associated with a PA.
    private static func metadataURL(for applicationId: String) throws -> URL {
        let directory = try permitArtefactsDirectory()
        let sanitized = sanitizeFilename(applicationId)
        return directory.appendingPathComponent("\(sanitized).\(metadataExtension)")
    }

    /// Sanitize an application ID for use as a filename.
    /// Removes path separators and other problematic characters.
    private static func sanitizeFilename(_ name: String) -> String {
        let invalidCharacters = CharacterSet(charactersIn: "/\\:*?\"<>|")
        return name.components(separatedBy: invalidCharacters).joined(separator: "_")
    }

    // MARK: - Public API

    /// Save a downloaded Permission Artefact ZIP to local storage.
    ///
    /// If a file already exists for this application ID, it will be overwritten.
    ///
    /// - Parameters:
    ///   - pa: The raw ZIP data to save.
    ///   - applicationId: The eGCA-assigned application identifier.
    ///   - endDateTime: Optional flight end time for expiry-based cleanup.
    /// - Throws: If the file cannot be written to disk.
    static func save(pa: Data, applicationId: String, endDateTime: Date? = nil) throws {
        let url = try fileURL(for: applicationId)

        try pa.write(to: url, options: [.atomic, .completeFileProtection])

        // Store metadata alongside the ZIP
        let metadata = PAMetadata(
            applicationId: applicationId,
            cachedAt: Date(),
            endDateTime: endDateTime,
            fileSizeBytes: Int64(pa.count)
        )
        let metaURL = try metadataURL(for: applicationId)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let metaData = try encoder.encode(metadata)
        try metaData.write(to: metaURL, options: [.atomic, .completeFileProtection])
    }

    /// Load a previously cached Permission Artefact ZIP from local storage.
    ///
    /// - Parameter applicationId: The eGCA-assigned application identifier.
    /// - Returns: The raw ZIP data.
    /// - Throws: If the file does not exist or cannot be read.
    static func load(applicationId: String) throws -> Data {
        let url = try fileURL(for: applicationId)

        guard FileManager.default.fileExists(atPath: url.path) else {
            throw PAStorageError.notFound(applicationId)
        }

        return try Data(contentsOf: url)
    }

    /// List all cached Permission Artefacts with their metadata.
    ///
    /// - Returns: An array of ``CachedPA`` entries sorted by cached date (newest first).
    static func listCached() -> [CachedPA] {
        guard let directory = try? permitArtefactsDirectory() else {
            return []
        }

        let fileManager = FileManager.default

        guard let contents = try? fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.fileSizeKey, .creationDateKey],
            options: [.skipsHiddenFiles]
        ) else {
            return []
        }

        // Find all .zip files and pair with their metadata
        let zipFiles = contents.filter { $0.pathExtension == fileExtension }

        var results: [CachedPA] = []

        for zipURL in zipFiles {
            let applicationId = zipURL.deletingPathExtension().lastPathComponent

            // Read file attributes
            let attributes = try? fileManager.attributesOfItem(atPath: zipURL.path)
            let fileSize = (attributes?[.size] as? Int64) ?? 0
            let creationDate = (attributes?[.creationDate] as? Date) ?? Date.distantPast

            // Try to read metadata
            var endDateTime: Date?
            if let metaURL = try? metadataURL(for: applicationId),
               let metaData = try? Data(contentsOf: metaURL) {
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                if let metadata = try? decoder.decode(PAMetadata.self, from: metaData) {
                    endDateTime = metadata.endDateTime
                }
            }

            results.append(CachedPA(
                applicationId: applicationId,
                fileURL: zipURL,
                fileSizeBytes: fileSize,
                cachedAt: creationDate,
                endDateTime: endDateTime
            ))
        }

        // Sort by cached date, newest first
        return results.sorted { $0.cachedAt > $1.cachedAt }
    }

    /// Delete all expired Permission Artefacts from local storage.
    ///
    /// A PA is considered expired when its `endDateTime` is in the past.
    /// PAs without an `endDateTime` are never automatically deleted.
    static func deleteExpired() {
        let cached = listCached()
        let fileManager = FileManager.default

        for pa in cached where pa.isExpired {
            // Delete the ZIP file
            try? fileManager.removeItem(at: pa.fileURL)

            // Delete the metadata file
            if let metaURL = try? metadataURL(for: pa.applicationId) {
                try? fileManager.removeItem(at: metaURL)
            }
        }
    }

    /// Delete a specific cached PA by application ID.
    ///
    /// - Parameter applicationId: The eGCA-assigned application identifier.
    /// - Returns: `true` if the file was deleted, `false` if it did not exist.
    @discardableResult
    static func delete(applicationId: String) -> Bool {
        let fileManager = FileManager.default

        guard let url = try? fileURL(for: applicationId),
              fileManager.fileExists(atPath: url.path) else {
            return false
        }

        try? fileManager.removeItem(at: url)

        if let metaURL = try? metadataURL(for: applicationId) {
            try? fileManager.removeItem(at: metaURL)
        }

        return true
    }

    /// Check whether a PA is cached locally for the given application ID.
    ///
    /// - Parameter applicationId: The eGCA-assigned application identifier.
    /// - Returns: `true` if a cached ZIP exists.
    static func exists(applicationId: String) -> Bool {
        guard let url = try? fileURL(for: applicationId) else {
            return false
        }
        return FileManager.default.fileExists(atPath: url.path)
    }
}

// MARK: - Internal Metadata Model

/// Internal metadata stored alongside each PA ZIP file.
private struct PAMetadata: Codable {
    let applicationId: String
    let cachedAt: Date
    let endDateTime: Date?
    let fileSizeBytes: Int64
}

// MARK: - PAStorage Errors

/// Errors specific to PA local storage operations.
enum PAStorageError: Error, LocalizedError, Sendable {
    /// The requested PA file was not found in local storage.
    case notFound(String)

    /// The PA storage directory could not be created or accessed.
    case directoryError(String)

    var errorDescription: String? {
        switch self {
        case .notFound(let applicationId):
            return "Permission Artefact for application \(applicationId) not found in local storage."
        case .directoryError(let reason):
            return "PA storage directory error: \(reason)"
        }
    }
}
