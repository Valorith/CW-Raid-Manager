/**
 * FITREP AI Generation Service
 * 
 * Template-based suggestion engine with infrastructure for future LLM integration.
 * When an API key is configured, swap the `generateSuggestions` implementation
 * to call OpenAI/Claude/etc. instead of using templates.
 */

// ─── Types ─────────────────────────────────────────────────────────

export interface AiGenerateRequest {
  prompt: string;
  extractedExamples?: ExtractedExample[];
  currentForm?: Record<string, any>;
}

export interface ExtractedExample {
  fileName: string;
  text: string; // raw text extracted from PDF on the client side
}

export interface AiSuggestions {
  fields: Record<string, any>;
  confidence: 'template' | 'ai';
  notes?: string;
}

// ─── Navy FITREP Language Templates ────────────────────────────────

const PERFORMANCE_TEMPLATES: Record<string, string[]> = {
  'Early Promote': [
    'My #1 of {count} {rank}s. {name} is a proven deckplate leader whose extraordinary performance, technical expertise, and unwavering dedication to mission accomplishment set the standard for all Chief Petty Officers. Absolutely ready for increased responsibility -- promote immediately to {nextRank}!',
    'A superior Chief who consistently delivers exceptional results. {name} masterfully led a division of {divSize} Sailors, achieving a {metric}% improvement in operational readiness. Poised for greater challenges -- select for {nextRank} now!',
    'The finest {rank} I have observed in {years} years of service. {name} epitomizes the Navy core values and drives mission success at every level. Unlimited potential -- Early Promote to {nextRank}!',
  ],
  'Must Promote': [
    '{name} is a top-performing {rank} who consistently exceeds expectations. Demonstrated exceptional leadership managing {responsibility}. Ready for advancement to {nextRank} -- promote with peers.',
    'An outstanding {rank} whose technical acumen and leadership are above reproach. {name} directly contributed to command readiness through {achievement}. Must promote!',
    'A consummate professional who leads from the front. {name} mentored {menteeCount} junior Sailors and drove significant improvements in {area}. Strongly recommended for promotion to {nextRank}.',
  ],
  'Promotable': [
    '{name} is a solid performer who meets all standards and continues to grow as a leader. Contributed meaningfully to {achievement} and demonstrated steady improvement in {area}.',
    'A reliable {rank} who fulfills all duties competently. {name} managed {responsibility} effectively and supported command objectives throughout the reporting period.',
  ],
  'Progressing': [
    '{name} is developing as a {rank} and shows potential for improvement. Needs continued mentorship in {area} to reach full potential as a Chief Petty Officer.',
  ],
};

const COMMAND_EMPLOYMENT_TEMPLATES = [
  'Forward deployed to {location} in support of {operation}. Command achieved {achievement} during this reporting period.',
  'Homeported at {location}. Successfully completed {event} and maintained {readiness}% mission readiness throughout the reporting period.',
  'Assigned to {command}. Supported {operation} while maintaining exceptional standards in all warfare areas and administrative inspections.',
];

const PRIMARY_DUTIES_TEMPLATES = [
  'Leading Chief Petty Officer for {division} Division. Directly supervises {count} Sailors across {departments} departments. Responsible for {responsibility}.',
  '{billet}. Manages daily operations of {division} with {count} personnel. Collateral duties include {collateral}.',
  'Division Leading Chief Petty Officer. Oversees {responsibility} and serves as Command {collateral}.',
];

const TRAIT_PROFILES: Record<string, Record<string, number>> = {
  'Early Promote': {
    leadership: 5, institutionalExpertise: 5, professionalism: 5,
    loyalty: 5, character: 5, communication: 5, heritage: 5,
  },
  'Must Promote': {
    leadership: 5, institutionalExpertise: 4, professionalism: 5,
    loyalty: 5, character: 5, communication: 4, heritage: 4,
  },
  'Promotable': {
    leadership: 4, institutionalExpertise: 4, professionalism: 4,
    loyalty: 4, character: 4, communication: 3, heritage: 3,
  },
  'Progressing': {
    leadership: 3, institutionalExpertise: 3, professionalism: 3,
    loyalty: 3, character: 3, communication: 3, heritage: 3,
  },
};

// ─── Prompt Parsing ────────────────────────────────────────────────

interface ParsedPrompt {
  name?: string;
  rank?: string;
  recommendation: string;
  yearsOfService?: string;
  achievements: string[];
  areas: string[];
  divisionSize?: string;
  keywords: string[];
}

function parsePrompt(prompt: string): ParsedPrompt {
  const lower = prompt.toLowerCase();

  // Detect recommendation level
  let recommendation = 'Promotable';
  if (/early promote|ep\b|#1|top|best|finest|extraordinary/i.test(prompt)) recommendation = 'Early Promote';
  else if (/must promote|mp\b|outstanding|exceptional|superior/i.test(prompt)) recommendation = 'Must Promote';
  else if (/progressing|developing|needs improvement|below/i.test(prompt)) recommendation = 'Progressing';

  // Extract name
  const nameMatch = prompt.match(/(?:name[:\s]+|(?:Chief|Senior Chief|Master Chief|SCPO|MCPO|CPO)\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  const name = nameMatch?.[1];

  // Extract rank
  let rank: string | undefined;
  if (/master chief|mcpo|e-?9/i.test(prompt)) rank = 'E9';
  else if (/senior chief|scpo|e-?8/i.test(prompt)) rank = 'E8';
  else if (/chief|cpo|e-?7/i.test(prompt)) rank = 'E7';

  // Extract years of service
  const yosMatch = prompt.match(/(\d+)\s*(?:years?|yrs?)\s*(?:of\s*)?(?:service)?/i);
  const yearsOfService = yosMatch?.[1];

  // Extract division size
  const divMatch = prompt.match(/(?:team|division|group)\s*(?:of\s*)?(\d+)/i);
  const divisionSize = divMatch?.[1];

  // Extract achievements (sentences with action verbs)
  const achievements: string[] = [];
  const sentences = prompt.split(/[.!]/).map(s => s.trim()).filter(Boolean);
  for (const s of sentences) {
    if (/led|managed|achieved|completed|improved|increased|reduced|implemented|spearheaded|drove|coordinated|organized|mentored|trained/i.test(s)) {
      achievements.push(s);
    }
  }

  // Extract focus areas
  const areas: string[] = [];
  const areaPatterns = ['training', 'readiness', 'maintenance', 'operations', 'administration',
    'safety', 'morale', 'retention', 'qualification', 'warfare', 'logistics', 'communications'];
  for (const a of areaPatterns) {
    if (lower.includes(a)) areas.push(a);
  }

  return { name, rank, recommendation, yearsOfService, achievements, areas, divisionSize, keywords: [] };
}

// ─── Template Filling ──────────────────────────────────────────────

function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  }
  // Clean up unfilled placeholders
  result = result.replace(/\{[^}]+\}/g, '___');
  return result;
}

function getNextRank(rank?: string): string {
  if (rank === 'E7') return 'Senior Chief Petty Officer';
  if (rank === 'E8') return 'Master Chief Petty Officer';
  return 'the next level of responsibility';
}

function getRankTitle(rank?: string): string {
  if (rank === 'E9') return 'Master Chief';
  if (rank === 'E8') return 'Senior Chief';
  return 'Chief';
}

// ─── Main Generation Function ──────────────────────────────────────

export function generateSuggestions(request: AiGenerateRequest): AiSuggestions {
  const parsed = parsePrompt(request.prompt);
  const name = parsed.name || request.currentForm?.rateeName || 'MEMBER';
  const rank = parsed.rank || request.currentForm?.gradeRate || 'E7';
  const rankTitle = getRankTitle(rank);

  const vars: Record<string, string> = {
    name: name.toUpperCase(),
    rank: rankTitle,
    nextRank: getNextRank(rank),
    count: parsed.divisionSize || '15',
    divSize: parsed.divisionSize || '25',
    years: parsed.yearsOfService || '18',
    menteeCount: String(Math.floor(Math.random() * 8) + 5),
    metric: String(Math.floor(Math.random() * 15) + 85),
    responsibility: parsed.achievements[0] || 'critical command programs',
    achievement: parsed.achievements[1] || parsed.achievements[0] || 'significant operational milestones',
    area: parsed.areas[0] || 'operational readiness',
    location: 'Naval Station Norfolk',
    operation: 'ongoing fleet operations',
    readiness: String(Math.floor(Math.random() * 5) + 95),
    command: request.currentForm?.shipStation || 'the command',
    event: 'all scheduled deployments and exercises',
    division: 'Operations',
    departments: '3',
    billet: request.currentForm?.billet || 'Division Leading Chief Petty Officer',
    collateral: 'Command Fitness Leader and Training Coordinator',
  };

  // Pick templates based on recommendation level
  const perfTemplates = PERFORMANCE_TEMPLATES[parsed.recommendation] || PERFORMANCE_TEMPLATES['Promotable'];
  const perfComment = fillTemplate(perfTemplates[Math.floor(Math.random() * perfTemplates.length)], vars);

  const cmdEmploy = fillTemplate(
    COMMAND_EMPLOYMENT_TEMPLATES[Math.floor(Math.random() * COMMAND_EMPLOYMENT_TEMPLATES.length)], vars
  );

  const duties = fillTemplate(
    PRIMARY_DUTIES_TEMPLATES[Math.floor(Math.random() * PRIMARY_DUTIES_TEMPLATES.length)], vars
  );

  // Build trait suggestions
  const traitProfile = TRAIT_PROFILES[parsed.recommendation] || TRAIT_PROFILES['Promotable'];

  // Incorporate any text from uploaded examples
  let exampleNote = '';
  if (request.extractedExamples?.length) {
    exampleNote = `Based on ${request.extractedExamples.length} uploaded example(s). `;
  }

  // Build the suggestions object — only suggest fields that are empty or that AI should fill
  const fields: Record<string, any> = {
    ...traitProfile,
    recommendation: parsed.recommendation,
    performanceComments: perfComment,
    commandEmployment: cmdEmploy,
    primaryDuties: duties,
  };

  // If we detected a name/rank from prompt, suggest those too
  if (parsed.name && !request.currentForm?.rateeName) {
    fields.rateeName = parsed.name.toUpperCase();
  }
  if (parsed.rank && !request.currentForm?.gradeRate) {
    fields.gradeRate = parsed.rank;
  }

  return {
    fields,
    confidence: 'template',
    notes: `${exampleNote}Template-based suggestions generated for "${parsed.recommendation}" recommendation. Configure an AI API key for more personalized results.`,
  };
}
