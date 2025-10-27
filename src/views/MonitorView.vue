<template>
  <div class="monitor-view">
    <h1>🔌 Talos 設備監控系統</h1>

    <el-row :gutter="20">
      <el-col :xs="24" :lg="12">
        <ConnectionControl />
      </el-col>

      <el-col :xs="24" :lg="12">
        <DataDisplay />
      </el-col>
    </el-row>

    <el-row>
      <el-col :span="24">
        <DeviceControl />
      </el-col>
    </el-row>

    <el-row>
      <el-col :span="24">
        <LogViewer />
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import ConnectionControl from '@/components/ConnectionControl.vue'
import DataDisplay from '@/components/DataDisplay.vue'
import DeviceControl from '@/components/DeviceControl.vue'
import LogViewer from '@/components/LogViewer.vue'
</script>

<style scoped>
.monitor-view {
  padding: 20px;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

h1 {
  color: white;
  text-align: center;
  margin-bottom: 30px;
}

:deep(.el-row) {
  margin-bottom: 20px;
}
</style>
