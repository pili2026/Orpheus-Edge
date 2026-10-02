<template>
  <el-card class="card wifi-status-card" shadow="never">
    <template #header>
      <div class="card-header">
        <span>{{ s.title }}</span>
        <el-tag class="wifi-status-badge" :type="badgeType" effect="plain" size="small">
          {{ s.badge[status.verdict] }}
        </el-tag>
      </div>
    </template>

    <div class="wifi-status-summary">{{ summary }}</div>

    <ul class="wifi-status-layers">
      <li
        v-for="row in layerRows"
        :key="row.id"
        class="wifi-status-layer"
        :class="`is-${row.state}`"
        :data-layer="row.id"
        :data-state="row.state"
      >
        <el-icon
          class="wifi-status-layer-icon"
          role="img"
          :aria-label="s.layerState[row.state]"
          :title="s.layerState[row.state]"
        >
          <component :is="STATE_ICONS[row.state]" />
        </el-icon>
        <span class="wifi-status-layer-name">{{ s.layers[row.id] }}</span>
        <span v-if="row.detail" class="wifi-status-layer-detail">{{ row.detail }}</span>
      </li>
    </ul>

    <div v-if="nextStep" class="wifi-status-next">{{ nextStep }}</div>
    <div v-if="scanHint" class="wifi-status-scan-hint">{{ scanHint }}</div>

    <el-descriptions
      v-if="details.length"
      class="wifi-status-details"
      :column="2"
      border
      size="small"
    >
      <el-descriptions-item v-for="d in details" :key="d.label" :label="d.label">
        {{ d.value }}
      </el-descriptions-item>
    </el-descriptions>
  </el-card>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  CircleCheckFilled,
  CircleCloseFilled,
  QuestionFilled,
  RemoveFilled,
} from '@element-plus/icons-vue'
import { useI18n } from '@/composables/useI18n'
import { format } from '@/components/wifi/deleteNetworkConfirmation'
import type { LayerState, WifiStatus } from '@/utils/wifi_status'

/** Presentational: everything shown comes from `status`, worded in the active locale. */
const props = defineProps<{ status: WifiStatus }>()

const { t } = useI18n()
const s = computed(() => t.value.debugNetwork.wifiStatus)

const STATE_ICONS: Record<LayerState, Component> = {
  pass: CircleCheckFilled,
  fail: CircleCloseFilled,
  unknown: QuestionFilled,
  skipped: RemoveFilled,
}

const badgeType = computed(() => {
  switch (props.status.verdict) {
    case 'ok':
      return 'success' as const
    case 'unknown':
      return 'info' as const
    default:
      return 'danger' as const
  }
})

const summary = computed(() =>
  format(s.value.summary[props.status.summary.key], props.status.summary.values),
)

const layerRows = computed(() =>
  (['l1', 'l2', 'l3'] as const).map((id) => {
    const layer = props.status.layers[id]
    return {
      id,
      state: layer.state,
      detail: layer.detail
        ? format(s.value.layerDetail[layer.detail.key], layer.detail.values)
        : '',
    }
  }),
)

const nextStep = computed(() => {
  const n = props.status.nextStep
  return n ? format(s.value.nextStep[n.key], n.values) : ''
})

const scanHint = computed(() => {
  const h = props.status.scanHint
  return h ? format(s.value.scanHint[h.key], h.values) : ''
})

const details = computed(() =>
  props.status.details.map((d) => ({
    label: s.value.detailLabel[d.label],
    value: 'key' in d ? format(s.value.detailValue[d.key], d.values) : d.value,
  })),
)
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.wifi-status-summary {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.wifi-status-layers {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
}

.wifi-status-layer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}

.wifi-status-layer-icon {
  font-size: 16px;
}
.wifi-status-layer.is-pass .wifi-status-layer-icon {
  color: var(--el-color-success);
}
.wifi-status-layer.is-fail .wifi-status-layer-icon {
  color: var(--el-color-danger);
}
.wifi-status-layer.is-unknown .wifi-status-layer-icon,
.wifi-status-layer.is-skipped .wifi-status-layer-icon {
  color: var(--el-color-info);
}
.wifi-status-layer.is-skipped .wifi-status-layer-name {
  color: #9ca3af;
}

.wifi-status-layer-detail {
  color: #6b7280;
  font-size: 12px;
}

.wifi-status-next,
.wifi-status-scan-hint {
  color: #374151;
  font-size: 13px;
  line-height: 1.4;
  margin-bottom: 12px;
}

.wifi-status-scan-hint {
  color: #6b7280;
  font-size: 12px;
}
</style>
