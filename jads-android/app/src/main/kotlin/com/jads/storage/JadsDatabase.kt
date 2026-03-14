package com.jads.storage

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import net.sqlcipher.database.SupportFactory
import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update

// SQLCipher-encrypted Room database.
//
// WARNING 1: SupportFactory MUST receive ByteArray — NOT CharArray, NOT String.
//   Both compile. CharArray uses a different key derivation. Mission data is
//   silently lost on reopen. Only ByteArray produces the correct SQLCipher key.
//   Correct:  SupportFactory(passphrase)              where passphrase: ByteArray
//   WRONG:    SupportFactory(passphrase.toCharArray())
//   WRONG:    SupportFactory(passphrase.toString())
//
// WARNING 2: passphrase.fill(0) in finally block — ALWAYS, even on exception.
//   Passphrase must not persist in heap memory after DB is opened.
//
// WARNING 3: No destructive migration fallback anywhere in this file.
//   Flight data must NEVER be silently wiped on a migration failure.
//   A migration error must crash and surface to the operator — not silently
//   destroy the forensic record. Do not add Room's destructive migration option.

@Database(
    entities = [
        MissionEntity::class,
        TelemetryRecordEntity::class,
        ViolationEntity::class
    ],
    version  = 1,
    exportSchema = true
)
abstract class JadsDatabase : RoomDatabase() {

    abstract fun missionDao(): MissionDao
    abstract fun telemetryRecordDao(): TelemetryRecordDao
    abstract fun violationDao(): ViolationDao

    companion object {
        @Volatile private var INSTANCE: JadsDatabase? = null

        fun getInstance(context: Context, passphraseProvider: () -> ByteArray): JadsDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context, passphraseProvider).also { INSTANCE = it }
            }
        }

        private fun buildDatabase(
            context:            Context,
            passphraseProvider: () -> ByteArray
        ): JadsDatabase {
            val passphrase = passphraseProvider()
            try {
                // SupportFactory MUST receive ByteArray — see WARNING 1 above
                val factory = SupportFactory(passphrase)
                return Room.databaseBuilder(
                    context.applicationContext,
                    JadsDatabase::class.java,
                    "jads_encrypted.db"
                )
                    .openHelperFactory(factory)
                    // NO destructive migration fallback — see WARNING 3
                    .build()
            } finally {
                // Wipe passphrase from heap — see WARNING 2
                passphrase.fill(0)
            }
        }
    }
}

// ── DAOs ────────────────────────────────────────────────────────────────────


@Dao
interface MissionDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insert(mission: MissionEntity): Long

    @Update
    fun update(mission: MissionEntity)

    @Query("SELECT * FROM missions WHERE id = :id")
    fun getById(id: Long): MissionEntity?

    @Query("SELECT * FROM missions WHERE missionId = :missionId LIMIT 1")
    fun getByMissionId(missionId: Long): MissionEntity?

    @Query("SELECT * FROM missions WHERE state IN ('COMPLETED', 'ABORTED') AND uploadedAt IS NULL")
    fun getPendingUpload(): List<MissionEntity>

    @Query("SELECT * FROM missions ORDER BY missionStartUtcMs DESC")
    fun getAllMissions(): List<MissionEntity>

    @Query("SELECT COUNT(*) FROM telemetry_records WHERE missionDbId = :missionDbId")
    fun countRecords(missionDbId: Long): Long

    @Query("UPDATE missions SET uploadedAt = :uploadedAt WHERE id = :id")
    fun markUploaded(id: Long, uploadedAt: Long)

    @Query("UPDATE missions SET archivedCrlBase64 = :crlBase64, state = 'COMPLETED', missionEndUtcMs = :endUtcMs WHERE id = :id")
    fun finalize(id: Long, crlBase64: String?, endUtcMs: Long)

    @Query("UPDATE missions SET localIntegrityCheckOk = :ok WHERE id = :id")
    fun setIntegrityCheck(id: Long, ok: Boolean)
}

@Dao
interface TelemetryRecordDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insert(record: TelemetryRecordEntity)

    @Query("SELECT MAX(sequence) FROM telemetry_records WHERE missionId = :missionId")
    fun getLastSequence(missionId: Long): Long?   // null if no records yet

    @Query("SELECT * FROM telemetry_records WHERE missionDbId = :missionDbId ORDER BY sequence ASC")
    fun getAllForMission(missionDbId: Long): List<TelemetryRecordEntity>

    @Query("SELECT COUNT(*) FROM telemetry_records WHERE missionDbId = :missionDbId")
    fun countForMission(missionDbId: Long): Long
}

@Dao
interface ViolationDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insert(violation: ViolationEntity)

    @Query("SELECT * FROM violations WHERE missionDbId = :missionDbId ORDER BY sequence ASC")
    fun getAllForMission(missionDbId: Long): List<ViolationEntity>
}
