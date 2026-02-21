import { ref } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'
import { ElMessage } from 'element-plus'

export type ConfigType = 'modbus_device' | 'system_config'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type JsonObject = { [key: string]: Json }

export interface BackupInfo {
  filename: string
  generation: number | null
  created_at: string
  size_bytes: number
}

export interface BackupDetail {
  filename: string
  metadata: JsonObject
  content: JsonObject
}

type BackupDetailResponse = {
  status: string
  filename: string
  metadata: JsonObject
  content: JsonObject
}

type BackupListResponse = {
  backups: BackupInfo[]
  total: number
}

/** 後端常見錯誤格式：{ detail: string } */
type ApiErrorBody = {
  detail?: string
}

const getErrorMessage = (err: unknown, fallback: string): string => {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiErrorBody | undefined
    if (data?.detail && typeof data.detail === 'string') return data.detail
    return fallback
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

const normalizeError = (err: unknown, fallback: string): Error => {
  const msg = getErrorMessage(err, fallback)
  return err instanceof Error ? err : new Error(msg)
}

export const useBackupStore = defineStore('backup', () => {
  const backups = ref<BackupInfo[]>([])
  const total = ref(0)
  const currentDetail = ref<BackupDetail | null>(null)

  const isLoading = ref(false)
  const isLoadingDetail = ref(false)

  const backupsUrl = (t: ConfigType) => `/api/config/backups/${t}`
  const backupDetailUrl = (t: ConfigType, f: string) => `${backupsUrl(t)}/${encodeURIComponent(f)}`
  const restoreUrl = (t: ConfigType, f: string) => `${backupDetailUrl(t, f)}/restore`

  let detailReqSeq = 0

  const fetchBackups = async (configType: ConfigType) => {
    isLoading.value = true
    try {
      const resp = await axios.get<BackupListResponse>(backupsUrl(configType))
      backups.value = resp.data.backups
      total.value = resp.data.total
    } catch (err: unknown) {
      console.error(`Failed to fetch backups for ${configType}:`, err)
      const msg = getErrorMessage(err, '載入備份列表失敗')
      ElMessage.error(msg)
      throw normalizeError(err, msg)
    } finally {
      isLoading.value = false
    }
  }

  const fetchBackupDetail = async (configType: ConfigType, filename: string) => {
    isLoadingDetail.value = true
    const seq = ++detailReqSeq

    try {
      const resp = await axios.get<BackupDetailResponse>(backupDetailUrl(configType, filename))

      // ignore stale response
      if (seq !== detailReqSeq) return

      currentDetail.value = {
        filename: resp.data.filename,
        metadata: resp.data.metadata,
        content: resp.data.content,
      }
    } catch (err: unknown) {
      if (seq !== detailReqSeq) return

      console.error('Failed to fetch backup detail:', err)
      const msg = getErrorMessage(err, '載入備份內容失敗')
      ElMessage.error(msg)
      currentDetail.value = null
      throw normalizeError(err, msg)
    } finally {
      if (seq === detailReqSeq) isLoadingDetail.value = false
    }
  }

  const restoreBackup = async (configType: ConfigType, filename: string) => {
    isLoading.value = true
    try {
      await axios.post(restoreUrl(configType, filename))
      ElMessage.success('備份還原成功')
      await fetchBackups(configType)
    } catch (err: unknown) {
      console.error('Failed to restore backup:', err)
      const msg = getErrorMessage(err, '備份還原失敗')
      ElMessage.error(msg)
      throw normalizeError(err, msg)
    } finally {
      isLoading.value = false
    }
  }

  const clearDetail = () => {
    currentDetail.value = null
  }

  return {
    backups,
    total,
    currentDetail,
    isLoading,
    isLoadingDetail,
    fetchBackups,
    fetchBackupDetail,
    restoreBackup,
    clearDetail,
  }
})
