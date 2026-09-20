<template>
  <el-card class="configured-networks-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <span>{{ t.provision.configuredNetworks.title }}</span>
        <!-- D3: loading is a spinner on this control. Nothing in the body is
             swapped for a skeleton or a placeholder while a refresh is in flight. -->
        <el-button
          type="primary"
          :icon="Refresh"
          size="small"
          :loading="loading"
          @click="loadConfiguredNetworks"
        >
          {{ t.common.refresh }}
        </el-button>
      </div>
    </template>

    <!-- I2: the failure region is rendered on `loadError` alone. No part of its
         condition mentions `networks` or `hasLoaded`, so a successful earlier
         load cannot starve it -- the operator sees the failure while the stale
         list is still on screen. -->
    <el-alert
      v-if="loadError"
      type="error"
      :title="t.provision.configuredNetworks.loadError"
      :description="loadError"
      show-icon
      :closable="false"
      class="load-error"
    />

    <!-- I1: `networks` is written only on a successful response, so a refresh
         can replace this list with a newer one but never blank it. Telling an
         operator that a gateway stores nothing, when the request merely failed,
         invites them to re-enter networks that are already there. -->
    <el-table
      v-if="networks.length > 0"
      :data="networks"
      :row-class-name="rowClassName"
      stripe
      size="small"
      style="width: 100%"
    >
      <el-table-column :label="t.provision.configuredNetworks.ssid" min-width="200">
        <template #default="{ row }">
          <span class="ssid">{{ row.ssid }}</span>
          <!-- AC2: a configured rescue SSID is marked, so it is not mistaken
               for a site network. -->
          <el-tag
            v-if="row.is_factory_default"
            type="warning"
            size="small"
            effect="plain"
            class="rescue-tag"
          >
            {{ t.provision.configuredNetworks.factoryDefault }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column :label="t.provision.configuredNetworks.priority" width="120">
        <template #default="{ row }">{{ priorityLabel(row) }}</template>
      </el-table-column>

      <el-table-column :label="t.provision.configuredNetworks.enabled" width="120">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small" effect="plain">
            {{
              row.enabled
                ? t.provision.configuredNetworks.enabledYes
                : t.provision.configuredNetworks.enabledNo
            }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column :label="t.provision.configuredNetworks.current" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.current" type="success" size="small">
            {{ t.provision.configuredNetworks.currentYes }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>

    <!-- The empty state distinguishes "the gateway stores nothing" from "the
         list could not be read", so a first load that fails (AC6) never reads
         as an empty gateway. -->
    <el-empty v-else-if="hasLoaded || loadError" :description="emptyDescription" :image-size="80" />
  </el-card>
</template>

<script setup lang="ts">
/**
 * Read-only list of the Wi-Fi networks wpa_supplicant currently has stored on
 * the gateway.
 *
 * D1: this panel holds its own state and calls the Wi-Fi API client directly
 * rather than going through the Wi-Fi store. That store is adapter-scoped --
 * its actions early-return without a selected interface and switching adapters
 * deliberately blanks its collections -- while the provisioning screen never
 * selects an interface and configured networks are a property of the gateway,
 * not of an adapter.
 *
 * I3: every field shown here comes from GET /wifi/networks. Nothing calls
 * scan, status or interfaces to derive anything, `current` included.
 *
 * I5: `psk_state` and `psk_store_available` are on the wire and in the types,
 * and neither is rendered or logged. Nothing here prints the response whole,
 * so a passphrase-related field added later cannot ride along into the DOM or
 * the console.
 */
import { computed, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { useI18n } from '@/composables/useI18n'
import { wifiApi, type WiFiConfiguredNetwork } from '@/services/wifi'

const { t } = useI18n()

/**
 * The last snapshot that loaded successfully. I4: these rows are replaced
 * wholesale by each response and nothing is keyed on `network_id`, which is a
 * position in one snapshot -- wpa_supplicant leaves holes in its table on
 * delete and compacts them on restart, so the same network comes back numbered
 * differently.
 */
const networks = ref<WiFiConfiguredNetwork[]>([])
/** True once a response has been applied, which is what tells an empty list apart from a panel that has never loaded. */
const hasLoaded = ref(false)
const loading = ref(false)
const loadError = ref<string | null>(null)

/** Same shape the Wi-Fi store uses for its own errors; that helper is not exported. */
const errorMessage = (e: unknown): string => {
  const err = e as { response?: { data?: { detail?: string } }; message?: string }
  return err?.response?.data?.detail || err?.message || String(e)
}

const emptyDescription = computed(() =>
  hasLoaded.value
    ? t.value.provision.configuredNetworks.empty
    : t.value.provision.configuredNetworks.unavailable,
)

/** AC3: a priority that could not be read is stated as unknown, never as 0, a dash or a blank. */
const priorityLabel = (row: WiFiConfiguredNetwork): string =>
  row.priority === null || row.priority === undefined
    ? t.value.provision.configuredNetworks.priorityUnknown
    : String(row.priority)

const rowClassName = ({ row }: { row: WiFiConfiguredNetwork }): string =>
  row.is_factory_default ? 'factory-default-row' : ''

const loadConfiguredNetworks = async () => {
  loading.value = true
  // Cleared on the way in, so a refresh that succeeds drops the previous
  // failure. The catch below is the only other writer.
  loadError.value = null

  try {
    const res = await wifiApi.listConfiguredNetworks()
    networks.value = res.networks ?? []
    hasLoaded.value = true
  } catch (e) {
    // I1: deliberately does not touch `networks` or `hasLoaded`. A failure
    // records itself and leaves whatever last loaded on screen.
    loadError.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadConfiguredNetworks()
})
</script>

<style scoped>
.configured-networks-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.load-error {
  margin-bottom: 12px;
}

.ssid {
  font-weight: 500;
}

.rescue-tag {
  margin-left: 8px;
}

/* AC2: the rescue entry is set apart from the site networks by more than its tag. */
.configured-networks-card :deep(.factory-default-row) {
  background-color: var(--el-color-warning-light-9);
}
</style>
