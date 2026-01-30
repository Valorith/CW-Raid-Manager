-- FITREP (Fitness Report) Generator Tables

-- FITREP Templates - defines the structure of different FITREP forms
CREATE TABLE FitrepTemplate (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  description TEXT,
  version VARCHAR(50) DEFAULT '1.0',
  isActive BOOLEAN DEFAULT TRUE,
  fields JSON NOT NULL, -- JSON array of field definitions
  metadata JSON, -- Additional template config (layout, styling, etc.)
  createdById VARCHAR(191),
  createdAt DATETIME DEFAULT NOW(),
  updatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_fitrep_template_active (isActive)
);

-- FITREP Reports - individual fitness reports
CREATE TABLE FitrepReport (
  id VARCHAR(191) PRIMARY KEY,
  guildId VARCHAR(191) NOT NULL,
  templateId VARCHAR(191) NOT NULL,
  rateeUserId VARCHAR(191), -- The user being evaluated
  rateeCharacterId VARCHAR(191), -- The character being evaluated
  rateeName VARCHAR(191) NOT NULL, -- Name of person being evaluated
  rateeRank VARCHAR(191), -- Rank of person being evaluated
  
  -- Reporting period
  periodStart DATE,
  periodEnd DATE,
  
  -- Rater (person writing the report)
  raterUserId VARCHAR(191), -- The user writing the report
  raterCharacterId VARCHAR(191), -- The character writing the report
  raterName VARCHAR(191) NOT NULL, -- Name of rater
  raterRank VARCHAR(191), -- Rank of rater
  
  -- Report status
  status ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED') DEFAULT 'DRAFT',
  submittedAt DATETIME NULL,
  approvedAt DATETIME NULL,
  approvedById VARCHAR(191) NULL,
  
  -- Form data
  formData JSON NOT NULL, -- All form field values
  
  -- AI assistance data
  aiPrompt TEXT, -- User's prompt for AI assistance
  aiGeneratedData JSON, -- AI-generated content
  exampleReports JSON, -- References to example reports used
  
  createdById VARCHAR(191) NOT NULL,
  createdAt DATETIME DEFAULT NOW(),
  updatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  
  INDEX idx_fitrep_report_guild (guildId),
  INDEX idx_fitrep_report_ratee (rateeUserId),
  INDEX idx_fitrep_report_rater (raterUserId),
  INDEX idx_fitrep_report_status (status),
  INDEX idx_fitrep_report_period (periodStart, periodEnd),
  
  FOREIGN KEY (guildId) REFERENCES Guild(id) ON DELETE CASCADE,
  FOREIGN KEY (templateId) REFERENCES FitrepTemplate(id) ON DELETE RESTRICT,
  FOREIGN KEY (rateeUserId) REFERENCES User(id) ON DELETE SET NULL,
  FOREIGN KEY (rateeCharacterId) REFERENCES Characters(id) ON DELETE SET NULL,
  FOREIGN KEY (raterUserId) REFERENCES User(id) ON DELETE SET NULL,
  FOREIGN KEY (raterCharacterId) REFERENCES Characters(id) ON DELETE SET NULL,
  FOREIGN KEY (createdById) REFERENCES User(id) ON DELETE CASCADE,
  FOREIGN KEY (approvedById) REFERENCES User(id) ON DELETE SET NULL
);

-- FITREP Example Reports - user-uploaded examples for AI training
CREATE TABLE FitrepExample (
  id VARCHAR(191) PRIMARY KEY,
  guildId VARCHAR(191) NOT NULL,
  templateId VARCHAR(191), -- Optional link to template
  name VARCHAR(191) NOT NULL, -- User-defined name for this example
  description TEXT,
  
  -- File information
  filePath VARCHAR(512), -- Path to uploaded file
  fileName VARCHAR(255), -- Original filename
  fileSize INT, -- File size in bytes
  mimeType VARCHAR(100), -- File MIME type
  
  -- Extracted data (if parseable)
  extractedData JSON, -- Extracted form data
  
  -- Metadata
  uploadedById VARCHAR(191) NOT NULL,
  isPublic BOOLEAN DEFAULT FALSE, -- Whether other users can see this example
  isActive BOOLEAN DEFAULT TRUE,
  
  createdAt DATETIME DEFAULT NOW(),
  updatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  
  INDEX idx_fitrep_example_guild (guildId),
  INDEX idx_fitrep_example_template (templateId),
  INDEX idx_fitrep_example_uploader (uploadedById),
  INDEX idx_fitrep_example_public (isPublic, isActive),
  
  FOREIGN KEY (guildId) REFERENCES Guild(id) ON DELETE CASCADE,
  FOREIGN KEY (templateId) REFERENCES FitrepTemplate(id) ON DELETE SET NULL,
  FOREIGN KEY (uploadedById) REFERENCES User(id) ON DELETE CASCADE
);

-- FITREP AI Sessions - tracks AI assistance sessions
CREATE TABLE FitrepAiSession (
  id VARCHAR(191) PRIMARY KEY,
  reportId VARCHAR(191) NOT NULL,
  userId VARCHAR(191) NOT NULL,
  
  -- Session data
  prompt TEXT NOT NULL,
  exampleIds JSON, -- Array of FitrepExample IDs used
  generatedData JSON, -- AI-generated content
  
  -- Session metadata
  status ENUM('PROCESSING', 'COMPLETED', 'FAILED') DEFAULT 'PROCESSING',
  errorMessage TEXT,
  processingTimeMs INT,
  
  createdAt DATETIME DEFAULT NOW(),
  
  INDEX idx_fitrep_ai_session_report (reportId),
  INDEX idx_fitrep_ai_session_user (userId),
  INDEX idx_fitrep_ai_session_status (status),
  
  FOREIGN KEY (reportId) REFERENCES FitrepReport(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);

-- Insert default FITREP template
INSERT INTO FitrepTemplate (id, name, description, fields, metadata) VALUES 
('default-fitrep', 'Standard FITREP Template', 'Default fitness report template for guild member evaluation', 
'[
  {
    "id": "personal_info",
    "type": "section",
    "label": "Personal Information",
    "fields": [
      {"id": "ratee_name", "type": "text", "label": "Name", "required": true},
      {"id": "ratee_rank", "type": "text", "label": "Rank/Position"},
      {"id": "ratee_class", "type": "select", "label": "Character Class", "options": ["WARRIOR", "CLERIC", "PALADIN", "RANGER", "SHADOWKNIGHT", "DRUID", "MONK", "BARD", "ROGUE", "SHAMAN", "NECROMANCER", "WIZARD", "MAGICIAN", "ENCHANTER", "BEASTLORD", "BERSERKER"]},
      {"id": "period_start", "type": "date", "label": "Reporting Period From"},
      {"id": "period_end", "type": "date", "label": "Reporting Period To"}
    ]
  },
  {
    "id": "performance_ratings",
    "type": "section",
    "label": "Performance Ratings",
    "fields": [
      {"id": "attendance", "type": "rating", "label": "Raid Attendance", "scale": 5},
      {"id": "punctuality", "type": "rating", "label": "Punctuality", "scale": 5},
      {"id": "preparation", "type": "rating", "label": "Raid Preparation", "scale": 5},
      {"id": "teamwork", "type": "rating", "label": "Teamwork & Cooperation", "scale": 5},
      {"id": "leadership", "type": "rating", "label": "Leadership Potential", "scale": 5},
      {"id": "knowledge", "type": "rating", "label": "Game Knowledge", "scale": 5},
      {"id": "adaptability", "type": "rating", "label": "Adaptability", "scale": 5}
    ]
  },
  {
    "id": "narrative",
    "type": "section", 
    "label": "Narrative Evaluation",
    "fields": [
      {"id": "strengths", "type": "textarea", "label": "Strengths", "rows": 4},
      {"id": "areas_for_improvement", "type": "textarea", "label": "Areas for Improvement", "rows": 4},
      {"id": "accomplishments", "type": "textarea", "label": "Notable Accomplishments", "rows": 4},
      {"id": "goals", "type": "textarea", "label": "Goals for Next Period", "rows": 4},
      {"id": "additional_comments", "type": "textarea", "label": "Additional Comments", "rows": 6}
    ]
  },
  {
    "id": "recommendations",
    "type": "section",
    "label": "Recommendations",
    "fields": [
      {"id": "promotion_ready", "type": "radio", "label": "Promotion Ready", "options": ["Yes", "No", "Future Potential"]},
      {"id": "retention_recommendation", "type": "radio", "label": "Retention Recommendation", "options": ["Highly Recommended", "Recommended", "Not Recommended"]},
      {"id": "special_assignments", "type": "checkbox", "label": "Suitable for Special Assignments", "options": ["Raid Leading", "Officer Training", "New Member Mentoring", "Event Planning"]}
    ]
  },
  {
    "id": "rater_info",
    "type": "section",
    "label": "Rater Information", 
    "fields": [
      {"id": "rater_name", "type": "text", "label": "Rater Name", "required": true},
      {"id": "rater_rank", "type": "text", "label": "Rater Rank/Position"},
      {"id": "rater_signature", "type": "text", "label": "Digital Signature"},
      {"id": "date_signed", "type": "date", "label": "Date Signed"}
    ]
  }
]',
'{"layout": "vertical", "sections_per_page": 2, "auto_save": true, "allow_ai_assist": true}'
);