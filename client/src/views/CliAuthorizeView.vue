<template>
  <section class="cli-authorize">
    <div class="cli-authorize__panel">
      <p class="eyebrow">Nexus CLI</p>
      <template v-if="loading">
        <h1>Checking Request</h1>
        <p>Loading the CLI authorization request.</p>
      </template>

      <template v-else-if="errorMessage">
        <h1>Request Unavailable</h1>
        <p>{{ errorMessage }}</p>
        <RouterLink class="btn btn--secondary" to="/dashboard">Return to Dashboard</RouterLink>
      </template>

      <template v-else-if="login">
        <h1>Authorize CLI Access</h1>
        <p>
          <strong>{{ login.clientName }}</strong> is requesting access to your Nexus account for
          {{ scopeLabel }}.
        </p>

        <dl>
          <div>
            <dt>Code</dt>
            <dd>{{ login.userCode }}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{{ statusLabel }}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>{{ expiresLabel }}</dd>
          </div>
        </dl>

        <div v-if="login.status === 'pending'" class="actions">
          <button class="btn btn--primary" type="button" :disabled="submitting" @click="approve">
            {{ submitting ? 'Authorizing...' : 'Authorize' }}
          </button>
          <button class="btn btn--secondary" type="button" :disabled="submitting" @click="deny">
            Deny
          </button>
        </div>

        <RouterLink v-else class="btn btn--secondary" to="/dashboard">
          Return to Dashboard
        </RouterLink>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { api, type CliDeviceLogin } from '../services/api';

const route = useRoute();
const login = ref<CliDeviceLogin | null>(null);
const loading = ref(true);
const submitting = ref(false);
const errorMessage = ref('');

const userCode = computed(() =>
  typeof route.query.user_code === 'string' ? route.query.user_code.trim() : ''
);
const scopeLabel = computed(() =>
  login.value?.scopes?.length ? login.value.scopes.join(', ') : 'Nexus CLI features'
);
const statusLabel = computed(() => {
  if (!login.value) {
    return '';
  }
  const labels: Record<CliDeviceLogin['status'], string> = {
    pending: 'Waiting for approval',
    approved: 'Approved. Return to your terminal.',
    denied: 'Denied',
    consumed: 'Already used',
    expired: 'Expired'
  };
  return labels[login.value.status];
});
const expiresLabel = computed(() =>
  login.value ? new Date(login.value.expiresAt).toLocaleString() : ''
);

async function loadRequest() {
  loading.value = true;
  errorMessage.value = '';
  try {
    if (!userCode.value) {
      throw new Error('No CLI user code was provided.');
    }
    login.value = await api.fetchCliDeviceLogin(userCode.value);
  } catch (error) {
    login.value = null;
    errorMessage.value =
      error instanceof Error ? error.message : 'Unable to load the CLI authorization request.';
  } finally {
    loading.value = false;
  }
}

async function approve() {
  if (!userCode.value) {
    return;
  }
  submitting.value = true;
  try {
    login.value = await api.approveCliDeviceLogin(userCode.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to authorize CLI access.';
  } finally {
    submitting.value = false;
  }
}

async function deny() {
  if (!userCode.value) {
    return;
  }
  submitting.value = true;
  try {
    login.value = await api.denyCliDeviceLogin(userCode.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to deny CLI access.';
  } finally {
    submitting.value = false;
  }
}

onMounted(loadRequest);
</script>

<style scoped>
.cli-authorize {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
  padding: 2rem;
}

.cli-authorize__panel {
  width: min(100%, 34rem);
  padding: 2rem;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.92);
  color: #f8fafc;
}

.eyebrow {
  margin: 0 0 0.75rem;
  color: #93c5fd;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 0.75rem;
  font-size: 1.75rem;
}

p {
  color: #cbd5e1;
  line-height: 1.6;
}

dl {
  display: grid;
  gap: 0.75rem;
  margin: 1.5rem 0;
}

dl > div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

dt {
  color: #94a3b8;
  font-weight: 700;
}

dd {
  margin: 0;
  text-align: right;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.btn {
  border: 0;
  border-radius: 8px;
  color: #f8fafc;
  cursor: pointer;
  font-weight: 800;
  line-height: 1;
  padding: 0.75rem 1rem;
  text-decoration: none;
}

.btn:disabled {
  cursor: wait;
  opacity: 0.6;
}

.btn--primary {
  background: #2563eb;
}

.btn--secondary {
  background: rgba(51, 65, 85, 0.9);
}
</style>
