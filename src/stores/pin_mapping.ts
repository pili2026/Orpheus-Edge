import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

export interface PinMappingModelInfo {
  model: string
  has_override: boolean
  source: 'override' | 'template'
}

export interface PinEntry {
  name?: string
  formula?: number[]
  type?: string
  unit?: string
  precision?: number
  remark?: string
}

export interface PinMappingConfig {
  driver_model: string
  mapping_name: string
  description?: string
  pin_mappings: Record<string, PinEntry>
  metadata?: {
    generation: number
    checksum?: string
    last_modified?: string
  }
}

export const usePinMappingStore = defineStore('pinMapping', () => {
  const models = ref<PinMappingModelInfo[]>([])
  const currentConfig = ref<PinMappingConfig | null>(null)
  const currentModel = ref<string | null>(null)
  const currentSource = ref<'override' | 'template' | null>(null)
  const isLoading = ref(false)
  const isSaving = ref(false)

  const fetchModels = async () => {
    isLoading.value = true
    try {
      const { data } = await axios.get('/api/config/pin_mapping')
      models.value = data.models
    } finally {
      isLoading.value = false
    }
  }

  const fetchPinMapping = async (model: string) => {
    isLoading.value = true
    try {
      const { data } = await axios.get(`/api/config/pin_mapping/${model}`)
      currentConfig.value = data.config
      currentModel.value = model
      currentSource.value = data.source
    } finally {
      isLoading.value = false
    }
  }

  const fetchTemplate = async (model: string) => {
    isLoading.value = true
    try {
      const { data } = await axios.get(`/api/config/pin_mapping/${model}/template`)
      return data.config as PinMappingConfig
    } finally {
      isLoading.value = false
    }
  }

  return {
    models,
    currentConfig,
    currentModel,
    currentSource,
    isLoading,
    isSaving,
    fetchModels,
    fetchPinMapping,
    fetchTemplate,
  }
})
