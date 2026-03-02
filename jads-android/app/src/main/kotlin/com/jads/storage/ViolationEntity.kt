package com.jads.storage

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "violations",
    foreignKeys = [
        ForeignKey(
            entity        = MissionEntity::class,
            parentColumns = ["id"],
            childColumns  = ["missionDbId"],
            // RESTRICT: violation records must outlive their parent mission.
            // They are evidence — never silently deleted.
            onDelete      = ForeignKey.RESTRICT
        )
    ],
    indices = [
        Index(value = ["missionDbId"]),
        Index(value = ["missionId"])
    ]
)
data class ViolationEntity(
    @PrimaryKey(autoGenerate = true)
    val id:                 Long = 0,

    val missionDbId:        Long,
    val missionId:          Long,
    val sequence:           Long,      // Telemetry record sequence where violation occurred

    val violationType:      String,    // AGL_EXCEEDED, GEOFENCE_BREACH, ZONE_INCURSION, GNSS_REJECTED
    val severity:           String,    // WARNING, CRITICAL

    val timestampUtcMs:     Long,
    val latitudeMicrodeg:   Long,
    val longitudeMicrodeg:  Long,
    val altitudeCm:         Long,

    val detailJson:         String     // Structured detail: threshold, actual value, zone ID, etc.
)
