-- Ensure the admin flag exists on the User table for permission checks without failing if present
SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'User'
    AND COLUMN_NAME = 'admin'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE `User` ADD COLUMN `admin` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
