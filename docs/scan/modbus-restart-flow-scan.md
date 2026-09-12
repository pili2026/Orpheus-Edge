# Scan A — Orpheus Edge: Modbus device config & Talos restart flow

Read-only investigation of the Orpheus Edge Vue frontend (`pili2026/Orpheus-Edge`).
Factual report only; no design proposals. Every claim is anchored to `path:line`.

Repository state at time of scan: branch `claude/modbus-talos-restart-scan-xrv9kw`,
head `096377e`. `node_modules/` is not installed in this environment (static reading only).

---

## 1. Restart prompt trigger

**Which component/composable/store raises the "restart Talos?" dialog**

The dialog is raised by the shared composable `useTalosRestart`, specifically its
`promptRestart()` function (`src/composables/useTalosRestart.ts:184-200`). It is a
`ElMessageBox.confirm` from Element Plus, not a bespoke component:

- `src/composables/useTalosRestart.ts:187-192` — `ElMessageBox.confirm(i18n.value.restartMessage, i18n.value.restartTitle, { confirmButtonText: restartNow, cancelButtonText: restartLater, type: 'warning', distinguishCancelAndClose: true })`
- Confirm → `restartNow()` (`src/composables/useTalosRestart.ts:193`)
- Cancel (explicitly the Cancel button, not the X) → sets `showRestartAlert.value = true` and shows an info toast (`src/composables/useTalosRestart.ts:194-199`)

**Exact call chain from "add device" to the dialog**

1. `src/views/config/ModbusConfigView.vue:177` — "Add Device" button `@click="openDeviceDialog()"`
2. `src/views/config/ModbusConfigView.vue:433-437` — `openDeviceDialog()` sets `currentDevice = undefined`, `isEditDevice = false`, `deviceDialogVisible = true`
3. `src/views/config/ModbusConfigView.vue:255-261` — `<DeviceDialog>` rendered with `@submit="handleDeviceSubmit"`
4. `src/components/config/DeviceDialog.vue:185` — footer Save button `@click="handleSubmit"`
5. `src/components/config/DeviceDialog.vue:358-404` — `handleSubmit()` validates the form, re-checks `duplicateDevice`, parses `modes.custom` JSON, then `emit('submit', deviceData)` (`:400`)
6. `src/views/config/ModbusConfigView.vue:445-454` — `handleDeviceSubmit(device)`:
   - `await configStore.createOrUpdateDevice(device, 'web-user')` (`:447`)
   - `closeDeviceDialog()` (`:448`)
   - `promptRestart()` (`:449`)
7. `src/stores/modbus_config.ts:177-190` — `createOrUpdateDevice` POSTs `/api/config/modbus/devices` then `await fetchConfig()`
8. `src/composables/useTalosRestart.ts:184` — `promptRestart()` opens the confirm box

`promptRestart()` is called unconditionally on the success path; it is skipped only
because the `catch` in `handleDeviceSubmit` swallows a failure
(`src/views/config/ModbusConfigView.vue:450-453`).

**Is the dialog shared with other features? Every call site**

`useTalosRestart` is imported by three views:

| View | Import | `promptRestart()` call sites |
|---|---|---|
| `src/views/config/ModbusConfigView.vue` | `:293` | `:376` (import config), `:386` (backup restored), `:416` (save bus), `:426` (delete bus), `:449` (save device), `:460` (delete device) |
| `src/views/config/SystemConfigView.vue` | `:233` | `:386` (save system config), `:408` (import config), `:418` (backup restored) |
| `src/views/config/InstanceConfigView.vue` | `:409` | `:555` (import config), `:568` (backup restored), `:661` (save inverter constraints), `:673` (save pins) |

Manual (non-prompt) restart entry points, using `confirmRestart()` from the same composable:

- `src/views/config/ModbusConfigView.vue:72` — header "Restart Service" button
- `src/views/config/ModbusConfigView.vue:51` — the warning banner's "Restart Service" button, which calls `restartNow` directly (no second confirm)
- `src/views/config/SystemConfigView.vue:44` (banner `restartNow`), `:61` (header `confirmRestart`)
- `src/views/config/InstanceConfigView.vue:46` (banner `restartNow`), `:67` (header `confirmRestart`)

A **fourth, independent** restart path exists and does **not** use `useTalosRestart`:

- `src/views/config/MqttConfigView.vue:206-226` — its own `confirmRestart()` with a hard-coded
  English `ElMessageBox.confirm('Restart Talos now to apply MQTT changes?', 'Confirm Restart', ...)`
  (`:208`), calling `mqttStore.restartService()` (`:216`) which hits `POST /api/mqtt/restart`
  (`src/services/mqtt.ts:68`). Bound to the button at `src/views/config/MqttConfigView.vue:26`.

The restarting-progress dialog and the "not yet applied" warning banner are **not** shared
components — the same markup is duplicated inline in each of the three views:

- `src/views/config/ModbusConfigView.vue:4-33` (progress dialog), `:36-56` (banner)
- `src/views/config/SystemConfigView.vue:4-...` (`:4` progress dialog `v-model="showRestartingDialog"`, `:30` banner)
- `src/views/config/InstanceConfigView.vue:5` (progress dialog), `:32` (banner)

---

## 2. Device configuration flow

**Full path: form submit → validation → store action → API client → endpoint**

| Stage | Location |
|---|---|
| Form submit | `src/components/config/DeviceDialog.vue:185` → `handleSubmit()` `:358` |
| Element Plus rule validation | `src/components/config/DeviceDialog.vue:362` (`await formRef.value.validate()`), rules at `:300-305` |
| Duplicate-slave-ID re-check | `src/components/config/DeviceDialog.vue:364-372` |
| `modes.custom` JSON parse | `src/components/config/DeviceDialog.vue:378-386` |
| Emit to parent | `src/components/config/DeviceDialog.vue:400` |
| View handler | `src/views/config/ModbusConfigView.vue:445-454` |
| Store action | `src/stores/modbus_config.ts:177-190` `createOrUpdateDevice` |
| HTTP client | bare `axios` (not the `src/services/api.ts` instance) — `src/stores/modbus_config.ts:4`, `:181` |
| Endpoint | `POST /api/config/modbus/devices` (`API_BASE` at `src/stores/modbus_config.ts:85`) |
| Post-write refetch | `await fetchConfig()` at `src/stores/modbus_config.ts:185` |

The device store sends an `X-User-Email` header when a user string is supplied
(`src/stores/modbus_config.ts:60`, `:144`, `:162`, `:180`, `:198`). Every call site in
`ModbusConfigView.vue` passes the literal string `'web-user'`
(`:413`, `:425`, `:447`, `:458`) — not the real operator identity.

**Are add / edit / delete separate requests? Is there any bulk endpoint?**

Add and edit are the **same** request: `POST /api/config/modbus/devices` with the full device
object (`src/stores/modbus_config.ts:181`); the view uses one handler for both and only varies
the dialog title (`src/components/config/DeviceDialog.vue:4`) and the duplicate-check exclusion
(`src/components/config/DeviceDialog.vue:282-287`).

Delete is a separate request: `DELETE /api/config/modbus/devices/{model}/{slaveId}`
(`src/stores/modbus_config.ts:199`).

There is **no per-device bulk endpoint** in the frontend client. The only whole-config write
paths are:

- `POST /api/config/import/{configType}` — multipart YAML file upload
  (`src/stores/config_io.ts:26`), invoked for `'modbus_device'` at
  `src/views/config/ModbusConfigView.vue:373`
- `POST /api/config/backups/{configType}/{filename}/restore` (`src/stores/backup.ts:71`, `:123`)

Both replace the entire config file, and both are followed by `promptRestart()`
(`src/views/config/ModbusConfigView.vue:376`, `:386`).

---

## 3. API surface (as seen from the frontend client)

### Device / bus config

| Method | Path | Request | Response (as typed) | Called at |
|---|---|---|---|---|
| GET | `/api/config/modbus` | — | `ModbusConfig` = `{ metadata, buses: Record<string, ModbusBus>, devices: ModbusDevice[] }` (`src/stores/modbus_config.ts:35-39`) | `src/stores/modbus_config.ts:106`; also `src/stores/instance_config.ts:121` |
| GET | `/api/config/modbus/metadata` | — | `{ metadata: ConfigMetadata }` (`src/stores/modbus_config.ts:122`) | `src/stores/modbus_config.ts:122` (`fetchMetadata` is exported at `:238` but **no call site exists in the repo**) |
| POST | `/api/config/modbus/buses/{name}` | `{ port, baudrate, timeout }` | not typed / ignored | `src/stores/modbus_config.ts:145` |
| DELETE | `/api/config/modbus/buses/{name}` | — | not typed / ignored | `src/stores/modbus_config.ts:163` |
| POST | `/api/config/modbus/devices` | `ModbusDevice` (`src/stores/modbus_config.ts:26-33`) | not typed / ignored | `src/stores/modbus_config.ts:181` |
| DELETE | `/api/config/modbus/devices/{model}/{slaveId}` | — | not typed / ignored | `src/stores/modbus_config.ts:199` |
| GET | `/api/config/modbus_drivers` | — | `{ drivers: Array<{ model, type, description, file_path, available_parameters? }> }` (`src/components/config/DeviceDialog.vue:226-233`, `src/stores/instance_config.ts:132-137`) | `src/components/config/DeviceDialog.vue:311`, `src/stores/instance_config.ts:120` |
| GET | `/api/config/modbus_drivers/{model}` | — | untyped | `src/components/config/PinConfigDialog.vue:179` |

### Other config surfaces (same `/api/config` family)

| Method | Path | Called at |
|---|---|---|
| GET | `/api/config/instance` | `src/stores/instance_config.ts:107` |
| PUT | `/api/config/instance/{model}` | `src/stores/instance_config.ts:155` |
| PUT | `/api/config/instance/{model}/{slaveId}` | `src/stores/instance_config.ts:178` |
| GET | `/api/config/system` | `src/stores/system_config.ts:29` |
| POST | `/api/config/system` | `src/stores/system_config.ts:43` |
| GET | `/api/config/pin_mapping`, `/{model}`, `/{model}/template` | `src/stores/pin_mapping.ts:43`, `:53`, `:65` |
| GET | `/api/config/export/{configType}` (browser navigation, not XHR) | `src/stores/config_io.ts:12` |
| POST | `/api/config/import/{configType}` (multipart) | `src/stores/config_io.ts:26` |
| GET | `/api/config/backups/{type}` | `src/stores/backup.ts:65`, `:78` |
| GET | `/api/config/backups/{type}/{filename}` | `src/stores/backup.ts:68`, `:96` |
| POST | `/api/config/backups/{type}/{filename}/restore` | `src/stores/backup.ts:71`, `:123` |

`ConfigType` union: `'system_config' | 'modbus_device' | 'device_instance_config' | 'alert_config' | 'control_config' | 'pin_mapping'` (`src/types/config.ts:1-7`).

### Restart / reload endpoints

| Method | Path | Request | Response | Called at |
|---|---|---|---|---|
| POST | `/api/provision/service/restart` | — | `{ success: boolean; message?: string }` (`src/composables/useTalosRestart.ts:5`) | `src/composables/useTalosRestart.ts:163`, default URL at `:71` |
| GET | `/api/provision/config` | — | `ProvisionCurrentConfig` — used here purely as a liveness probe | `src/composables/useTalosRestart.ts:132`, default URL at `:72` |
| POST | `/api/mqtt/restart` | — | not typed / ignored | `src/services/mqtt.ts:68` |
| POST | `/api/provision/reboot` | — | `ProvisionRebootResult { success, message }` (`src/types/provision.ts:31-34`) | `src/services/provision.ts:35` — **whole-system reboot**, distinct from a Talos service restart |
| POST | `/api/devices/refresh` | — | untyped; a 404 is tolerated with the message `'Refresh API not implemented yet'` | `src/views/DashboardView.vue:442`, `:448-449` |

No `useTalosRestart` call site overrides `restartUrl` or `pollUrl`
(`src/views/config/ModbusConfigView.vue:331-335`, `src/views/config/SystemConfigView.vue:269-273`,
`src/views/config/InstanceConfigView.vue:461-465` — all pass only `onRestarted`), so all three
views use the defaults.

**Is "persist config" already separate from "restart Talos"?**

Yes, structurally. Every config mutation endpoint (`POST /api/config/modbus/devices` etc.)
is a distinct request from `POST /api/provision/service/restart`. Nothing in the mutation
request or response couples them; the coupling is entirely a client-side sequencing decision
(`src/views/config/ModbusConfigView.vue:447` then `:449`).

**Does any endpoint expose a config version / etag / hash / revision?**

Yes — read-only, and not used for concurrency control:

- `ConfigMetadata` (`src/stores/modbus_config.ts:9-17`) carries
  `generation: number`, `source: string`, `last_modified: string`, `last_modified_by: string`,
  `checksum: string`, `applied_at: string | null`, `cloud_sync_id: string | null`.
- It is rendered in the metadata card at `src/views/config/ModbusConfigView.vue:103-132`
  (`generation` `:111`, `source` `:115`, `last_modified` `:121`, `last_modified_by` `:125`,
  first 16 chars of `checksum` `:129`), and as a header tag at `:62-64`.
- `applied_at` and `cloud_sync_id` are declared in the type but are **not read anywhere** in the
  repo (grep over `src/` finds only the declaration).
- `InstanceConfigResponse` also carries `generation`, `checksum`, `modified_at`
  (`src/stores/instance_config.ts:37-39`).
- **No** request anywhere sends `If-Match`, an etag, a generation, or a checksum. `makeHeaders`
  (`src/stores/modbus_config.ts:60`) only ever emits `X-User-Email`.

**Does any endpoint suggest reload-without-restart?**

`NOT FOUND` for Modbus device config. The only reload-adjacent call is
`POST /api/devices/refresh` (`src/views/DashboardView.vue:442`), which the code itself treats as
possibly unimplemented (`:448-449` handles 404 with `'Refresh API not implemented yet'`), and
which is a dashboard data refresh, not a config apply. `POST /api/mqtt/restart`
(`src/services/mqtt.ts:68`) is named a restart and the store's success toast reads
`'Talos restart requested'` (`src/stores/mqtt.ts:240`).

---

## 4. State management

**Which store holds device config**

Pinia setup-store `useConfigStore`, id `'config'`, in `src/stores/modbus_config.ts:64`.

Shape (`src/stores/modbus_config.ts:69-82`, `:221-241`):

- State: `config: Ref<ModbusConfig | null>` (`:69`), `isLoading: Ref<boolean>` (`:70`), `error: Ref<string | null>` (`:71`)
- Computed: `metadata` (`:74`), `buses` (`:75`), `devices` (`:76`), `busList` — `buses` object flattened to an array with `name` injected (`:77-82`)
- Actions: `fetchConfig` (`:103`), `fetchMetadata` (`:120`), `createOrUpdateBus` (`:137`), `deleteBus` (`:159`), `createOrUpdateDevice` (`:177`), `deleteDevice` (`:195`), `getDeviceDisplayName` (`:213`)

`ModbusDevice` shape: `{ model, type, model_file, slave_id, bus, modes: Record<string, unknown> }`
(`src/stores/modbus_config.ts:26-33`). Note `modes` is non-optional in the type but the dialog
omits it when empty (`src/components/config/DeviceDialog.vue:396-398`).

Adjacent stores that also hold parts of device configuration:
`useInstanceConfigStore` (`src/stores/instance_config.ts:53`), `useSystemConfigStore`
(`src/stores/system_config.ts`), `usePinMappingStore` (`src/stores/pin_mapping.ts`),
`useConfigIOStore` (`src/stores/config_io.ts:6`), `useBackupStore` (`src/stores/backup.ts:56`),
`useMqttStore` (`src/stores/mqtt.ts:25`).

**Does dirty-state / draft / unsaved-changes tracking already exist?**

Yes — three distinct patterns exist, none of them in the Modbus flow:

1. **JSON-snapshot draft** — `src/views/config/MqttConfigView.vue`
   - `normalizeDraft(source)` builds a whitelisted plain object (`:104-133`)
   - `initDraft()` deep-clones via `JSON.parse(JSON.stringify(...))` and stores
     `initialSnapshot = JSON.stringify(draft)` (`:153-161`)
   - `const isDirty = computed(() => !!draft.value && snapshot(draft.value) !== initialSnapshot.value)` (`:163`)
   - `canSave` gates on `configLoaded && !loadingConfig && !saving && !configLoadError && draft && isDirty` (`:164-172`)
   - After a successful save, `initDraft()` re-baselines (`:200`)
   - The whole form binds to `draft` via `v-model` (`:31-47`), so the page is a live draft over a snapshot.

2. **Field-by-field comparison against server state** — `src/views/config/SystemConfigView.vue:293-302`
   `isDirty` compares four `form` fields to `currentConfig`; drives `:disabled` on Reset (`:198`)
   and Save (`:201`); `handleReset()` copies the server values back (`:361-371`); a `watch` on
   `currentConfig` re-seeds the form (`:337-347`).

3. **Same pattern, plus a visible badge** — `src/views/ProvisionView.vue:492-498`
   `hasChanges` compares two fields; rendered as an `el-tag` reading
   `t.provision.unsavedChanges` (`:84-86`); gates Save (`:144`) and Reset (`:149`);
   `handleResetForm()` at `:602-609`.

i18n key already exists: `unsavedChanges` — `'Unsaved Changes'` (`src/locales/en.ts:340`) /
`'未儲存的變更'` (`src/locales/zh-TW.ts:343`), typed at `src/types/i18n.ts:326`.

Nothing of this kind exists in `ModbusConfigView.vue`, `DeviceDialog.vue`, or
`src/stores/modbus_config.ts`. `DeviceDialog` keeps a local `form` ref
(`src/components/config/DeviceDialog.vue:235-248`) that it wipes on close (`:406-424`), with no
baseline comparison.

**Is device config cached client-side, or refetched after every mutation?**

Refetched after every mutation. Each of `createOrUpdateBus`, `deleteBus`,
`createOrUpdateDevice`, `deleteDevice` ends with `await fetchConfig()`
(`src/stores/modbus_config.ts:148`, `:166`, `:185`, `:203`), which replaces `config.value`
wholesale (`:107`). `ModbusConfigView` also refetches on mount (`:359`), on the Refresh button
(`:77` → `:362-364`), and after a successful restart (`:332-334`).

Additionally, `handleDeleteDevice` refetches the *instance* config too
(`src/views/config/ModbusConfigView.vue:459`) — but `handleDeviceSubmit` does not.

`DeviceDialog` caches the driver list for the component's lifetime: it fetches only when
`availableDrivers.value.length === 0` (`src/components/config/DeviceDialog.vue:454-462`).

---

## 5. Restart mechanics

**How restart is requested**

`restartNow()` (`src/composables/useTalosRestart.ts:157-179`):
- guards re-entry with `isRestarting` (`:158`)
- clears the warning banner (`:160`)
- `await axios.post<RestartApiResp>(restartUrl)` (`:163`) — bare `axios`, no timeout set
- if `resp.data.success` → `startCountdown()` (`:164-167`)
- if `success` is falsy → warning toast using `resp.data.message` or `i18n.restartWarning`, and `isRestarting` reset to `false` (`:168-172`)
- on throw → `console.error` + `ElMessage.error(i18n.restartFailed)` + `isRestarting = false` (`:173-178`)

**What the UI does while Talos is down**

`startCountdown()` (`src/composables/useTalosRestart.ts:103-118`):
- sets `showRestartingDialog = true` (`:105`) — a modal `el-dialog` with
  `:close-on-click-modal="false" :close-on-press-escape="false" :show-close="false"`
  (`src/views/config/ModbusConfigView.vue:8-10`), so it cannot be dismissed
- runs a **fake** progress bar: `setInterval` every 1000 ms driving `restartProgress` from 0 to a
  cap of 80% over `fakeProgressDurationSec` (default 15 s) (`:107-112`, default at `:74`)
- schedules the first poll after `pollInitialDelayMs` (default 3000 ms) so the service has time to
  go down first (`:75`, `:114-117`)

**Health / readiness polling, reconnect, timeout**

`pollUntilUp(seq, attempt)` (`src/composables/useTalosRestart.ts:120-150`):
- staleness guard against a superseded polling run via `pollingSeq` (`:121`, `:133`, `:145`, and
  invalidation at `:228`)
- probe is `await axios.get(pollUrl, { timeout: 2000 })` — i.e. `GET /api/provision/config`
  (`:132`). There is **no dedicated health/readiness endpoint**; this is a plain config GET used
  as a liveness check.
- on success: stop timers, jump progress to 100 (`:135-136`), then after 600 ms close the dialog,
  show `restartSuccess`, and run the `onRestarted` callback (`:138-143`)
- on failure: schedule the next attempt after `pollIntervalMs` (default 2000 ms) (`:146-148`, `:76`)
- ceiling: `pollMaxAttempts` default 25 (`:77`); so worst case ≈ 3 s + 25 × 2 s ≈ 53 s before giving up

**What happens if the restart request fails or Talos never comes back**

- Request fails → error toast `restartFailed`, `isRestarting` back to `false`, no dialog, no
  polling (`src/composables/useTalosRestart.ts:173-178`). The warning banner was already cleared
  at `:160` and is **not** restored.
- API returns `success: false` → warning toast, no dialog, no polling (`:168-172`).
- Polling exhausts `pollMaxAttempts` → timers stopped, dialog closed, `isRestarting = false`,
  error toast `restartFailed` (`:123-129`). The English copy for that key is
  `'Failed to restart Talos service. Please restart manually: sudo systemctl restart talos.service'`
  (`src/locales/en.ts:605-606`). The UI does **not** re-raise the "config not yet applied" banner
  in this case, and does not refetch.
- Timers are cleaned up on unmount (`:100`). `cancelRestartFlow()` exists (`:227-232`) but has no
  call site in the repo.

The banner itself is `showRestartAlert` (`src/composables/useTalosRestart.ts:81`), set **only**
when the user presses Cancel on the prompt (`:196`), and cleared by `restartNow()` (`:160`) or
`dismissAlert()` (`:220-222`). It is component-local state and is lost on navigation away —
there is no persistence (see §7).

For contrast, the whole-system reboot flow in `ProvisionView` uses a different, longer recovery
loop: 10 s initial wait (`src/views/ProvisionView.vue:654-657`), then `checkSystemHealth()` every
4 s (`:694`) up to `maxReconnectAttempts = 30 // 30 attempts = ~2 minutes` (`:385`), probing
`provisionService.getCurrentConfig()` (`:685`).

---

## 6. Validation rules

**Where validation is implemented**

Frontend only, as far as this repository shows. Backend validation is not observable from here
(see `## Unknowns`), except that error bodies are expected to carry a `detail` string
(`src/stores/modbus_config.ts:50-58`, `src/stores/backup.ts:35-47`) and that string is surfaced
verbatim in the error toast (`src/stores/modbus_config.ts:186-187`).

**Concrete rules found — device (`src/components/config/DeviceDialog.vue`)**

| Rule | Location |
|---|---|
| `typeFilter` required — "Please select a device type" | `:301` |
| `selectedDriver` required — "Please select a driver" | `:302` |
| `slave_id` required | `:303` |
| `bus` required | `:304` |
| `slave_id` numeric range 1–247, enforced by the `el-input-number` widget (`:119-120`), default 1 (`:241`) | `:117-124` |
| **Duplicate slave ID on the same bus** — `duplicateDevice` finds any device where `d.bus === form.bus && d.slave_id === form.slave_id`, excluding the device being edited (matched by `model` + `slave_id`) | `:274-290` |
| Duplicate shown as an inline `el-alert type="error"` under the slave-ID field | `:126-139` |
| Submit button disabled unless `model && slave_id && bus && !duplicateDevice` | `:292-294`, bound at `:185` |
| Duplicate re-checked at submit time, aborting with an error toast | `:364-372` |
| `modes.custom` must parse as JSON, else error toast `modes.invalidJson` and abort | `:378-386` |
| `model`, `type`, `model_file` are read-only, auto-filled from the selected driver | `:64-91`, filled at `:326-334` |

**Concrete rules found — bus (`src/views/config/ModbusConfigView.vue`)**

| Rule | Location |
|---|---|
| `name`, `port`, `baudrate`, `timeout` all required | `:351-356` |
| `name` immutable when editing (`:disabled="busDialogMode === 'edit'"`) | `:235` |
| `baudrate` widget range 1200–115200, step 100 | `:242` |
| `timeout` widget range 0.1–10, step 0.1 | `:245` |
| Bus deletion guarded only by an `el-popconfirm`, with **no check for devices still attached to that bus** — despite `getDeviceCountForBus` existing and being displayed in the table (`:149-153`, `:474-475`) | `:159-168`, `:423-430` |

**Other config screens**

- `SystemConfigView`: `monitor_interval_seconds` required and 0.1–3600 (`:322-325`);
  `device_id_series` required and 0–9 (`:328-331`); cross-field `validateInterval` requiring
  `control_interval_seconds` and `alert_interval_seconds` to be `>= monitor_interval_seconds`
  when non-null (`:304-319`), re-triggered when the monitor interval changes (`:354-359`).
- `ProvisionView`: `hostname` required + `HOSTNAME_PATTERN` of exactly `HOSTNAME_LENGTH`
  alphanumeric characters (`:471-478`); `reverse_port` required and 1024–65535 (`:479-488`).
- `InverterConstraintDialog`: widget-level bounds only — `startupFreq` / `minHz` / `maxHz` all
  `:min="0" :max="120" :step="0.5"` (`:10`, `:25`, `:28`). There is **no check that `minHz <= maxHz`**.

**Per-device only, or cross-device / whole-config checks?**

The duplicate-slave-ID check (`src/components/config/DeviceDialog.vue:274-290`) is cross-device:
it scans the whole `configStore.devices` list. It is the **only** cross-device check found.

`NOT FOUND` in the frontend: port conflict between buses, register-range overlap, polling-budget
vs. baud-rate feasibility, orphaned-device check on bus delete, whole-config consistency
validation before save. A generic `validateSlaveAddress` (1–247) exists at
`src/utils/validator.ts:167-178` along with `validatePort` (`:151-162`) and
`validateRegisterAddress` (`:183-194`), but grep over `src/` shows **`src/utils/validator.ts` is
never imported by any component, view, store, or composable** — it is dead code referenced only
in the doc comment of `src/utils/index.ts:26`, `:30`.

---

## 7. Navigation guards & persistence

**Navigation guards**

`NOT FOUND`. There is no `onBeforeRouteLeave`, no `beforeRouteLeave`, no `router.beforeEach` /
`beforeResolve`, and no `beforeunload` listener anywhere in `src/`. The router
(`src/router/index.ts:19-133`) registers routes only, with no global guards and no route-level
guards. (`beforeEach` hits in grep are Vitest lifecycle hooks in `src/**/__tests__/*`, not router
guards.)

**localStorage / sessionStorage / IndexedDB**

`sessionStorage` and IndexedDB: `NOT FOUND`.

`localStorage` in use, all for UI preferences and logs — never for config drafts:

| Key | Purpose | Location |
|---|---|---|
| `language` | selected locale | `src/stores/ui.ts:58` (write), `:82` (read) |
| `talos_layout_mode` | dashboard layout mode | `src/views/DashboardView.vue:203` (read), `:249` (write) |
| `talos_device_order` | dashboard card order | `src/views/DashboardView.vue:267`, `:307`, `:412` |
| `talos_grid_layout` | dashboard grid geometry | `src/views/DashboardView.vue:322`, `:382`, `:404`, `:416` |
| logger storage key | persisted logs | `src/utils/logger.ts:240`, `:277`, `:288` |

There is also an unused general-purpose storage layer: `src/utils/storage.ts` defines
`Storage` (prefix `'talos_'`, TTL support, `btoa` obfuscation) at `:19-193`,
`PreferencesManager` at `:202-250`, `CacheManager` at `:256-309`, and
`ConnectionSettingsManager` at `:322-359`, with singletons `storage` (`:196`),
`preferences` (`:253`), `cache` (`:312`), `connectionSettings` (`:362`). Grep shows
**no importer** of `@/utils/storage` outside `src/utils/index.ts`'s doc comment (`:32`) — the
views use `localStorage` directly instead.

---

## 8. i18n

**Restart dialog / banner keys — namespace `config.talos`**

Defined in `src/locales/en.ts:585-607` and `src/locales/zh-TW.ts:584-604`; typed in
`src/types/i18n.ts` (`restartNow` at `:570`, `confirmRestartMessage` at `:576`).

| Key | en (`src/locales/en.ts`) | zh-TW (`src/locales/zh-TW.ts`) | Used at |
|---|---|---|---|
| `restartService` | `:586` | `:585` | header + banner buttons: `ModbusConfigView.vue:53`, `:74` |
| `restartTitle` | `:588` | `:587` | `useTalosRestart.ts:187`, `:208` |
| `restartMessage` | `:589` `'Configuration updated. Restart Talos service to apply changes?'` | `:588` | `useTalosRestart.ts:187` |
| `restartNow` | `:590` | `:589` | confirm button, `useTalosRestart.ts:188` |
| `restartLater` | `:591` | `:590` | cancel button, `useTalosRestart.ts:189` |
| `restartReminder` | `:592` | `:591` | info toast after Cancel, `useTalosRestart.ts:197` |
| `alertTitle` | `:594` `'Configuration updated but not yet applied. Please restart Talos service.'` | `:593` | banner title, `ModbusConfigView.vue:44` |
| `confirmRestartMessage` | `:596` | `:595` | `useTalosRestart.ts:208` |
| `restartingTitle` | `:598` | `:597` | dialog title, `ModbusConfigView.vue:6` |
| `restartingMessage` | `:599` | `:598` | `ModbusConfigView.vue:17` |
| `restartingSubtext` | `:600` | `:599` | `ModbusConfigView.vue:18`, `:29` |
| `restartSuccess` | `:602` | `:601` | `useTalosRestart.ts:141`; `ModbusConfigView.vue:29` |
| `restartWarning` | `:603-604` | `:602` | `useTalosRestart.ts:169` |
| `restartFailed` | `:605-606` | `:603` | `useTalosRestart.ts:127`, `:176` |

Each of the three views rebuilds the same `TalosRestartI18n` object by hand
(`ModbusConfigView.vue:305-320`, `SystemConfigView.vue:243-258`, `InstanceConfigView.vue:435-450`),
pulling `confirmText` from `common.confirm` and `cancelText` from `common.cancel`.

`MqttConfigView.vue` bypasses i18n for its restart confirm — the strings at
`src/views/config/MqttConfigView.vue:208` are hard-coded English, as is its button label source
`t.config.mqtt.restartTalos` at `:26`.

**Device config screen keys — namespace `config`**

- Screen chrome: `config.title`, `config.generation`, `config.refresh`, `config.exportConfig`,
  `config.importConfig`, `config.backups` (`src/locales/en.ts:440-446`)
- `config.importSuccess` = `'Config imported. Please restart the service to apply changes.'`
  (`src/locales/en.ts:445`), `config.importFailed` (`:446`)
- `config.metadata.*` — `title`, `generation`, `source`, `lastModified`, `modifiedBy`, `checksum`
  (`src/locales/en.ts:448-455`)
- `config.tabs.buses` / `config.tabs.devices` (`:457-460`)
- `config.bus.*` — 22 keys (`src/locales/en.ts:462-484`)
- `config.device.*` — 43 keys (`src/locales/en.ts:486-558`), including
  `duplicateSlaveId` (`:526`), `duplicateSlaveIdDetail` with `{bus}` / `{slaveId}` / `{device}`
  placeholders (`:527`), `duplicateSlaveIdError` with `{device}` (`:528-529`),
  `config.device.types.*` (`:531-543`), `config.device.modes.*` (`:545-557`)
- `config.common.save` / `config.common.cancel` / `config.common.loadFailed` (`:583` for `loadFailed`)
- `config.backup.*` (`src/locales/en.ts:560-`)

Placeholder interpolation is manual `String.replace` in both places that use it
(`src/components/config/DeviceDialog.vue:132-137`, `:366-369`).

Untranslated hard-coded strings inside the Modbus/instance config path:
`'載入 Driver 列表失敗'` (`src/components/config/DeviceDialog.vue:315`),
`'載入 Instance Config 失敗'` / `'載入 Driver 清單失敗'` / `'儲存失敗'`
(`src/stores/instance_config.ts:110`, `:139`, `:157`, `:160`),
`'載入備份列表失敗'` / `'載入備份內容失敗'` / `'備份還原成功'` / `'備份還原失敗'`
(`src/stores/backup.ts:83`, `:111`, `:124`, `:128`),
`'找不到對應的從站地址'` (`src/views/config/InstanceConfigView.vue:593`).

The project uses **no `vue-i18n` runtime** for these strings despite the dependency being present
(`package.json` `"vue-i18n": "^11.1.12"`): translation is a plain reactive object selected in
`useUIStore` (`src/stores/ui.ts:21-24`, `:36`) and consumed as `t.value.<path>`.

---

## 9. Tests

**Framework and layout**

- Unit: Vitest 3 + `@vue/test-utils` 2, `jsdom` environment, `e2e/**` excluded
  (`vitest.config.ts:8-12`), config merged from `vite.config.ts` (`:5`). Script `npm run test:unit`
  (`package.json`).
- E2E: Playwright (`playwright.config.ts`), script `npm run test:e2e`. The only spec is a
  placeholder asserting `h1` reads `'You did it!'` (`e2e/vue.spec.ts:5-8`), which does not
  correspond to the current `App.vue`.
- Tests live in `__tests__/` directories beside the code under test; TS project
  `tsconfig.vitest.json` includes `src/**/__tests__/*` while `tsconfig.app.json` excludes them.

**Existing unit tests (complete list)**

| File | Lines | Subject |
|---|---|---|
| `src/router/__tests__/index.test.ts` | 13 | `/device/:deviceId` route resolution |
| `src/services/__tests__/mqtt.test.ts` | 37 | MQTT service call paths, incl. `POST /mqtt/restart` (`:33`) |
| `src/stores/__tests__/mqtt.test.ts` | 291 | MQTT store: Orion normalization, registration, restart |
| `src/stores/__tests__/websocket.test.ts` | 383 | dashboard WebSocket reconnect budget, with a `FakeWebSocket` harness (`:11-...`) |
| `src/views/config/__tests__/MqttConfigView.test.ts` | 271 | MQTT view: draft/dirty gating, save, restart confirm |
| `src/views/__tests__/ProvisionView.test.ts` | 804 | provision form validation, save, reboot/reconnect |

**Which of these cover the device config flow or the restart dialog**

`NOT FOUND` for the Modbus flow. There is **no test** for `ModbusConfigView.vue`,
`DeviceDialog.vue`, `src/stores/modbus_config.ts`, or `src/composables/useTalosRestart.ts`.

The nearest analogues, useful as style references:

- `src/views/config/__tests__/MqttConfigView.test.ts` — mounts the view with a hand-rolled store
  double built from `ref()`s (`:16-27`), stubs Element Plus components as minimal
  `defineComponent`s (`:37-...`), hoists `ElMessageBox.confirm` with `vi.hoisted` (`:6`), and
  drives assertions through `flushPromises`.
- `src/views/__tests__/ProvisionView.test.ts` — same shape, but keeps the real `ElForm` /
  `ElFormItem` / `ElInput` plus `async-validator` so validation rules are genuinely exercised
  (`:6-7`), uses a real Pinia (`:4`, `setActivePinia`) and the real locale objects (`:9-10`) to
  assert against translated copy, with a `STUBS` map for the rest (`:38-`).
- `src/stores/__tests__/mqtt.test.ts` — `vi.hoisted` + `vi.mock('element-plus', ...)` to capture
  toasts (`:6-13`), then store actions asserted directly.

**Style conventions observable in the tests**

`vi.hoisted` for anything referenced inside `vi.mock` factories (a fix recorded in commit
`929b256 test(infra): fix vi.mock hoisting under vitest 3`); stub components defined inline as
`defineComponent` rather than string stubs; `flushPromises` after every interaction; assertions
against rendered text rather than internal component state.

---

## 10. Conventions

**Framework and language**

- Vue `^3.5.22`, Vite `^7.1.7`, TypeScript `~5.9.0`, Pinia `^3.0.3`, Vue Router `^4.5.1`,
  Element Plus `^2.11.5` (`package.json`). Node `^20.19.0 || >=22.12.0`.
- **Composition API with `<script setup lang="ts">` throughout.** Every `.vue` file in `src/`
  uses `<script setup lang="ts">`; no Options API components were found.
- Pinia stores are all **setup stores** (`defineStore('id', () => { ... })`) — e.g.
  `src/stores/modbus_config.ts:64`, `src/stores/mqtt.ts:25`, `src/stores/instance_config.ts:53`,
  `src/stores/websocket.ts:29`.
- Path alias `@` → `./src` (`vite.config.ts:9-13`, `tsconfig.app.json`).

**TypeScript strictness**

`tsconfig.app.json` extends `@vue/tsconfig/tsconfig.dom.json` and sets no `strict` flags of its
own. `node_modules/` is not installed in this environment, so the effective `strict` value could
not be read — recorded in `## Unknowns`. Observable in-code signals: `unknown`-typed catch
parameters with explicit narrowing are the dominant style
(`src/stores/modbus_config.ts:52-58`, `:109`, `:127`; `src/composables/useTalosRestart.ts:173`
with the comment `// avoid any`), and non-null assertions appear where index access would
otherwise widen (`src/stores/instance_config.ts:129`, `src/views/config/InstanceConfigView.vue:598`,
`:602`) — consistent with `strict` + `noUncheckedIndexedAccess`. Counter-examples using `any`
persist in `src/components/config/DeviceDialog.vue:374`, `:388`, `:440-443`,
`src/views/config/InstanceConfigView.vue:473`, `src/views/DashboardView.vue:187-188`, `:444`,
and `src/services/device.ts:77`.

**Naming and directory conventions**

- `src/components/` — shared components, PascalCase; `src/components/config/` for config dialogs
  (`BackupDialog.vue`, `DeviceDialog.vue`, `InverterConstraintDialog.vue`, `PinConfigDialog.vue`,
  `PinMappingViewDialog.vue`); `src/components/common/` for chrome (`LanguageSwitcher.vue`,
  `WiFiSelector.vue`); `src/components/layout/AppSidebar.vue` exists but is **not referenced**
  (nor is `src/layouts/MainLayout.vue` — the sidebar is inlined in `src/App.vue:4-158`).
- `src/views/` — route components, PascalCase ending `View.vue`; `src/views/config/` for the
  config routes.
- `src/composables/` — `useXxx.ts` camelCase (`useTalosRestart.ts`, `useWebSocket.ts`,
  `useDashboard.ts`, `useDevice.ts`, `useI18n.ts`).
- `src/stores/` — **snake_case filenames** (`modbus_config.ts`, `instance_config.ts`,
  `system_config.ts`, `pin_mapping.ts`, `config_io.ts`) alongside single-word camelCase ones
  (`device.ts`, `mqtt.ts`, `ui.ts`, `websocket.ts`, `wifi.ts`, `backup.ts`, `data.ts`).
  Store ids do not always match the filename: `modbus_config.ts` exports
  `useConfigStore` with id `'config'` (`src/stores/modbus_config.ts:64`).
- `src/services/` — API clients; `src/utils/`, `src/types/`, `src/locales/` as named.
- Section banner comments (`// ===== Actions =====`) are used consistently in stores and views —
  e.g. `src/stores/modbus_config.ts:48`, `:62`, `:98`; `src/views/config/ModbusConfigView.vue:297`,
  `:337`, `:350`, `:358`, `:432`, `:466`.
- Formatting: Prettier with `semi: false`, `singleQuote: true`, `printWidth: 100`
  (`.prettierrc.json`). ESLint flat config with `pluginVue.configs['flat/essential']` and
  `vueTsConfigs.recommended` (`eslint.config.ts:21-22`).
- README code-style section restates: 2-space indent, single quotes, no semicolons, PascalCase
  components, camelCase composables, UPPER_SNAKE_CASE constants (`README.md:485-493`).

**How errors are surfaced today**

Four mechanisms, mixed:

1. **Element Plus toasts (`ElMessage`)** — the default. Errors:
   `src/stores/modbus_config.ts:112`, `:152`, `:169`, `:187`, `:205`;
   `src/composables/useTalosRestart.ts:127`, `:176`; `src/views/config/ModbusConfigView.vue:378`,
   `:452`. Successes: `src/stores/modbus_config.ts:147`, `:165`, `:183`, `:201`.
2. **Inline `el-alert`** — only for the duplicate-slave-ID case
   (`src/components/config/DeviceDialog.vue:126-139`).
3. **Page banner `el-alert`** — the "config not applied" restart banner
   (`src/views/config/ModbusConfigView.vue:36-56`).
4. **Blocking `ElMessageBox`** — restart confirmations only.

Failures are **loud at the store layer and doubled at the view layer** in the device path: the
store already toasts on failure (`src/stores/modbus_config.ts:186-187`) and then rethrows (`:188`),
and `handleDeviceSubmit` catches and toasts again (`src/views/config/ModbusConfigView.vue:450-453`).

Failures are **silently swallowed** in several places by design, with a comment saying so:

- `src/views/config/ModbusConfigView.vue:417-419`, `:427-429`, `:461-463` — `catch { // handled in store }`
- `src/views/config/ModbusConfigView.vue:401-403` — `handleSaveBus` returns early if `busFormRef` is unset, with no feedback
- `src/components/config/DeviceDialog.vue:401-403` — validation failure only `console.error`s
- `src/composables/useTalosRestart.ts:214` — `confirmRestart`'s `.catch(() => {})`
- `src/views/config/MqttConfigView.vue:178-180`, `:201-203`, `:211-213`, `:218-219`, `:223-225` — bare `catch { return }`

Server error bodies are surfaced when present: `getErrorMessage` reads `err.response.data.detail`
and falls back to a localized string (`src/stores/modbus_config.ts:52-58`, mirrored in
`src/stores/backup.ts:39-47`).

---

## 11. Backend topology

**Base URL and where it is configured**

Three different configurations coexist:

1. **The axios instance** `src/services/api.ts:10-16` uses `baseURL: '/api'` with the comment
   `// Use relative path; automatically resolves to current page host` (`:11`) and a 10 s timeout.
   Used by `src/services/device.ts`, `mqtt.ts`, `parameter.ts`, `provision.ts`, `wifi.ts`, and
   `src/components/ConnectionControl.vue:261`.
2. **Bare `axios` with absolute paths** — the entire config surface bypasses the instance and calls
   `axios.get('/api/config/...')` directly: `src/stores/modbus_config.ts:4`, `:85`;
   `src/stores/instance_config.ts:3`, `:107`; `src/stores/system_config.ts:30`;
   `src/stores/pin_mapping.ts:43`; `src/stores/backup.ts:65`; `src/stores/config_io.ts:26`;
   `src/components/config/DeviceDialog.vue:311`; `src/views/DashboardView.vue:442`; and
   `src/composables/useTalosRestart.ts:71-72`, `:132`, `:163`. These inherit no baseURL, no
   interceptors, and no default timeout.
3. **`ConfigManager`** (`src/utils/config.ts:6-47`) returns the literal `'/api'` from
   `apiBaseUrl` (`:11-13`) and builds WebSocket URLs from `window.location`
   (`:20-29`). Used by `src/utils/api.ts:10`, `:110`.

`.env` declares `VITE_API_URL=http://192.168.6.89:8000/api/` and
`VITE_WS_URL=ws://192.168.6.89:8000` (`.env:1-2`), but grep shows **neither variable is read
anywhere in `src/`** — they are dead configuration. `vite.config.ts:19-25` proxies `/api` (with
`ws: true`) to `http://192.168.6.64:8000` in dev only; note this target differs from the `.env`
host.

**Talos-local or Orion cloud?**

The frontend talks to a **Talos-local API on the gateway**, served same-origin. Evidence:

- All request paths are relative to the page origin (`src/services/api.ts:11`,
  `src/utils/config.ts:11-13`), and WebSocket URLs are derived from `window.location.host`
  (`src/utils/config.ts:22-23`, `src/stores/websocket.ts:116-118`).
- Deployment copies the built bundle into Talos's own static directory:
  `TALOS_STATIC="../talos/static"` … `cp -r dist/* "$TALOS_STATIC/"` (`bin/deploy.sh:8`, `:14`),
  documented identically at `README.md:296-302` and `README.md:330-342`.
- README describes Orpheus Edge as `"Web Frontend Dashboard for the **Talos** System"`
  (`README.md:3`) and lists `Talos Backend (WebSocket Server)` as a requirement (`README.md:30`).
- The restart endpoint's failure copy names a local systemd unit:
  `'... Please restart manually: sudo systemctl restart talos.service'` (`src/locales/en.ts:605-606`).

Orion (the cloud server) is reachable only **indirectly, through the local Talos API**: every
Orion-related call goes to a Talos endpoint —
`POST /api/mqtt/test-orion` (`src/services/mqtt.ts:69-70`) and
`POST /api/mqtt/register-gateway` (`src/services/mqtt.ts:71-72`). The frontend never addresses an
Orion host directly.

**Signs that device config can change from somewhere other than this UI**

Yes, three pieces of evidence, all indirect:

1. `ConfigMetadata.source: string` (`src/stores/modbus_config.ts:11`), rendered as a tag whose
   colour map enumerates the expected writers:
   `const map: Record<string, TagType> = { manual: 'info', edge: 'success', cloud: 'warning' }`
   (`src/views/config/ModbusConfigView.vue:468`). The presence of `'cloud'` implies a cloud writer.
2. `ConfigMetadata.cloud_sync_id: string | null` (`src/stores/modbus_config.ts:16`) — declared,
   never read by any code in this repo.
3. `ConfigMetadata.last_modified_by: string` (`src/stores/modbus_config.ts:13`), displayed at
   `src/views/config/ModbusConfigView.vue:124-126`; this UI always writes the literal `'web-user'`
   (`:413`, `:425`, `:447`, `:458`), so any other value originates elsewhere.

No **mechanism** for receiving such external changes exists in the frontend: no config WebSocket,
no SSE, no polling of config or metadata (see §13). The UI would only notice on the next manual
`fetchConfig()`.

---

## 12. Who decides a restart is needed

For **Modbus device config, this is a purely client-side decision.** The mutation response is
never inspected:

```ts
// src/stores/modbus_config.ts:180-181
const headers = makeHeaders(userEmail)
await axios.post(`${API_BASE}/devices`, device, { headers })
```

The response is discarded — not assigned, not typed, not returned. Then:

```ts
// src/views/config/ModbusConfigView.vue:445-454
const handleDeviceSubmit = async (device: ModbusDevice) => {
  try {
    await configStore.createOrUpdateDevice(device, 'web-user')
    closeDeviceDialog()
    promptRestart()
  } catch (err: unknown) { ... }
}
```

`promptRestart()` fires on any non-throwing outcome. The same holds for
`handleSaveBus` (`:416`), `handleDeleteBus` (`:426`), `handleDeleteDevice` (`:460`),
`handleImport` (`:376`), and `handleBackupRestored` (`:386`).

Elsewhere in the codebase, **server-provided restart/reboot flags do exist** — so the pattern is
available but unused for Modbus:

| Flag | Declared | Set from server | Consumed |
|---|---|---|---|
| `ProvisionSetConfigResult.requires_reboot: boolean` | `src/types/provision.ts:21-26` (full shape: `{ success, requires_reboot, changes: string[], message }`) | `src/services/provision.ts:27` | `src/views/ProvisionView.vue:569-586` — prompts only when true |
| `OrionConnectionResult.restart_required?: boolean` | `src/services/mqtt.ts:55` | `POST /mqtt/test-orion` | **not consumed** — grep finds no reader |
| `RegisterGatewayResult.restart_required?: boolean` | `src/services/mqtt.ts:61` | `POST /mqtt/register-gateway` | `src/stores/mqtt.ts:192-194` → sets `restartRequired.value = true` |
| `mqttStore.restartRequired` (client-side) | `src/stores/mqtt.ts:39` | set unconditionally after any successful save (`src/stores/mqtt.ts:225`), cleared after restart (`:239`) | `src/views/config/MqttConfigView.vue:100` |

**Does any restart signal indicate scope?**

`NOT FOUND` for scope. `RestartApiResp` is only `{ success: boolean; message?: string }`
(`src/composables/useTalosRestart.ts:5`). `ProvisionSetConfigResult.changes: string[]`
(`src/types/provision.ts:24`) is the only field resembling a change list, and it belongs to the
system-provisioning flow, not to Modbus config. Nothing distinguishes whole-agent vs. per-bus vs.
per-device restart anywhere in the frontend.

---

## 13. Concurrency assumptions

**WebSocket / SSE / polling that pushes config or device state into the UI**

- **WebSocket, telemetry only.** `useWebSocketStore` connects to
  `${protocol}//${host}/api/monitoring/subscribe/dashboard` (`src/stores/websocket.ts:116-118`)
  and handles exactly two message kinds: `keepalive` (`:146-155`) and per-device snapshots keyed
  by `device_id` (`:157-168`). Anything else is logged and dropped (`:158-161`). **No config
  messages.** A second, per-device WebSocket path exists for the monitor views
  (`src/composables/useWebSocket.ts:126-152`, `src/utils/api.ts:84-114`) — also telemetry only.
- The dashboard socket is connected/disconnected by route, not globally: `App.vue:246-252` computes
  `needsWebSocket` (true only for `/dashboard`, `/monitor*`, `/device/*`) and `:273-285` opens or
  closes accordingly. On the config routes, **no socket is open at all.**
- **SSE / `EventSource`:** `NOT FOUND` (grep over `src/`).
- **Polling:** no config or metadata polling exists. The only `setInterval`s are
  `src/stores/wifi.ts:264` (Wi-Fi status auto-refresh), `src/components/StatisticsPanel.vue:384`,
  `:391`, `src/components/DataDisplay.vue:195` (UI rate counters),
  `src/services/websocket.ts:163` (WS heartbeat), and `src/composables/useTalosRestart.ts:109`
  (the fake progress bar). `ModbusConfigView` fetches on mount and on explicit user action only
  (`:359`, `:362-364`).

**Optimistic or refetch?**

Refetch, never optimistic. Every mutation awaits the server and then calls `fetchConfig()`
(`src/stores/modbus_config.ts:148`, `:166`, `:185`, `:203`), which replaces `config.value`
wholesale (`:107`). The device list the UI shows is always the server's last response; local state
is never mutated ahead of the server.

**Any handling of "someone else changed this"?**

`NOT FOUND`. No conditional requests, no `If-Match`, no generation/checksum comparison before a
write, no conflict-response handling. `generation` and `checksum` are read (`fetchConfig`) and
displayed (`src/views/config/ModbusConfigView.vue:110-130`) but never compared or sent back.
`fetchMetadata` (`src/stores/modbus_config.ts:120-132`), which would be the natural cheap staleness
probe, is exported (`:238`) but has no call site.

Two request-ordering guards do exist, but they protect against *this client's own* overlapping
requests, not against other writers:

- `src/stores/backup.ts:73`, `:93`, `:100`, `:108`, `:116` — `detailReqSeq` discards stale
  backup-detail responses.
- `src/composables/useTalosRestart.ts:87`, `:121`, `:133`, `:145`, `:228` — `pollingSeq` discards
  stale restart polls.

---

## 14. Operator-visible device state

**On the dashboard** (`src/views/DashboardView.vue` + `src/components/DeviceCard.vue`)

Sourced entirely from the dashboard WebSocket snapshot stream. `DeviceSnapshot` carries
`device_id`, `model`, `slave_id`, `type`, `is_online`, `sampling_datetime`, `values`, `port`
(`src/stores/websocket.ts:6-15`), transformed into `TransformedDevice` (`:17-27`) by
`transformSnapshot` (`:70-94`), which also infers a display unit from the parameter name
(`:54-67`).

Displayed:
- Online/offline tag: `{{ device.is_online ? 'Online' : 'Offline' }}` with `type` success/danger
  (`src/components/DeviceCard.vue:19-21`), plus an `is-offline` card modifier
  (`:6`, styled at `:123`)
- Last sample time: `{{ formatTimestamp(device.timestamp) }}` (`src/components/DeviceCard.vue:43`),
  where `timestamp` is the snapshot's `sampling_datetime` (`src/stores/websocket.ts:91`)
- Aggregates `totalDevices` / `onlineCount` / `offlineCount`, computed from the same snapshots
  (`src/stores/websocket.ts:49-51`), exposed via `useDashboard` (`src/composables/useDashboard.ts:12-14`)
- App-header connection tag for the socket itself, shown only on WS routes
  (`src/App.vue:168-179`)

**Refresh cadence:** push-driven — there is no timer. A device's card updates only when the
backend sends a new snapshot for it, at whatever interval the backend uses. `devices` is a `Map`
that is only ever `set` (`src/stores/websocket.ts:168`) and cleared wholesale on manual disconnect
(`:258`); entries are **never expired**, so a device that stops reporting keeps its last
`is_online` value and last timestamp indefinitely. There is no staleness threshold and no
client-side "last seen N seconds ago" derivation.

The manual Refresh button posts `/api/devices/refresh` (`src/views/DashboardView.vue:442`) behind a
5 s client cooldown (`:429-436`) and tolerates a 404 (`:448-449`).

**Elsewhere**

- REST device state exists but is separate: `DeviceApiResponse` carries
  `connection_status: 'online' | 'offline' | 'unknown'` and `last_seen: string | null`
  (`src/services/device.ts:13-20`); `ConnectivityApiResponse` carries `is_online` and optional
  `last_seen` (`:37-41`). `useDeviceStore` maps `connection_status === 'online'` to a boolean
  `is_online` and **drops `last_seen` entirely** (`src/stores/device.ts:44-51`, `:69-75`).
  `deviceService.checkConnectivity` / `batchCheckConnectivity` (`src/services/device.ts:94-121`)
  are wrapped by the store as `checkDeviceConnectivity` (`src/stores/device.ts:185-200`),
  `batchCheckConnectivity` (`:203-217`) and `refreshAllDeviceStatus` (`:220-223`), and re-exposed
  by `src/composables/useDevice.ts:181-183`, `:235` — but **no view calls any of them**.
  `useDevice` has no importer at all, and the only view using `useDeviceStore`
  (`src/views/ParameterTestingToolView.vue:302`, `:313`) calls only `devices`, `selectedDevice`,
  `loadAllDevices`, `loadDeviceDetails`, `selectDevice`, and `getDeviceParameters`
  (`:319-320`, `:339`, `:351-353`). So REST-based liveness is never actually fetched by the UI.
- **The Modbus config screen shows no liveness at all.** The device table
  (`src/views/config/ModbusConfigView.vue:182-220`) lists display name, model, type, slave ID, bus,
  and purpose — no online/offline, no last-poll time, no comms-error count. Nothing in
  `ModbusConfigView` reads the WebSocket store, and (per §13) no socket is even open on that route.

Comms-error counts: `NOT FOUND` anywhere in the frontend.

---

## 15. Documented intent

There is no `docs/` directory in the repository (this report creates the first file under it) and
no `CLAUDE.md` or contributor guide. Verbatim quotations of everything found that bears on
commissioning or device provisioning:

**README.md — product framing**

> `> Web Frontend Dashboard for the **Talos** System — providing real-time device monitoring, remote control, and data visualization.` (`README.md:3`)

> `- Talos Backend (WebSocket Server)` (`README.md:30`, under *Requirements*)

The README's *User Guide* (`README.md:139-200`) documents only three steps — "1. Connect Device",
"2. Control Device", "3. View Real-Time Data" — where "Connect Device" means selecting an
already-configured device from a dropdown to monitor it (`README.md:155-158`). **The README
documents no device-provisioning or commissioning workflow at all**, and never mentions the Modbus
config screen, adding a device, or restarting Talos.

**Deployment intent** (`README.md:296-302`, mirrored in `bin/deploy.sh:7-14`)

> ```
> echo "Deploying to Talos..."
> TALOS_STATIC="../talos/static"
> ```

**Code comments bearing on the restart flow** — `src/composables/useTalosRestart.ts`, quoted verbatim:

> ```
>   /**
>    * Restart API endpoint.
>    * default: /api/provision/service/restart
>    */
> ```
> (`:31-35`)

> ```
>   /**
>    * Poll API endpoint to check if service is back.
>    * default: /api/provision/config
>    */
> ```
> (`:37-41`)

> ```
>   /**
>    * Fake progress seconds to reach 80%
>    */
> ```
> (`:48-51`)

> ```
>   /**
>    * Start polling delay ms (wait service to go down first)
>    */
> ```
> (`:53-56`)

> ```
>   /**
>    * Call restart API (fire-and-forget), then start countdown + polling
>    */
> ```
> (`:154-156`)

> ```
>   /**
>    * After config update: ask user restart now / later
>    */
> ```
> (`:181-183`)

> ```
>   /**
>    * Manual restart button: confirm then restart
>    */
> ```
> (`:202-204`)

> ```
>   /**
>    * If user closes alert banner
>    */
> ```
> (`:217-219`)

> ```
>   /**
>    * Force close dialog & cancel polling (rarely used, but safe)
>    */
> ```
> (`:224-226`)

> `      if (attempt >= pollMaxAttempts) {` … preceded by `    if (seq !== pollingSeq) return // stale poll` (`:121`)

**Invariant-documenting comments elsewhere** (quoted verbatim, as they establish the codebase's
existing concurrency conventions):

`src/stores/websocket.ts:96-98`:
> ```
>   // Connect to WebSocket. Explicit (external) calls grant a fresh retry
>   // budget; the internal auto-reconnect timer passes resetBudget = false so
>   // its scheduled retries stay bounded by MAX_RECONNECT_ATTEMPTS.
> ```

`src/stores/websocket.ts:126-128`:
> ```
>       // Each callback below belongs to this specific socket. If disconnect()
>       // or a fresh connect() has replaced `ws` by the time a callback fires,
>       // the callback is stale and must not touch shared store state.
> ```

`src/stores/websocket.ts:147-151`:
> ```
>             // The retry counter resets only on a recognized valid message
>             // (keepalive or snapshot), not in onopen and not on arbitrary
>             // frames: a connection that opens, or emits garbage, and then
>             // closes has not proven itself, and resetting for it would
>             // defeat the retry ceiling.
> ```

`src/stores/websocket.ts:186-188`:
> ```
>         // 1013: the backend deliberately refuses the dashboard subscription
>         // (WS_UNAVAILABLE, e.g. API running in standalone mode); 1000 is a
>         // clean close. Neither should trigger a reconnect.
> ```

`src/stores/websocket.ts:207-208`:
> ```
>           // Jitter spreads reconnects out so multiple clients do not retry in
>           // lockstep against a struggling backend.
> ```

`src/stores/websocket.ts:254-255`:
> ```
>     // Teardown state is owned here: the superseded socket's onclose is
>     // ignored by the staleness guard, so it can no longer clear these flags.
> ```

`src/services/api.ts:1-4`:
> ```
> /**
>  * Axios Instance Configuration
>  * Uses relative paths to automatically adapt to the deployment environment
>  */
> ```

`src/utils/config.ts:7-10`:
> ```
>   /**
>    * Get API base URL
>    * Uses a relative path and automatically resolves to the current page host
>    */
> ```

`src/stores/instance_config.ts:148-151`:
> ```
>   /**
>    * Update the full config for a device model.
>    * Replaces all instances under that model.
>    */
> ```

`src/stores/instance_config.ts:167-170`:
> ```
>   /**
>    * Update config for a specific device instance (model + slave_id).
>    * Only updates the target instance, other instances remain unchanged.
>    */
> ```

`src/composables/useI18n.ts:1-5`:
> ```
> /**
>  * i18n Composable (clean)
>  * - `t` is a reactive object (Pinia state)
>  * - use as `t.xxx` everywhere (NO `t.value`)
>  */
> ```

`src/views/config/ModbusConfigView.vue:417-419`, `:427-429`, `:461-463` — the swallow convention:
> ```
>     } catch {
>       // handled in store
>     }
> ```

---

## 16. Falsification

**The premise "every device add triggers a restart prompt" is CONFIRMED for the device-add path,
but it is an incomplete description of the actual behaviour.** Four corrections:

**(a) It is not specific to device add. Ten distinct actions raise the same prompt.**
Across three views: save bus, delete bus, save device, delete device, import config, restore
backup (`ModbusConfigView.vue:376`, `:386`, `:416`, `:426`, `:449`, `:460`); save system config,
import, restore backup (`SystemConfigView.vue:386`, `:408`, `:418`); import, restore backup, save
inverter constraints, save pins (`InstanceConfigView.vue:555`, `:568`, `:661`, `:673`). A fifth
view (`MqttConfigView.vue:206`) has its own separate restart confirm.

**(b) It is not per-*device*; it is per-*mutation*, and it is not debounced.** There is no
batching, coalescing, or debounce anywhere in `useTalosRestart` — `promptRestart()` opens a new
`ElMessageBox` on each call. The only guard is `if (isRestarting.value) return`
(`src/composables/useTalosRestart.ts:185`), which suppresses the prompt **only while a restart is
already in flight**, not while an earlier prompt is merely open and unanswered. Element Plus
`ElMessageBox.confirm` calls are not mutually exclusive, so rapid successive mutations can stack
prompts.

**(c) A partial "batch" escape hatch already exists — via file import, not via the UI.**
`POST /api/config/import/modbus_device` (`src/stores/config_io.ts:26`) replaces the whole Modbus
config from an uploaded `.yml`/`.yaml` (`src/views/config/ModbusConfigView.vue:85-94`, `:371-381`)
and prompts for restart exactly once. The i18n copy acknowledges this framing:
`'Config imported. Please restart the service to apply changes.'` (`src/locales/en.ts:445`).
Backup restore (`src/stores/backup.ts:123`) behaves the same way. Neither is a draft/edit flow —
both are whole-file replacements — but both are single-prompt, multi-device writes today.

**(d) Cancelling the prompt is a supported, already-implemented "defer" path, and it is
lossy.** Pressing "Restart Later" (the Cancel button) sets `showRestartAlert = true` and shows the
`restartReminder` toast (`src/composables/useTalosRestart.ts:194-199`), which raises a persistent
in-page banner titled `'Configuration updated but not yet applied. Please restart Talos service.'`
(`src/locales/en.ts:594`, rendered at `src/views/config/ModbusConfigView.vue:36-56`). Two
consequences visible in the code:

- The `distinguishCancelAndClose: true` option (`useTalosRestart.ts:191`) means closing the dialog
  with the **X** or Escape yields `action === 'close'`, which fails the `if (action === 'cancel')`
  test at `:195` — so **dismissing the dialog rather than pressing "Restart Later" leaves no banner
  and no reminder at all.** The config is saved and un-applied with no persistent UI indication.
- `showRestartAlert` is composable-local `ref` state created per component instance
  (`useTalosRestart.ts:81`). Navigating away from `/config/modbus` unmounts the view, and the
  banner is gone on return. Each of the three views has its own independent instance, so a deferred
  restart raised on the Modbus screen is invisible on the System and Instance screens. There is no
  cross-view or cross-reload record that a restart is pending (no store, no localStorage — see §7).

So the accurate statement is: **every successful config mutation in four different views raises an
un-debounced, per-mutation modal; deferring is possible but records only a per-view, in-memory,
navigation-fragile banner, and only when the user picks the Cancel button specifically.**

---

## Unknowns

Everything below could not be determined from this repository alone.

**Backend behaviour (requires the Talos Python agent source — Scan B territory)**
1. What `POST /api/config/modbus/devices` actually returns. The frontend discards the response
   (`src/stores/modbus_config.ts:181`), so its shape, whether it echoes the new `generation` or
   `checksum`, and whether it carries any restart-required or scope hint, are unknown.
2. Whether the Modbus config write is atomic, and whether it validates cross-device constraints
   server-side (duplicate slave ID, port conflict, register overlap, polling budget).
3. Whether `GET /api/provision/config` (used as the restart liveness probe,
   `src/composables/useTalosRestart.ts:132`) actually becomes unavailable while Talos restarts, and
   whether it becomes available again *before* Modbus polling resumes — i.e. whether "poll
   succeeded" genuinely means "config applied".
4. Whether `POST /api/provision/service/restart` restarts the whole agent, a subset, or something
   else; what `success: false` means; and whether the process is supervised.
5. Whether any reload-without-restart capability exists server-side (SIGHUP, admin endpoint,
   file watcher, per-bus worker recycle). The frontend exposes none.
6. Whether `POST /api/mqtt/restart` (`src/services/mqtt.ts:68`) restarts the same process as
   `POST /api/provision/service/restart`, or only an MQTT subsystem.
7. Whether `POST /api/devices/refresh` (`src/views/DashboardView.vue:442`) is implemented at all —
   the code explicitly handles a 404 as "not implemented yet" (`:448-449`).
8. Semantics of `ConfigMetadata.generation`, `checksum`, `applied_at`, `cloud_sync_id` — in
   particular whether `applied_at` distinguishes "saved" from "running", which would be directly
   relevant to a three-state model. The frontend declares these fields
   (`src/stores/modbus_config.ts:9-17`) but reads only the first five.
9. Whether the server enforces optimistic concurrency at all (rejecting a stale write). No client
   sends a version, so this is untestable from here.
10. What values `ConfigMetadata.source` can take beyond `'manual' | 'edge' | 'cloud'`, which are
    inferred from a colour map (`src/views/config/ModbusConfigView.vue:468`), not from a type.
11. Whether any push channel for config change notifications exists server-side. The dashboard
    WebSocket handles only `keepalive` and device snapshots
    (`src/stores/websocket.ts:146-168`); whether the backend emits other frame types on that
    socket cannot be determined from the client.
12. Whether a health/readiness endpoint exists at all. The frontend uses a config GET as a proxy;
    no `/health`, `/ready`, or `/status` endpoint for the agent as a whole is referenced.
13. Whether `X-User-Email` is honoured, validated, or authorized server-side, and whether any
    authentication or role system exists. The frontend sends the literal `'web-user'`
    (`src/views/config/ModbusConfigView.vue:413`, `:425`, `:447`, `:458`) and its axios instance
    has all auth code commented out (`src/services/api.ts:21-25`).
14. Whether `POST /api/config/import/{configType}` validates the uploaded YAML before writing, and
    what happens on partial validity.
15. Whether restarting Talos loses in-memory state (accumulators, alarm latches, MQTT queues) —
    the decisive question for whether an "applied" transition can ever be automated. Nothing in
    the frontend speaks to this. **This is Scan B's subject.**

**Environment / tooling**
16. Effective TypeScript strictness. `tsconfig.app.json` extends `@vue/tsconfig/tsconfig.dom.json`
    and sets no `strict` flags itself; `node_modules/` is not installed in this environment, so the
    inherited settings could not be read.
17. Whether `npm run test:coverage` exists — `README.md:507` documents it, but `package.json` has
    no such script.
18. Which backend host the production build actually talks to. `.env` names
    `http://192.168.6.89:8000/api/` (`.env:1`) but is never read; `vite.config.ts:21` proxies to
    `http://192.168.6.64:8000` in dev only; production resolves `/api` against whatever origin
    serves the bundle.

**Product / operational**
19. Whether operators today use the YAML export/import round-trip
    (`src/stores/config_io.ts:9-35`) as the de-facto batch-commissioning path. The code supports
    it and the copy hints at it, but there is no usage evidence in the repository.
20. Whether the un-referenced `src/layouts/MainLayout.vue`, `src/components/layout/AppSidebar.vue`,
    `src/utils/storage.ts`, `src/utils/validator.ts`, and `useConfigStore.fetchMetadata` are
    intentional groundwork or abandoned code.
