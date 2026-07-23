// electron/preload.cjs
// Runs in a privileged context between main and renderer.
// contextIsolation=true means this is the ONLY way renderer can call native code.
// Skill ref: electron/examples/processes/ipc-communication.md
//   → use contextBridge.exposeInMainWorld, never expose ipcRenderer directly
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Phase 0 — monitoring state read
  getMonitoringStatus: () => ipcRenderer.invoke("get-monitoring-status"),

  // Phase 5 — consent: renderer calls this after employee clicks "agree"
  // main.cjs writes userData/consent.json and starts capture
  giveConsent: (payload) => ipcRenderer.invoke("give-consent", payload),

  // Phase 5 — toggle monitoring ON/OFF from renderer (mirrors tray menu toggle)
  setMonitoring: (on) => ipcRenderer.invoke("set-monitoring", on),

  // Phase 5 — listen for main→renderer push events (tray toggle, working hours gate)
  onMonitoringChange: (cb) => {
    ipcRenderer.on("monitoring-changed", (_evt, state) => cb(state));
  },
});
