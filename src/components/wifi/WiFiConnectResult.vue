<template>
  <el-card class="card" shadow="never">
    <template #header>
      <div class="card-header">
        <span>{{ t.debugNetwork.connectResult || 'Connect Result' }}</span>
        <el-tag
          v-if="connectResultTag"
          class="connect-result-badge"
          :type="connectResultTag.type"
          effect="plain"
          size="small"
        >
          {{ connectResultTag.text }}
        </el-tag>
      </div>
    </template>

    <el-empty
      v-if="!result"
      :description="t.debugNetwork.noConnectResult || 'No connect attempt yet'"
    />

    <template v-else>
      <el-alert
        v-if="connectResultReason"
        :title="connectResultReason.title"
        :type="connectResultReason.type"
        show-icon
        :closable="false"
        class="mb-12 connect-result-reason"
      />

      <el-descriptions :column="columns" border size="small">
        <el-descriptions-item label="interface">{{ result.interface ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="ssid">{{ result.ssid }}</el-descriptions-item>

        <el-descriptions-item label="saved">{{ result.saved }}</el-descriptions-item>
        <el-descriptions-item label="save_error">{{
          result.save_error ?? '-'
        }}</el-descriptions-item>

        <el-descriptions-item label="applied_network_id">{{
          result.applied_network_id ?? '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="applied_priority">{{
          result.applied_priority ?? '-'
        }}</el-descriptions-item>

        <el-descriptions-item label="bssid_locked">{{ result.bssid_locked }}</el-descriptions-item>
        <el-descriptions-item label="applied_bssid">{{
          result.applied_bssid ?? '-'
        }}</el-descriptions-item>

        <el-descriptions-item label="poll_interval_ms">{{
          result.recommended_poll_interval_ms
        }}</el-descriptions-item>
        <el-descriptions-item label="timeout_ms">{{
          result.recommended_timeout_ms
        }}</el-descriptions-item>
      </el-descriptions>

      <el-alert
        v-if="result.warnings?.length"
        :title="t.common.warning || 'Warnings'"
        type="warning"
        show-icon
        :closable="false"
        class="mt-12"
      >
        <template #default>
          <ul class="steps">
            <li v-for="(w, idx) in result.warnings" :key="idx">
              {{ warningText(w) }}
            </li>
          </ul>
        </template>
      </el-alert>

      <el-alert
        v-if="pollMessage"
        :title="pollMessage"
        :type="pollAlertType"
        show-icon
        :closable="false"
        class="mt-12"
      />
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { useI18n } from '@/composables/useI18n'
import type { WiFiConnectResponse } from '@/services/wifi'

/**
 * The last connect's outcome, presentational: the page works out the badge, the
 * reason and the poll message, and renders this card in exactly one place.
 */
withDefaults(
  defineProps<{
    result: WiFiConnectResponse | null
    connectResultTag: { type: 'info' | 'success' | 'danger'; text: string } | null
    connectResultReason: { type: 'info' | 'success' | 'error'; title: string } | null
    warningText: (code: string) => string
    pollMessage: string
    pollAlertType: 'success' | 'warning' | 'info'
    columns?: 1 | 2
  }>(),
  { columns: 2 },
)

const { t } = useI18n()
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mb-12 {
  margin-bottom: 12px;
}
.mt-12 {
  margin-top: 12px;
}

.steps {
  margin: 8px 0 0 18px;
  padding: 0;
}
</style>
