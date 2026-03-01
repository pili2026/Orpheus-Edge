<template>
  <div class="device-config-page">
    <el-alert
      v-if="route.query.reason === 'no-devices'"
      title="請先完成設備配置"
      type="warning"
      description="Control Config 和 Alert Config 需要至少一個已配置的 Modbus 設備才能使用。"
      :closable="false"
      show-icon
      class="redirect-alert"
    />

    <el-card>
      <template #header>
        <div class="card-header">
          <el-icon><Cpu /></el-icon>
          <span>設備配置</span>
          <el-button
            type="primary"
            :icon="Plus"
            @click="showAddDialog = true"
            class="ml-auto"
          >新增設備</el-button>
        </div>
      </template>

      <el-table
        v-loading="store.loading"
        :data="store.devices"
        empty-text="尚未配置任何設備"
        stripe
      >
        <el-table-column label="Model" prop="model" min-width="160" />
        <el-table-column label="Slave ID" prop="slave_id" width="100" align="center" />
        <el-table-column label="類型" prop="type" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.type" size="small">{{ row.type }}</el-tag>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row }">
            <el-popconfirm
              title="確認刪除此設備？"
              confirm-button-text="刪除"
              cancel-button-text="取消"
              @confirm="removeDevice(row.model, row.slave_id)"
            >
              <template #reference>
                <el-button type="danger" size="small" :icon="Delete" link />
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Add Device Dialog -->
    <el-dialog v-model="showAddDialog" title="新增設備" width="480px" @closed="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="Model" prop="model">
          <el-input v-model="form.model" placeholder="例如：teco_inverter" />
        </el-form-item>
        <el-form-item label="Slave ID" prop="slave_id">
          <el-input-number v-model="form.slave_id" :min="1" :max="247" style="width: 100%" />
        </el-form-item>
        <el-form-item label="類型" prop="type">
          <el-input v-model="form.type" placeholder="例如：inverter（選填）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitAdd">確認新增</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Cpu, Plus, Delete } from '@element-plus/icons-vue'
import { useConfigDeviceStore } from '@/stores/configDevice'

const route = useRoute()
const store = useConfigDeviceStore()

const showAddDialog = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  model: '',
  slave_id: 1,
  type: '',
})

const rules: FormRules = {
  model: [{ required: true, message: '請輸入設備 Model', trigger: 'blur' }],
  slave_id: [{ required: true, message: '請輸入 Slave ID', trigger: 'blur' }],
}

async function submitAdd() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    saving.value = true
    try {
      store.addDevice({
        model: form.model,
        slave_id: form.slave_id,
        type: form.type || undefined,
      })
      ElMessage.success('設備已新增')
      showAddDialog.value = false
    } catch (err: unknown) {
      ElMessage.error((err as { message?: string })?.message ?? '新增失敗')
    } finally {
      saving.value = false
    }
  })
}

function removeDevice(model: string, slaveId: number) {
  store.removeDevice(model, slaveId)
  ElMessage.success('設備已刪除')
}

function resetForm() {
  formRef.value?.resetFields()
  form.model = ''
  form.slave_id = 1
  form.type = ''
}
</script>

<style scoped>
.device-config-page {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.ml-auto {
  margin-left: auto;
}

.text-muted {
  color: #909399;
}

.redirect-alert {
  margin-bottom: 0;
}
</style>
