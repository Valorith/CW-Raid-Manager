<template>
  <div class="wiki-editor">
    <div class="wiki-editor__toolbar" role="toolbar" aria-label="Wikitext formatting">
      <button
        v-for="action in actions"
        :key="action.label"
        type="button"
        class="wiki-editor__tool"
        :class="{ 'wiki-editor__tool--group-end': action.groupEnd }"
        :title="action.title"
        :aria-label="action.title"
        @click="applyAction(action)"
      >
        <span :class="action.style">{{ action.label }}</span>
      </button>
      <span class="wiki-editor__spacer"></span>
      <a
        href="https://www.mediawiki.org/wiki/Help:Formatting"
        class="wiki-editor__help"
        target="_blank"
        rel="noopener noreferrer"
      >
        Wikitext help ↗
      </a>
    </div>

    <div class="wiki-editor__workspace">
      <div class="wiki-editor__pane wiki-editor__pane--source">
        <div class="wiki-editor__pane-heading">
          <span>Wikitext</span>
          <span>{{ modelValue.length.toLocaleString() }} characters</span>
        </div>
        <textarea
          ref="textareaRef"
          :value="modelValue"
          aria-label="Boss notes wikitext"
          spellcheck="true"
          placeholder="== Strategy ==&#10;Add the encounter strategy here…"
          @input="handleInput"
          @keydown="handleKeydown"
        ></textarea>
      </div>
      <div class="wiki-editor__pane wiki-editor__pane--preview">
        <div class="wiki-editor__pane-heading">
          <span>Live preview</span>
          <span>MediaWiki style</span>
        </div>
        <div class="wiki-editor__preview-scroll">
          <MediaWikiContent :source="modelValue" :links="links">
            <template #empty>Start writing to see the rendered page.</template>
          </MediaWikiContent>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue';

import MediaWikiContent from './MediaWikiContent.vue';

interface EditorAction {
  label: string;
  title: string;
  before?: string;
  after?: string;
  placeholder?: string;
  linePrefix?: string;
  block?: string;
  style?: string;
  groupEnd?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    links?: Record<string, string>;
  }>(),
  { links: () => ({}) }
);

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>();
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const actions: EditorAction[] = [
  {
    label: 'H2',
    title: 'Section heading',
    before: '== ',
    after: ' ==',
    placeholder: 'Heading',
    groupEnd: true
  },
  {
    label: 'B',
    title: 'Bold (⌘B)',
    before: "'''",
    after: "'''",
    placeholder: 'Bold text',
    style: 'is-bold'
  },
  {
    label: 'I',
    title: 'Italic (⌘I)',
    before: "''",
    after: "''",
    placeholder: 'Italic text',
    style: 'is-italic',
    groupEnd: true
  },
  {
    label: 'Link',
    title: 'Internal boss link',
    before: '[[',
    after: ']]',
    placeholder: 'Boss name'
  },
  {
    label: '↗',
    title: 'External link',
    before: '[https://example.com ',
    after: ']',
    placeholder: 'Link text',
    groupEnd: true
  },
  { label: '• List', title: 'Bulleted list', linePrefix: '* ' },
  { label: '1. List', title: 'Numbered list', linePrefix: '# ' },
  { label: '❝', title: 'Callout quote', linePrefix: ': ', groupEnd: true },
  {
    label: 'Table',
    title: 'Insert table',
    block: '{| class="wikitable"\n|+ Mechanics\n! Phase !! Response\n|-\n| One || Add details\n|}'
  },
  { label: '—', title: 'Horizontal rule', block: '----' }
];

function handleInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
}

function applyAction(action: EditorAction) {
  const textarea = textareaRef.value;
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = props.modelValue.slice(start, end);
  let replacement = '';
  let selectionStart = start;
  let selectionEnd = start;

  if (action.block) {
    const needsLeadingBreak = start > 0 && props.modelValue[start - 1] !== '\n';
    const needsTrailingBreak = end < props.modelValue.length && props.modelValue[end] !== '\n';
    replacement = `${needsLeadingBreak ? '\n' : ''}${action.block}${needsTrailingBreak ? '\n' : ''}`;
    selectionStart = start + (needsLeadingBreak ? 1 : 0);
    selectionEnd = selectionStart + action.block.length;
  } else if (action.linePrefix) {
    const lineStart = props.modelValue.lastIndexOf('\n', start - 1) + 1;
    const lineEndIndex = props.modelValue.indexOf('\n', end);
    const lineEnd = lineEndIndex === -1 ? props.modelValue.length : lineEndIndex;
    const lines = props.modelValue.slice(lineStart, lineEnd).split('\n');
    replacement = lines.map((line) => `${action.linePrefix}${line}`).join('\n');
    emit(
      'update:modelValue',
      `${props.modelValue.slice(0, lineStart)}${replacement}${props.modelValue.slice(lineEnd)}`
    );
    nextTick(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart, lineStart + replacement.length);
    });
    return;
  } else {
    const content = selected || action.placeholder || '';
    replacement = `${action.before ?? ''}${content}${action.after ?? ''}`;
    selectionStart = start + (action.before?.length ?? 0);
    selectionEnd = selectionStart + content.length;
  }

  emit(
    'update:modelValue',
    `${props.modelValue.slice(0, start)}${replacement}${props.modelValue.slice(end)}`
  );
  nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(selectionStart, selectionEnd);
  });
}

function handleKeydown(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey)) return;
  if (event.key.toLowerCase() === 'b') {
    event.preventDefault();
    applyAction(actions[1]);
  }
  if (event.key.toLowerCase() === 'i') {
    event.preventDefault();
    applyAction(actions[2]);
  }
}
</script>

<style scoped>
.wiki-editor {
  background: rgba(8, 13, 26, 0.92);
  border: 1px solid rgba(95, 139, 190, 0.24);
  border-radius: 16px;
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.wiki-editor__toolbar {
  align-items: center;
  background: rgba(19, 30, 52, 0.92);
  border-bottom: 1px solid rgba(95, 139, 190, 0.2);
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.55rem 0.65rem;
  position: sticky;
  top: 0;
  z-index: 3;
}

.wiki-editor__tool {
  align-items: center;
  background: rgba(8, 14, 27, 0.7);
  border: 1px solid rgba(110, 150, 210, 0.25);
  border-radius: 7px;
  color: #c8d7e9;
  cursor: pointer;
  display: inline-flex;
  height: 2rem;
  justify-content: center;
  min-width: 2rem;
  padding: 0 0.55rem;
  transition: 150ms ease;
}

.wiki-editor__tool--group-end {
  margin-right: 0.35rem;
}

.wiki-editor__tool:hover {
  background: rgba(34, 211, 238, 0.11);
  border-color: rgba(34, 211, 238, 0.5);
  color: #ecfeff;
  transform: translateY(-1px);
}

.wiki-editor__tool:active {
  transform: translateY(0) scale(0.96);
}

.wiki-editor__tool:focus-visible,
.wiki-editor__help:focus-visible {
  outline: 2px solid rgba(103, 232, 249, 0.9);
  outline-offset: 2px;
}

.wiki-editor__spacer {
  flex: 1;
}

.wiki-editor__help {
  color: #91a6bf;
  font-size: 0.74rem;
  padding: 0.35rem;
  text-decoration: none;
}

.wiki-editor__help:hover {
  color: #67e8f9;
}

.is-bold {
  font-weight: 800;
}

.is-italic {
  font-style: italic;
}

.wiki-editor__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  min-height: 35rem;
}

.wiki-editor__pane {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.wiki-editor__pane + .wiki-editor__pane {
  border-left: 1px solid rgba(95, 139, 190, 0.18);
}

.wiki-editor__pane-heading {
  align-items: center;
  background: rgba(15, 23, 42, 0.68);
  color: #8fa4be;
  display: flex;
  font-size: 0.69rem;
  font-weight: 700;
  justify-content: space-between;
  letter-spacing: 0.08em;
  padding: 0.55rem 0.85rem;
  text-transform: uppercase;
}

.wiki-editor textarea {
  background: #080d1a;
  border: 0;
  color: #dce8f5;
  flex: 1;
  font-family: var(--nx-font-mono);
  font-size: 0.9rem;
  line-height: 1.65;
  min-height: 33rem;
  outline: none;
  padding: 1.15rem;
  resize: vertical;
  tab-size: 2;
  width: 100%;
}

.wiki-editor textarea:focus {
  box-shadow: inset 0 0 0 1px rgba(34, 211, 238, 0.35);
}

.wiki-editor__preview-scroll {
  flex: 1;
  max-height: 40rem;
  overflow: auto;
  padding: 0.4rem 1.35rem 1.5rem;
}

@media (max-width: 900px) {
  .wiki-editor__workspace {
    grid-template-columns: 1fr;
  }

  .wiki-editor__pane + .wiki-editor__pane {
    border-left: 0;
    border-top: 1px solid rgba(95, 139, 190, 0.18);
  }

  .wiki-editor__preview-scroll {
    min-height: 20rem;
  }
}

@media (max-width: 600px) {
  .wiki-editor__toolbar {
    flex-wrap: nowrap;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scrollbar-width: none;
  }

  .wiki-editor__toolbar::-webkit-scrollbar {
    display: none;
  }

  .wiki-editor__spacer,
  .wiki-editor__help {
    display: none;
  }

  .wiki-editor__tool {
    flex: 0 0 auto;
  }

  .wiki-editor textarea {
    min-height: 24rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .wiki-editor__tool {
    transition: none;
  }
}
</style>
