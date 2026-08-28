-- Additive metadata for provider recording callbacks. recordingUrl remains the
-- generic provider reference and never contains a browser-facing Plivo URL.
ALTER TABLE "Call" ADD COLUMN "recordingId" TEXT;
ALTER TABLE "Call" ADD COLUMN "recordingStatus" TEXT;
ALTER TABLE "Call" ADD COLUMN "recordingAvailableAt" TIMESTAMP(3);
