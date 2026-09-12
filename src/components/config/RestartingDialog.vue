<template>
  <el-dialog
    v-model="showRestartingDialog"
    :title="t.config.talos.restartingTitle"
    width="380px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    align-center
  >
    <div class="restarting-content">
      <el-icon class="is-loading restarting-icon" :size="56" color="#e6a23c">
        <component :is="RefreshRight" />
      </el-icon>
      <p class="restarting-text">{{ t.config.talos.restartingMessage }}</p>
      <p class="restarting-subtext">{{ t.config.talos.restartingSubtext }}</p>
      <el-progress
        :percentage="restartProgress"
        :stroke-width="6"
        :status="restartProgress >= 100 ? 'success' : 'warning'"
        :striped="restartProgress < 100"
        :striped-flow="restartProgress < 100"
        :duration="3"
      />
      <p class="restarting-countdown">
        {{
          restartProgress < 100 ? t.config.talos.restartingSubtext : t.config.talos.restartSuccess
        }}
      </p>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { RefreshRight } from '@element-plus/icons-vue'
import { useUIStore } from '@/stores/ui'
import { useRestartStore } from '@/stores/restart'

const { t } = storeToRefs(useUIStore())
const { showRestartingDialog, restartProgress } = storeToRefs(useRestartStore())
</script>

<style scoped>
.restarting-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 12px 0 4px;
  text-align: center;
}
.restarting-icon {
  animation: spin 1.2s linear infinite;
}
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.restarting-text {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.restarting-subtext {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.restarting-countdown {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.restarting-content :deep(.el-progress) {
  width: 100%;
}
</style>
