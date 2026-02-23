import { ref } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import type { ConfigType } from '@/types/config'

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

const buildQuery = (model?: string) => (model ? `?model=${encodeURIComponent(model)}` : '')

export const useBackupStore = defineStore('backup', () => {
  const backups = ref<BackupInfo[]>([])
  const total = ref(0)
  const currentDetail = ref<BackupDetail | null>(null)

  const isLoading = ref(false)
  const isLoadingDetail = ref(false)

  const backupsUrl = (t: ConfigType, model?: string) =>
    `/api/config/backups/${t}${buildQuery(model)}`

  const backupDetailUrl = (t: ConfigType, f: string, model?: string) =>
    `/api/config/backups/${t}/${encodeURIComponent(f)}${buildQuery(model)}`

  const restoreUrl = (t: ConfigType, f: string, model?: string) =>
    `/api/config/backups/${t}/${encodeURIComponent(f)}/restore${buildQuery(model)}`

  let detailReqSeq = 0

  const fetchBackups = async (configType: ConfigType, model?: string) => {
    isLoading.value = true
    try {
      const resp = await axios.get<BackupListResponse>(backupsUrl(configType, model))
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

  const fetchBackupDetail = async (configType: ConfigType, filename: string, model?: string) => {
    isLoadingDetail.value = true
    const seq = ++detailReqSeq

    try {
      const resp = await axios.get<BackupDetailResponse>(
        backupDetailUrl(configType, filename, model),
      )

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

  const restoreBackup = async (configType: ConfigType, filename: string, model?: string) => {
    isLoading.value = true
    try {
      await axios.post(restoreUrl(configType, filename, model))
      ElMessage.success('備份還原成功')
      await fetchBackups(configType, model)
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
