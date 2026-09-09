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
      <span class="pending-scopes">{{ pendingScopesText }}</span>
      <el-button
        type="warning"
        size="small"
        :icon="RefreshRight"
        :loading="isRestarting"
        @click="restartStore.restartNow(scope)"
      >
        {{ t.config.talos.restartService }}
      </el-button>
    </template>
  </el-alert>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { RefreshRight } from '@element-plus/icons-vue'
import { useUIStore } from '@/stores/ui'
import { useRestartStore, type RestartScope } from '@/stores/restart'

defineProps<{
  /**
   * The scope this screen owns. It decides which endpoint the Restart button
   * targets; the banner itself is shown whenever ANY scope is pending, so a
   * restart deferred on one screen stays visible on the others.
   */
  scope: RestartScope
}>()

const { t } = storeToRefs(useUIStore())
const restartStore = useRestartStore()
const { hasPending, isRestarting, pendingScopeLabels } = storeToRefs(restartStore)

const pendingScopesText = computed(() =>
  t.value.config.talos.pendingScopes.replace('{scopes}', pendingScopeLabels.value.join(', ')),
)
</script>

<style scoped>
.restart-alert {
  margin-bottom: 20px;
}
.restart-alert :deep(.el-alert__content) {
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
