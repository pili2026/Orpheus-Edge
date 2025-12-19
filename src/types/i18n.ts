/**
 * i18n 類型定義
 * 定義所有多語言相關的類型
 */

export type Locale = 'zh-TW' | 'en'

export interface I18nMessages {
  common: {
    confirm: string
    cancel: string
    save: string
    delete: string
    edit: string
    close: string
    refresh: string
    search: string
    loading: string
    success: string
    error: string
    warning: string
    info: string
    yes: string
    no: string
    ok: string
    back: string
    next: string
    submit: string
    reset: string
    clear: string
    export: string
    import: string
    download: string
    upload: string
    selectAll: string
    clearAll: string
    invert: string
  }

  connection: {
    title: string
    deviceId: string
    deviceIdPlaceholder: string
    interval: string
    intervalUnit: string
    autoReconnect: string
    parameters: string
    parametersPlaceholder: string
    connect: string
    disconnect: string
    reconnect: string
    status: string
    connectionTime: string
    messagesReceived: string
    connecting: string
    connected: string
    disconnected: string
    connectionSuccess: string
    connectionFailed: string
    disconnectSuccess: string
    deviceConstraints: string
    min: string
    max: string
    noConstraints: string
  }

  dataDisplay: {
    title: string
    lastUpdate: string
    noData: string
    connectDeviceHint: string
    parameterCount: string
    updateRate: string
    updateRateUnit: string
    dataFreshness: string
    fresh: string
    stale: string
    expired: string
    on: string
    off: string
    normal: string
    rising: string
    falling: string
    stable: string
  }

  deviceControl: {
    title: string
    noDevice: string
    connectHint: string
    digitalOutput: string
    analogOutput: string
    customParameter: string
    quickActions: string
    parameterName: string
    parameterPlaceholder: string
    writeValue: string
    forceWrite: string
    forceWriteHint: string
    write: string
    allOn: string
    allOff: string
    resetAll: string
    operationHistory: string
    noHistory: string
    writeSuccess: string
    writeFailed: string
    readOnlyDevice: string
    readOnlyDeviceHint: string
    inverterControl: string
    frequency: string
    setFrequency: string
    runControl: string
    start: string
    stop: string
    reset: string
    resetInverter: string
    power: string
    voltage: string
    current: string
    status: string
  }

  deviceSelector: {
    title: string
    reload: string
    loading: string
    loadFailed: string
    retry: string
    noDevices: string
    select: string
    selected: string
    deviceId: string
    model: string
    port: string
    slaveAddress: string
    description: string
    selectedDevice: string
    loadSuccess: string
  }

  logViewer: {
    title: string
    export: string
    clear: string
    logType: string
    all: string
    debug: string
    info: string
    success: string
    warn: string
    error: string
    searchPlaceholder: string
    autoScroll: string
    totalLogs: string
    logsUnit: string
    noLogs: string
    details: string
    exportPromptTitle: string
    exportPromptMessage: string
    exportPromptPlaceholder: string
    exportSuccess: string
    clearConfirmTitle: string
    clearConfirmMessage: string
    clearSuccess: string
  }

  parameterSelector: {
    title: string
    selected: string
    selectedUnit: string
    selectAll: string
    clear: string
    digitalParameters: string
    analogParameters: string
    invert: string
    searchPlaceholder: string
    allParameters: string
    digitalCount: string
    analogCount: string
    parametersUnit: string
  }

  logExporter: {
    title: string
    exportFormat: string
    json: string
    csv: string
    txt: string
    timeRange: string
    all: string
    last1hour: string
    last6hours: string
    last24hours: string
    custom: string
    startTime: string
    endTime: string
    includeDetails: string
    export: string
    exportSuccess: string
    exportFailed: string
    invalidTimeRange: string
  }

  wifi: {
    title: string
    noNetworks: string
    scanFailed: string
    connectTo: string
    password: string
    passwordPlaceholder: string
    connect: string
    connectSuccess: string
    connectFailed: string
  }

  dashboard: {
    title: string
    totalDevices: string
    onlineDevices: string
    offlineDevices: string
    online: string
    offline: string
    noDevices: string
    filterByStatus: string
    showing: string
  }
  nav: {
    deviceMonitoring: string
    parameterTesting: string
    debugTools: string
    connected: string
    disconnected: string
  }

  parameterTool: {
    title: string
    subtitle: string
    refresh: string
    deviceSelection: string
    selectDevice: string
    selectDeviceFirst: string
    online: string
    offline: string
    devicesLoaded: string
    loadDevicesFailed: string
    deviceSelected: string
    loadDeviceDetailsFailed: string
    readSingle: string
    selectParameter: string
    read: string
    readSuccess: string
    readFailed: string
    readError: string
    readMultiple: string
    selectParameters: string
    readResults: string
    partialSuccess: string
    write: string
    enterValue: string
    forceWrite: string
    forceWriteTooltip: string
    writeSuccess: string
    writeError: string
    parameter: string
    previousValue: string
    newValue: string
    forcedWrite: string
  }
}
