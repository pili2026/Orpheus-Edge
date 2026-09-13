import { ElMessage } from 'element-plus'
import { useI18n } from '@/composables/useI18n'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Dotted paths at which `stored` differs from `baseline`. Plain objects are
 * walked key by key; anything else is compared by value.
 */
export const changedFields = (baseline: unknown, stored: unknown, prefix = ''): string[] => {
  if (isRecord(baseline) && isRecord(stored)) {
    const keys = [...new Set([...Object.keys(baseline), ...Object.keys(stored)])]
    return keys.flatMap((key) =>
      changedFields(baseline[key], stored[key], prefix ? `${prefix}.${key}` : key),
    )
  }
  return JSON.stringify(baseline) === JSON.stringify(stored) ? [] : [prefix]
}

/**
 * The save-time check every config form runs before it writes.
 *
 * These forms save whole documents: the MQTT draft, the System form and the
 * Provision form each send every field they own, edited or not. The dirty
 * guard keeps such a form intact when a refetch finds that the stored
 * configuration changed underneath it, which is right for the operator's
 * edits but means the untouched fields still hold the values loaded before
 * the change. Saving then writes those stale values back and silently
 * reverts whatever the other writer -- an Orion cloud push, an import,
 * another operator -- had stored. Losing another writer's configuration
 * silently is never the conservative side, so the save is refused instead
 * and the operator is told which fields moved.
 *
 * The check runs at save time, not at refresh time: a flag raised during a
 * refresh would miss a change that lands after that refresh and before the
 * save. Re-reading immediately before the write is the latest point the
 * client can look.
 *
 * This narrows the race; it does not close it. A writer can still land
 * between this read and the write that follows, and the client cannot see
 * that happen. Closing the window needs a server-side precondition -- an
 * If-Match, an expected generation or checksum -- and the config API offers
 * none (Talos repository, docs/scan/talos-config-restart-cost.md, section
 * 10), so nothing here pretends otherwise.
 */
export const useStoredConfigCheck = () => {
  const { t } = useI18n()

  /**
   * Re-read what is stored and compare it with the baseline this form was
   * loaded against -- never with the draft. Resolves true when the save may
   * proceed. On any difference, and when the read itself fails, the refusal
   * is shown and false is returned; nothing is written either way.
   *
   * `labels` maps a changed field's dotted path to the label the form shows
   * for it; a field without one is named by its path.
   */
  const storedStillMatches = async <T>(
    read: () => Promise<T>,
    baseline: T,
    labels: Record<string, string> = {},
  ): Promise<boolean> => {
    let stored: T
    try {
      stored = await read()
    } catch (err: unknown) {
      console.error('Failed to re-read the stored configuration before saving:', err)
      ElMessage.error({ message: t.value.common.saveRefusedCheckFailed, duration: 6000 })
      return false
    }

    const changed = changedFields(baseline, stored)
    if (changed.length === 0) return true

    const fields = changed.map((field) => labels[field] ?? field).join(', ')
    ElMessage.error({
      message: t.value.common.saveRefusedStoredChanged.replace('{fields}', fields),
      duration: 6000,
    })
    return false
  }

  return { storedStillMatches }
}
