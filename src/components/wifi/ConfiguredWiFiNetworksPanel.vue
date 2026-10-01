<template>
  <el-card class="configured-networks-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <span class="header-title">
          {{ t.wifi.configuredNetworks.title }}
          <!-- Which interface the rows below came from. Rendered only when the
               response carried one; no other source is consulted, so it cannot
               claim an interface the list did not come from. -->
          <el-tag v-if="interfaceName" class="interface-label" size="small" effect="plain">
            {{ t.wifi.configuredNetworks.interface }}: {{ interfaceName }}
          </el-tag>
        </span>
        <!-- Secondary styling, like the page toolbar's own refresh button,
             which passes no `type`. The page's one primary action is the
             connect form's; a second filled button competes with it.
             D3: loading is a spinner on this control. Nothing in the body is
             swapped for a skeleton or a placeholder while a refresh is in flight. -->
        <el-button :icon="Refresh" size="small" :loading="loading" @click="loadConfiguredNetworks">
          {{ t.common.refresh }}
        </el-button>
        <!-- Styled like refresh, and after it. The dialog saves a network
             without connecting; the list is reloaded on either of its events. -->
        <el-button :icon="Plus" size="small" class="add-network" @click="addDialogOpen = true">
          {{ t.wifi.addNetwork.open }}
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
      :title="t.wifi.configuredNetworks.loadError"
      :description="loadError"
      show-icon
      :closable="false"
      class="load-error"
    />

    <!-- The last delete's failure, separate from the load failure above and
         persistent until the next delete starts. It offers no retry: the list
         under it is the one to act on. -->
    <el-alert
      v-if="deleteOutcome"
      :type="deleteOutcome.type"
      :title="deleteOutcome.title"
      :description="deleteOutcome.detail ?? undefined"
      show-icon
      :closable="false"
      class="delete-outcome"
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
      <el-table-column :label="t.wifi.configuredNetworks.ssid" min-width="200">
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
            {{ t.wifi.configuredNetworks.factoryDefault }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column :label="t.wifi.configuredNetworks.priority" width="120">
        <template #default="{ row }">{{ priorityLabel(row) }}</template>
      </el-table-column>

      <el-table-column :label="t.wifi.configuredNetworks.enabled" width="120">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small" effect="plain">
            {{ row.enabled ? t.wifi.configuredNetworks.yes : t.wifi.configuredNetworks.no }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column :label="t.wifi.configuredNetworks.current" width="120">
        <template #default="{ row }">
          <el-tag :type="row.current ? 'success' : 'info'" size="small" effect="plain">
            {{ row.current ? t.wifi.configuredNetworks.yes : t.wifi.configuredNetworks.no }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column :label="t.wifi.configuredNetworks.actions" width="200">
        <template #default="{ row }">
          <!-- Talos refuses to delete a factory-default network, so none is offered. -->
          <span v-if="row.is_factory_default" class="delete-unavailable">
            {{ t.wifi.configuredNetworks.deleteUnavailable }}
          </span>
          <!-- Styled like the header controls. Every row's control is disabled
               while any delete is in flight. -->
          <el-button
            v-else
            :icon="Delete"
            size="small"
            class="delete-network"
            :disabled="deleting"
            @click="deleteRow(row)"
          >
            {{ t.common.delete }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- The empty state distinguishes "the gateway stores nothing" from "the
         list could not be read", so a first load that fails (AC6) never reads
         as an empty gateway. -->
    <el-empty v-else-if="hasLoaded || loadError" :description="emptyDescription" :image-size="80" />

    <!-- `hasLoaded` tells the dialog whether `networks` is a list it can check
         against, or only the empty start of one that never arrived. -->
    <AddWiFiNetworkDialog
      v-model="addDialogOpen"
      :existing-networks="networks"
      :existing-networks-loaded="hasLoaded"
      @saved="loadConfiguredNetworks"
      @reload="loadConfiguredNetworks"
    />
  </el-card>
</template>

<script setup lang="ts">
/**
 * List of the Wi-Fi networks wpa_supplicant currently has stored on the
 * gateway, each removable except a factory-default one.
 *
 * D1: this panel holds its own state and calls the Wi-Fi API client directly
 * rather than going through the Wi-Fi store, and that still holds now it sits
 * on the Wi-Fi page beside that store's interface selector. The store is
 * adapter-scoped -- its actions early-return without a selected interface and
 * switching adapters deliberately blanks its collections -- while configured
 * networks are a property of the gateway, not of an adapter. The panel does
 * not read the selector and takes the gateway's default interface.
 *
 * I3: The panel's requests carry no interface. Every endpoint it calls
 * resolves the gateway's default interface, and the panel reads neither the
 * page selector nor the Wi-Fi store. Every field shown here still comes from
 * GET /wifi/networks; the other endpoints are the save its dialog issues and
 * the per-row delete.
 * Nothing calls scan, status or interfaces to derive anything, `current`
 * included.
 *
 * I5: `psk_state` and `psk_store_available` are on the wire and in the types,
 * and neither is rendered or logged. Nothing here prints the response whole,
 * so a passphrase-related field added later cannot ride along into the DOM or
 * the console.
 *
 * I10 — Only the most recently started load writes to the panel. A superseded
 * response writes neither rows nor an error.
 */
import { computed, onMounted, ref } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus, Refresh } from '@element-plus/icons-vue'
import { useI18n } from '@/composables/useI18n'
import { wifiApi, type WiFiConfiguredNetwork } from '@/services/wifi'
import AddWiFiNetworkDialog from '@/components/wifi/AddWiFiNetworkDialog.vue'
import {
  buildDeleteConfirmation,
  displaySsid,
  format,
} from '@/components/wifi/deleteNetworkConfirmation'

const { t } = useI18n()

/**
 * The last snapshot that loaded successfully. I4: these rows are replaced
 * wholesale by each response and nothing is keyed on `network_id`, which is a
 * position in one snapshot -- wpa_supplicant leaves holes in its table on
 * delete and compacts them on restart, so the same network comes back numbered
 * differently.
 */
const networks = ref<WiFiConfiguredNetwork[]>([])
/**
 * The interface the rows above came from, straight off the same response.
 * It describes the list on screen, so it is written on the success path beside
 * `networks` and nowhere else: a failed refresh keeps the rows (I1) and must
 * keep the label that names them. A newer label over an older list, or the
 * reverse, is the mismatch this exists to prevent.
 */
const interfaceName = ref<string | null>(null)
/** True once a response has been applied, which is what tells an empty list apart from a panel that has never loaded. */
const hasLoaded = ref(false)
const loading = ref(false)
const loadError = ref<string | null>(null)
const addDialogOpen = ref(false)

/** Same shape the Wi-Fi store uses for its own errors; that helper is not exported. */
const errorMessage = (e: unknown): string => {
  const err = e as { response?: { data?: { detail?: string } }; message?: string }
  return err?.response?.data?.detail || err?.message || String(e)
}

const emptyDescription = computed(() =>
  hasLoaded.value
    ? t.value.wifi.configuredNetworks.empty
    : t.value.wifi.configuredNetworks.unavailable,
)

/** AC3: a priority that could not be read is stated as unknown, never as 0, a dash or a blank. */
const priorityLabel = (row: WiFiConfiguredNetwork): string =>
  row.priority === null || row.priority === undefined
    ? t.value.wifi.configuredNetworks.priorityUnknown
    : String(row.priority)

const rowClassName = ({ row }: { row: WiFiConfiguredNetwork }): string =>
  row.is_factory_default ? 'factory-default-row' : ''

/**
 * The generation of the most recently started load. I10: loads can overlap --
 * refresh is disabled while one is in flight, but the dialog's `saved` and
 * `reload` are not -- and responses need not arrive in the order they were
 * asked for. Only the load whose generation is still this one may write.
 */
let latestLoad = 0

const isLatestLoad = (generation: number): boolean => generation === latestLoad

type LoadOutcome = 'succeeded' | 'failed' | 'superseded'

/**
 * Resolves in every case and never rejects. The result tells a delete whether
 * the list now on screen came from this load (I4); the refresh control and the
 * dialog's events ignore it.
 */
const loadConfiguredNetworks = async (): Promise<{ generation: number; outcome: LoadOutcome }> => {
  const generation = ++latestLoad
  loading.value = true
  // Cleared on the way in, so a refresh that succeeds drops the previous
  // failure. The catch below is the only other writer.
  loadError.value = null

  try {
    const res = await wifiApi.listConfiguredNetworks()
    // I10: a superseded response writes nothing -- not the rows, the label or `hasLoaded`.
    if (!isLatestLoad(generation)) return { generation, outcome: 'superseded' }
    networks.value = res.networks ?? []
    interfaceName.value = res.interface ?? null
    hasLoaded.value = true
    return { generation, outcome: 'succeeded' }
  } catch (e) {
    // I1: deliberately does not touch `networks`, `interfaceName` or
    // `hasLoaded`. A failure records itself and leaves whatever last loaded on
    // screen, label included.
    // I10: nor does a superseded one record its error over the newer outcome.
    if (!isLatestLoad(generation)) return { generation, outcome: 'superseded' }
    loadError.value = errorMessage(e)
    return { generation, outcome: 'failed' }
  } finally {
    loading.value = false
  }
}

// ==================== Deleting a network ====================

/**
 * True from a delete control's click until that delete's outcome is shown.
 * Deliberately not `loading`, which a superseded load resets early.
 */
const deleting = ref(false)

interface DeleteOutcome {
  type: 'error' | 'warning'
  title: string
  /** Server text, shown as given. */
  detail: string | null
}
/** The last delete's failure. Success is a toast and never lands here. */
const deleteOutcome = ref<DeleteOutcome | null>(null)

const deleteStrings = computed(() => t.value.wifi.configuredNetworks)

/** True when `fresh` still shows the operator what `seen` showed them. */
const sameVisibleState = (seen: WiFiConfiguredNetwork, fresh: WiFiConfiguredNetwork): boolean =>
  fresh.priority === seen.priority &&
  fresh.enabled === seen.enabled &&
  fresh.current === seen.current &&
  fresh.is_factory_default === seen.is_factory_default

/**
 * Maps a rejected delete onto what the operator is told, and whether the
 * attempt may have changed the stored networks so the list must be reloaded
 * (I7). Every message names the row that was asked about, never the
 * response's `ssid`, which is `""` on some failures.
 */
const describeDeleteFailure = (
  e: unknown,
  target: WiFiConfiguredNetwork,
): { outcome: DeleteOutcome; reload: boolean } => {
  const s = deleteStrings.value
  const ssid = displaySsid(target.ssid, s)
  const unknown: DeleteOutcome = {
    type: 'warning',
    title: format(s.deleteOutcomeUnknown, { ssid }),
    detail: null,
  }

  // Not an HTTP failure: `assertBodyStatusSucceeded` rejected a 200 whose body
  // said the delete failed (I6), with the server's own message.
  if (!axios.isAxiosError(e)) {
    const detail = e instanceof Error ? e.message : String(e)
    return {
      outcome: { type: 'error', title: format(s.deleteFailed, { ssid }), detail },
      reload: true,
    }
  }

  const response = e.response
  if (!response) {
    // A timeout or a dropped connection claims neither outcome. Deleting the
    // network this page may be reached over is expected to lose the response.
    const title = target.current ? s.deleteNoResponseCurrent : s.deleteNoResponse
    return {
      outcome: { type: 'warning', title: format(title, { ssid }), detail: null },
      reload: true,
    }
  }

  const data = (response.data ?? {}) as Record<string, unknown>
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null

  switch (response.status) {
    case 500:
      // Only the persistence failure carries the delete body; this mirrors how
      // Talos itself recognises it (`_is_persistence_failure`). Nothing else off
      // a 500 is shown.
      if (data.status === 'error' && data.saved === false && typeof data.save_error === 'string') {
        return {
          outcome: {
            type: 'error',
            title: format(s.deleteNotPersisted, { ssid }),
            detail: data.save_error,
          },
          reload: true,
        }
      }
      return { outcome: unknown, reload: true }

    case 409:
      // Flat at the response root, not nested under `detail`.
      if (typeof data.requested_ssid === 'string' && typeof data.actual_ssid === 'string') {
        return {
          outcome: {
            type: 'error',
            title: format(s.deleteMismatch, {
              requested: displaySsid(data.requested_ssid, s),
              actual: displaySsid(data.actual_ssid, s),
            }),
            detail: null,
          },
          reload: true,
        }
      }
      return { outcome: unknown, reload: true }

    case 404:
      return {
        outcome: { type: 'error', title: format(s.deleteNotFound, { ssid }), detail: null },
        reload: true,
      }

    case 400:
      return {
        outcome: {
          type: 'error',
          title: format(s.deleteRefused, { ssid }),
          detail: text(data.detail) ?? text(data.message) ?? e.message,
        },
        reload: true,
      }

    case 422:
      // Never reached the delete, so nothing can have changed.
      return {
        outcome: {
          type: 'error',
          title: format(s.deleteInvalid, { ssid }),
          detail: text(data.message) ?? e.message,
        },
        reload: false,
      }

    default:
      return { outcome: unknown, reload: true }
  }
}

/**
 * I4 — A `network_id` leaves its row only in a delete request that carries the
 * same row's SSID, and only if that row came from the most recently started
 * load and that load succeeded. It is never rendered, never copied out of its
 * row, and never reused after that request.
 *
 * So the list is read again before anything is confirmed, the row is matched
 * in that fresh list on both its id and its SSID, and the confirmation is
 * built from the fresh row, which is the only thing the request is built from.
 */
const deleteRow = async (row: WiFiConfiguredNetwork) => {
  if (deleting.value) return
  deleting.value = true
  deleteOutcome.value = null
  const s = deleteStrings.value

  // Which of the same-named rows on screen was clicked, by position. wpa_supplicant
  // renumbers its table on restart, so after a renumber another duplicate can
  // inherit the clicked row's id and match it on id, SSID and every visible
  // field. Renumbering preserves relative order (INFERRED from wpa_supplicant
  // behaviour), so the ordinal identifies a duplicate across a renumber. The
  // window between the reload below and the confirm click remains undetectable.
  const sameSsidBefore = networks.value.filter((shown) => shown.ssid === row.ssid)
  const ordinal = sameSsidBefore.indexOf(row)
  const sameSsidCount = sameSsidBefore.length

  try {
    const { generation, outcome } = await loadConfiguredNetworks()
    if (outcome !== 'succeeded') {
      deleteOutcome.value = { type: 'error', title: s.deleteListUnreadable, detail: null }
      return
    }

    const target = networks.value.find(
      (fresh) => fresh.network_id === row.network_id && fresh.ssid === row.ssid,
    )
    const sameSsidNow = networks.value.filter((fresh) => fresh.ssid === row.ssid)
    if (
      !target ||
      !sameVisibleState(row, target) ||
      ordinal === -1 ||
      sameSsidNow.length !== sameSsidCount ||
      sameSsidNow[ordinal] !== target
    ) {
      deleteOutcome.value = { type: 'warning', title: s.deleteStateChanged, detail: null }
      return
    }

    const confirmation = buildDeleteConfirmation(target, networks.value, s, t.value.common.delete)
    try {
      // `autofocus: false`: by default focus lands on the confirm button, and an
      // Enter meant for something else would delete.
      await ElMessageBox.confirm(confirmation.message, s.deleteConfirmTitle, {
        autofocus: false,
        confirmButtonText: confirmation.confirmButtonText,
        confirmButtonClass: confirmation.confirmButtonClass,
        cancelButtonText: t.value.common.cancel,
        type: 'warning',
        customClass: 'delete-network-confirm',
      })
    } catch {
      // Cancel, Escape or a click outside: nothing was asked of the gateway.
      return
    }

    // A load started while the confirmation was open may show a different list.
    if (!isLatestLoad(generation)) {
      deleteOutcome.value = { type: 'warning', title: s.deleteStateChanged, detail: null }
      return
    }

    try {
      await wifiApi.deleteNetwork(target.network_id, target.ssid)
      // I7: the reload is started, not awaited; the delete succeeded whatever it does.
      void loadConfiguredNetworks()
      ElMessage.success(format(s.deleteSucceeded, { ssid: displaySsid(target.ssid, s) }))
    } catch (e) {
      const { outcome: failure, reload } = describeDeleteFailure(e, target)
      if (reload) void loadConfiguredNetworks()
      deleteOutcome.value = failure
    }
  } finally {
    deleting.value = false
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

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  /* Keeps the two header controls together at the right. */
  margin-right: auto;
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

.delete-outcome {
  margin-bottom: 12px;
}

.delete-unavailable {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

/* AC2: the rescue entry is set apart from the site networks by more than its tag. */
.configured-networks-card :deep(.factory-default-row) {
  background-color: var(--el-color-warning-light-9);
}
</style>
