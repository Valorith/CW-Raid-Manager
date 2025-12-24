<template>
  <div class="notes-tab">
    <!-- Add Note Form -->
    <div class="add-note-section">
      <h4>Add Note</h4>
      <textarea
        v-model="newNoteContent"
        placeholder="Enter note content..."
        class="note-textarea"
        rows="3"
      ></textarea>
      <button
        class="btn btn--primary"
        @click="createNote"
        :disabled="!newNoteContent.trim() || creatingNote"
      >
        {{ creatingNote ? 'Adding...' : 'Add Note' }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="store.notesLoading" class="loading-container">
      <span class="loading-spinner"></span>
      <p>Loading notes...</p>
    </div>

    <!-- Notes List -->
    <template v-else>
      <div class="notes-summary">
        {{ store.notes.length }} note{{ store.notes.length !== 1 ? 's' : '' }}
        <span class="notes-info">(Notes are tied to the account)</span>
      </div>

      <div class="notes-list">
        <div
          v-for="note in store.notes"
          :key="note.id"
          class="note-card"
        >
          <!-- View Mode -->
          <template v-if="editingNoteId !== note.id">
            <div class="note-content">{{ note.content }}</div>
            <div class="note-meta">
              <span class="note-author">{{ note.createdByName }}</span>
              <span class="note-date">{{ formatDate(note.createdAt) }}</span>
              <span v-if="note.updatedAt !== note.createdAt" class="note-edited">
                (edited {{ formatDate(note.updatedAt) }})
              </span>
            </div>
            <div class="note-actions">
              <button class="btn btn--small btn--secondary" @click="startEditing(note)">
                Edit
              </button>
              <button
                class="btn btn--small btn--danger"
                @click="handleDeleteNote(note.id)"
                :disabled="deletingNoteId === note.id"
              >
                {{ deletingNoteId === note.id ? 'Deleting...' : 'Delete' }}
              </button>
            </div>
          </template>

          <!-- Edit Mode -->
          <template v-else>
            <textarea
              v-model="editingContent"
              class="note-textarea"
              rows="4"
            ></textarea>
            <div class="edit-actions">
              <button
                class="btn btn--primary btn--small"
                @click="saveEdit(note.id)"
                :disabled="!editingContent.trim() || savingNote"
              >
                {{ savingNote ? 'Saving...' : 'Save' }}
              </button>
              <button class="btn btn--secondary btn--small" @click="cancelEdit">
                Cancel
              </button>
            </div>
          </template>
        </div>

        <div v-if="store.notes.length === 0" class="no-data">
          No notes have been added for this account yet
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useCharacterAdminStore } from '../../../stores/characterAdmin';
import type { AccountNote } from '../../../services/api';

const store = useCharacterAdminStore();

const newNoteContent = ref('');
const creatingNote = ref(false);
const editingNoteId = ref<string | null>(null);
const editingContent = ref('');
const savingNote = ref(false);
const deletingNoteId = ref<string | null>(null);

async function createNote() {
  if (!newNoteContent.value.trim()) return;

  creatingNote.value = true;
  try {
    await store.createNote(newNoteContent.value);
    newNoteContent.value = '';
  } catch (err) {
    console.error('Failed to create note:', err);
  } finally {
    creatingNote.value = false;
  }
}

function startEditing(note: AccountNote) {
  editingNoteId.value = note.id;
  editingContent.value = note.content;
}

function cancelEdit() {
  editingNoteId.value = null;
  editingContent.value = '';
}

async function saveEdit(noteId: string) {
  if (!editingContent.value.trim()) return;

  savingNote.value = true;
  try {
    await store.updateNote(noteId, editingContent.value);
    editingNoteId.value = null;
    editingContent.value = '';
  } catch (err) {
    console.error('Failed to update note:', err);
  } finally {
    savingNote.value = false;
  }
}

async function handleDeleteNote(noteId: string) {
  if (!confirm('Are you sure you want to delete this note?')) return;

  deletingNoteId.value = noteId;
  try {
    await store.deleteNote(noteId);
  } catch (err) {
    console.error('Failed to delete note:', err);
  } finally {
    deletingNoteId.value = null;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}
</script>

<style scoped lang="scss">
.notes-tab {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.add-note-section {
  padding: 1rem;
  background: #0f172a;
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  h4 {
    margin: 0;
    font-size: 0.875rem;
    color: #e2e8f0;
  }
}

.note-textarea {
  width: 100%;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 0.25rem;
  color: #f8fafc;
  padding: 0.75rem;
  font-size: 0.875rem;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s ease;
  align-self: flex-start;

  &--primary {
    background: #3b82f6;
    color: white;

    &:hover {
      background: #2563eb;
    }
  }

  &--secondary {
    background: #334155;
    color: #e2e8f0;

    &:hover {
      background: #475569;
    }
  }

  &--danger {
    background: #dc2626;
    color: white;

    &:hover {
      background: #b91c1c;
    }
  }

  &--small {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  color: #94a3b8;
}

.loading-spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid #334155;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.notes-summary {
  font-size: 0.875rem;
  color: #94a3b8;
}

.notes-info {
  font-size: 0.75rem;
  color: #64748b;
  margin-left: 0.5rem;
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.note-card {
  padding: 1rem;
  background: #0f172a;
  border-radius: 0.5rem;
  border: 1px solid #334155;
}

.note-content {
  color: #e2e8f0;
  font-size: 0.875rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.note-meta {
  margin-top: 0.75rem;
  font-size: 0.75rem;
  color: #64748b;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.note-author {
  color: #94a3b8;
  font-weight: 500;
}

.note-date {
  color: #475569;
}

.note-edited {
  color: #475569;
  font-style: italic;
}

.note-actions {
  margin-top: 0.75rem;
  display: flex;
  gap: 0.5rem;
}

.edit-actions {
  margin-top: 0.75rem;
  display: flex;
  gap: 0.5rem;
}

.no-data {
  text-align: center;
  padding: 2rem;
  color: #64748b;
}
</style>
