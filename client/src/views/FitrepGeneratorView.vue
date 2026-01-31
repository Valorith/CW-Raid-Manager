<template>
  <section class="fitrep">
    <header class="section-header">
      <div>
        <h1>FITREP Generator</h1>
        <p class="section-subtitle">Navy Evaluation &amp; Counseling Record (E7-E9)</p>
      </div>
      <div class="header-actions">
        <button class="btn btn--secondary" @click="loadDraft" v-if="savedReports.length">
          📂 Load Draft
        </button>
        <button class="btn" @click="saveDraft" :disabled="!formDirty">
          💾 Save Draft
        </button>
      </div>
    </header>

    <div class="fitrep-layout">
      <!-- Left: Form -->
      <div class="fitrep-form">
        <!-- Section 1: Identification -->
        <fieldset class="form-section">
          <legend>Identification</legend>
          <div class="form-grid">
            <div class="form-group form-group--wide">
              <label>1. Name (Last, First MI Suffix) <span class="required">*</span></label>
              <input v-model="form.rateeName" type="text" placeholder="DOE, JOHN A" @input="markDirty" />
            </div>
            <div class="form-group">
              <label>2. Grade/Rate <span class="required">*</span></label>
              <input v-model="form.gradeRate" type="text" placeholder="E7" @input="markDirty" />
            </div>
            <div class="form-group">
              <label>3. Desig</label>
              <input v-model="form.desig" type="text" placeholder="0000" @input="markDirty" />
            </div>
            <div class="form-group">
              <label>4. SSN</label>
              <input v-model="form.ssn" type="text" placeholder="123456789" maxlength="9" @input="markDirty" />
            </div>
            <div class="form-group">
              <label>5. Status</label>
              <div class="radio-group">
                <label v-for="opt in ['ACT', 'FTS', 'INACT']" :key="opt" class="radio-label">
                  <input type="radio" v-model="form.status" :value="opt" @change="markDirty" />
                  {{ opt }}
                </label>
              </div>
            </div>
            <div class="form-group">
              <label>6. UIC</label>
              <input v-model="form.uic" type="text" @input="markDirty" />
            </div>
            <div class="form-group form-group--wide">
              <label>7. Ship/Station</label>
              <input v-model="form.shipStation" type="text" @input="markDirty" />
            </div>
            <div class="form-group">
              <label>8. Promotion Status</label>
              <select v-model="form.promotionStatus" @change="markDirty">
                <option value="">Select...</option>
                <option v-for="opt in ['Regular', 'Frocked', 'Selected']" :key="opt" :value="opt">{{ opt }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>9. Date Reported</label>
              <input v-model="form.dateReported" type="date" @input="markDirty" />
            </div>
          </div>
        </fieldset>

        <!-- Section 2: Period of Report -->
        <fieldset class="form-section">
          <legend>Period of Report</legend>
          <div class="form-grid">
            <div class="form-group">
              <label>14. From <span class="required">*</span></label>
              <input v-model="form.periodFrom" type="date" @input="markDirty" />
            </div>
            <div class="form-group">
              <label>15. To <span class="required">*</span></label>
              <input v-model="form.periodTo" type="date" @input="markDirty" />
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" v-model="form.notObserved" @change="markDirty" />
                16. Not Observed Report
              </label>
            </div>
          </div>
        </fieldset>

        <!-- Section 3: Type of Report -->
        <fieldset class="form-section">
          <legend>Type of Report</legend>
          <div class="form-grid">
            <div class="form-group">
              <label>17-19. Report Type</label>
              <div class="radio-group">
                <label v-for="opt in ['Regular', 'Concurrent', 'Ops Cdr']" :key="opt" class="radio-label">
                  <input type="radio" v-model="form.reportType" :value="opt" @change="markDirty" />
                  {{ opt }}
                </label>
              </div>
            </div>
            <div class="form-group">
              <label>20. Physical Readiness</label>
              <input v-model="form.physicalReadiness" type="text" @input="markDirty" />
            </div>
          </div>
        </fieldset>

        <!-- Section 4: Billet & Reporting Senior -->
        <fieldset class="form-section">
          <legend>Billet &amp; Reporting Senior</legend>
          <div class="form-grid">
            <div class="form-group form-group--wide">
              <label>21. Billet</label>
              <input v-model="form.billet" type="text" @input="markDirty" />
            </div>
            <div class="form-group form-group--wide">
              <label>22. Reporting Senior (Last, FI MI)</label>
              <input v-model="form.reportingSeniorName" type="text" @input="markDirty" />
            </div>
            <div class="form-group">
              <label>23. Grade</label>
              <input v-model="form.reportingSeniorGrade" type="text" @input="markDirty" />
            </div>
            <div class="form-group">
              <label>24. Desig</label>
              <input v-model="form.reportingSeniorDesig" type="text" @input="markDirty" />
            </div>
            <div class="form-group form-group--wide">
              <label>25. Title</label>
              <input v-model="form.reportingSeniorTitle" type="text" @input="markDirty" />
            </div>
            <div class="form-group">
              <label>26. UIC</label>
              <input v-model="form.reportingSeniorUIC" type="text" @input="markDirty" />
            </div>
          </div>
        </fieldset>

        <!-- Section 5: Command Info -->
        <fieldset class="form-section">
          <legend>Command Information</legend>
          <div class="form-grid">
            <div class="form-group form-group--full">
              <label>28. Command employment and command achievements</label>
              <textarea v-model="form.commandEmployment" rows="4" maxlength="2000" @input="markDirty"></textarea>
              <span class="char-count">{{ (form.commandEmployment || '').length }}/2000</span>
            </div>
            <div class="form-group form-group--full">
              <label>29. Primary/Collateral/Watchstanding duties</label>
              <textarea v-model="form.primaryDuties" rows="4" maxlength="2000" @input="markDirty"></textarea>
              <span class="char-count">{{ (form.primaryDuties || '').length }}/2000</span>
            </div>
          </div>
        </fieldset>

        <!-- Section 6: Counseling -->
        <fieldset class="form-section">
          <legend>Counseling</legend>
          <div class="form-grid">
            <div class="form-group">
              <label>30. Date Counseled</label>
              <input v-model="form.dateCounseled" type="date" @input="markDirty" />
            </div>
            <div class="form-group">
              <label>31. Counselor</label>
              <input v-model="form.counselor" type="text" @input="markDirty" />
            </div>
            <div class="form-group form-group--wide">
              <label>32. Signature of Individual Counseled</label>
              <input v-model="form.individualSignature" type="text" @input="markDirty" />
            </div>
          </div>
        </fieldset>

        <!-- Section 7: Performance Traits -->
        <fieldset class="form-section">
          <legend>Performance Traits</legend>
          <p class="section-help">Rate each trait on a scale of 1.0 (lowest) to 5.0 (highest). NOB = Not Observed.</p>
          <div class="traits-grid">
            <div v-for="trait in traits" :key="trait.key" class="trait-row">
              <label class="trait-label">{{ trait.label }}</label>
              <div class="trait-buttons">
                <button
                  v-for="val in [1, 2, 3, 4, 5]"
                  :key="val"
                  :class="['trait-btn', { 'trait-btn--active': form[trait.key] === val }]"
                  @click="setTrait(trait.key, val)"
                >{{ val }}.0</button>
                <button
                  :class="['trait-btn trait-btn--nob', { 'trait-btn--active': form[trait.key] === 'NOB' }]"
                  @click="setTrait(trait.key, 'NOB')"
                >NOB</button>
              </div>
            </div>
            <div class="trait-avg" v-if="traitAverage !== null">
              <span class="trait-avg-label">Trait Average:</span>
              <span class="trait-avg-value">{{ traitAverage }}</span>
            </div>
          </div>
        </fieldset>

        <!-- Section 8: Recommendation -->
        <fieldset class="form-section">
          <legend>Recommendation</legend>
          <div class="form-grid">
            <div class="form-group form-group--full">
              <label>40. Recommendation</label>
              <div class="recommendation-grid">
                <label v-for="opt in recommendations" :key="opt" class="radio-label radio-label--block">
                  <input type="radio" v-model="form.recommendation" :value="opt" @change="markDirty" />
                  {{ opt }}
                </label>
              </div>
            </div>
            <div class="form-group form-group--full">
              <label>41. Comments on Performance</label>
              <textarea v-model="form.performanceComments" rows="8" maxlength="5000" @input="markDirty"></textarea>
              <span class="char-count">{{ (form.performanceComments || '').length }}/5000</span>
            </div>
          </div>
        </fieldset>

        <!-- Section 9: Signatures -->
        <fieldset class="form-section">
          <legend>Signatures</legend>
          <div class="form-grid">
            <div class="form-group form-group--wide">
              <label>44. Reporting Senior Address</label>
              <input v-model="form.summarySignProblem" type="text" @input="markDirty" />
            </div>
            <div class="form-group">
              <label>45. Date</label>
              <input v-model="form.reportingSeniorSignDate" type="date" @input="markDirty" />
            </div>
            <div class="form-group form-group--full">
              <label>47. Typed name, grade, command, UIC and signature of Regular Reporting Senior</label>
              <input v-model="form.regularReportingSenior" type="text" @input="markDirty" />
            </div>
            <div class="form-group">
              <label>47. Date</label>
              <input v-model="form.regularReportingSeniorDate" type="date" @input="markDirty" />
            </div>
          </div>
        </fieldset>
      </div>

      <!-- Right: AI Assistant Panel -->
      <aside class="ai-panel">
        <div class="ai-panel-header">
          <h2>🤖 AI Assistant</h2>
        </div>

        <div class="ai-section">
          <h3>Upload Example FITREP</h3>
          <p class="ai-help">Upload a completed FITREP as a reference for AI-assisted filling.</p>
          <div class="upload-zone" @dragover.prevent @drop.prevent="handleDrop">
            <input type="file" ref="fileInput" accept=".pdf,.txt,.doc,.docx" @change="handleFileSelect" style="display:none" />
            <button class="btn btn--secondary" @click="$refs.fileInput.click()">
              📎 Choose File
            </button>
            <p class="upload-hint">or drag &amp; drop here</p>
          </div>
          <div v-if="uploadedExamples.length" class="examples-list">
            <div v-for="ex in uploadedExamples" :key="ex.name" class="example-item">
              <span>📄 {{ ex.name }}</span>
              <button class="btn-icon" @click="removeExample(ex)">✕</button>
            </div>
          </div>
        </div>

        <div class="ai-section">
          <h3>AI Prompt</h3>
          <p class="ai-help">Describe the person being evaluated, their accomplishments, and any specific areas to highlight.</p>
          <textarea
            v-model="aiPrompt"
            rows="6"
            placeholder="E.g., Senior Chief Petty Officer with 18 years of service. Led a team of 12 in..."
          ></textarea>
          <button class="btn btn--ai" @click="generateWithAI" :disabled="(!aiPrompt && !uploadedExamples.length) || aiLoading">
            <span v-if="aiLoading">⏳ Generating...</span>
            <span v-else>✨ Generate with AI</span>
          </button>
          <p v-if="aiError" class="ai-error">{{ aiError }}</p>
        </div>

        <div class="ai-section" v-if="aiSuggestions">
          <div class="ai-suggestions-header">
            <h3>AI Suggestions</h3>
            <button class="btn btn--small btn--accent" @click="applyAllSuggestions" v-if="Object.keys(aiSuggestions).length > 1">
              ✅ Apply All
            </button>
          </div>
          <p v-if="aiNotes" class="ai-notes">{{ aiNotes }}</p>
          <div class="ai-suggestions">
            <div v-for="(value, key) in aiSuggestions" :key="key" class="suggestion-item">
              <div class="suggestion-header">
                <span class="suggestion-field">{{ getFieldLabel(key) }}</span>
                <button class="btn btn--small" @click="applySuggestion(key, value)">Apply</button>
              </div>
              <p class="suggestion-value">{{ typeof value === 'number' ? value + '.0' : value }}</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import axios from 'axios';

const formDirty = ref(false);
const aiPrompt = ref('');
const aiLoading = ref(false);
const aiSuggestions = ref<Record<string, any> | null>(null);
const aiNotes = ref<string>('');
const aiError = ref<string>('');
const uploadedExamples = ref<{ name: string; file: File }[]>([]);
const savedReports = ref<any[]>([]);
const fileInput = ref<HTMLInputElement>();

const traits = [
  { key: 'leadership', label: '33. Leadership' },
  { key: 'institutionalExpertise', label: '34. Institutional Expertise' },
  { key: 'professionalism', label: '35. Professionalism' },
  { key: 'loyalty', label: '36. Loyalty' },
  { key: 'character', label: '37. Character' },
  { key: 'communication', label: '38. Communication' },
  { key: 'heritage', label: '39. Heritage' },
];

const recommendations = [
  'NOB', 'Significant Problems', 'Progressing', 'Promotable', 'Must Promote', 'Early Promote'
];

const form = reactive<Record<string, any>>({
  rateeName: '', gradeRate: '', desig: '', ssn: '', status: '', uic: '',
  shipStation: '', promotionStatus: '', dateReported: '',
  periodFrom: '', periodTo: '', notObserved: false,
  reportType: '', physicalReadiness: '',
  billet: '', reportingSeniorName: '', reportingSeniorGrade: '',
  reportingSeniorDesig: '', reportingSeniorTitle: '', reportingSeniorUIC: '',
  commandEmployment: '', primaryDuties: '',
  dateCounseled: '', counselor: '', individualSignature: '',
  leadership: null, institutionalExpertise: null, professionalism: null,
  loyalty: null, character: null, communication: null, heritage: null,
  recommendation: '', performanceComments: '',
  summarySignProblem: '', reportingSeniorSignDate: '',
  regularReportingSenior: '', regularReportingSeniorDate: '',
});

const traitAverage = computed(() => {
  const vals = traits
    .map(t => form[t.key])
    .filter(v => typeof v === 'number') as number[];
  if (vals.length === 0) return null;
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
});

function markDirty() { formDirty.value = true; }

function setTrait(key: string, val: number | string) {
  form[key] = form[key] === val ? null : val;
  markDirty();
}

const FIELD_LABELS: Record<string, string> = {
  rateeName: '1. Name',
  gradeRate: '2. Grade/Rate',
  commandEmployment: '28. Command Employment',
  primaryDuties: '29. Primary Duties',
  performanceComments: '41. Comments on Performance',
  recommendation: '40. Recommendation',
  leadership: '33. Leadership',
  institutionalExpertise: '34. Institutional Expertise',
  professionalism: '35. Professionalism',
  loyalty: '36. Loyalty',
  character: '37. Character',
  communication: '38. Communication',
  heritage: '39. Heritage',
};

function getFieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const field = traits.find(t => t.key === key);
  return field?.label || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

function applySuggestion(key: string, value: any) {
  form[key] = value;
  markDirty();
}

function saveDraft() {
  const data = JSON.parse(JSON.stringify(form));
  localStorage.setItem('fitrep-draft', JSON.stringify(data));
  formDirty.value = false;
  alert('Draft saved locally.');
}

function loadDraft() {
  const raw = localStorage.getItem('fitrep-draft');
  if (raw) {
    const data = JSON.parse(raw);
    Object.assign(form, data);
    formDirty.value = false;
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) {
    uploadedExamples.value.push({ name: input.files[0].name, file: input.files[0] });
  }
}

function handleDrop(e: DragEvent) {
  if (e.dataTransfer?.files.length) {
    for (const file of Array.from(e.dataTransfer.files)) {
      uploadedExamples.value.push({ name: file.name, file });
    }
  }
}

function removeExample(ex: { name: string }) {
  uploadedExamples.value = uploadedExamples.value.filter(e => e.name !== ex.name);
}

async function generateWithAI() {
  if (!aiPrompt.value && !uploadedExamples.value.length) return;

  aiLoading.value = true;
  aiError.value = '';
  aiSuggestions.value = null;
  aiNotes.value = '';

  try {
    // Extract text from uploaded files (read as text for .txt, name-only for PDFs)
    const extractedExamples: { fileName: string; text: string }[] = [];
    for (const ex of uploadedExamples.value) {
      if (ex.file.type === 'text/plain' || ex.name.endsWith('.txt')) {
        const text = await ex.file.text();
        extractedExamples.push({ fileName: ex.name, text });
      } else {
        // For PDFs/docs, send filename as reference (server-side extraction would need pdf-parse)
        extractedExamples.push({ fileName: ex.name, text: `[Uploaded file: ${ex.name}]` });
      }
    }

    const { data } = await axios.post('/api/fitrep/ai/generate', {
      prompt: aiPrompt.value,
      currentForm: JSON.parse(JSON.stringify(form)),
      extractedExamples,
    });

    aiSuggestions.value = data.fields;
    aiNotes.value = data.notes || '';
  } catch (err: any) {
    aiError.value = err.response?.data?.message || err.message || 'Failed to generate suggestions';
    console.error('AI generation error:', err);
  } finally {
    aiLoading.value = false;
  }
}

function applyAllSuggestions() {
  if (!aiSuggestions.value) return;
  for (const [key, value] of Object.entries(aiSuggestions.value)) {
    form[key] = value;
  }
  markDirty();
}

// Load draft on mount if exists
const existing = localStorage.getItem('fitrep-draft');
if (existing) {
  savedReports.value = [{ id: 'local', name: 'Local Draft' }];
}
</script>

<style scoped lang="scss">
.fitrep {
  max-width: 1400px;
  margin: 0 auto;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}

.section-subtitle {
  color: var(--text-dim, #888);
  font-size: 0.9rem;
  margin-top: 0.25rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.fitrep-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 1.5rem;
  align-items: start;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
}

.form-section {
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  padding: 1.25rem;
  margin-bottom: 1rem;
  background: var(--card-bg, #1a1a2e);

  legend {
    font-weight: 600;
    font-size: 1rem;
    color: var(--accent, #e94560);
    padding: 0 0.5rem;
  }
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  &--wide { grid-column: span 2; }
  &--full { grid-column: 1 / -1; }

  label {
    font-size: 0.8rem;
    color: var(--text-dim, #aaa);
    font-weight: 500;
  }

  input[type="text"],
  input[type="date"],
  select,
  textarea {
    background: var(--input-bg, #111);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    padding: 0.5rem;
    color: var(--text, #eee);
    font-size: 0.9rem;

    &:focus {
      outline: none;
      border-color: var(--accent, #e94560);
    }
  }

  textarea {
    resize: vertical;
    font-family: inherit;
  }
}

.required { color: var(--accent, #e94560); }

.char-count {
  font-size: 0.75rem;
  color: var(--text-dim, #666);
  text-align: right;
}

.radio-group {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--text, #ddd);
  cursor: pointer;

  &--block {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    transition: all 0.2s;

    &:has(input:checked) {
      border-color: var(--accent, #e94560);
      background: rgba(233, 69, 96, 0.1);
    }
  }
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.recommendation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.5rem;
}

// Traits
.traits-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.trait-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--border, #222);
}

.trait-label {
  min-width: 200px;
  font-size: 0.85rem;
  color: var(--text, #ddd);
}

.trait-buttons {
  display: flex;
  gap: 0.25rem;
}

.trait-btn {
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--border, #444);
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim, #888);
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.15s;

  &:hover { border-color: var(--accent, #e94560); color: var(--text, #eee); }
  &--active {
    background: var(--accent, #e94560);
    color: #fff;
    border-color: var(--accent, #e94560);
  }
  &--nob {
    font-style: italic;
    font-size: 0.75rem;
  }
}

.trait-avg {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 2px solid var(--accent, #e94560);
  margin-top: 0.25rem;
}

.trait-avg-label { font-weight: 600; color: var(--text-dim, #aaa); }
.trait-avg-value { font-size: 1.25rem; font-weight: 700; color: var(--accent, #e94560); }

.section-help {
  font-size: 0.8rem;
  color: var(--text-dim, #888);
  margin-bottom: 0.75rem;
}

// AI Panel
.ai-panel {
  position: sticky;
  top: 1rem;
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  background: var(--card-bg, #1a1a2e);
  overflow: hidden;

  @media (max-width: 1024px) {
    position: static;
  }
}

.ai-panel-header {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border, #333);
  background: rgba(233, 69, 96, 0.05);

  h2 { font-size: 1rem; margin: 0; }
}

.ai-section {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border, #222);

  h3 { font-size: 0.9rem; margin: 0 0 0.5rem; }

  textarea {
    width: 100%;
    background: var(--input-bg, #111);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    padding: 0.5rem;
    color: var(--text, #eee);
    font-size: 0.85rem;
    resize: vertical;
    font-family: inherit;

    &:focus { outline: none; border-color: var(--accent, #e94560); }
  }
}

.ai-help {
  font-size: 0.8rem;
  color: var(--text-dim, #777);
  margin-bottom: 0.5rem;
}

.upload-zone {
  border: 2px dashed var(--border, #444);
  border-radius: 8px;
  padding: 1rem;
  text-align: center;
  transition: border-color 0.2s;

  &:hover { border-color: var(--accent, #e94560); }
}

.upload-hint {
  font-size: 0.75rem;
  color: var(--text-dim, #666);
  margin-top: 0.5rem;
}

.examples-list {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.example-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.35rem 0.5rem;
  background: rgba(255,255,255,0.03);
  border-radius: 4px;
  font-size: 0.85rem;
}

.btn-icon {
  background: none;
  border: none;
  color: var(--text-dim, #888);
  cursor: pointer;
  padding: 0.25rem;

  &:hover { color: var(--accent, #e94560); }
}

.btn--ai {
  width: 100%;
  margin-top: 0.75rem;
  background: linear-gradient(135deg, #e94560, #c23152);
  border: none;
  color: #fff;
  padding: 0.6rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: opacity 0.2s;

  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.ai-suggestions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.suggestion-item {
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  padding: 0.75rem;
}

.suggestion-field {
  font-size: 0.75rem;
  color: var(--accent, #e94560);
  font-weight: 600;
}

.suggestion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.suggestion-value {
  font-size: 0.85rem;
  color: var(--text, #ddd);
  margin: 0.25rem 0 0;
  white-space: pre-wrap;
}

.btn--small {
  font-size: 0.75rem;
  padding: 0.25rem 0.75rem;
}

.btn--accent {
  background: var(--accent, #e94560);
  color: #fff;
  border: none;
}

.ai-suggestions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;

  h3 { margin: 0; }
}

.ai-notes {
  font-size: 0.75rem;
  color: var(--text-dim, #888);
  background: rgba(255,255,255,0.03);
  padding: 0.5rem;
  border-radius: 4px;
  margin-bottom: 0.75rem;
  font-style: italic;
}

.ai-error {
  color: #e94560;
  font-size: 0.8rem;
  margin-top: 0.5rem;
}
</style>
