package com.jads.time

import org.apache.commons.net.ntp.NTPUDPClient
import java.net.InetAddress
import kotlin.math.abs

// NTP quorum authority — requires MINIMUM 2 servers to agree before mission start.
// If quorum not reached: SyncStatus.FAILED → MissionController blocks mission.
// Evidence stored in MissionEntity for forensic verification.
//
// MANDATORY: timeInfo.computeDetails() MUST be called before getOffset().
// Without it, getOffset() always returns 0ms silently. Tests pass (mocked),
// but real device records wrong timestamps. Comment below is load-bearing.

data class TimeAuthorityEvidence(
    val servers:        List<String>,
    val offsets:        List<Long>,       // NTP offsets in milliseconds
    val delays:         List<Long>,       // Round-trip delays in milliseconds
    val syncStatus:     SyncStatus,
    val correctionMs:   Long,             // Final applied correction
    val spreadMs:       Long,             // Max - min offset across servers
    val evidenceTimeMs: Long              // System.currentTimeMillis() when evidence collected
)

enum class SyncStatus {
    SYNCED,          // Quorum reached, spread within tolerance
    DEGRADED,        // Fewer than ideal servers but quorum met
    FAILED,          // Quorum not reached — mission cannot start
    SPREAD_EXCEEDED  // Quorum met but servers disagree too much
}

class NtpQuorumAuthority(
    private val servers:       List<String> = listOf(
        "time.google.com",      // Google — anycast, globally reachable
        "time.nist.gov",        // NIST — US, reliable stratum-1
        "time.nplindia.org",    // NPL India — official Indian NTP stratum-1
        "time.cloudflare.com",  // Cloudflare — anycast, low latency
        "pool.ntp.org"          // NTP Pool — geographically diverse
        // ntp.aai.aero removed — unreachable from civilian networks
    ),
    private val quorumMinimum: Int  = 2,
    private val maxSpreadMs:   Long = 100L,
    private val timeoutMs:     Int  = 3000
) {
    private var lastEvidence: TimeAuthorityEvidence? = null

    fun syncAndGetEvidence(): TimeAuthorityEvidence {
        val client = NTPUDPClient()
        client.defaultTimeout = timeoutMs
        client.open()

        val successOffsets = mutableListOf<Long>()
        val successDelays  = mutableListOf<Long>()
        val successServers = mutableListOf<String>()

        for (server in servers) {
            try {
                val address  = InetAddress.getByName(server)
                val timeInfo = client.getTime(address)

                // MANDATORY — do not remove. Without this, getOffset() returns 0ms silently.
                timeInfo.computeDetails()

                successOffsets.add(timeInfo.offset)
                successDelays.add(timeInfo.delay)
                successServers.add(server)
            } catch (e: Exception) {
                // Server unreachable — continue to next
            }
        }

        client.close()

        val evidence = buildEvidence(successServers, successOffsets, successDelays)
        lastEvidence = evidence
        return evidence
    }

    fun getLastEvidence(): TimeAuthorityEvidence? = lastEvidence

    private fun buildEvidence(
        servers: List<String>,
        offsets: List<Long>,
        delays:  List<Long>
    ): TimeAuthorityEvidence {
        if (offsets.size < quorumMinimum) {
            return TimeAuthorityEvidence(
                servers = servers, offsets = offsets, delays = delays,
                syncStatus = SyncStatus.FAILED,
                correctionMs = 0L,
                spreadMs = if (offsets.isEmpty()) 0L else offsets.max() - offsets.min(),
                evidenceTimeMs = System.currentTimeMillis()
            )
        }

        val spread = offsets.max() - offsets.min()
        val median = offsets.sorted()[offsets.size / 2]

        val status = when {
            spread > maxSpreadMs         -> SyncStatus.SPREAD_EXCEEDED
            servers.size < this.servers.size -> SyncStatus.DEGRADED
            else                         -> SyncStatus.SYNCED
        }

        return TimeAuthorityEvidence(
            servers = servers, offsets = offsets, delays = delays,
            syncStatus = status,
            correctionMs = median,
            spreadMs = spread,
            evidenceTimeMs = System.currentTimeMillis()
        )
    }
}
