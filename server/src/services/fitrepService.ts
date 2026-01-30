import { FitrepStatus } from '@prisma/client';
import { prisma } from '../utils/prisma.js';

// ─── Template Management ───────────────────────────────────────────

export async function getActiveTemplates() {
  return prisma.fitrepTemplate.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTemplateById(templateId: string) {
  return prisma.fitrepTemplate.findUnique({
    where: { id: templateId },
  });
}

export async function createTemplate(data: {
  name: string;
  description?: string;
  version?: string;
  fields: any;
  metadata?: any;
  createdById?: string;
}) {
  return prisma.fitrepTemplate.create({ data });
}

// ─── Report CRUD ───────────────────────────────────────────────────

export async function listReports(guildId: string, filters?: {
  status?: FitrepStatus;
  rateeUserId?: string;
  raterUserId?: string;
  limit?: number;
  offset?: number;
}) {
  const where: any = { guildId };
  if (filters?.status) where.status = filters.status;
  if (filters?.rateeUserId) where.rateeUserId = filters.rateeUserId;
  if (filters?.raterUserId) where.raterUserId = filters.raterUserId;

  const [reports, total] = await Promise.all([
    prisma.fitrepReport.findMany({
      where,
      include: {
        template: { select: { id: true, name: true, version: true } },
        rateeUser: { select: { id: true, displayName: true } },
        raterUser: { select: { id: true, displayName: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    }),
    prisma.fitrepReport.count({ where }),
  ]);

  return { reports, total };
}

export async function getReportById(reportId: string) {
  return prisma.fitrepReport.findUnique({
    where: { id: reportId },
    include: {
      template: true,
      rateeUser: { select: { id: true, displayName: true } },
      raterUser: { select: { id: true, displayName: true } },
      createdBy: { select: { id: true, displayName: true } },
      approvedBy: { select: { id: true, displayName: true } },
      aiSessions: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
}

export async function createReport(data: {
  guildId: string;
  templateId: string;
  rateeName: string;
  rateeRank?: string;
  rateeUserId?: string;
  rateeCharacterId?: string;
  raterName: string;
  raterRank?: string;
  raterUserId?: string;
  raterCharacterId?: string;
  periodStart?: Date;
  periodEnd?: Date;
  formData: any;
  createdById: string;
}) {
  return prisma.fitrepReport.create({
    data: {
      ...data,
      status: 'DRAFT',
    },
    include: {
      template: { select: { id: true, name: true } },
    },
  });
}

export async function updateReport(reportId: string, data: {
  rateeName?: string;
  rateeRank?: string;
  raterName?: string;
  raterRank?: string;
  periodStart?: Date;
  periodEnd?: Date;
  formData?: any;
  status?: FitrepStatus;
  aiPrompt?: string;
  aiGeneratedData?: any;
}) {
  const updateData: any = { ...data };
  if (data.status === 'SUBMITTED') {
    updateData.submittedAt = new Date();
  }
  return prisma.fitrepReport.update({
    where: { id: reportId },
    data: updateData,
    include: {
      template: { select: { id: true, name: true } },
    },
  });
}

export async function deleteReport(reportId: string) {
  return prisma.fitrepReport.delete({ where: { id: reportId } });
}

// ─── Example Reports ───────────────────────────────────────────────

export async function listExamples(guildId: string, userId: string) {
  return prisma.fitrepExample.findMany({
    where: {
      guildId,
      OR: [
        { uploadedById: userId },
        { isPublic: true },
      ],
      isActive: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createExample(data: {
  guildId: string;
  templateId?: string;
  name: string;
  description?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  extractedData?: any;
  uploadedById: string;
  isPublic?: boolean;
}) {
  return prisma.fitrepExample.create({ data });
}

export async function deleteExample(exampleId: string) {
  return prisma.fitrepExample.update({
    where: { id: exampleId },
    data: { isActive: false },
  });
}

// ─── AI Session Tracking ───────────────────────────────────────────

export async function createAiSession(data: {
  reportId: string;
  prompt: string;
  exampleIds?: string[];
  generatedData?: any;
  userId?: string;
}) {
  return prisma.fitrepAiSession.create({
    data: {
      reportId: data.reportId,
      userId: data.userId || 'system',
      prompt: data.prompt,
      exampleIds: data.exampleIds || [],
      generatedData: data.generatedData,
    },
  });
}

// ─── Seed E7-E9 Template ──────────────────────────────────────────

export const E7E9_TEMPLATE_FIELDS = [
  // Section 1: Identification
  { key: 'rateeName', label: '1. Name (Last, First MI Suffix)', type: 'text', section: 'identification', required: true },
  { key: 'gradeRate', label: '2. Grade/Rate', type: 'text', section: 'identification', required: true },
  { key: 'desig', label: '3. Desig', type: 'text', section: 'identification' },
  { key: 'ssn', label: '4. SSN', type: 'text', section: 'identification' },
  { key: 'status', label: '5. Status', type: 'radio', options: ['ACT', 'FTS', 'INACT'], section: 'identification' },
  { key: 'uic', label: '6. UIC', type: 'text', section: 'identification' },
  { key: 'shipStation', label: '7. Ship/Station', type: 'text', section: 'identification' },
  { key: 'promotionStatus', label: '8. Promotion Status', type: 'select', options: ['Regular', 'Frocked', 'Selected'], section: 'identification' },
  { key: 'dateReported', label: '9. Date Reported', type: 'date', section: 'identification' },

  // Section 2: Period of Report
  { key: 'notObserved', label: '16. Not Observed Report', type: 'checkbox', section: 'period' },
  { key: 'periodFrom', label: '14. Period From', type: 'date', section: 'period', required: true },
  { key: 'periodTo', label: '15. Period To', type: 'date', section: 'period', required: true },

  // Section 3: Report Type
  { key: 'reportType', label: '17-19. Type of Report', type: 'radio', options: ['Regular', 'Concurrent', 'Ops Cdr'], section: 'reportType' },
  { key: 'physicalReadiness', label: '20. Physical Readiness', type: 'text', section: 'reportType' },

  // Section 4: Billet & Reporting Senior
  { key: 'billet', label: '21. Billet', type: 'text', section: 'reportingSenior' },
  { key: 'reportingSeniorName', label: '22. Reporting Senior (Last, FI MI)', type: 'text', section: 'reportingSenior' },
  { key: 'reportingSeniorGrade', label: '23. Grade', type: 'text', section: 'reportingSenior' },
  { key: 'reportingSeniorDesig', label: '24. Desig', type: 'text', section: 'reportingSenior' },
  { key: 'reportingSeniorTitle', label: '25. Title', type: 'text', section: 'reportingSenior' },
  { key: 'reportingSeniorUIC', label: '26. UIC', type: 'text', section: 'reportingSenior' },

  // Section 5: Command Info
  { key: 'commandEmployment', label: '28. Command employment and command achievements', type: 'textarea', section: 'command', maxLength: 2000 },
  { key: 'primaryDuties', label: '29. Primary/Collateral/Watchstanding duties', type: 'textarea', section: 'command', maxLength: 2000 },

  // Section 6: Counseling
  { key: 'dateCounseled', label: '30. Date Counseled', type: 'date', section: 'counseling' },
  { key: 'counselor', label: '31. Counselor', type: 'text', section: 'counseling' },
  { key: 'individualSignature', label: '32. Signature of Individual Counseled', type: 'text', section: 'counseling' },

  // Section 7: Performance Traits (1.0 - 5.0 scale)
  { key: 'leadership', label: '33. Leadership', type: 'trait', section: 'traits', min: 1.0, max: 5.0 },
  { key: 'institutionalExpertise', label: '34. Institutional Expertise', type: 'trait', section: 'traits', min: 1.0, max: 5.0 },
  { key: 'professionalism', label: '35. Professionalism', type: 'trait', section: 'traits', min: 1.0, max: 5.0 },
  { key: 'loyalty', label: '36. Loyalty', type: 'trait', section: 'traits', min: 1.0, max: 5.0 },
  { key: 'character', label: '37. Character', type: 'trait', section: 'traits', min: 1.0, max: 5.0 },
  { key: 'communication', label: '38. Communication', type: 'trait', section: 'traits', min: 1.0, max: 5.0 },
  { key: 'heritage', label: '39. Heritage', type: 'trait', section: 'traits', min: 1.0, max: 5.0 },

  // Section 8: Recommendation & Comments
  { key: 'recommendation', label: '40. Recommendation', type: 'radio', options: [
    'NOB', 'Significant Problems', 'Progressing', 'Promotable', 'Must Promote', 'Early Promote'
  ], section: 'recommendation' },
  { key: 'performanceComments', label: '41. Comments on Performance', type: 'textarea', section: 'comments', maxLength: 5000 },

  // Section 9: Summary & Signatures
  { key: 'summarySignProblem', label: '44. Reporting Senior Address', type: 'text', section: 'signatures' },
  { key: 'reportingSeniorSignDate', label: '45. Date', type: 'date', section: 'signatures' },
  { key: 'regularReportingSenior', label: '47. Typed name, grade, command, UIC and signature', type: 'text', section: 'signatures' },
  { key: 'regularReportingSeniorDate', label: '47. Date', type: 'date', section: 'signatures' },
];

export async function seedE7E9Template() {
  const existing = await prisma.fitrepTemplate.findFirst({
    where: { name: 'Navy FITREP E7-E9 (NAVPERS 1610/2)' },
  });
  if (existing) return existing;

  return prisma.fitrepTemplate.create({
    data: {
      name: 'Navy FITREP E7-E9 (NAVPERS 1610/2)',
      description: 'Evaluation & Counseling Record for E7-E9 (Chief Petty Officers). Based on NAVPERS 1610/2 Version 4.A.',
      version: '4.A',
      fields: E7E9_TEMPLATE_FIELDS,
      metadata: {
        formNumber: 'NAVPERS 1610/2',
        applicableRanks: ['E7', 'E8', 'E9'],
        traitScale: { min: 1.0, max: 5.0, step: 1.0 },
      },
    },
  });
}
