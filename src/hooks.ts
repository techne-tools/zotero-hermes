if (typeof console === "undefined") {
  const debugLog = (level: string, msg: any, args: any[]) => {
    const formatted = `${msg} ${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")}`;
    if (typeof Zotero !== "undefined") {
      Zotero.debug(`[Hermes-${level}] ${formatted}`);
    }
  };

  (globalThis as any).console = {
    log: (msg: any, ...args: any[]) => debugLog("log", msg, args),
    warn: (msg: any, ...args: any[]) => debugLog("warn", msg, args),
    error: (msg: any, ...args: any[]) => debugLog("error", msg, args),
    info: (msg: any, ...args: any[]) => debugLog("info", msg, args),
    group: () => {},
    groupCollapsed: () => {},
    groupEnd: () => {},
    trace: () => {},
  };
}

import { UIExampleFactory } from "./modules/examples";
import { HermesClient } from "./modules/hermes/HermesClient";
import { HermesApiClient } from "./modules/hermes/HermesApiClient";
import { ChatManager } from "./modules/hermes/ChatManager";
import { NoteManager } from "./modules/hermes/NoteManager";
import { ItemManager } from "./modules/hermes/ItemManager";
import { CitationManager } from "./modules/hermes/CitationManager";
import { AnnotationManager } from "./modules/hermes/AnnotationManager";
import { ApprovalDialog } from "./modules/hermes/ApprovalDialog";
import { TagManager } from "./modules/hermes/TagManager";
import { ConversationManager } from "./modules/hermes/ConversationManager";
import { PreferencesManager } from "./modules/hermes/PreferencesManager";
import { DebugLogger } from "./utils/DebugLogger";
import { AuditLog } from "./utils/AuditLog";
import { getString, getLocaleID, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";
import { mountHermesChat } from "./views/HermesChatView";

async function onStartup() {
  try {
    addon.log("Step 1: Waiting for Zotero promises...");
    await Promise.all([
      Zotero.initializationPromise,
      Zotero.unlockPromise,
      Zotero.uiReadyPromise,
    ]);
    addon.log("Step 2: Zotero promises resolved");

    // Initialize locale FIRST
    initLocale();
    addon.log("Step 3: Locale initialized");

    // Debug mode can now gate verbose logs below this point
    const debug = new DebugLogger(addon);
    debug.info("Debug mode enabled — verbose logging active");

    // Audit log for recording all agent actions
    const auditLog = new AuditLog(addon);
    auditLog.record("connection", "Plugin startup", "success");

    // Initialize Hermes modules
    addon.log("Step 4: Creating ApprovalDialog...");
    const approvalDialog = new ApprovalDialog(addon);
    addon.log("Step 5: ApprovalDialog created");

    addon.log("Step 6: Creating Hermes client...");
    const preferences = new PreferencesManager(addon);
    const connectionMode = preferences.getConnectionMode();
    let client;
    if (connectionMode === "api") {
      client = new HermesApiClient(addon);
      addon.log("Step 7: HermesApiClient created (API mode)");
    } else {
      client = new HermesClient(addon);
      addon.log("Step 7: HermesClient created (ACP/stdio mode)");
    }

    addon.log("Step 8: Creating ChatManager...");
    const chat = new ChatManager(addon);
    addon.log("Step 9: ChatManager created");

    addon.log("Step 10: Creating NoteManager...");
    const notes = new NoteManager(addon, approvalDialog);
    addon.log("Step 11: NoteManager created");

    addon.log("Step 12: Creating ItemManager...");
    const items = new ItemManager(addon);
    addon.log("Step 13: ItemManager created");

    addon.log("Step 14: Creating CitationManager...");
    const citations = new CitationManager(addon);
    addon.log("Step 15: CitationManager created");

    addon.log("Step 16: Creating AnnotationManager...");
    const annotations = new AnnotationManager(addon);
    addon.log("Step 17: AnnotationManager created");

    addon.log("Step 18: Creating TagManager...");
    const tags = new TagManager(addon);
    addon.log("Step 19: TagManager created");

    addon.log("Step 20: Creating ConversationManager...");
    const conversations = new ConversationManager(addon);
    addon.log("Step 21: ConversationManager created");

    addon.data.hermes = {
      client,
      chat,
      notes,
      items,
      citations,
      annotations,
      tags,
      conversations,
      preferences,
      approvalDialog,
      debug,
      auditLog,
    };
    addon.log("Step 24: Hermes modules initialized");
    // Load FTL/Stylesheets for all existing windows
    const mainWindows = Zotero.getMainWindows();
    addon.log(`Step 25: Found ${mainWindows.length} main windows`);
    if (mainWindows.length > 0) {
      await Promise.all(mainWindows.map((win) => onMainWindowLoad(win)));
    }
    addon.log("Step 26: onMainWindowLoad complete for all windows");

    // Register preferences pane in Zotero Settings
    try {
      Zotero.PreferencePanes.register({
        pluginID: addon.data.config.addonID,
        src: rootURI + "content/preferences.xhtml",
        label: getString("prefs-title"),
        image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
      });
      addon.log("Step 27: Preference pane registered");
    } catch (prefErr) {
      addon.log(
        `Failed to register preference pane: ${(prefErr as Error).message}`,
      );
    }

    addon.data.initialized = true;
    addon.log("Hermes startup complete");
  } catch (error) {
    addon.log(`Startup error: ${(error as Error).message}`);
    addon.log(`Startup stack: ${(error as Error).stack}`);
    throw error;
  }
}

/**
 * Register Hermes Toolbar Toggle Button and prepare full sidebar.
 */
function registerHermesSidebar(win: _ZoteroTypes.MainWindow): void {
  try {
    const doc = win.document;
    const syncBtn = doc.getElementById("zotero-tb-sync") as any;

    if (syncBtn && !doc.getElementById("zotero-hermes-tb-chat-toggle")) {
      const btn = doc.createXULElement("toolbarbutton") as any;
      btn.setAttribute("id", "zotero-hermes-tb-chat-toggle");
      btn.setAttribute("tooltiptext", "Toggle Hermes Chat");
      btn.setAttribute("aria-label", "Toggle Hermes Chat");
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("tabindex", "0");
      btn.style.listStyleImage =
        "url('chrome://hermes/content/icons/hermes-sidenav.svg')";
      btn.style.mozUserFocus = "normal";

      const separator = doc.createElement("div") as any;
      separator.setAttribute("id", "hermes-tb-separator");
      separator.className = "zotero-tb-separator";

      // Insert right before sync button
      (syncBtn.parentNode as any).insertBefore(btn, syncBtn);
      (syncBtn.parentNode as any).insertBefore(separator, syncBtn);

      // Hook toggle click action
      btn.addEventListener("click", () => {
        toggleHermesSidebar(win);
      });

      // Deactivate Hermes if Beaver is activated to avoid overlapping panels
      const beaverToggle = doc.getElementById(
        "zotero-beaver-tb-chat-toggle",
      ) as any;
      if (beaverToggle && !beaverToggle.dataset.hermesListener) {
        beaverToggle.addEventListener("click", () => {
          const hermesBtn = doc.getElementById("zotero-hermes-tb-chat-toggle");
          if (hermesBtn && hermesBtn.getAttribute("aria-pressed") === "true") {
            toggleHermesSidebar(win);
          }
        });
        beaverToggle.dataset.hermesListener = "true";
      }

      // Synchronize initial layout state on startup/load
      if (btn.getAttribute("aria-pressed") === "true") {
        btn.setAttribute("aria-pressed", "false");
        toggleHermesSidebar(win);
      }

      addon.log("Hermes sidebar toggle button registered successfully");
    }
  } catch (error) {
    addon.log(
      `Failed to register Hermes sidebar toggle button: ${(error as Error).message}`,
    );
  }
}

/**
 * Toggle the full-height Hermes sidebar view.
 */
function toggleHermesSidebar(win: _ZoteroTypes.MainWindow): void {
  try {
    const doc = win.document;
    const btn = doc.getElementById("zotero-hermes-tb-chat-toggle");
    if (!btn) return;

    const isPressed = btn.getAttribute("aria-pressed") === "true";

    const itemPane = doc.getElementById("zotero-item-pane") as any;
    const deck = doc.getElementById("zotero-item-pane-content") as any;
    const sidenav = doc.getElementById("zotero-view-item-sidenav") as any;
    if (!itemPane || !deck || !sidenav) return;

    let hermesPane = doc.getElementById("hermes-pane-library") as any;

    if (!isPressed) {
      // 1. Deactivate Beaver if active to avoid collisions
      const beaverToggle = doc.getElementById("zotero-beaver-tb-chat-toggle");
      if (
        beaverToggle &&
        beaverToggle.getAttribute("aria-pressed") === "true"
      ) {
        (beaverToggle as any).click();
      }

      // 2. Hide default Zotero details panel & vertical sidenav tabs
      deck.style.display = "none";
      sidenav.style.display = "none";

      // 3. Create full-height Hermes sidebar if needed
      if (!hermesPane) {
        hermesPane = doc.createXULElement("vbox") as any;
        hermesPane.setAttribute("id", "hermes-pane-library");
        hermesPane.className = "display-flex flex-1 h-full min-w-0";
        hermesPane.style.minWidth = "0px";
        hermesPane.style.width = "100%";

        const reactContainer = doc.createElement("div") as any;
        reactContainer.setAttribute("id", "hermes-react-root");
        reactContainer.setAttribute(
          "style",
          "width: 100%; height: 100%; display: flex; flex-direction: column;",
        );

        hermesPane.appendChild(reactContainer);
        itemPane.appendChild(hermesPane);
      }

      // 4. Show panel and mount React Chat
      hermesPane.style.display = "flex";

      const reactContainer = doc.getElementById("hermes-react-root") as any;
      if (reactContainer && !reactContainer.dataset.mounted) {
        try {
          const unmount = mountHermesChat(reactContainer as HTMLElement, addon);
          reactContainer.dataset.mounted = "true";
          reactContainer._unmount = unmount;
          addon.log(
            "Hermes Chat React component successfully mounted in full sidebar",
          );
        } catch (err) {
          addon.log(
            `Hermes React mount error in full sidebar: ${(err as Error).message}`,
          );
        }
      }

      btn.setAttribute("aria-pressed", "true");
      addon.log("Hermes full sidebar view toggled ON");
    } else {
      // Hide Hermes panel and restore default Zotero views
      if (hermesPane) {
        hermesPane.style.display = "none";
      }
      deck.style.display = "";
      sidenav.style.display = "";
      btn.setAttribute("aria-pressed", "false");
      addon.log("Hermes full sidebar view toggled OFF");
    }
  } catch (error) {
    addon.log(`Error toggling Hermes sidebar: ${(error as Error).message}`);
  }
}

/**
 * Remove all Hermes sidebar elements and restore layout.
 */
function unregisterHermesSidebar(win: Window): void {
  try {
    const doc = win.document;

    // 1. Remove toolbar button and separator
    const btn = doc.getElementById("zotero-hermes-tb-chat-toggle");
    if (btn) {
      btn.parentNode?.removeChild(btn);
    }
    const separator = doc.getElementById("hermes-tb-separator");
    if (separator) {
      separator.parentNode?.removeChild(separator);
    }

    // 2. Clean up Hermes sidebar panel
    const hermesPane = doc.getElementById("hermes-pane-library") as any;
    if (hermesPane) {
      const reactContainer = doc.getElementById("hermes-react-root") as any;
      if (reactContainer && reactContainer._unmount) {
        try {
          reactContainer._unmount();
        } catch (e) {
          // ignore unmount errors
        }
      }
      hermesPane.parentNode?.removeChild(hermesPane);
    }

    // 3. Restore Zotero default sidebars
    const deck = doc.getElementById("zotero-item-pane-content") as any;
    if (deck) {
      deck.style.display = "";
    }
    const sidenav = doc.getElementById("zotero-view-item-sidenav") as any;
    if (sidenav) {
      sidenav.style.display = "";
    }
    addon.log("Hermes sidebar fully cleaned up and Zotero layout restored");
  } catch (error) {
    addon.log(`Error cleaning up Hermes sidebar: ${(error as Error).message}`);
  }
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window FIRST
  addon.data.ztoolkit = createZToolkit();

  // Initialize locale for this window
  initLocale();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  const popupWin = new addon.data.ztoolkit.ProgressWindow(
    addon.data.config.addonName,
    {
      closeOnClick: true,
      closeTime: -1,
    },
  )
    .createLine({
      text: getString("startup-begin"),
      type: "default",
      progress: 0,
    })
    .show();

  await Zotero.Promise.delay(1000);
  popupWin.changeLine({
    progress: 30,
    text: `[30%] ${getString("startup-begin")}`,
  });

  // Only essential UI setup
  UIExampleFactory.registerStyleSheet(win);

  // Register full-height sidebar and toolbar button
  registerHermesSidebar(win);

  await Zotero.Promise.delay(1000);

  popupWin.changeLine({
    progress: 100,
    text: `[100%] ${getString("startup-finish")}`,
  });
  popupWin.startCloseTimer(5000);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  unregisterHermesSidebar(win);
  addon.data.ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  try {
    const mainWindows = Zotero.getMainWindows();
    for (const win of mainWindows) {
      unregisterHermesSidebar(win);
    }
    addon.log("Hermes sidebar unregistered from all windows during shutdown");
  } catch (error) {
    addon.log(
      `Error during shutdown unregistration: ${(error as Error).message}`,
    );
  }

  addon.data.ztoolkit?.unregisterAll();
  addon.data.dialog?.window?.close();
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * Handle notify events
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  // Placeholder for future notify handling
  addon.data.ztoolkit.log("notify", event, type, ids, extraData);
}

/**
 * Handle preference UI events
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

/**
 * Handle keyboard shortcuts (removed - shortcuts not used)
 */
function onShortcuts(type: string) {
  // No shortcuts implemented
}

/**
 * Handle dialog events (removed - example dialogs not used)
 */
function onDialogEvents(type: string) {
  // No dialog events implemented
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
