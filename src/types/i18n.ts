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
    rebootNow: string
    later: string
    scan: string
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

  debugNetwork: {
    title: string
    subtitle: string
    interface: string
    interfaceHealth: string
    wifiLinkStatus: string
    ipDhcp: string
    diagnosis: string
    nextSteps: string
    availableNetworks: string
    total: string
    currentSsid: string
    scanError: string
    connect: string
    connectResult: string
    noConnectResult: string
    selectNetworkHint: string
    saveConfig: string
    advanced: string
    autoRefresh: string
    noInterface: string
    noStatus: string
    pollPolling: string
    pollConnected: string
    pollConnectedNoIp: string
    pollTimeout: string
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
    singleDeviceMonitor: string
    wifiInfo: string
    connected: string
    disconnected: string
    provision: string
    configuration: string
    monitoringGroup: string
    toolsGroup: string
    configGroup: string
    systemGroup: string
    modbusConfig: string
    alertConfig: string
    controlConfig: string
    constraintConfig: string
    toggleMenu: string
    expandMenu: string
    collapseMenu: string
    systemConfig: string
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

  provision: {
    title: string
    description: string
    currentConfig: string
    editConfig: string
    systemReboot: string
    hostname: string
    reversePort: string
    portSource: string
    hostnamePlaceholder: string
    unsavedChanges: string
    hostnameChangeWarning: string
    rebootWarning: string
    rebootSystem: string
    dangerZone: string
    confirmReboot: string
    rebootDialogWarning: string
    rebootDialogMessage: string
    confirmRebootButton: string
    loadError: string
    saveSuccess: string
    rebootSuccess: string
    rebootInitiated: string
    rebootRequiredTitle: string
    rebootRequiredMessage: string
    waitingForSystem: string
    systemRebooting: string
    reconnecting: string
    reconnectSuccess: string
    reconnectFailed: string
    checkingConnection: string
  }

  config: {
    title: string
    refresh: string
    backups: string
    generation: string

    exportConfig: string
    importConfig: string
    importSuccess: string
    importFailed: string

    metadata: {
      title: string
      generation: string
      source: string
      lastModified: string
      modifiedBy: string
      checksum: string
    }

    tabs: {
      buses: string
      devices: string
    }

    bus: {
      addBus: string
      editBus: string
      name: string
      port: string
      baudrate: string
      timeout: string
      devices: string
      actions: string
      edit: string
      delete: string
      deleteConfirm: string
      namePlaceholder: string
      portPlaceholder: string
      nameRequired: string
      portRequired: string
      baudrateRequired: string
      timeoutRequired: string
      saveSuccess: string
      deleteSuccess: string
      saveFailed: string
      deleteFailed: string
    }

    device: {
      addDevice: string
      editDevice: string
      selectDriver: string
      selectDriverPlaceholder: string
      selectDriverRequired: string
      basicInfo: string
      connectionSettings: string
      displayName: string
      model: string
      type: string
      slaveId: string
      bus: string
      purpose: string
      driverFile: string
      modelPlaceholder: string
      driverPlaceholder: string
      modelRequired: string
      typeRequired: string
      driverRequired: string
      slaveIdRequired: string
      busRequired: string
      deleteConfirm: string
      saveSuccess: string
      deleteSuccess: string
      saveFailed: string
      deleteFailed: string
      selectType: string
      selectTypePlaceholder: string
      selectTypeRequired: string
      selectTypeFirst: string
      selectModel: string
      selectModelPlaceholder: string
      autoFilled: string
      manualInput: string
      willAutoFill: string
      duplicateSlaveId: string
      duplicateSlaveIdDetail: string
      duplicateSlaveIdError: string

      types: {
        vfd: string
        inverter: string
        powerMeter: string
        power_meter: string
        analogInput: string
        ai_module: string
        di_module: string
        io_module: string
        sensor: string
        panel_meter: string
        other: string
        [key: string]: string
      }

      modes: {
        title: string
        name: string
        namePlaceholder: string
        nameTip: string
        purpose: string
        purposePlaceholder: string
        purposeTip: string
        customFields: string
        customPlaceholder: string
        customTip: string
        invalidJson: string
      }
    }

    backup: {
      title: string
      filename: string
      generation: string
      created: string
      size: string
      actions: string
      restore: string
      restoreConfirm: string
      restoreSuccess: string
      restoreFailed: string
      loadFailed: string
      preview: string
      previewTitle: string
      previewMeta: string
      previewConfig: string
    }

    common: {
      save: string
      cancel: string
      loading: string
      noData: string
      loadFailed: string
    }

    talos: {
      restartService: string

      restartTitle: string
      restartMessage: string
      restartNow: string
      restartLater: string
      restartReminder: string

      alertTitle: string

      confirmRestartMessage: string

      restartingTitle: string
      restartingMessage: string
      restartingSubtext: string

      restartSuccess: string
      restartWarning: string
      restartFailed: string
    }
  }

  comingSoon: {
    title: string
    description: string
    plannedFeatures: string

    alert: {
      title: string
      description: string
      features: string[]
    }

    control: {
      title: string
      description: string
      features: string[]
    }

    constraint: {
      title: string
      description: string
      features: string[]
    }
  }
  systemConfig: {
    title: string
    editableSettings: string
    readOnlySection: string
    monitorInterval: string
    monitorIntervalTip: string
    monitorIntervalRequired: string
    monitorIntervalRange: string
    seconds: string
    deviceIdSeries: string
    deviceIdSeriesTip: string
    deviceIdSeriesRequired: string
    deviceIdSeriesRange: string
    reverseSshPort: string
    reverseSshPortTip: string
    reverseSshPortManaged: string
    goToProvision: string
    saveSuccess: string
    saveFailed: string
  }
}
