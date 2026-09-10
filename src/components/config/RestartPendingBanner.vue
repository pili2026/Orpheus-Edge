<template>
  <el-alert
    v-if="hasPending"
    type="warning"
    :closable="true"
    show-icon
    class="restart-alert"
    @close="restartStore.dismissAlert"
  >
    <template #title>{{ t.config.talos.alertTitle }}</template>
    <template #default>
      <div v-for="entry in pendingRestarts" :key="entry.id" class="pending-restart">
        <span class="pending-scopes">{{ pendingScopesText(entry.scopeLabels) }}</span>
        <el-button
          type="warning"
          size="small"
          :icon="RefreshRight"
          :loading="isRestarting"
          @click="restartStore.restartEndpoint(entry.id)"
        >
          {{ entry.label }}
        </el-button>
      </div>
    </template>
  </el-alert>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { RefreshRight } from '@element-plus/icons-vue'
import { useUIStore } from '@/stores/ui'
import { useRestartStore } from '@/stores/restart'

/**
 * One row per service with pending changes: what is waiting, and the button
 * that applies it. The row's button restarts only the service that row names,
 * so the banner can never offer a restart the user cannot see named.
 *
 * With a single service pending there is a single row, which is the shape this
 * banner had before `mqtt` was split onto its own endpoint.
 */
const { t } = storeToRefs(useUIStore())
const restartStore = useRestartStore()
const { hasPending, isRestarting, pendingRestarts } = storeToRefs(restartStore)

const pendingScopesText = (scopeLabels: string[]) =>
  t.value.config.talos.pendingScopes.replace('{scopes}', scopeLabels.join(', '))
</script>

<style scoped>
.restart-alert {
  margin-bottom: 20px;
}
.restart-alert :deep(.el-alert__content) {
  width: 100%;
}
.pending-restart {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 12px;
}
.pending-restart + .pending-restart {
  margin-top: 8px;
}
.pending-scopes {
  font-size: 13px;
}
</style>
