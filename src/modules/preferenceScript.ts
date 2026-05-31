import { config } from "../../package.json";

/**
 * Initialize the Hermes preferences UI.
 * Called when the Zotero preferences pane is opened.
 */
export async function registerPrefsScripts(_window: Window) {
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
      columns: [],
      rows: [],
    };
  } else {
    addon.data.prefs.window = _window;
  }
  bindPrefEvents();
  updateConnectionModeUI();
}

/**
 * Show/hide fields based on the selected connection mode.
 */
function updateConnectionModeUI(): void {
  const doc = addon.data.prefs?.window?.document;
  if (!doc) return;

  const modeDropdown = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-connection-mode`,
  ) as any;
  const binaryRow = doc.getElementById(`${config.addonRef}-binary-path-row`) as HTMLElement | null;
  const apiUrlRow = doc.getElementById(`${config.addonRef}-api-url-row`) as HTMLElement | null;
  const apiKeyRow = doc.getElementById(`${config.addonRef}-api-key-row`) as HTMLElement | null;

  if (!modeDropdown || !binaryRow || !apiUrlRow || !apiKeyRow) return;

  const mode = modeDropdown.value || "stdio";

  if (mode === "api") {
    binaryRow.style.display = "none";
    apiUrlRow.style.display = "";
    apiKeyRow.style.display = "";
  } else {
    binaryRow.style.display = "";
    apiUrlRow.style.display = "none";
    apiKeyRow.style.display = "none";
  }
}

function bindPrefEvents(): void {
  const doc = addon.data.prefs?.window?.document;
  if (!doc) return;

  // Connection mode dropdown — toggle visible rows
  const modeDropdown = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-connection-mode`,
  );
  modeDropdown?.addEventListener("command", () => {
    updateConnectionModeUI();
  });
}
