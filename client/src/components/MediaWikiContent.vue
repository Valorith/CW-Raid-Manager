<template>
  <div v-if="source.trim()" class="wiki-content" v-html="rendered"></div>
  <div v-else class="wiki-content wiki-content--empty">
    <slot name="empty">No notes have been added yet.</slot>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { renderMediaWiki } from '../utils/mediaWiki';

const props = withDefaults(
  defineProps<{
    source: string;
    links?: Record<string, string>;
  }>(),
  {
    links: () => ({})
  }
);

const rendered = computed(() =>
  renderMediaWiki(props.source, {
    resolveWikiLink(target) {
      return props.links[target.trim().toLocaleLowerCase()] ?? null;
    }
  })
);
</script>

<style scoped>
.wiki-content {
  container-name: wiki-render;
  container-type: inline-size;
  color: #d9e4f2;
  display: flow-root;
  font-size: 1rem;
  line-height: 1.75;
  overflow-wrap: break-word;
}

.wiki-content--empty {
  display: grid;
  min-height: 14rem;
  place-items: center;
  color: #7e8ea8;
  text-align: center;
}

.wiki-content :deep(h2),
.wiki-content :deep(h3),
.wiki-content :deep(h4),
.wiki-content :deep(h5),
.wiki-content :deep(h6) {
  color: #f5f8fc;
  font-family: var(--nx-font-display);
  letter-spacing: -0.02em;
  line-height: 1.25;
  margin: 2rem 0 0.72rem;
  scroll-margin-top: 8.5rem;
  text-wrap: balance;
}

@media (max-width: 860px) {
  .wiki-content :deep(h2),
  .wiki-content :deep(h3),
  .wiki-content :deep(h4),
  .wiki-content :deep(h5),
  .wiki-content :deep(h6) {
    scroll-margin-top: calc(9.75rem + env(safe-area-inset-top, 0px));
  }
}

.wiki-content :deep(.wiki-heading--major) {
  border-bottom: 1px solid rgba(125, 211, 252, 0.18);
  font-size: clamp(1.4rem, 3.2cqw, 1.68rem);
  margin-top: clamp(2.45rem, 5cqw, 3.35rem);
  padding-bottom: 0.65rem;
}

.wiki-content :deep(.wiki-heading--first:first-child) {
  margin-top: 0;
}

.wiki-content :deep(.wiki-heading--secondary) {
  color: #e7f0f8;
  font-size: clamp(1.12rem, 2.5cqw, 1.3rem);
  margin-top: 2.1rem;
}

.wiki-content :deep(.wiki-heading--minor) {
  color: #c6d6e5;
  font-size: clamp(0.98rem, 2.2cqw, 1.1rem);
  letter-spacing: -0.01em;
  margin-top: 1.65rem;
}

.wiki-content :deep(.wiki-heading:target) {
  color: #a5f3f6;
}

.wiki-content :deep(p) {
  margin: 0 0 1.1rem;
  max-width: 74ch;
}

.wiki-content :deep(ul),
.wiki-content :deep(ol),
.wiki-content :deep(dl) {
  margin: 0.6rem 0 1.25rem;
  max-width: 74ch;
  padding-left: 1.5rem;
}

.wiki-content :deep(dl) {
  padding-left: 0;
}

.wiki-content :deep(li) {
  margin: 0.32rem 0;
  padding-left: 0.25rem;
}

.wiki-content :deep(li > ul),
.wiki-content :deep(li > ol),
.wiki-content :deep(li > dl),
.wiki-content :deep(dd > ul),
.wiki-content :deep(dd > ol) {
  margin: 0.2rem 0 0.45rem;
}

.wiki-content :deep(dt) {
  color: #f4f8fd;
  font-weight: 700;
  margin-top: 0.5rem;
}

.wiki-content :deep(dd) {
  border-left: 2px solid rgba(103, 232, 249, 0.2);
  margin: 0.2rem 0 0.55rem;
  padding-left: 1rem;
}

.wiki-content :deep(li::marker) {
  color: #58cbd2;
  font-weight: 750;
}

.wiki-content :deep(strong) {
  color: #f4f8fd;
  font-weight: 700;
}

.wiki-content :deep(.wiki-link),
.wiki-content :deep(.wiki-external-link) {
  color: #67e8f9;
  overflow-wrap: anywhere;
  text-decoration-color: rgba(103, 232, 249, 0.4);
  text-underline-offset: 0.18em;
}

.wiki-content :deep(.wiki-external-link),
.wiki-content :deep(.wiki-link--external-wiki) {
  color: #f2a93b;
  text-decoration-color: rgba(242, 169, 59, 0.45);
}

.wiki-content :deep(.wiki-external-link::after),
.wiki-content :deep(.wiki-link--external-wiki::after) {
  content: ' ↗';
  font-size: 0.72em;
  font-weight: 750;
  vertical-align: 0.12em;
}

.wiki-content :deep(.wiki-link--unresolved) {
  color: #fbbf24;
  cursor: help;
  text-decoration: underline dashed rgba(251, 191, 36, 0.5);
  text-underline-offset: 0.2em;
}

.wiki-content :deep(blockquote) {
  background: rgba(34, 211, 238, 0.055);
  border-left: 3px solid rgba(34, 211, 238, 0.7);
  color: #b9c9dc;
  margin: 1.3rem 0;
  max-width: 74ch;
  padding: 0.85rem 1.1rem;
  border-radius: 0 10px 10px 0;
}

.wiki-content :deep(pre) {
  background: #080d19;
  border: 1px solid rgba(94, 129, 176, 0.2);
  border-radius: 10px;
  color: #c5d6e9;
  font-family: var(--nx-font-mono);
  font-size: 0.86rem;
  overflow-x: auto;
  padding: 1rem;
}

.wiki-content :deep(hr) {
  border: 0;
  border-top: 1px solid rgba(125, 211, 252, 0.18);
  clear: both;
  margin: 2rem 0;
}

.wiki-content :deep(.wiki-table-wrap) {
  border: 1px solid rgba(94, 129, 176, 0.2);
  border-radius: 10px;
  margin: 1.4rem 0;
  max-width: 100%;
  overscroll-behavior-inline: contain;
  overflow-x: auto;
  scrollbar-color: rgba(103, 232, 249, 0.32) rgba(8, 15, 29, 0.54);
  scrollbar-width: thin;
  width: fit-content;
}

.wiki-content :deep(.wiki-table) {
  background: rgba(8, 15, 29, 0.54);
  border-collapse: collapse;
  min-width: min(20rem, 100%);
  width: auto;
}

.wiki-content :deep(.wiki-table caption) {
  color: #f1f6fb;
  font-weight: 700;
  padding: 0.5rem;
  text-align: left;
}

.wiki-content :deep(.wiki-table th),
.wiki-content :deep(.wiki-table td) {
  border: 1px solid rgba(94, 129, 176, 0.24);
  padding: 0.52rem 0.75rem;
  text-align: left;
}

.wiki-content :deep(.wiki-table th) {
  background: rgba(36, 55, 91, 0.6);
  color: #f1f6fb;
}

.wiki-content :deep(.wiki-table tr:hover td) {
  background: rgba(69, 215, 223, 0.035);
}

.wiki-content :deep(.wiki-file) {
  box-sizing: border-box;
  max-width: 100%;
}

.wiki-content :deep(.wiki-file--block) {
  margin: 0 0 1.4rem;
  width: var(--wiki-file-width, fit-content);
}

.wiki-content :deep(.wiki-file--right) {
  float: right;
  margin-left: 2rem;
}

.wiki-content :deep(.wiki-file--left) {
  float: left;
  margin-right: 2rem;
}

.wiki-content :deep(.wiki-file--center) {
  margin-left: auto;
  margin-right: auto;
}

.wiki-content :deep(.wiki-file--thumb) {
  background: rgba(8, 15, 29, 0.78);
  border: 1px solid rgba(94, 129, 176, 0.28);
  border-radius: 4px;
  padding: 0.38rem;
}

.wiki-content :deep(.wiki-file__link) {
  display: block;
}

.wiki-content :deep(.wiki-file img) {
  border-radius: 3px;
  display: block;
  height: auto;
  max-width: 100%;
}

.wiki-content :deep(.wiki-file--block img) {
  width: var(--wiki-file-width, auto);
}

.wiki-content :deep(.wiki-file--inline) {
  display: inline-block;
  vertical-align: middle;
  width: var(--wiki-file-width, auto);
}

.wiki-content :deep(.wiki-file figcaption) {
  color: #f2a93b;
  font-size: 0.84rem;
  line-height: 1.45;
  padding: 0.45rem 0.28rem 0.15rem;
}

.wiki-content :deep(.wiki-file-missing) {
  color: #fbbf24;
  text-decoration: underline dashed rgba(251, 191, 36, 0.45);
}

.wiki-content :deep(.wiki-callout) {
  background: rgba(56, 189, 248, 0.07);
  border: 1px solid rgba(56, 189, 248, 0.22);
  border-radius: 12px;
  margin: 1.3rem 0;
  max-width: 74ch;
  padding: 0.85rem 1rem;
}

.wiki-content :deep(.wiki-callout p) {
  margin: 0.25rem 0 0;
}

.wiki-content :deep(.wiki-callout--warning) {
  background: rgba(251, 191, 36, 0.075);
  border-color: rgba(251, 191, 36, 0.25);
}

.wiki-content :deep(.wiki-categories) {
  border-top: 1px solid rgba(125, 211, 252, 0.16);
  clear: both;
  color: #93a4bb;
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1rem;
  margin-top: 2.5rem;
  padding-top: 1rem;
}

.wiki-content :deep(.wiki-categories > div) {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.wiki-content :deep(.wiki-categories a),
.wiki-content :deep(.wiki-categories span) {
  border: 1px solid rgba(94, 129, 176, 0.28);
  border-radius: 999px;
  color: #d5dfed;
  font-size: 0.8rem;
  line-height: 1;
  padding: 0.42rem 0.68rem;
  text-decoration: none;
}

.wiki-content :deep(.wiki-categories a:hover) {
  border-color: rgba(103, 232, 249, 0.48);
  color: #67e8f9;
}

@container wiki-render (max-width: 54rem) {
  .wiki-content :deep(.wiki-table-wrap) {
    width: 100%;
  }

  .wiki-content :deep(.wiki-file--right),
  .wiki-content :deep(.wiki-file--left) {
    float: none;
    margin-left: 0;
    margin-right: 0;
  }

  .wiki-content :deep(.wiki-file--block) {
    width: 100%;
  }

  .wiki-content :deep(.wiki-file--block img) {
    margin-inline: auto;
  }

  .wiki-content :deep(.wiki-table) {
    min-width: 18rem;
  }
}

@container wiki-render (max-width: 34rem) {
  .wiki-content {
    font-size: 0.94rem;
    line-height: 1.68;
  }

  .wiki-content :deep(.wiki-heading--major) {
    font-size: 1.32rem;
    margin-top: 2.25rem;
  }

  .wiki-content :deep(.wiki-heading--secondary) {
    font-size: 1.08rem;
    margin-top: 1.85rem;
  }

  .wiki-content :deep(.wiki-heading--minor) {
    font-size: 0.98rem;
    margin-top: 1.45rem;
  }

  .wiki-content :deep(ul),
  .wiki-content :deep(ol) {
    padding-left: 1.2rem;
  }

  .wiki-content :deep(.wiki-table th),
  .wiki-content :deep(.wiki-table td) {
    font-size: 0.84rem;
    padding: 0.46rem 0.58rem;
  }

  .wiki-content :deep(.wiki-table:has(tr > :nth-child(2):last-child) th:first-child),
  .wiki-content :deep(.wiki-table:has(tr > :nth-child(2):last-child) td:first-child) {
    white-space: nowrap;
  }

  .wiki-content :deep(.wiki-callout),
  .wiki-content :deep(blockquote) {
    padding: 0.75rem 0.85rem;
  }
}
</style>
