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
  updateMcpUI();
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
  const localSettings = doc.getElementById(`${config.addonRef}-local-settings`) as HTMLElement | null;
  const remoteSettings = doc.getElementById(`${config.addonRef}-remote-settings`) as HTMLElement | null;

  if (!modeDropdown || !localSettings || !remoteSettings) return;

  const mode = modeDropdown.value || "stdio";

  if (mode === "api") {
    localSettings.style.display = "none";
    remoteSettings.style.display = "";
  } else {
    localSettings.style.display = "";
    remoteSettings.style.display = "none";
  }
}

/**
 * Show/hide MCP servers textarea based on the MCP enabled checkbox.
 */
function updateMcpUI(): void {
  const doc = addon.data.prefs?.window?.document;
  if (!doc) return;

  const mcpCheckbox = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-mcp-enabled`,
  ) as any;
  const mcpServersRow = doc.getElementById(`${config.addonRef}-mcp-servers-row`) as HTMLElement | null;

  if (!mcpCheckbox || !mcpServersRow) return;

  mcpServersRow.style.display = mcpCheckbox.checked ? "" : "none";
}

function bindPrefEvents(): void {
  const doc = addon.data.prefs?.window?.document;
  if (!doc) return;

  // Connection mode dropdown — toggle visible sections
  const modeDropdown = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-connection-mode`,
  );
  modeDropdown?.addEventListener("command", () => {
    updateConnectionModeUI();
  });

  // MCP enabled checkbox — toggle servers textarea
  const mcpCheckbox = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-mcp-enabled`,
  );
  mcpCheckbox?.addEventListener("command", () => {
    updateMcpUI();
  });

  // Test Local Connection button
  const testLocalBtn = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-test-local`,
  );
  testLocalBtn?.addEventListener("click", async () => {
    try {
      const hermes = addon.data.hermes;
      if (!hermes?.client) {
        (doc.defaultView as any)?.alert("Hermes client not initialized. Please restart Zotero.");
        return;
      }
      await hermes.client.connect();
      (doc.defaultView as any)?.alert("Local connection successful! Hermes is ready.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      (doc.defaultView as any)?.alert(`Local connection failed: ${message}`);
    }
  });

  // Test Remote Connection button
  const testRemoteBtn = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-test-remote`,
  );
  testRemoteBtn?.addEventListener("click", async () => {
    try {
      const hermes = addon.data.hermes;
      if (!hermes?.client) {
        (doc.defaultView as any)?.alert("Hermes client not initialized. Please restart Zotero.");
        return;
      }
      await hermes.client.connect();
      (doc.defaultView as any)?.alert("Remote connection successful! Hermes is ready.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      (doc.defaultView as any)?.alert(`Remote connection failed: ${message}`);
    }
  });

  // Reset Onboarding button
  const resetOnboardingBtn = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-reset-onboarding`,
  );
  resetOnboardingBtn?.addEventListener("click", () => {
    const hermes = addon.data.hermes;
    if (hermes?.preferences) {
      hermes.preferences.set("hasSeenOnboarding", false);
      (doc.defaultView as any)?.alert("Welcome message will appear next time you open chat.");
    }
  });
}
