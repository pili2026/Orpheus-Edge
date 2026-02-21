import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type { ConfigType } from '@/stores/backup'

export const useConfigIOStore = defineStore('configIO', () => {
  const isImporting = ref(false)

  const exportConfig = (configType: ConfigType) => {
    // Download file via creating and clicking a temporary link
    const link = document.createElement('a')
    link.href = `/api/config/export/${configType}`
    link.click()
  }

  const importConfig = async (configType: ConfigType, file: File): Promise<void> => {
    isImporting.value = true
    try {
      const formData = new FormData()
      formData.append('file', file)
      await axios.post(`/api/config/import/${configType}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    } catch (error) {
      console.error('Import failed:', error)
      throw error
    } finally {
      isImporting.value = false
    }
  }

  return { isImporting, exportConfig, importConfig }
})
