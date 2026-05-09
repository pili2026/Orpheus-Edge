<template>
  <div class="mqtt-config-page">
    <div class="header-row">
      <div class="header-left">
        <el-button @click="goBack" data-testid="back-btn">{{ t('config.mqtt.back') }}</el-button>
        <h2>{{ t('config.mqtt.title') }}</h2>
      </div>
      <div>
        <el-button @click="refreshAll" :loading="loadingConfig || loadingStatus">{{ t('config.mqtt.refresh') }}</el-button>
        <el-button type="primary" @click="onSave" :loading="saving" :disabled="!canSave" data-testid="save-btn">{{ t('config.mqtt.save') }}</el-button>
      </div>
    </div>

    <el-alert
      v-if="configLoadError"
      type="error"
      show-icon
      :closable="false"
      class="mb-16"
      :title="t('config.mqtt.loadFailed')"
    />

    <el-alert v-if="restartRequired" type="warning" show-icon :closable="false" class="mb-16">
      <template #title>{{ t('config.mqtt.restartRequired') }}</template>
      <template #default>
        <el-button type="warning" size="small" :loading="restarting" @click="confirmRestart">{{ t('config.mqtt.restartTalos') }}</el-button>
      </template>
    </el-alert>

    <el-card v-loading="loadingConfig">
      <el-form v-if="draft" :model="draft" label-width="220px">
        <el-form-item :label="t('config.mqtt.mqttEnabled')"><el-switch v-model="draft.enabled" /></el-form-item>
        <el-form-item :label="t('config.mqtt.brokerHost')"><el-input v-model="draft.broker.host" /></el-form-item>
        <el-form-item :label="t('config.mqtt.brokerPort')"><el-input-number v-model="draft.broker.port" :min="1" :max="65535" /></el-form-item>
        <el-form-item :label="t('config.mqtt.tlsEnabled')"><el-switch v-model="draft.broker.tls.enabled" /></el-form-item>
        <el-form-item :label="t('config.mqtt.caCertPath')"><el-input v-model="draft.broker.tls.ca_cert_path" /></el-form-item>
        <el-form-item :label="t('config.mqtt.tlsInsecureSkipVerify')"><el-switch v-model="draft.broker.tls.insecure_skip_verify" /></el-form-item>
        <el-form-item :label="t('config.mqtt.username')"><el-input :model-value="config?.credentials?.username || ''" disabled /></el-form-item>
        <el-form-item :label="t('config.mqtt.passwordConfigured')">
          <el-tag :type="config?.credentials?.password_configured ? 'success' : 'warning'">{{ config?.credentials?.password_configured ? t('config.mqtt.configured') : t('config.mqtt.missing') }}</el-tag>
        </el-form-item>
        <el-form-item :label="t('config.mqtt.clientId')"><el-input v-model="draft.client.client_id" /></el-form-item>
        <el-form-item :label="t('config.mqtt.cleanSession')"><el-switch v-model="draft.client.clean_session" /></el-form-item>
        <el-form-item :label="t('config.mqtt.keepaliveSeconds')"><el-input-number v-model="draft.client.keepalive_sec" :min="1" /></el-form-item>
        <el-form-item :label="t('config.mqtt.baseTopicPrefix')"><el-input v-model="draft.topics.base_prefix" /></el-form-item>
        <el-form-item :label="t('config.mqtt.eventEnabled')"><el-switch v-model="draft.event.enabled" /></el-form-item>
        <el-form-item :label="t('config.mqtt.telemetryEnabled')"><el-switch v-model="draft.telemetry.enabled" /></el-form-item>
        <el-form-item>
          <el-alert type="info" :closable="false" :title="t('config.mqtt.telemetryNotice')" />
        </el-form-item>
      </el-form>
      <el-empty v-else :description="t('config.mqtt.loadToEdit')" />
    </el-card>

    <el-card class="mt-16" v-loading="loadingStatus">
      <template #header><strong>Runtime Status</strong></template>
      <div class="status-grid">
        <div>
          <strong>Registered:</strong>
          <el-tag :type="statusTagType(status?.registered, 'warning')">
            {{ statusLabel(status?.registered) }}
          </el-tag>
        </div>
        <div>
          <strong>Connected:</strong>
          <el-tag :type="statusTagType(status?.connected, 'danger')">
            {{ statusLabel(status?.connected) }}
          </el-tag>
        </div>
        <div>
          <strong>Service Registered:</strong>
          <el-tag :type="statusTagType(status?.service_registered, 'warning')">
            {{ statusLabel(status?.service_registered, 'N/A') }}
          </el-tag>
        </div>
        <div><strong>Last Connect:</strong> {{ status?.last_connect_time || '-' }}</div>
        <div><strong>Last Disconnect:</strong> {{ status?.last_disconnect_time || '-' }}</div>
        <div><strong>Last Status Publish:</strong> {{ status?.last_status_publish_time || '-' }}</div>
        <div><strong>Last Status Publish Error:</strong> {{ status?.last_status_publish_error || '-' }}</div>
        <div><strong>Last Connection Error:</strong> {{ status?.last_connection_error || '-' }}</div>
      </div>
      <el-alert type="warning" :closable="false" title="Credentials are managed by Gateway registration flow." class="mt-16" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from '@/composables/useI18n'
import { useMqttStore } from '@/stores/mqtt'
import type { MqttConfig, MqttConfigPatch } from '@/services/mqtt'

const mqttStore = useMqttStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { config, status, loadingConfig, loadingStatus, saving, restarting, restartRequired, configLoaded, configLoadError } = storeToRefs(mqttStore)

type MqttConfigDraft = Required<MqttConfigPatch>

const normalizeDraft = (source: MqttConfig): MqttConfigDraft => ({
  enabled: source.enabled,
  broker: {
    host: source.broker.host,
    port: source.broker.port,
    tls: {
      enabled: source.broker.tls.enabled,
      ca_cert_path: source.broker.tls.ca_cert_path,
      insecure_skip_verify: source.broker.tls.insecure_skip_verify,
    },
  },
  client: {
    client_id: source.client.client_id,
    clean_session: source.client.clean_session,
    keepalive_sec: source.client.keepalive_sec,
  },
  reconnect: source.reconnect,
  qos: source.qos,
  topics: {
    base_prefix: source.topics.base_prefix,
  },
  outbox: source.outbox,
  status: source.status,
  event: {
    enabled: source.event.enabled,
  },
  telemetry: {
    enabled: source.telemetry.enabled,
  },
})

const draft = ref<MqttConfigDraft | null>(null)
const initialSnapshot = ref('')

const snapshot = (obj: unknown) => JSON.stringify(obj)

const statusLabel = (value: boolean | null | undefined, unknownLabel = 'Unknown') => {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return unknownLabel
}

const statusTagType = (value: boolean | null | undefined, falseType: 'warning' | 'danger') => {
  if (value === true) return 'success'
  if (value === false) return falseType
  return 'info'
}


const initDraft = () => {
  if (!config.value) {
    draft.value = null
    initialSnapshot.value = ''
    return
  }
  draft.value = JSON.parse(JSON.stringify(normalizeDraft(config.value))) as MqttConfigDraft
  initialSnapshot.value = snapshot(draft.value)
}

const isDirty = computed(() => !!draft.value && snapshot(draft.value) !== initialSnapshot.value)
const canSave = computed(
  () =>
    configLoaded.value &&
    !loadingConfig.value &&
    !saving.value &&
    !configLoadError.value &&
    !!draft.value &&
    isDirty.value,
)

const refreshAll = async () => {
  try {
    await mqttStore.loadConfig()
    initDraft()
  } catch {
    draft.value = null
  }
  try {
    await mqttStore.loadStatus()
  } catch {
    // status errors are shown by store; config editing still allowed when config loaded
  }
}

const goBack = async () => {
  if (route.query.from === 'provision') {
    await router.push('/provision')
    return
  }
  await router.push('/config')
}

const onSave = async () => {
  if (!canSave.value || !draft.value) return
  try {
    await mqttStore.saveConfig(draft.value)
    initDraft()
  } catch {
    return
  }
}

const confirmRestart = async () => {
  try {
    await ElMessageBox.confirm('Restart Talos now to apply MQTT changes?', 'Confirm Restart', {
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await mqttStore.restartService()
  } catch {
    return
  }

  try {
    await mqttStore.loadStatus()
  } catch {
    return
  }
}

onMounted(refreshAll)
</script>

<style scoped>
.mqtt-config-page { padding: 20px; }
.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.header-left { display: flex; gap: 12px; align-items: center; }
.status-grid { display: grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap: 10px; }
.mt-16 { margin-top: 16px; }
.mb-16 { margin-bottom: 16px; }
</style>
