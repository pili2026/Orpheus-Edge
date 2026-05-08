<template>
  <div class="mqtt-config-page">
    <div class="header-row">
      <h2>MQTT Configuration</h2>
      <div>
        <el-button @click="refreshAll" :loading="loadingConfig || loadingStatus">Refresh</el-button>
        <el-button type="primary" @click="onSave" :loading="saving">Save</el-button>
      </div>
    </div>

    <el-alert v-if="restartRequired" type="warning" show-icon :closable="false" class="mb-16">
      <template #title>Restart required to apply MQTT config changes.</template>
      <template #default>
        <el-button type="warning" size="small" :loading="restarting" @click="confirmRestart">Restart Talos</el-button>
      </template>
    </el-alert>

    <el-card v-loading="loadingConfig">
      <el-form :model="form" label-width="220px">
        <el-form-item label="MQTT Enabled"><el-switch v-model="form.enabled" /></el-form-item>
        <el-form-item label="Broker Host"><el-input v-model="form.broker.host" /></el-form-item>
        <el-form-item label="Broker Port"><el-input-number v-model="form.broker.port" :min="1" :max="65535" /></el-form-item>
        <el-form-item label="TLS Enabled"><el-switch v-model="form.broker.tls.enabled" /></el-form-item>
        <el-form-item label="CA Cert Path"><el-input v-model="form.broker.tls.ca_cert_path" /></el-form-item>
        <el-form-item label="TLS Insecure Skip Verify"><el-switch v-model="form.broker.tls.insecure_skip_verify" /></el-form-item>
        <el-form-item label="Username"><el-input :model-value="config?.credentials?.username || ''" disabled /></el-form-item>
        <el-form-item label="Password Configured">
          <el-tag :type="config?.credentials?.password_configured ? 'success' : 'warning'">
            {{ config?.credentials?.password_configured ? 'Configured' : 'Missing' }}
          </el-tag>
        </el-form-item>
        <el-form-item label="Client ID"><el-input v-model="form.client.client_id" /></el-form-item>
        <el-form-item label="Clean Session"><el-switch v-model="form.client.clean_session" /></el-form-item>
        <el-form-item label="Keepalive Seconds"><el-input-number v-model="form.client.keepalive_sec" :min="1" /></el-form-item>
        <el-form-item label="Base Topic Prefix"><el-input v-model="form.topics.base_prefix" /></el-form-item>
        <el-form-item label="Event Enabled"><el-switch v-model="form.event.enabled" /></el-form-item>
        <el-form-item label="Telemetry Enabled"><el-switch v-model="form.telemetry.enabled" /></el-form-item>
        <el-form-item>
          <el-alert type="info" :closable="false" title="Telemetry is configuration only; publisher is not implemented yet." />
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="mt-16" v-loading="loadingStatus">
      <template #header><strong>Runtime Status</strong></template>
      <div class="status-grid">
        <div><strong>Registered:</strong> <el-tag :type="status?.registered ? 'success' : 'warning'">{{ status?.registered ? 'true' : 'false' }}</el-tag></div>
        <div><strong>Connected:</strong> <el-tag :type="status?.connected ? 'success' : 'danger'">{{ status?.connected ? 'true' : 'false' }}</el-tag></div>
        <div><strong>Service Registered:</strong> {{ status?.service_registered ?? 'n/a' }}</div>
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
import { computed, onMounted, reactive } from 'vue'
import { ElMessageBox } from 'element-plus'
import { storeToRefs } from 'pinia'
import { useMqttStore } from '@/stores/mqtt'

const mqttStore = useMqttStore()
const { config, status, loadingConfig, loadingStatus, saving, restarting, restartRequired } = storeToRefs(mqttStore)

const form = reactive({
  enabled: false,
  broker: { host: '', port: 1883, tls: { enabled: false, ca_cert_path: '', insecure_skip_verify: false } },
  client: { client_id: '', clean_session: true, keepalive_sec: 60 },
  reconnect: {},
  qos: {},
  topics: { base_prefix: '' },
  outbox: {},
  status: {},
  event: { enabled: false },
  telemetry: { enabled: false },
})

const applyConfig = () => {
  if (!config.value) return
  Object.assign(form, JSON.parse(JSON.stringify({
    enabled: config.value.enabled,
    broker: config.value.broker,
    client: config.value.client,
    reconnect: config.value.reconnect,
    qos: config.value.qos,
    topics: config.value.topics,
    outbox: config.value.outbox,
    status: config.value.status,
    event: config.value.event,
    telemetry: config.value.telemetry,
  })))
}

const refreshAll = async () => {
  await Promise.all([mqttStore.loadConfig(), mqttStore.loadStatus()])
  applyConfig()
}

const onSave = async () => {
  await mqttStore.saveConfig(form)
}

const confirmRestart = async () => {
  await ElMessageBox.confirm('Restart Talos now to apply MQTT changes?', 'Confirm Restart', { type: 'warning' })
  await mqttStore.restartService()
  await mqttStore.loadStatus()
}

onMounted(refreshAll)
</script>

<style scoped>
.mqtt-config-page { padding: 20px; }
.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.status-grid { display: grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap: 10px; }
.mt-16 { margin-top: 16px; }
.mb-16 { margin-bottom: 16px; }
</style>
