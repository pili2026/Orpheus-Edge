<template>
  <button
    type="button"
    class="wifi-summary-row"
    :class="`is-${badgeType}`"
    :aria-expanded="expanded"
    @click="emit('toggle')"
  >
    <el-icon class="wifi-summary-row-icon" aria-hidden="true">
      <component :is="VERDICT_ICONS[badgeType]" />
    </el-icon>
    <span class="wifi-summary-row-main">
      <span class="wifi-summary-row-label">{{ t.debugNetwork.currentConnection }}</span>
      <span class="wifi-summary-row-line">
        <template v-if="ssid">
          <span class="wifi-summary-row-ssid">{{ ssid }}</span>
          <span v-if="ip" class="wifi-summary-row-ip">{{ ip }}</span>
        </template>
        <span v-else class="wifi-summary-row-summary">{{ summary }}</span>
      </span>
    </span>
    <el-tag class="wifi-summary-row-badge" :type="badgeType" effect="plain" size="small">
      {{ s.badge[status.verdict] }}
    </el-tag>
    <el-icon class="wifi-summary-row-chevron" aria-hidden="true">
      <component :is="expanded ? ArrowUp : ArrowDown" />
    </el-icon>
  </button>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  CircleCheckFilled,
  CircleCloseFilled,
  QuestionFilled,
} from '@element-plus/icons-vue'
import { useI18n } from '@/composables/useI18n'
import { format } from '@/components/wifi/deleteNetworkConfirmation'
import { wifiBadgeType } from '@/components/wifi/wifiStatusBadge'
import type { WifiStatus } from '@/utils/wifi_status'

/**
 * One line for the page's Wi-Fi verdict, from the same `status` object the
 * status card is given, never a derivation of its own. Tapping it asks the page
 * to show that card.
 */
const props = defineProps<{ status: WifiStatus; expanded: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

const { t } = useI18n()
const s = computed(() => t.value.debugNetwork.wifiStatus)

const VERDICT_ICONS: Record<ReturnType<typeof wifiBadgeType>, Component> = {
  success: CircleCheckFilled,
  danger: CircleCloseFilled,
  info: QuestionFilled,
}

const badgeType = computed(() => wifiBadgeType(props.status.verdict))

// The verdict's own values: the SSID for `ok` and `l3`, the IP for `ok` only.
const ssid = computed(() => String(props.status.summary.values.ssid ?? ''))
const ip = computed(() => String(props.status.summary.values.ip ?? ''))

const summary = computed(() =>
  format(s.value.summary[props.status.summary.key], props.status.summary.values),
)
</script>

<style scoped>
.wifi-summary-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  margin: 0 0 16px;
  padding: 10px 14px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.wifi-summary-row-icon {
  flex: none;
  font-size: 20px;
}
.wifi-summary-row.is-success .wifi-summary-row-icon {
  color: var(--el-color-success);
}
.wifi-summary-row.is-danger .wifi-summary-row-icon {
  color: var(--el-color-danger);
}
.wifi-summary-row.is-info .wifi-summary-row-icon {
  color: var(--el-color-info);
}

.wifi-summary-row-main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.wifi-summary-row-label {
  color: #6b7280;
  font-size: 12px;
}

.wifi-summary-row-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  font-size: 14px;
}

/* One line: the full SSID, IP and summary are in the card this row expands. */
.wifi-summary-row-ssid,
.wifi-summary-row-ip,
.wifi-summary-row-summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wifi-summary-row-ssid {
  font-weight: 600;
}

.wifi-summary-row-ip {
  color: #6b7280;
  font-size: 13px;
}

.wifi-summary-row-badge,
.wifi-summary-row-chevron {
  flex: none;
}
</style>
