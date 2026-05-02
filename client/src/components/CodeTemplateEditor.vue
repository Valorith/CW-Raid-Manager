<template>
  <div class="code-template-editor">
    <div class="code-template-editor__header">
      <div>
        <span class="code-template-editor__label">{{ label }}</span>
        <span v-if="language" class="code-template-editor__language">{{ language }}</span>
      </div>
      <div v-if="placeholders.length > 0" class="code-template-editor__tokens" aria-label="Template variables">
        <button
          v-for="token in placeholders"
          :key="token"
          type="button"
          class="code-template-editor__token"
          @click="insertToken(token)"
        >
          {{ token }}
        </button>
      </div>
    </div>

    <div class="code-template-editor__body">
      <pre ref="gutterRef" class="code-template-editor__gutter" aria-hidden="true"><span
        v-for="lineNumber in lineNumbers"
        :key="lineNumber"
      >{{ lineNumber }}</span></pre>
      <textarea
        ref="textareaRef"
        class="code-template-editor__textarea"
        :value="editorValue"
        :placeholder="placeholder"
        :rows="rows"
        wrap="soft"
        spellcheck="false"
        @input="handleInput"
        @scroll="syncScroll"
        @keydown.tab.prevent="insertToken('  ')"
      ></textarea>
    </div>

    <div class="code-template-editor__footer">
      <span>{{ lineCount }} {{ lineCount === 1 ? 'line' : 'lines' }}</span>
      <span>{{ editorValue.length }} chars</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    label: string;
    modelValue?: string;
    language?: string;
    placeholder?: string;
    placeholders?: string[];
    rows?: number;
  }>(),
  {
    language: '',
    placeholder: '',
    placeholders: () => [],
    rows: 8
  }
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const gutterRef = ref<HTMLPreElement | null>(null);

const editorValue = computed(() => props.modelValue ?? '');
const lineCount = computed(() => Math.max(1, editorValue.value.split('\n').length));
const lineNumbers = computed(() => Array.from({ length: lineCount.value }, (_, index) => index + 1));

function handleInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
}

function syncScroll(event: Event) {
  if (!gutterRef.value) return;
  gutterRef.value.scrollTop = (event.target as HTMLTextAreaElement).scrollTop;
}

async function insertToken(token: string) {
  const textarea = textareaRef.value;
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const nextValue = `${editorValue.value.slice(0, start)}${token}${editorValue.value.slice(end)}`;
  emit('update:modelValue', nextValue);

  await nextTick();
  textarea.focus();
  textarea.selectionStart = start + token.length;
  textarea.selectionEnd = start + token.length;
}
</script>

<style scoped>
.code-template-editor {
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 0.8rem;
  overflow: hidden;
  background: rgba(2, 6, 23, 0.45);
  box-shadow:
    inset 0 0 0 1px rgba(15, 23, 42, 0.35),
    0 10px 24px rgba(2, 6, 23, 0.18);
}

.code-template-editor:focus-within {
  border-color: rgba(56, 189, 248, 0.72);
  box-shadow:
    0 0 0 3px rgba(14, 165, 233, 0.18),
    inset 0 0 0 1px rgba(15, 23, 42, 0.45);
}

.code-template-editor__header,
.code-template-editor__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background: rgba(15, 23, 42, 0.78);
}

.code-template-editor__header {
  min-height: 2.5rem;
  padding: 0.45rem 0.65rem 0.45rem 0.8rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
}

.code-template-editor__label,
.code-template-editor__language {
  display: inline-flex;
  align-items: center;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.code-template-editor__label {
  color: rgba(203, 213, 225, 0.92);
}

.code-template-editor__language {
  margin-left: 0.45rem;
  color: #7dd3fc;
}

.code-template-editor__tokens {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.code-template-editor__token {
  min-height: 1.55rem;
  padding: 0 0.45rem;
  border: 1px solid rgba(56, 189, 248, 0.24);
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.1);
  color: #bae6fd;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 0.68rem;
  cursor: pointer;
}

.code-template-editor__token:hover {
  border-color: rgba(56, 189, 248, 0.5);
  background: rgba(14, 165, 233, 0.18);
}

.code-template-editor__body {
  display: grid;
  grid-template-columns: 3.2rem minmax(0, 1fr);
  min-height: 9rem;
  position: relative;
  background-color: #071018;
  background-image: repeating-linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.022) 0 1px,
    transparent 1px 5px
  );
}

.code-template-editor__gutter,
.code-template-editor__textarea {
  position: relative;
  z-index: 1;
  margin: 0;
  padding: 0.75rem 0;
  border: 0;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 0.86rem;
  line-height: 1.45rem;
  tab-size: 2;
}

.code-template-editor__gutter {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: rgba(2, 6, 23, 0.58);
  background-image: repeating-linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.018) 0 1px,
    transparent 1px 5px
  );
  border-right: 1px solid rgba(148, 163, 184, 0.14);
  color: rgba(148, 163, 184, 0.58);
  text-align: right;
  user-select: none;
}

.code-template-editor__gutter span {
  height: 1.45rem;
  padding-right: 0.75rem;
}

.code-template-editor__textarea {
  width: 100%;
  resize: vertical;
  padding-right: 0.9rem;
  padding-left: 0.9rem;
  outline: none;
  background: transparent;
  color: #dbeafe;
  caret-color: #7dd3fc;
  overflow-x: hidden;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.code-template-editor__textarea::placeholder {
  color: rgba(148, 163, 184, 0.62);
}

.code-template-editor__footer {
  min-height: 1.9rem;
  padding: 0.25rem 0.75rem;
  border-top: 1px solid rgba(148, 163, 184, 0.14);
  color: rgba(148, 163, 184, 0.8);
  font-size: 0.72rem;
}

@media (max-width: 560px) {
  .code-template-editor__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .code-template-editor__tokens {
    justify-content: flex-start;
    width: 100%;
  }

  .code-template-editor__body {
    grid-template-columns: 2.45rem minmax(0, 1fr);
  }

  .code-template-editor__gutter,
  .code-template-editor__textarea {
    font-size: 0.78rem;
  }

  .code-template-editor__textarea {
    padding-left: 0.65rem;
    padding-right: 0.65rem;
  }

  .code-template-editor__gutter span {
    padding-right: 0.5rem;
  }
}
</style>
