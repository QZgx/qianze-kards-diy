'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('KARDS_NATIVE_DESKTOP', true);
// Only the short-lived server authorization token crosses this bridge.
// User-entered access keys are never sent to the main process or stored on disk.
contextBridge.exposeInMainWorld('KARDS_DESKTOP_SESSION', {
  get: () => ipcRenderer.invoke('kards-session:get'),
  set: token => ipcRenderer.invoke('kards-session:set', token),
  remove: () => ipcRenderer.invoke('kards-session:remove')
});
