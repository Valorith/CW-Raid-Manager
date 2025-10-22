-- Add an event type flag to attendance events
ALTER TABLE `AttendanceEvent`
  ADD COLUMN `eventType` ENUM('LOG', 'START', 'END', 'RESTART') NOT NULL DEFAULT 'LOG';
