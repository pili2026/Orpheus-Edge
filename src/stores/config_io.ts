import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type { ConfigType } from '@/types/config'

export const useConfigIOStore = defineStore('configIO', () => {
  const isImporting = ref(false)

  const exportConfig = (configType: ConfigType, model?: string) => {
    const params = model ? `?model=${model}` : ''
    const link = document.createElement('a')
    link.href = `/api/config/export/${configType}${params}`
    link.click()
  }

  const importConfig = async (
    configType: ConfigType,
    file: File,
    model?: string,
  ): Promise<void> => {
    isImporting.value = true
    try {
      const params = model ? `?model=${model}` : ''
      const formData = new FormData()
      formData.append('file', file)
      await axios.post(`/api/config/import/${configType}${params}`, formData, {
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
