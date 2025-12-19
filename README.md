# Orpheus-edge

> Web Frontend Dashboard for the **Talos** System — providing real-time device monitoring, remote control, and data visualization.

[![Vue 3](https://img.shields.io/badge/Vue-3.5+-4FC08D?logo=vue.js)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Element Plus](https://img.shields.io/badge/Element_Plus-2.9+-409EFF)](https://element-plus.org/)
[![Vite](https://img.shields.io/badge/Vite-7.1+-646CFF?logo=vite)](https://vitejs.dev/)

---

## Features

- **Real-Time Connection** — Live data streaming via WebSocket
- **Data Visualization** — Grid-style display for all device parameters
- **Remote Control** — Digital Output (DOut) switching via web interface
- **Trend Analysis** — Automatically tracks parameter trends
- **Operation Log** — Complete history of all operations and events
- **Multilingual Support** — Traditional Chinese / English
- **Responsive Design** — Optimized for all screen sizes

---

## Quick Start

### Requirements

- Node.js 120+
- npm 9+
- Talos Backend (WebSocket Server)

### Installation

#### Node.js and Npm

1. Add Node.js 22.ver repo

```
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
```

2. Install Node.js 22

```
sudo apt install -y nodejs
```

3. Check Version

```
node -v
npm -v
```

#### Orpheus

```bash
# Clone the project
git clone <repository-url>
cd orpheus-edge

# Install dependencies
npm install
```

### Development Mode

```bash
# Start development server with hot reload
npm run dev

# Open browser
# → http://localhost:5173
```

### Production Build

```bash
# TypeScript type check + Vite build
npm run build

# Output files are generated in dist/
```

---

## 📦 Project Structure

```
orpheus-edge/
├── src/
│   ├── components/                 # Vue components
│   │   ├── ConnectionControl.vue   # Connection control
│   │   ├── DeviceControl.vue       # Device control
│   │   └── DataDisplay.vue         # Data display
│   ├── composables/                # Composable functions
│   │   └── useWebSocket.ts         # WebSocket singleton
│   ├── stores/                     # Pinia state management
│   │   └── data.ts                 # Data store
│   ├── utils/                      # Utility functions
│   ├── i18n/                       # Internationalization
│   ├── types/                      # TypeScript type definitions
│   ├── views/                      # Page components
│   ├── App.vue
│   └── main.ts
├── public/                         # Static assets
├── dist/                           # Build output
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Core Technologies

### Frontend Framework

- **Vue 3.5+** — Progressive JavaScript Framework
- **TypeScript 5.6+** — Type-safe JavaScript
- **Vite 7.1+** — Next-generation build tool

### UI Framework

- **Element Plus 2.9+** — Vue 3 component library
- **@element-plus/icons-vue** — Icon set

### State Management

- **Pinia 2.3+** — Official Vue state management library

### Communication Protocol

- **WebSocket** — Full-duplex real-time communication

---

## User Guide

### 1. Connect Device

```
┌─────────────────────────────────────┐
│ 🔌 Connection Control   [Connected] │
├─────────────────────────────────────┤
│ Device ID:  [Select Device ▼]       │
│ Polling Interval: 10.0 sec          │
│ Auto Reconnect: ☑                   │
│                                     │
│ [Connect]  [Disconnect]  [Reconnect]│
└─────────────────────────────────────┘
```

1. Click the **Device ID** dropdown
2. Select the device to monitor (e.g. `IMA_C_5`)
3. Set polling interval (recommended: 5–10s)
4. Click **Connect**

### 2. Control Device

```
┌──────────────────────────────────┐
│ Device Control                │
├──────────────────────────────────┤
│ Digital Output (DOut)            │
│ ┌─────────┐  ┌─────────┐         │
│ │ DOut01  │  │ DOut02  │         │
│ │ 🔘 ON   │  │ 🔘 OFF  │         │
│ └─────────┘  └─────────┘         │
│                                  │
│ Analog Input (AIn)               │
│ ┌─────────┐  ┌─────────┐         │
│ │ AIn01   │  │ AIn02   │         │
│ │ 12.34 V │  │ 56.78 V │         │
│ └─────────┘  └─────────┘         │
└──────────────────────────────────┘
```

- **DOut (Digital Output)**: Click the button to toggle ON/OFF
- **AIn (Analog Input)**: Display-only

### 3. View Real-Time Data

```
┌───────────────────────────────────────────┐
│ Real-Time Data  Last Updated: 11:48:47 │
├───────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐                │
│ │DOut01│ │DIn02 │ │AIn01 │                │
│ │  0   │ │  1   │ │12.34 │                │
│ │ OFF  │ │ ON   │ │12.34 │                │
│ │↔Stable│ │↑Up  │ │↓Down│                 │
│ └──────┘ └──────┘ └──────┘                │
└───────────────────────────────────────────┘
```

- **Live Updates**: Data auto-refreshes based on polling interval
- **Trend Indicators**: ↑ Increasing / ↓ Decreasing / ↔ Stable
- **Freshness**: Marks whether the data is stale

---

## WebSocket API

### Connection URLs

```
Single-device mode:
ws://host/api/monitoring/device/{device_id}?interval=10&parameters=DIn01,DOut01

Multi-device mode:
ws://host/api/monitoring/devices?device_ids=IMA_C_5,SD400_3&interval=10
```

### Message Formats

#### Incoming Messages

**Connection Confirmation**

```json
{
  "type": "connected",
  "device_id": "IMA_C_5",
  "parameters": ["DIn01", "DOut01", "AIn01"],
  "interval": 10
}
```

**Device Data**

```json
{
  "type": "data",
  "device_id": "IMA_C_5",
  "timestamp": "2025-10-28T00:47:20.015Z",
  "data": {
    "DIn01": { "value": 0, "unit": null },
    "DOut01": { "value": 1, "unit": null },
    "AIn01": { "value": 12.34, "unit": "V" }
  }
}
```

**Write Result**

```json
{
  "type": "write_result",
  "device_id": "IMA_C_5",
  "parameter": "DOut01",
  "value": 1,
  "success": true,
  "message": "Successfully written"
}
```

#### Outgoing Messages

**Write Parameter**

```json
{
  "action": "write",
  "parameter": "DOut01",
  "value": 1,
  "force": false
}
```

**Heartbeat**

```json
{
  "action": "ping"
}
```

---

## Deploy to Talos

### Automatic Deployment Script

Create `deploy.sh`:

```bash
#!/bin/bash
set -e

echo "Building Orpheus-edge..."
npm run build

echo "Deploying to Talos..."
TALOS_STATIC="../talos/static"

# Clear old files
find "$TALOS_STATIC" -mindepth 1 ! -name '.gitkeep' -delete

# Copy new build
cp -r dist/* "$TALOS_STATIC/"

echo "Deployment completed!"
```

Run deployment:

```bash
chmod +x deploy.sh
./deploy.sh
```

### Manual Deployment

```bash
# (Option) Clear Cache
rm -rf node_modules/.vite

# 1. Build project
npm run build

# 2. Copy files to Talos
cp -r dist/* ../talos/static/

# 3. Verify deployment
ls -la ../talos/static/
```

### Talos Directory Structure

```
talos/
│ └── static/          # ← Orpheus-edge build output
│       ├── index.html
│       └── assets/
│            ├── index-[hash].js
│            ├── index-[hash].css
│            └── ...
├── requirements.txt
└── ...
```

---

## Troubleshooting

### Q1: Build Error - Property 'values' does not exist

**Error Message:**

```
Property 'values' does not exist on type 'DeviceData'
```

**Solution:**
The correct property is `data`, not `values`.

```typescript
// Wrong
currentData.value?.values

// Correct
currentData.value?.data
```

---

### Q2: Data Not Displaying

**Symptoms:**

- Console shows data being received
- UI shows “No data available”

**Checklist:**

1. Verify the correct data source:

```typescript
// Correct: from composable
import { useWebSocket } from '@/composables/useWebSocket'
const { connectionConfig } = useWebSocket()

// Wrong: from non-existent store
import { useWebSocketStore } from '@/stores/websocket'
```

2. Run diagnostics in console:

```javascript
const stores = window.$nuxt?.$pinia?.state.value || {}
console.log('connectionConfig:', stores.websocket?.connectionConfig)
console.log('latestData:', stores.data?.latestData)
```

---

### Q3: WebSocket Connection Failed

**Possible Causes:**

- Talos backend not running
- Incorrect WebSocket URL
- Firewall blocking connection

**Fix:**

1. Ensure Talos backend is running
2. Check browser console for errors
3. Verify WebSocket host and port

---

### Q4: Control Toggle Not Working

**Possible Causes:**

- WebSocket disconnected
- Device not writable
- Parameter name incorrect

**Fix:**

1. Ensure connection (green “Connected” label)
2. Inspect write response in console
3. Check log panel for error messages

---

## Developer Guide

### Create a New Component

```bash
# Create new component
touch src/components/NewComponent.vue
```

```vue
<template>
  <div class="new-component">
    <h1>{{ title }}</h1>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  title: string
}

const props = defineProps<Props>()
</script>

<style scoped>
.new-component {
  padding: 20px;
}
</style>
```

### Create a New Store

```typescript
// src/stores/newStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useNewStore = defineStore('newStore', () => {
  const data = ref<string[]>([])

  const addData = (item: string) => {
    data.value.push(item)
  }

  return {
    data,
    addData,
  }
})
```

### Code Style

- **Indentation**: 2 spaces
- **Quotes**: Single quotes `'`
- **Semicolons**: Omit `;`
- **Naming Rules**:
  - Components: PascalCase (`MyComponent.vue`)
  - Composables: camelCase (`useMyComposable`)
  - Constants: UPPER_SNAKE_CASE (`MAX_ITEMS`)

---

## Testing

```bash
# Unit tests
npm run test:unit

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

---

## Performance Monitoring

### Developer Tools

- **Vue DevTools** — Inspect components & state
- **Chrome Performance** — Analyze runtime performance
- **Lighthouse** — Audit website quality

### Metrics

- **First Contentful Paint (FCP)**: < 1.5s
- **Largest Contentful Paint (LCP)**: < 2.5s
- **First Input Delay (FID)**: < 100ms
- **Cumulative Layout Shift (CLS)**: < 0.1

---
