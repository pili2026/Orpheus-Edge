<template>
  <ul v-if="networks.length" class="wifi-network-list">
    <li
      v-for="(n, i) in networks"
      :key="`${i}:${n.ssid}`"
      class="wifi-network-item"
      :class="{ 'is-invalid': !n.is_valid, 'is-in-use': n.in_use }"
    >
      <!-- Only a valid network can be selected, as on the sm+ table; an invalid one
           is not a control, and says why on the row itself rather than on hover. -->
      <component
        :is="n.is_valid ? 'button' : 'div'"
        class="wifi-network-row"
        v-bind="n.is_valid ? { type: 'button' } : { 'aria-disabled': 'true' }"
        @click="n.is_valid && emit('select', n)"
      >
        <span class="wifi-network-main">
          <span class="wifi-network-ssid">{{ n.ssid }}</span>
          <span v-if="!n.is_valid" class="wifi-network-invalid-reason">
            {{ n.invalid_reason || t.debugNetwork.networkInvalid }}
          </span>
        </span>
        <el-tag
          v-if="n.in_use"
          class="wifi-network-in-use"
          type="success"
          size="small"
          effect="plain"
        >
          {{ t.debugNetwork.networkInUse }}
        </el-tag>
        <el-tag
          v-if="!n.is_valid"
          class="wifi-network-invalid"
          type="danger"
          size="small"
          effect="plain"
        >
          {{ t.debugNetwork.networkInvalid }}
        </el-tag>
        <el-icon
          v-if="secured(n.security)"
          class="wifi-network-lock"
          role="img"
          :aria-label="t.debugNetwork.networkSecured"
        >
          <Lock />
        </el-icon>
        <span class="wifi-network-signal">{{ n.signal_strength }}%</span>
      </component>
    </li>
  </ul>
  <el-empty v-else :description="t.wifi.noNetworks" :image-size="60" />
</template>

<script setup lang="ts">
import { Lock } from '@element-plus/icons-vue'
import { useI18n } from '@/composables/useI18n'
import type { SecurityType, WiFiNetwork } from '@/services/wifi'

/** The scan list as rows to tap, for a phone; the page decides what a tap does. */
defineProps<{
  networks: WiFiNetwork[]
  /** The page's own rule for whether a network needs a password. */
  secured: (security: SecurityType) => boolean
}>()
const emit = defineEmits<{ select: [network: WiFiNetwork] }>()

const { t } = useI18n()
</script>

<style scoped>
.wifi-network-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.wifi-network-item + .wifi-network-item {
  border-top: 1px solid var(--el-border-color-lighter);
}

.wifi-network-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 8px 0;
  border: 0;
  background: none;
  color: var(--el-text-color-primary);
  font: inherit;
  text-align: left;
}
button.wifi-network-row {
  cursor: pointer;
}

.wifi-network-main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.wifi-network-ssid {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.wifi-network-item.is-in-use .wifi-network-ssid {
  font-weight: 600;
}
.wifi-network-item.is-invalid .wifi-network-ssid {
  color: #9ca3af;
}

.wifi-network-invalid-reason {
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.wifi-network-in-use,
.wifi-network-invalid,
.wifi-network-lock {
  flex: none;
}

.wifi-network-lock {
  color: #6b7280;
}

.wifi-network-signal {
  flex: none;
  min-width: 3em;
  color: #6b7280;
  font-size: 12px;
  text-align: right;
}
</style>
