<template>
  <!-- Appended to body so it is not laid out inside the panel's card, and so no
       selector scoped to the panel can reach into it. Every close route -- the
       header button, escape, the overlay -- goes through `onBeforeClose`, and
       none of them is available while a save is in flight: an outcome that
       arrived after the dialog closed would have nowhere to be read. -->
  <el-dialog
    :model-value="modelValue"
    :title="strings.title"
    width="520px"
    append-to-body
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    :before-close="onBeforeClose"
    class="add-wifi-network-dialog"
  >
    <p class="intro">{{ strings.intro }}</p>

    <!-- With no loaded list the duplicate warning and the factory-default block
         cannot fire. Saying so is the point: a check skipped in silence reads as
         a check that passed. Submission stays allowed, because the gateway
         refuses a factory-default SSID on its own. -->
    <div v-if="!existingNetworksLoaded" class="form-notice stored-check-unavailable">
      {{ strings.storedCheckUnavailable }}
    </div>

    <el-form label-position="top" @submit.prevent>
      <el-form-item :label="strings.ssid">
        <el-input v-model="ssid" class="ssid-input" autocomplete="off" />
        <div v-if="ssidError" class="form-error ssid-error">{{ ssidError }}</div>
        <div v-for="warning in ssidWarnings" :key="warning" class="form-warning ssid-warning">
          <el-icon><WarningFilled /></el-icon>
          <span>{{ warning }}</span>
        </div>
      </el-form-item>

      <el-form-item :label="strings.security">
        <!-- The five values are wire values, shown exactly as Talos spells them. -->
        <el-select v-model="security" class="security-select">
          <el-option v-for="value in SAVE_SECURITIES" :key="value" :label="value" :value="value" />
        </el-select>
        <div v-if="securityError" class="form-error security-error">{{ securityError }}</div>
      </el-form-item>

      <el-form-item v-if="security !== 'OPEN'" :label="strings.passphrase">
        <el-input
          v-model="passphrase"
          type="password"
          show-password
          autocomplete="new-password"
          class="passphrase-input"
        />
        <div v-if="passphraseError" class="form-error passphrase-error">
          {{ passphraseError }}
        </div>
        <div
          v-for="warning in passphraseWarnings"
          :key="warning"
          class="form-warning passphrase-warning"
        >
          <el-icon><WarningFilled /></el-icon>
          <span>{{ warning }}</span>
        </div>
      </el-form-item>
    </el-form>

    <!-- Every failure is told here, never by a toast: the dialog stays open and
         the operator reads this while retyping. Only a new attempt or closing
         the dialog clears it. -->
    <el-alert
      v-if="failure"
      :type="failure.type"
      :title="failure.title"
      :description="failure.detail ?? undefined"
      show-icon
      :closable="false"
      class="save-failure"
    />

    <template #footer>
      <el-button class="cancel-button" :disabled="submitting" @click="close">
        {{ t.common.cancel }}
      </el-button>
      <el-button
        type="primary"
        class="save-button"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
      >
        {{ strings.submit }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * Stores a Wi-Fi network on the gateway without connecting to it, for an SSID
 * that is out of range and so cannot be picked from a scan.
 *
 * I8: No value the operator typed is altered before it is sent. No trimming, no
 * case-folding, no normalisation. Every rule below inspects a value; none
 * rewrites one.
 *
 * I9: The passphrase exists only in the dialog's own state, is cleared when the
 * dialog closes by any route, and never reaches the DOM as text or a log line.
 * Nothing here logs.
 *
 * I4: Nothing acts on a `network_id`; none is held across a fetch. The save
 * response carries one and nothing reads it.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import axios, { AxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import { WarningFilled } from '@element-plus/icons-vue'
import { useI18n } from '@/composables/useI18n'
import {
  wifiApi,
  type WiFiConfiguredNetwork,
  type WiFiSaveNetworkRequest,
  type WiFiSaveNetworkResponse,
  type WiFiSaveSecurity,
} from '@/services/wifi'

const props = defineProps<{
  modelValue: boolean
  /** The panel's current rows, for the duplicate warning and the factory-default block. */
  existingNetworks: WiFiConfiguredNetwork[]
  /** Whether the panel has ever loaded a list; without one neither check can run. */
  existingNetworksLoaded: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** The save succeeded; the list should be reloaded. */
  (e: 'saved'): void
  /** The save reached the gateway and did not plainly succeed; the list should be reloaded. */
  (e: 'reload'): void
}>()

const { t } = useI18n()
const strings = computed(() => t.value.wifi.addNetwork)

const SAVE_SECURITIES: readonly WiFiSaveSecurity[] = [
  'OPEN',
  'WPA',
  'WPA2',
  'WPA/WPA2',
  'WPA2/WPA3',
]
const SSID_MAX_BYTES = 32
const PASSPHRASE_MIN_LENGTH = 8
const PASSPHRASE_MAX_LENGTH = 63

const ssid = ref('')
const security = ref<WiFiSaveSecurity>('WPA2')
const passphrase = ref('')
const submitting = ref(false)

interface Failure {
  /** `warning` for an outcome that claims neither success nor failure. */
  type: 'error' | 'warning'
  title: string
  detail: string | null
}
const failure = ref<Failure | null>(null)

/** Fills `{name}` tokens in one pass, so a value that itself contains a token is left alone. */
const format = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (token, name: string) =>
    name in values ? String(values[name]) : token,
  )

/**
 * Talos refuses what Python's `str.isprintable()` rejects: every Unicode
 * "Other" and "Separator" character except the ASCII space.
 */
const hasNonPrintable = (value: string): boolean =>
  // Cn (unassigned) follows each runtime's Unicode version, so the two ends can differ on it.
  [...value].some((ch) => ch !== ' ' && /[\p{C}\p{Z}]/u.test(ch))

/** Printable but outside ASCII: allowed, and warned about. */
const hasNonAscii = (value: string): boolean => /[^\x20-\x7E]/.test(value)

// The two lengths are counted in different units deliberately. An SSID is an
// 802.11 element of at most 32 octets, so it is measured in UTF-8 bytes. The
// passphrase bound is the one Talos enforces, which counts code points.
const ssidBytes = computed(() => new TextEncoder().encode(ssid.value).length)
const passphraseLength = computed(() => [...passphrase.value].length)

/** Rows stored under exactly the SSID typed. Empty when there is no list to check. */
const matchingRows = computed(() =>
  props.existingNetworksLoaded ? props.existingNetworks.filter((n) => n.ssid === ssid.value) : [],
)
const isFactoryDefault = computed(() => matchingRows.value.some((n) => n.is_factory_default))

// Tier 1 and Tier 3: each blocks submission and names its reason beside the field.
const ssidError = computed<string | null>(() => {
  if (ssid.value === '') return strings.value.ssidRequired
  if (hasNonPrintable(ssid.value)) return strings.value.ssidNonPrintable
  if (ssidBytes.value > SSID_MAX_BYTES) {
    return format(strings.value.ssidTooLong, { bytes: ssidBytes.value, max: SSID_MAX_BYTES })
  }
  // Tier 3: no request is issued for a factory-default SSID.
  if (isFactoryDefault.value) return format(strings.value.factoryDefault, { ssid: ssid.value })
  return null
})

const securityError = computed<string | null>(() =>
  security.value === 'OPEN' && passphrase.value !== '' ? strings.value.passphraseOnOpen : null,
)

// Never names the length itself: I5 keeps every passphrase-related value out of the DOM.
const passphraseError = computed<string | null>(() => {
  if (security.value === 'OPEN') return null
  if (hasNonPrintable(passphrase.value)) return strings.value.passphraseNonPrintable
  if (
    passphraseLength.value < PASSPHRASE_MIN_LENGTH ||
    passphraseLength.value > PASSPHRASE_MAX_LENGTH
  ) {
    return strings.value.passphraseLength
  }
  return null
})

// Tier 2: each warns beside its field and leaves submission allowed.
const ssidWarnings = computed<string[]>(() => {
  const warnings: string[] = []
  if (ssid.value !== '' && /^\s|\s$/u.test(ssid.value)) warnings.push(strings.value.ssidWhitespace)
  if (matchingRows.value.length > 0 && !isFactoryDefault.value) {
    // Branches on the security chosen here, not on anything in the list: saving
    // an existing entry as OPEN removes its passphrase rather than replacing it.
    const existing =
      security.value === 'OPEN' ? strings.value.ssidExistsOpen : strings.value.ssidExists
    warnings.push(format(existing, { ssid: ssid.value }))
  }
  return warnings
})

const passphraseWarnings = computed<string[]>(() =>
  security.value !== 'OPEN' && hasNonAscii(passphrase.value) && !hasNonPrintable(passphrase.value)
    ? [strings.value.passphraseNonAscii]
    : [],
)

const canSubmit = computed(
  () => !submitting.value && !ssidError.value && !securityError.value && !passphraseError.value,
)

// An OPEN network carries no passphrase, and the field is not shown for one.
watch(security, (value) => {
  if (value === 'OPEN') passphrase.value = ''
})

/** `psk` is omitted, never sent as null or empty, for OPEN. */
const buildRequest = (): WiFiSaveNetworkRequest =>
  security.value === 'OPEN'
    ? { ssid: ssid.value, security: security.value }
    : { ssid: ssid.value, security: security.value, psk: passphrase.value }

/**
 * `sent` is the security of the request that was saved, not whatever the select
 * shows now: the form stays editable while a save is in flight. An existing entry
 * saved as OPEN is set to key_mgmt NONE and its passphrase cleared, so it was not
 * "updated".
 */
const successMessage = (res: WiFiSaveNetworkResponse, sent: WiFiSaveSecurity): string => {
  const updated = sent === 'OPEN' ? strings.value.savedUpdatedOpen : strings.value.savedUpdated
  return format(res.created ? strings.value.savedCreated : updated, {
    ssid: res.ssid,
    interface: res.interface ?? strings.value.unknownInterface,
  })
}

/**
 * Maps a rejected save onto what the operator is told, and whether the attempt
 * reached the gateway far enough that the list must be reloaded (I7).
 */
const describeFailure = (e: unknown): { failure: Failure; reload: boolean } => {
  const s = strings.value

  // Not an HTTP failure: `assertBodyStatusSucceeded` rejected a 200 whose body
  // said the save failed (I6), with the server's own message.
  if (!axios.isAxiosError(e)) {
    const detail = e instanceof Error ? e.message : String(e)
    return { failure: { type: 'error', title: s.saveFailed, detail }, reload: true }
  }

  const response = e.response
  if (!response) {
    // Talos holds the interface lock with no timeout and finishes the save, so a
    // client timeout claims neither success nor failure.
    if (e.code === AxiosError.ECONNABORTED || e.code === AxiosError.ETIMEDOUT) {
      return {
        failure: { type: 'warning', title: s.timedOut, detail: s.timedOutDetail },
        reload: true,
      }
    }
    return {
      failure: { type: 'warning', title: s.outcomeUnknown, detail: e.message },
      reload: true,
    }
  }

  const data = (response.data ?? {}) as Record<string, unknown>
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null

  switch (response.status) {
    case 400:
      return {
        failure: { type: 'error', title: s.refused, detail: text(data.detail) ?? e.message },
        reload: false,
      }

    case 422: {
      // The body's own `message` is a constant; the reasons are in `errors`.
      const errors = Array.isArray(data.errors) ? data.errors : []
      const reasons = errors
        .map((err: { field?: unknown; message?: unknown }) =>
          [text(err?.field), text(err?.message)].filter(Boolean).join(': '),
        )
        .filter((reason) => reason !== '')
      return {
        failure: {
          type: 'error',
          title: s.invalid,
          detail: reasons.length > 0 ? reasons.join('; ') : (text(data.message) ?? e.message),
        },
        reload: false,
      }
    }

    case 500:
      // Two different 500s. Only the persistence failure carries the save body,
      // and this mirrors how Talos itself recognises it (`_is_persistence_failure`).
      // The body is read from the response root: it is not nested under `detail`.
      if (data.status === 'error' && data.saved === false && typeof data.save_error === 'string') {
        return {
          failure: { type: 'error', title: s.notPersisted, detail: data.save_error },
          reload: true,
        }
      }
      // Any other 500 can arrive after the write, so it claims neither outcome.
      return {
        failure: {
          type: 'warning',
          title: s.outcomeUnknown,
          detail: text(data.message) ?? e.message,
        },
        reload: true,
      }

    default:
      return {
        failure: {
          type: 'warning',
          title: s.outcomeUnknown,
          detail: text(data.message) ?? text(data.detail) ?? e.message,
        },
        reload: true,
      }
  }
}

const submit = async () => {
  if (!canSubmit.value) return

  submitting.value = true
  failure.value = null

  try {
    const req = buildRequest()
    const res = await wifiApi.saveNetwork(req)
    // I7: the reload is requested before the operator is told anything. The
    // message does not wait on it: the save succeeded whatever the reload does.
    emit('saved')
    ElMessage.success(successMessage(res, req.security))
    close()
  } catch (e) {
    const outcome = describeFailure(e)
    if (outcome.reload) emit('reload')
    failure.value = outcome.failure
  } finally {
    submitting.value = false
  }
}

/** I9: every close route ends here, and the passphrase goes with the rest of the form. */
const clearForm = () => {
  ssid.value = ''
  security.value = 'WPA2'
  passphrase.value = ''
  failure.value = null
}

const close = () => {
  clearForm()
  emit('update:modelValue', false)
}

/** The header button, escape and the overlay. Refused while a save is in flight. */
const onBeforeClose = (done: () => void) => {
  if (submitting.value) return
  close()
  done()
}

// A parent that closes the dialog itself still clears it.
watch(
  () => props.modelValue,
  (open) => {
    if (!open) clearForm()
  },
)

onBeforeUnmount(clearForm)
</script>

<style scoped>
.intro {
  margin: 0 0 12px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.5;
}

.form-notice {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 4px;
  background-color: var(--el-color-info-light-9);
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.4;
}

.security-select {
  width: 100%;
}

/* Same treatment as the provisioning form's field errors. */
.form-error {
  flex-basis: 100%;
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.4;
  padding-top: 4px;
}

/* A Tier 2 warning: another colour and an icon, so it never reads as a blocking error. */
.form-warning {
  flex-basis: 100%;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
  line-height: 1.4;
  padding-top: 4px;
}

.form-warning .el-icon {
  margin-top: 2px;
}
</style>
