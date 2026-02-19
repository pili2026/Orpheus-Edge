<template>
  <div class="config-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <el-icon><Operation /></el-icon>
          <span>{{ t.nav.controlConfig }}</span>
        </div>
      </template>

      <el-alert
        :title="t.comingSoon.control.title"
        type="info"
        :description="t.comingSoon.control.description"
        :closable="false"
        show-icon
      />

      <div class="placeholder-content">
        <h3>{{ t.comingSoon.plannedFeatures }}</h3>
        <ul>
          <li v-for="(feature, index) in t.comingSoon.control.features" :key="index">
            {{ feature }}
          </li>
        </ul>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { Operation } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { useUIStore } from '@/stores/ui'

const { t } = storeToRefs(useUIStore())
</script>

<style scoped>
.config-page {
  padding: 24px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.placeholder-content {
  margin-top: 24px;
}

.placeholder-content h3 {
  margin-bottom: 12px;
  color: #303133;
}

.placeholder-content ul {
  margin: 0;
  padding-left: 24px;
}

.placeholder-content li {
  margin-bottom: 8px;
  color: #606266;
}
</style>
