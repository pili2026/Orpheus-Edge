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
      <div class="pending-restart">
        <span class="pending-scopes">{{ pendingScopesText }}</span>
        <el-button
          type="warning"
          size="small"
          :icon="RefreshRight"
          :loading="isRestarting"
          @click="restartStore.restartNow()"
        >
          {{ t.config.talos.restartService }}
        </el-button>
      </div>
    </template>
  </el-alert>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { RefreshRight } from '@element-plus/icons-vue'
import { useUIStore } from '@/stores/ui'
import { useRestartStore } from '@/stores/restart'

/**
 * One row and one button: what is waiting, and the restart that applies it.
 * Every pending scope is applied by the same Talos restart (see RESTART_URL in
 * `@/stores/restart`), so the row names every one of them and the button
 * never offers a restart the user cannot see named.
 */
const { t } = storeToRefs(useUIStore())
const restartStore = useRestartStore()
const { hasPending, isRestarting, pendingScopeList } = storeToRefs(restartStore)

const pendingScopesText = computed(() =>
  t.value.config.talos.pendingScopes.replace(
    '{scopes}',
    pendingScopeList.value.map((scope) => t.value.config.talos.scopes[scope]).join(', '),
  ),
)
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
.pending-scopes {
  font-size: 13px;
}
</style>
