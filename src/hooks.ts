import { UIExampleFactory } from "./modules/examples";
import { HermesClient } from "./modules/hermes/HermesClient";
import { ChatManager } from "./modules/hermes/ChatManager";
import { NoteManager } from "./modules/hermes/NoteManager";
import { ItemManager } from "./modules/hermes/ItemManager";
import { CitationManager } from "./modules/hermes/CitationManager";
import { AnnotationManager } from "./modules/hermes/AnnotationManager";
import { ApprovalDialog } from "./modules/hermes/ApprovalDialog";
import { TagManager } from "./modules/hermes/TagManager";
import { ConversationManager } from "./modules/hermes/ConversationManager";
import { PreferencesManager } from "./modules/hermes/PreferencesManager";
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

    // Initialize Hermes modules
    addon.log("Step 4: Creating ApprovalDialog...");
    const approvalDialog = new ApprovalDialog(addon);
    addon.log("Step 5: ApprovalDialog created");

    addon.log("Step 6: Creating HermesClient...");
    const client = new HermesClient(addon);
    addon.log("Step 7: HermesClient created");

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

    addon.log("Step 22: Creating PreferencesManager...");
    const preferences = new PreferencesManager(addon);
    addon.log("Step 23: PreferencesManager created");

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
    };
    addon.log("Step 24: Hermes modules initialized");

    // Register Hermes sidebar tab for all existing windows
    const mainWindows = Zotero.getMainWindows();
    addon.log(`Step 25: Found ${mainWindows.length} main windows`);
    if (mainWindows.length > 0) {
      await Promise.all(
        mainWindows.map((win) => onMainWindowLoad(win)),
      );
    }
    addon.log("Step 26: onMainWindowLoad complete for all windows");

    addon.data.initialized = true;
    addon.log("Hermes startup complete");
  } catch (error) {
    addon.log(`Startup error: ${(error as Error).message}`);
    addon.log(`Startup stack: ${(error as Error).stack}`);
    throw error;
  }
}

/**
 * Register Hermes as a proper sidebar tab with toolbar icon.
 * Creates a panel inside zotero-item-pane-content and adds a toggle button to the toolbar.
 */
function registerHermesSidebarTab(win: _ZoteroTypes.MainWindow): void {
  try {
    const doc = win.document;
    const contentPane = doc.getElementById("zotero-item-pane-content");
    if (!contentPane) {
      addon.log("Hermes: zotero-item-pane-content not found");
      return;
    }

    // Skip if already registered (prevents double-registration from bootstrap)
    if (doc.getElementById("hermes-pane")) {
      addon.log("Hermes panel already exists, skipping registration");
      return;
    }

    // Create the Hermes panel container inside the content pane
    const mountPoint = doc.createElement("div");
    mountPoint.setAttribute("id", "hermes-pane");
    mountPoint.setAttribute("hidden", "");
    mountPoint.style.width = "100%";
    mountPoint.style.height = "100%";

    // Create inner div for React mounting
    const reactContainer = doc.createElement("div");
    reactContainer.setAttribute("id", "hermes-react-root");
    reactContainer.style.width = "100%";
    reactContainer.style.height = "100%";
    mountPoint.appendChild(reactContainer);

    contentPane.appendChild(mountPoint);
    addon.log("Hermes panel created inside zotero-item-pane-content");

    // Add toolbar button
    addHermesToolbarButton(win);

    // Defer React mount until first toggle (ensures addon.data.hermes is ready)
    addon.log("Hermes React mount deferred until first toggle");
  } catch (error) {
    addon.log(`Failed to register Hermes sidebar: ${(error as Error).message}`);
  }
}

/**
 * Add Hermes toggle button to the Zotero toolbar.
 */
function addHermesToolbarButton(win: _ZoteroTypes.MainWindow): void {
  const doc = win.document;
  const toolbar = doc.querySelector("#zotero-tabs-toolbar");
  if (!toolbar) {
    addon.log("Hermes: zotero-tabs-toolbar not found");
    return;
  }

  // Skip if button already exists (prevents double-registration)
  if (doc.getElementById("zotero-hermes-tb-toggle")) {
    return;
  }

  const btn = doc.createXULElement("toolbarbutton");
  btn.setAttribute("id", "zotero-hermes-tb-toggle");
  btn.setAttribute("class", "zotero-tb-button");
  btn.setAttribute("type", "button");
  btn.setAttribute("tooltiptext", "Toggle Hermes Chat");
  btn.setAttribute("image", `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`);

  // Multiple event handlers for maximum compatibility
  const handleToggle = (evt?: Event) => {
    if (evt) {
      evt.preventDefault();
      evt.stopPropagation();
    }
    addon.log("Hermes button clicked/toggled");
    toggleHermesPanel(win);
  };

  btn.addEventListener("command", handleToggle);
  btn.addEventListener("click", handleToggle);
  (btn as any).onclick = handleToggle;

  // Insert before sync button or at end
  const syncBtn = toolbar.querySelector("#zotero-tb-sync");
  if (syncBtn) {
    toolbar.insertBefore(btn, syncBtn);
  } else {
    toolbar.appendChild(btn);
  }
  addon.log("Hermes toolbar button added");
}

/**
 * Toggle the Hermes panel visibility.
 */
function toggleHermesPanel(win: _ZoteroTypes.MainWindow): void {
  console.log("[Hermes] toggleHermesPanel called");
  const doc = win.document;
  const hermesPane = doc.getElementById("hermes-pane") as HTMLElement | null;
  const contentPane = doc.getElementById("zotero-item-pane-content");
  const btn = doc.getElementById("zotero-hermes-tb-toggle");

  addon.log(`toggleHermesPanel: hermesPane=${!!hermesPane}, contentPane=${!!contentPane}, btn=${!!btn}`);
  if (!hermesPane || !contentPane) {
    addon.log("toggleHermesPanel: missing elements, returning");
    return;
  }

  const isHidden = hermesPane.hasAttribute("hidden");
  addon.log(`toggleHermesPanel: isHidden=${isHidden}`);

  if (isHidden) {
    // Show Hermes, hide default content children
    hermesPane.removeAttribute("hidden");
    addon.log(`toggleHermesPanel: hermesPane hidden removed`);
    const children = Array.from(contentPane.children);
    addon.log(`toggleHermesPanel: contentPane has ${children.length} children`);
    for (const child of children) {
      if (child.id !== "hermes-pane") {
        (child as HTMLElement).setAttribute("hidden", "");
        addon.log(`toggleHermesPanel: hid child ${child.id || child.tagName}`);
      } else {
        addon.log(`toggleHermesPanel: left hermes-pane visible`);
      }
    }
    if (btn) btn.setAttribute("checked", "true");

    // Log dimensions for debugging
    const rect = hermesPane.getBoundingClientRect();
    addon.log(`Hermes pane dimensions: ${rect.width}x${rect.height}`);
    const contentRect = contentPane.getBoundingClientRect();
    addon.log(`Content pane dimensions: ${contentRect.width}x${contentRect.height}`);

    // Mount React on first toggle (ensures addon.data.hermes is ready)
    const reactContainer = doc.getElementById("hermes-react-root") as HTMLElement | null;
    if (reactContainer && !reactContainer.dataset.mounted) {
      try {
        const unmount = mountHermesChat(reactContainer, addon);
        reactContainer.dataset.mounted = "true";
        (reactContainer as any)._unmount = unmount;
        addon.log("Hermes React chat mounted on first toggle");
      } catch (err) {
        addon.log(`Hermes React mount error: ${(err as Error).message}`);
      }
    }

    addon.log("Hermes panel shown");
  } else {
    // Hide Hermes, show default content children
    hermesPane.setAttribute("hidden", "");
    for (const child of Array.from(contentPane.children)) {
      if (child.id !== "hermes-pane") {
        (child as HTMLElement).removeAttribute("hidden");
      }
    }
    if (btn) btn.removeAttribute("checked");
    addon.log("Hermes panel hidden");
  }
}

/**
 * Remove Hermes panel and toolbar button for cleanup.
 */
function removeHermesSidebarTab(win: _ZoteroTypes.MainWindow): void {
  try {
    const doc = win.document;

    // Unmount React
    const reactContainer = doc.getElementById("hermes-react-root");
    if (reactContainer && (reactContainer as any)._unmount) {
      (reactContainer as any)._unmount();
    }

    // Remove panel
    const panel = doc.getElementById("hermes-pane");
    if (panel) panel.remove();

    // Remove toolbar button
    const btn = doc.getElementById("zotero-hermes-tb-toggle");
    if (btn) btn.remove();

    // Restore default content visibility
    const contentPane = doc.getElementById("zotero-item-pane-content");
    if (contentPane) {
      for (const child of Array.from(contentPane.children)) {
        if (child.id !== "hermes-pane") {
          (child as HTMLElement).removeAttribute("hidden");
        }
      }
    }

    addon.log("Hermes sidebar removed");
  } catch (error) {
    addon.log(`Error removing Hermes sidebar: ${(error as Error).message}`);
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

  const popupWin = new addon.data.ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
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

  // Only essential UI setup - all example code removed
  UIExampleFactory.registerStyleSheet(win);

  // Register Hermes sidebar tab for this window
  registerHermesSidebarTab(win);

  await Zotero.Promise.delay(1000);

  popupWin.changeLine({
    progress: 100,
    text: `[100%] ${getString("startup-finish")}`,
  });
  popupWin.startCloseTimer(5000);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  // Remove Hermes sidebar for this window
  removeHermesSidebarTab(win as _ZoteroTypes.MainWindow);
  addon.data.ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  // Clean up all windows
  const windows = Zotero.getMainWindows();
  for (const win of windows) {
    removeHermesSidebarTab(win);
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
