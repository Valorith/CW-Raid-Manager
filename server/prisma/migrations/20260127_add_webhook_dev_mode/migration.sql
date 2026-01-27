-- Add devMode column to InboundWebhook table for routing Discord messages to dev webhook URLs
ALTER TABLE `InboundWebhook` ADD COLUMN `devMode` BOOLEAN NOT NULL DEFAULT false;
