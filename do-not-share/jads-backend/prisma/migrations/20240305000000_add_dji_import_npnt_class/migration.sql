-- AlterEnum: Add DJI_IMPORT to NpntClass
-- This allows the backend to accept drone missions ingested from DJI flight logs
-- (post-flight import) as distinct from real-time NPNT-classified missions.
ALTER TYPE "NpntClass" ADD VALUE 'DJI_IMPORT';
