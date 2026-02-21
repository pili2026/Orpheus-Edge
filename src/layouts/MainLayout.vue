<template>
  <div class="main-layout">
    <AppSidebar />

    <div class="content-area">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import AppSidebar from '@/components/layout/AppSidebar.vue'
</script>

<style scoped>
.main-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  background: #f3f4f6;
}
</style>
