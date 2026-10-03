// The only bridge between the page and the main process. It exposes named functions, nothing else:
// no ipcRenderer, no generic "send this channel" function, no Node.
import { buildBridge } from '@pos/api-contract';
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld(
  'posBridge',
  buildBridge((channel, payload) => ipcRenderer.invoke(channel, payload)),
);
