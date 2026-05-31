import { BasicTool } from "zotero-plugin-toolkit";
import Addon from "./addon";
import { config } from "../package.json";

// Ensure browser globals are available in Zotero sandbox for React
const mainWindow = Zotero.getMainWindow();
if (mainWindow) {
  if (typeof (globalThis as any).window === "undefined") {
    (globalThis as any).window = mainWindow;
  }
  if (typeof (globalThis as any).document === "undefined") {
    (globalThis as any).document = mainWindow.document;
  }
  if (typeof (globalThis as any).navigator === "undefined") {
    (globalThis as any).navigator = mainWindow.navigator;
  }
  if (typeof (globalThis as any).console === "undefined") {
    (globalThis as any).console = mainWindow.console;
  }
}

const basicTool = new BasicTool();

// @ts-expect-error - Plugin instance is not typed
if (!basicTool.getGlobal("Zotero")[config.addonInstance]) {
  _globalThis.addon = new Addon();
  defineGlobal("ztoolkit", () => {
    return _globalThis.addon.data.ztoolkit;
  });
  // @ts-expect-error - Plugin instance is not typed
  Zotero[config.addonInstance] = addon;
}

function defineGlobal(name: Parameters<BasicTool["getGlobal"]>[0]): void;
function defineGlobal(name: string, getter: () => any): void;
function defineGlobal(name: string, getter?: () => any) {
  Object.defineProperty(_globalThis, name, {
    get() {
      return getter ? getter() : basicTool.getGlobal(name);
    },
  });
}
