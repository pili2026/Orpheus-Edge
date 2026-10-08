<template>
  <el-form :label-width="labelWidth" :label-position="labelPosition" size="default" @submit.prevent>
    <el-form-item label="SSID">
      <el-input :model-value="selectedNetwork.ssid" readonly />
    </el-form-item>

    <el-form-item label="Security">
      <el-input :model-value="String(selectedNetwork.security)" readonly />
    </el-form-item>

    <el-form-item v-if="requiresPsk" :label="t.wifi.password || 'Password'">
      <el-input
        v-model="connectForm.psk"
        type="password"
        show-password
        clearable
        :placeholder="t.wifi.passwordPlaceholder || 'Enter password'"
      />
    </el-form-item>

    <el-form-item :label="t.debugNetwork.saveConfig || 'Save config'">
      <el-switch v-model="connectForm.save_config" />
    </el-form-item>

    <el-collapse v-model="advancedOpen" class="mb-12">
      <el-collapse-item :title="t.debugNetwork.advanced || 'Advanced'" name="adv">
        <el-form-item label="Priority (0-100)">
          <el-input-number v-model="connectForm.priority" :min="0" :max="100" :step="1" />
        </el-form-item>

        <el-form-item label="Lock BSSID">
          <el-switch v-model="connectForm.lock_bssid" />
          <div class="muted ml-8" v-if="connectForm.lock_bssid">
            {{ selectedNetwork.bssid ?? 'BSSID not available (group_by_ssid may hide it)' }}
          </div>
        </el-form-item>
      </el-collapse-item>
    </el-collapse>

    <el-form-item>
      <el-button
        type="primary"
        :loading="loading"
        :disabled="connectDisabled"
        @click="emit('connect')"
      >
        {{ t.wifi.connect || 'Connect' }}
      </el-button>

      <el-button :disabled="loading" @click="emit('reset')">
        {{ t.common.reset || 'Reset' }}
      </el-button>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { useI18n } from '@/composables/useI18n'
import type { WiFiNetwork } from '@/services/wifi'

/**
 * The connect form, presentational: the page owns its state, its checks and the
 * confirmation, and renders this form in exactly one place for the current tier.
 */
withDefaults(
  defineProps<{
    selectedNetwork: WiFiNetwork
    requiresPsk: boolean
    loading: boolean
    connectDisabled: boolean
    labelWidth?: string
    labelPosition?: 'left' | 'right' | 'top'
  }>(),
  { labelWidth: '120px', labelPosition: 'right' },
)

const connectForm = defineModel<{
  psk: string
  save_config: boolean
  priority: number | undefined
  lock_bssid: boolean
}>('connectForm', { required: true })
const advancedOpen = defineModel<string[]>('advancedOpen', { required: true })

const emit = defineEmits<{ connect: []; reset: [] }>()

const { t } = useI18n()
</script>

<style scoped>
.muted {
  color: #6b7280;
  font-size: 12px;
}

.mb-12 {
  margin-bottom: 12px;
}
.ml-8 {
  margin-left: 8px;
}
</style>
