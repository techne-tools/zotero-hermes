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
import { UIExampleFactory } from "./modules/examples";
import { getString, getLocaleID, initLocale } from "./utils/locale";
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

  // Register Hermes sidebar
  await registerHermesSidebar();

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

  await Zotero.Promise.delay(1000);

  popupWin.changeLine({
    progress: 100,
    text: `[100%] ${getString("startup-finish")}`,
  });
  popupWin.startCloseTimer(5000);
}

/**
 * Register Hermes sidebar in Zotero's main window.
 */
async function registerHermesSidebar(): Promise<void> {
  // Add sidebar button to Zotero toolbar
  ztoolkit.UI.appendElement(
    {
      tag: "toolbarbutton",
      id: "zotero-tb-hermes",
      properties: {
        type: "menu-button",
        label: "Hermes Agent",
        tooltiptext: "Open Hermes AI Assistant",
        image: `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
      },
      attributes: {
        class: "zotero-tb-button",
      },
      listeners: [
        {
          type: "click",
          listener: () => {
            toggleHermesSidebar();
          },
        },
      ],
    },
    Zotero.getMainWindow().document.getElementById("zotero-tb-add")!,
  );

  // Register Hermes as an item pane tab (Zotero 7/9 API)
  // The sidenav property makes it appear as a proper sidebar tab
  // (like Notes, Tags, etc.) rather than just a collapsible section.
  Zotero.ItemPaneManager.registerSection({
    paneID: "hermes",
    pluginID: addon.data.config.addonID,
    // Header is required by the API but we keep it minimal
    header: {
      l10nID: "hermes-sidebar-title",
      icon: `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
    },
    sidenav: {
      l10nID: "hermes-sidebar-title",
      icon: `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
    },
    bodyXHTML: `<div id="hermes-sidebar-container" style="display:flex;flex-direction:column;height:100%;flex:1;min-height:0"><div id="hermes-header" class="hermes-header"><div class="hermes-header-title">Hermes AI Chat</div><div class="hermes-header-subtitle">Ask questions about your research</div></div><div id="hermes-toolbar" class="hermes-toolbar" style="display:flex;flex-direction:row"><button id="hermes-new-conversation-btn" label="New Chat" class="hermes-btn-small"/><button id="hermes-export-conversation-btn" label="Export" class="hermes-btn-small"/><button id="hermes-preferences-btn" label="Settings" class="hermes-btn-small"/></div><div id="hermes-chat-messages" class="hermes-chat-container" style="display:flex;flex-direction:column;flex:1;min-height:0"><div id="hermes-messages-list" style="height:100%;overflow-y:auto"></div></div><div id="hermes-context-bar" class="hermes-context-bar" style="display:none"><div id="hermes-context-items" class="hermes-context-items"></div><button id="hermes-clear-context-btn" label="Clear" class="hermes-btn-small"/></div><div id="hermes-feature-bar" class="hermes-feature-bar" style="display:flex;flex-direction:row"><div style="display:flex;flex-direction:row;align-items:center"><label class="hermes-checkbox-label"><input type="checkbox" id="hermes-toggle-citations" checked="true"/> Citations</label><label class="hermes-checkbox-label"><input type="checkbox" id="hermes-toggle-annotations" checked="true"/> Annotations</label><label class="hermes-checkbox-label"><input type="checkbox" id="hermes-toggle-tags" checked="true"/> Tags</label></div></div><div class="hermes-input-container" style="display:flex;flex-direction:row"><div style="display:flex;flex-direction:column;flex:1"><textarea id="hermes-input" placeholder="Ask Hermes about your research... (Type /help for commands)" rows="3" style="flex:1"></textarea><div class="hermes-input-actions" style="display:flex;flex-direction:row"><button id="hermes-attach-btn" label="Attach Selected Item" class="hermes-btn-secondary"/><button id="hermes-cite-btn" label="Cite" class="hermes-btn-secondary"/><button id="hermes-annotate-btn" label="Annotate" class="hermes-btn-secondary"/></div></div><button id="hermes-send-btn" label="Send" class="hermes-btn-primary"/></div></div>`,
    onInit: ({ item }) => {
      ztoolkit.log("Hermes tab init!", item?.id);
    },
    onDestroy: () => {
      ztoolkit.log("Hermes tab destroy!");
    },
    onItemChange: ({ item, setEnabled, tabType }) => {
      ztoolkit.log(`Hermes tab item changed to ${item?.id}`);
      // Enable for all tab types (library, reader, etc.)
      setEnabled(true);
      return true;
    },
    onRender: ({ body, item, editable, tabType }) => {
      const win = body.ownerDocument?.defaultView;
      if (win) {
        initializeHermesUI(win);
      }
    },
  });
}

/**
 * Toggle Hermes sidebar tab.
 * Activates the Hermes tab in the item pane sidenav.
 */
function toggleHermesSidebar(): void {
  const win = Zotero.getMainWindow();
  const doc = win.document;

  // Find the sidenav and look for the Hermes tab button
  const sidenav = doc.getElementById("zotero-view-item-sidenav");
  if (!sidenav) return;

  // Find the Hermes sidenav button by its icon or tooltip
  const buttons = sidenav.querySelectorAll("toolbarbutton, .btn");
  for (const btn of Array.from(buttons)) {
    const title = (btn as HTMLElement).getAttribute("title") || "";
    const tooltiptext = (btn as HTMLElement).getAttribute("tooltiptext") || "";
    if (title.includes("Hermes") || tooltiptext.includes("Hermes")) {
      (btn as HTMLElement).click();
      return;
    }
  }

  // Fallback: try to find by paneID or data attribute
  const hermesBtn = sidenav.querySelector('[data-pane-id="hermes"]') as HTMLElement;
  if (hermesBtn) {
    hermesBtn.click();
    return;
  }

  // Last resort: look for any element with hermes in its id
  const hermesElement = doc.querySelector('[id*="hermes"]') as HTMLElement;
  if (hermesElement && hermesElement.closest("item-pane-sidenav")) {
    hermesElement.click();
  }
}

/**
 * Initialize Hermes UI components.
 */
function initializeHermesUI(win: Window): void {
  const doc = win.document;

  // Load stylesheet
  const link = ztoolkit.UI.createElement(doc, "link", {
    properties: {
      type: "text/css",
      rel: "stylesheet",
      href: `chrome://${addon.data.config.addonRef}/content/hermes/sidebar.css`,
    },
  });
  if (doc.documentElement) {
    doc.documentElement.appendChild(link);
  }

  // Setup send button
  const sendBtn = doc.getElementById("hermes-send-btn");
  const input = doc.getElementById("hermes-input") as HTMLTextAreaElement;

  if (sendBtn && input) {
    sendBtn.addEventListener("click", () => {
      sendHermesMessage(input.value);
      input.value = "";
      input.style.height = "auto";
    });

    input.addEventListener("keypress", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        (sendBtn as HTMLElement).click();
      }
    });

    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight}px`;
    });
  }

  // Setup attach button
  const attachBtn = doc.getElementById("hermes-attach-btn");
  if (attachBtn) {
    attachBtn.addEventListener("click", () => {
      attachSelectedItems(doc);
    });
  }

  // Setup cite button
  const citeBtn = doc.getElementById("hermes-cite-btn");
  if (citeBtn) {
    citeBtn.addEventListener("click", () => {
      sendHermesMessage("/cite");
    });
  }

  // Setup annotate button
  const annotateBtn = doc.getElementById("hermes-annotate-btn");
  if (annotateBtn) {
    annotateBtn.addEventListener("click", () => {
      sendHermesMessage("/annotate");
    });
  }

  // Setup clear context button
  const clearContextBtn = doc.getElementById("hermes-clear-context-btn");
  if (clearContextBtn) {
    clearContextBtn.addEventListener("click", () => {
      clearAttachedItems(doc);
    });
  }

  // Setup undo button
  const undoBtn = doc.getElementById("hermes-undo-btn");
  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      const undoneText = addon.data.hermes?.chat.undoLastTurn();
      if (undoneText !== null && undoneText !== undefined) {
        addon.data.hermes?.conversations.undoLastTurn();
        renderLoadedMessages(doc);
        const input = doc.getElementById("hermes-input") as HTMLTextAreaElement;
        if (input) {
          input.value = undoneText;
          input.focus();
          input.style.height = "auto";
          input.style.height = `${input.scrollHeight}px`;
        }
      }
    });
  }

  // Setup toolbar buttons
  const newConversationBtn = doc.getElementById("hermes-new-conversation-btn");
  if (newConversationBtn) {
    newConversationBtn.addEventListener("click", () => {
      addon.data.hermes?.chat.clear();
      addon.data.hermes?.conversations.createConversation();
      clearMessagesList(doc);
    });
  }

  const clearConversationBtn = doc.getElementById(
    "hermes-clear-conversation-btn",
  );
  if (clearConversationBtn) {
    clearConversationBtn.addEventListener("click", () => {
      if (
        win.confirm("Are you sure you want to clear the current conversation?")
      ) {
        addon.data.hermes?.chat.clear();
        addon.data.hermes?.conversations.createConversation();
        clearMessagesList(doc);
      }
    });
  }

  const loadConversationBtn = doc.getElementById(
    "hermes-load-conversation-btn",
  );
  if (loadConversationBtn) {
    loadConversationBtn.addEventListener("click", async () => {
      const notes = await addon.data.hermes?.notes.getAllNotes();
      const chatNotes =
        notes
          ?.filter((n: any) => {
            const title = n.getDisplayTitle() || "";
            return (
              title.includes("Hermes Chat") ||
              title.includes("Hermes Conversation")
            );
          })
          .sort((a: any, b: any) => {
            const dateA = new Date(a.getField("dateModified") || 0).getTime();
            const dateB = new Date(b.getField("dateModified") || 0).getTime();
            return dateB - dateA;
          }) || [];

      if (chatNotes.length === 0) {
        const pw = new Zotero.ProgressWindow();
        pw.changeHeadline("No saved conversations");
        pw.addDescription("No notes containing 'Hermes Chat' were found.");
        pw.show();
        pw.startCloseTimer(3000);
        return;
      }

      const noteId =
        await addon.data.hermes?.approvalDialog.showLoadConversationDialog(
          chatNotes,
        );
      if (noteId) {
        await addon.data.hermes?.chat.loadFromNote(noteId);
        renderLoadedMessages(doc);
      }
    });
  }

  const exportConversationBtn = doc.getElementById(
    "hermes-export-conversation-btn",
  );
  if (exportConversationBtn) {
    exportConversationBtn.addEventListener("click", async () => {
      const noteID = await addon.data.hermes?.conversations.exportToNote();
      if (noteID) {
        const pw = new Zotero.ProgressWindow();
        pw.changeHeadline("Conversation exported");
        pw.addDescription("Conversation saved to a new note.");
        pw.show();
        pw.startCloseTimer(3000);
      }
    });
  }

  const preferencesBtn = doc.getElementById("hermes-preferences-btn");
  if (preferencesBtn) {
    preferencesBtn.addEventListener("click", () => {
      addon.data.hermes?.preferences.openPreferences();
    });
  }

  // Setup feature toggles
  const citationsToggle = doc.getElementById(
    "hermes-toggle-citations",
  ) as HTMLInputElement;
  if (citationsToggle) {
    citationsToggle.checked =
      addon.data.hermes?.preferences.areCitationsEnabled() ?? true;
    citationsToggle.addEventListener("change", () => {
      addon.data.hermes?.preferences.set(
        "enableCitations",
        citationsToggle.checked,
      );
    });
  }

  const annotationsToggle = doc.getElementById(
    "hermes-toggle-annotations",
  ) as HTMLInputElement;
  if (annotationsToggle) {
    annotationsToggle.checked =
      addon.data.hermes?.preferences.areAnnotationsEnabled() ?? true;
    annotationsToggle.addEventListener("change", () => {
      addon.data.hermes?.preferences.set(
        "enableAnnotations",
        annotationsToggle.checked,
      );
    });
  }

  const tagsToggle = doc.getElementById(
    "hermes-toggle-tags",
  ) as HTMLInputElement;
  if (tagsToggle) {
    tagsToggle.checked =
      addon.data.hermes?.preferences.areTagsEnabled() ?? true;
    tagsToggle.addEventListener("change", () => {
      addon.data.hermes?.preferences.set("enableTags", tagsToggle.checked);
    });
  }

  // Update connection status
  updateConnectionStatus(doc);
}

/**
 * Clear the messages list.
 */
function clearMessagesList(doc: Document): void {
  const messagesList = doc.getElementById("hermes-messages-list");
  if (messagesList) {
    messagesList.innerHTML = "";
  }
}

/**
 * Generic syntax highlighter for code blocks in the chat view.
 */
function highlightCode(code: string, lang: string): string {
  if (lang === "diff" || lang === "patch") {
    return code
      .split("\n")
      .map((line) => {
        if (
          line.startsWith("+++") ||
          line.startsWith("---") ||
          line.startsWith("@@") ||
          line.startsWith("Index:")
        ) {
          return `<span style="color: #005cc5; background: #f0f8ff; display: inline-block; width: 100%; font-weight: bold;">${line}</span>`;
        }
        if (line.startsWith("+"))
          return `<span style="color: #22863a; background: #e6ffed; display: inline-block; width: 100%;">${line}</span>`;
        if (line.startsWith("-"))
          return `<span style="color: #cb2431; background: #ffeef0; display: inline-block; width: 100%;">${line}</span>`;
        return line;
      })
      .join("\n");
  }

  return (
    code
      // Strings
      .replace(
        /(&quot;.*?&quot;|'.*?'|`[\s\S]*?`)/g,
        (match) => `<span style="color: #22863a;">${match}</span>`,
      )
      // Comments (single line // or #, avoiding URLs)
      .replace(
        /(^|\s)(\/\/[^\n]*|#[^\n]*)/g,
        (match, space, comment) =>
          `${space}<span style="color: #6a737d; font-style: italic;">${comment}</span>`,
      )
      // Keywords
      .replace(
        /\b(const|let|var|function|def|class|import|from|return|if|else|for|while|try|catch|async|await|switch|case|break|continue|new|this|super|export|default|null|true|false)\b/g,
        (match) =>
          `<span style="color: #d73a49; font-weight: 500;">${match}</span>`,
      )
      // Numbers
      .replace(
        /\b(\d+(?:\.\d+)?)\b/g,
        (match) => `<span style="color: #005cc5;">${match}</span>`,
      )
  );
}

/**
 * Lightweight Markdown to HTML renderer for Zotero chat view.
 */
function renderMarkdown(text: string): string {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const highlighted = highlightCode(code, lang);
    codeBlocks.push(`
      <div class="hermes-code-block" style="background: #f6f8fa; border-radius: 6px; overflow: hidden; margin: 8px 0; border: 1px solid #e1e4e8;">
        <div style="background: #e1e4e8; padding: 4px 10px; font-size: 0.85em; font-family: monospace; color: #586069; font-weight: bold;">
          ${lang || "text"}
        </div>
        <pre style="margin: 0; padding: 12px; overflow-x: auto; font-family: monospace; font-size: 0.9em; line-height: 1.4;"><code style="font-family: inherit;">${highlighted}</code></pre>
      </div>
    `);
    return `%%%CODE_BLOCK_${codeBlocks.length - 1}%%%`;
  });

  html = html.replace(
    /`([^`\n]+)`/g,
    `<code style="background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em; color: #d73a49;">$1</code>`,
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, `<strong>$1</strong>`);
  html = html.replace(/\*([^*]+)\*/g, `<em>$1</em>`);

  // Blockquotes (e.g., > text)
  html = html.replace(/(?:^>\s?.*\n?)+/gm, (match) => {
    const content = match.replace(/^>\s?/gm, "");
    return `<blockquote style="border-left: 4px solid #d0d7de; padding: 8px 12px; color: #656d76; margin: 8px 0; background: #f6f8fa; border-radius: 0 4px 4px 0;">${content.trim()}</blockquote>\n`;
  });

  html = html.replace(
    /^[\s]*[-*] (.*)$/gm,
    `<li style="margin-left: 20px;">$1</li>`,
  );

  html = html.replace(/%%%CODE_BLOCK_(\d+)%%%/g, (_, index) => {
    return codeBlocks[parseInt(index, 10)];
  });

  return `<div style="white-space: pre-wrap; word-break: break-word;">${html}</div>`;
}

/**
 * Render loaded messages from the ChatManager into the UI.
 * Call this after loading a conversation from a Zotero note.
 */
export function renderLoadedMessages(doc: Document): void {
  const messagesList = doc.getElementById("hermes-messages-list");
  if (!messagesList) return;

  // Clear the existing chat
  messagesList.innerHTML = "";

  const messages = addon.data.hermes?.chat.getMessages() || [];

  for (const msg of messages) {
    const isUser = msg.role === "user";
    const msgEl = ztoolkit.UI.createElement(doc, "div", {
      namespace: "html",
      classList: [
        "hermes-message",
        isUser ? "hermes-message-user" : "hermes-message-assistant",
      ],
    });

    // Restore tool calls if they exist (assistant messages only)
    if (!isUser && msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tool of msg.toolCalls) {
        const toolEl = ztoolkit.UI.createElement(doc, "div", {
          namespace: "html",
          properties: { className: "hermes-tool-status" },
          attributes: { "data-tool-id": tool.id },
        });

        toolEl.style.fontSize = "0.9em";
        toolEl.style.margin = "4px 0";
        toolEl.style.padding = "4px 8px";
        toolEl.style.background = "#f5f5f5";
        toolEl.style.borderRadius = "4px";
        toolEl.style.borderLeft = "3px solid #ccc";

        if (tool.payload) {
          toolEl.setAttribute("data-raw-payload", tool.payload);
          toolEl.style.cursor = "pointer";
          toolEl.title =
            tool.status === "error"
              ? "Click to view failure reason"
              : "Click to view raw JSON payload";
          toolEl.addEventListener("click", () => {
            const parsed = JSON.parse(tool.payload!);
            let desc = "Raw JSON payload for tool call:";
            let dialogTitle = "Tool Debug Payload";

            if (tool.status === "error" || parsed.status === "failed") {
              dialogTitle = "Tool Execution Failed";
              const resultObj = parsed.result || parsed.error;
              const errorReason =
                typeof resultObj === "string"
                  ? resultObj
                  : resultObj?.error ||
                    resultObj?.message ||
                    JSON.stringify(resultObj) ||
                    "Unknown error occurred";
              const safeError = String(errorReason)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
              desc = `<strong style="color: #d73a49;">Failure Reason:</strong> ${safeError}<br><br>Raw JSON payload:`;
            }

            addon.data.hermes?.approvalDialog.showPermissionApproval(
              dialogTitle,
              desc,
              parsed,
              [{ id: "close", name: "Close" }],
            );
          });
        }

        if (tool.status === "running") {
          toolEl.innerHTML = `⏳ <em>Running: ${tool.title}...</em>`;
          toolEl.style.borderLeftColor = "#2196f3";
        } else if (tool.status === "complete") {
          toolEl.innerHTML = `✅ <em>Finished: ${tool.title}</em>`;
          toolEl.style.borderLeftColor = "#4caf50";
        } else if (tool.status === "error") {
          toolEl.innerHTML = `❌ <strong>Failed: ${tool.title}</strong>`;
          toolEl.style.borderLeftColor = "#f44336";
          toolEl.style.background = "#ffebee";
        }
        msgEl.appendChild(toolEl);
      }
    }

    // Add the actual message text
    const contentEl = ztoolkit.UI.createElement(doc, "div", {
      namespace: "html",
      properties: {
        className: "hermes-message-content",
        innerHTML: renderMarkdown(msg.content),
      },
    });

    msgEl.appendChild(contentEl);
    messagesList.appendChild(msgEl);
  }

  // Auto-scroll to bottom of the restored chat
  messagesList.scrollTop = messagesList.scrollHeight;
}

/**
 * Attach selected Zotero items to chat context.
 */
function attachSelectedItems(doc: Document): void {
  const items = addon.data.hermes?.items.attachSelectedItems();
  if (!items || items.length === 0) {
    const pw = new Zotero.ProgressWindow();
    pw.changeHeadline("No items selected");
    pw.addDescription("Please select one or more items in Zotero to attach.");
    pw.show();
    pw.startCloseTimer(3000);
    return;
  }

  updateContextBar(doc);
}

/**
 * Clear all attached items.
 */
function clearAttachedItems(doc: Document): void {
  addon.data.hermes?.items.clearAttachedItems();
  updateContextBar(doc);
}

/**
 * Update the context bar UI.
 */
function updateContextBar(doc: Document): void {
  const contextBar = doc.getElementById("hermes-context-bar");
  const contextItems = doc.getElementById("hermes-context-items");
  if (!contextBar || !contextItems) return;

  const items = addon.data.hermes?.items.getAttachedItems() || [];

  if (items.length === 0) {
    (contextBar as HTMLElement).style.display = "none";
    contextItems.innerHTML = "";
    return;
  }

  (contextBar as HTMLElement).style.display = "flex";
  contextItems.innerHTML = "";

  for (const item of items) {
    const chip = ztoolkit.UI.createElement(doc, "div", {
      namespace: "html",
      classList: ["hermes-context-item"],
      children: [
        {
          tag: "span",
          properties: {
            textContent: item.title,
          },
        },
        {
          tag: "span",
          properties: {
            textContent: "×",
            className: "hermes-context-item-remove",
          },
          listeners: [
            {
              type: "click",
              listener: () => {
                addon.data.hermes?.items.removeAttachedItem(item.id);
                updateContextBar(doc);
              },
            },
          ],
        },
      ],
    });
    contextItems.appendChild(chip);
  }

  if (items.length > 0) {
    const actionsContainer = ztoolkit.UI.createElement(doc, "div", {
      namespace: "html",
      styles: {
        marginLeft: "auto",
        display: "flex",
        gap: "4px",
      },
    });

    const summarizeChip = ztoolkit.UI.createElement(doc, "div", {
      namespace: "html",
      properties: {
        textContent: "Summarize",
        className: "hermes-context-summarize",
      },
      styles: {
        fontSize: "0.85em",
        color: "#999",
        cursor: "pointer",
        padding: "2px 8px",
      },
      listeners: [
        {
          type: "click",
          listener: () =>
            sendHermesMessage(
              "Please provide a concise summary of the attached context items.",
            ),
        },
      ],
    });
    actionsContainer.appendChild(summarizeChip);

    const canCite = items.some(
      (i) => i.itemType !== "note" && i.itemType !== "attachment",
    );
    if (canCite) {
      const citeSaveChip = ztoolkit.UI.createElement(doc, "div", {
        namespace: "html",
        properties: {
          textContent: "Cite & Save",
          className: "hermes-context-cite-save",
        },
        styles: {
          fontSize: "0.85em",
          color: "#999",
          cursor: "pointer",
          padding: "2px 8px",
        },
        listeners: [
          {
            type: "click",
            listener: () => sendHermesMessage("/cite save"),
          },
        ],
      });
      actionsContainer.appendChild(citeSaveChip);
    }

    const canAnnotate = items.some((i) => i.itemType !== "note");
    if (canAnnotate) {
      const annotateSaveChip = ztoolkit.UI.createElement(doc, "div", {
        namespace: "html",
        properties: {
          textContent: "Annotate & Save",
          className: "hermes-context-annotate-save",
        },
        styles: {
          fontSize: "0.85em",
          color: "#999",
          cursor: "pointer",
          padding: "2px 8px",
        },
        listeners: [
          {
            type: "click",
            listener: () => sendHermesMessage("/annotate save"),
          },
        ],
      });
      actionsContainer.appendChild(annotateSaveChip);
    }

    const copyAllChip = ztoolkit.UI.createElement(doc, "div", {
      namespace: "html",
      properties: {
        textContent: "Copy All",
        className: "hermes-context-copy-all",
      },
      styles: {
        fontSize: "0.85em",
        color: "#999",
        cursor: "pointer",
        padding: "2px 8px",
      },
      listeners: [
        {
          type: "click",
          listener: async () => {
            const contextItems =
              addon.data.hermes?.items.formatContextForPrompt() || [];

            if (addon.data.hermes?.preferences.areCitationsEnabled()) {
              const attachedItems =
                addon.data.hermes?.items.getAttachedItems() || [];
              for (const item of attachedItems) {
                const citation =
                  await addon.data.hermes?.citations.generateCitation(item.id);
                if (citation)
                  contextItems.push({
                    type: "citation",
                    content: `Citation: ${citation}`,
                  });
              }
            }

            if (addon.data.hermes?.preferences.areAnnotationsEnabled()) {
              const attachedItems =
                addon.data.hermes?.items.getAttachedItems() || [];
              for (const item of attachedItems) {
                const annotations =
                  await addon.data.hermes?.annotations.getAnnotations(item.id);
                if (annotations && annotations.length > 0) {
                  const formatted =
                    addon.data.hermes?.annotations.formatAnnotationsForPrompt(
                      annotations,
                    );
                  if (formatted) contextItems.push(...formatted);
                }
              }
            }

            const textToCopy = contextItems
              .map((c) => c.content)
              .join("\n\n---\n\n");
            if (textToCopy) {
              const win = Zotero.getMainWindow();
              if (
                typeof Zotero !== "undefined" &&
                Zotero.Utilities &&
                Zotero.Utilities.Internal
              ) {
                Zotero.Utilities.Internal.copyTextToClipboard(textToCopy);
              } else if (win.navigator && win.navigator.clipboard) {
                win.navigator.clipboard.writeText(textToCopy);
              }
              const pw = new Zotero.ProgressWindow();
              pw.changeHeadline("Copied to Clipboard");
              pw.addDescription("All context items extracted and copied.");
              pw.show();
              pw.startCloseTimer(2000);
            }
          },
        },
      ],
    });
    actionsContainer.appendChild(copyAllChip);

    if (items.length > 1) {
      const clearAllChip = ztoolkit.UI.createElement(doc, "div", {
        namespace: "html",
        properties: {
          textContent: "Clear All",
          className: "hermes-context-clear-all",
        },
        styles: {
          fontSize: "0.85em",
          color: "#999",
          cursor: "pointer",
          padding: "2px 8px",
        },
        listeners: [
          {
            type: "click",
            listener: () => clearAttachedItems(doc),
          },
        ],
      });
      actionsContainer.appendChild(clearAllChip);
    }

    contextItems.appendChild(actionsContainer);
  }
}

/**
 * Handle slash commands.
 */
async function handleSlashCommand(text: string): Promise<string | null> {
  const trimmed = text.trim();

  // /cite command - generate citations for attached items
  if (trimmed.startsWith("/cite")) {
    const isSaveToNote = trimmed.includes("save") || trimmed.includes("note");
    const items = addon.data.hermes?.items.getAttachedItems() || [];
    if (items.length === 0) {
      return "No items attached. Please attach items first using the paperclip button.";
    }

    const itemObjects = items
      .map((i) => Zotero.Items.get(i.id))
      .filter(Boolean) as Zotero.Item[];
    const citations =
      await addon.data.hermes?.citations.generateCitations(itemObjects);
    if (!citations || citations.length === 0) {
      return "Could not generate citations.";
    }

    const styleName =
      addon.data.hermes?.citations.getCurrentStyleName() || "Current Style";
    const formattedCitations = citations.map((c) => `> ${c}`).join("\n>\n");
    let resultMsg = `📚 **Generated Citations** (${styleName})\n\n${formattedCitations}`;

    if (isSaveToNote) {
      try {
        const safeStyle = styleName
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const noteContent = `<h1>Citations (${safeStyle})</h1>\n\n<p>${citations.join("</p>\n<p>")}</p>`;
        await addon.data.hermes?.notes.writeNote(
          null,
          noteContent,
          undefined,
          undefined,
          items.map((i: any) => i.id),
        );
        resultMsg += `\n\n*✅ Saved to a new Zotero note.*`;
      } catch (error) {
        resultMsg += `\n\n*❌ Failed to save note: ${error}*`;
      }
    }

    return resultMsg;
  }

  // /annotate command - extract annotations from attached items
  if (trimmed.startsWith("/annotate")) {
    const isSaveToNote = trimmed.includes("save") || trimmed.includes("note");
    const items = addon.data.hermes?.items.getAttachedItems() || [];
    if (items.length === 0) {
      return "No items attached. Please attach items first using the paperclip button.";
    }

    const contexts: Array<{ type: string; content: string }> = [];
    for (const item of items) {
      const annotations = await addon.data.hermes?.annotations.getAnnotations(
        item.id,
      );
      if (annotations && annotations.length > 0) {
        const formatted =
          addon.data.hermes?.annotations.formatAnnotationsForPrompt(
            annotations,
          );
        if (formatted) {
          contexts.push(...formatted);
        }
      }
    }

    if (contexts.length === 0) {
      return "No annotations found for the attached items.";
    }

    const rawOutput = contexts.map((c) => c.content).join("\n\n---\n\n");
    let resultMsg = `📝 **Extracted Annotations**\n\n${rawOutput
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")}`;

    if (isSaveToNote) {
      try {
        const escapeHtml = (text: string) =>
          text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        const htmlOutput = contexts
          .map((c) => `<p>${escapeHtml(c.content).replace(/\n/g, "<br>")}</p>`)
          .join("<hr>");
        const noteContent = `<h1>Extracted Annotations</h1>\n\n${htmlOutput}`;

        await addon.data.hermes?.notes.writeNote(
          null,
          noteContent,
          undefined,
          undefined,
          items.map((i: any) => i.id),
        );
        resultMsg += `\n\n*✅ Saved to a new Zotero note.*`;
      } catch (error) {
        resultMsg += `\n\n*❌ Failed to save note: ${error}*`;
      }
    }

    return resultMsg;
  }

  // /search command - search notes
  if (trimmed.startsWith("/search ")) {
    const query = trimmed.slice(8).trim();
    const notes = await addon.data.hermes?.notes.searchNotes(query);
    if (!notes || notes.length === 0) {
      return `No notes found matching "${query}".`;
    }

    const lines = notes.map((note) => {
      const title = note.getDisplayTitle() || "Untitled";
      const preview = (note.getNote() || "").slice(0, 100) + "...";
      return `- ${title}: ${preview}`;
    });

    return `Found ${notes.length} notes:\n${lines.join("\n")}`;
  }

  // /tags command - suggest tags for attached items
  if (trimmed.startsWith("/tags")) {
    const items = addon.data.hermes?.items.getAttachedItems() || [];
    if (items.length === 0) {
      return "No items attached. Please attach items first using the paperclip button.";
    }

    const results: string[] = [];
    for (const item of items) {
      const suggestions = await addon.data.hermes?.tags.suggestTags(item.id);
      if (suggestions && suggestions.length > 0) {
        const formatted = addon.data.hermes?.tags.formatTagSuggestionsForPrompt(
          item.id,
          suggestions,
        );
        if (formatted) {
          results.push(formatted.content);
        }
      }
    }

    if (results.length === 0) {
      return "No tag suggestions available for the attached items.";
    }

    return results.join("\n\n---\n\n");
  }

  // /clear command - clear conversation
  if (trimmed === "/clear") {
    addon.data.hermes?.conversations.createConversation();
    return "Conversation cleared.";
  }

  // /help command - show available commands
  if (trimmed === "/help") {
    return `Available commands:
- /cite - Generate citations for attached items
- /cite save - Generate citations and save them as a new Zotero note
- /annotate - Extract annotations from attached items
- /annotate save - Extract annotations and save them as a new Zotero note
- /search <query> - Search notes
- /tags - Get tag suggestions for attached items
- /clear - Clear current conversation
- /help - Show this help message`;
  }

  return null;
}

/**
 * Send a message to Hermes.
 */
async function sendHermesMessage(text: string): Promise<void> {
  if (!text.trim()) return;

  const win = Zotero.getMainWindow();
  const doc = win.document;
  const messagesList = doc.getElementById("hermes-messages-list");

  if (!messagesList) return;

  // Add user message to UI
  const userMsg = ztoolkit.UI.createElement(doc, "div", {
    namespace: "html",
    classList: ["hermes-message", "hermes-message-user"],
    children: [
      {
        tag: "div",
        properties: {
          className: "hermes-message-content",
          innerHTML: renderMarkdown(text),
        },
      },
    ],
  });
  messagesList.appendChild(userMsg);

  // Add to chat manager
  addon.data.hermes?.chat.addUserMessage(text);
  addon.data.hermes?.conversations.addMessage("user", text);

  // Auto-scroll to bottom
  messagesList.scrollTop = messagesList.scrollHeight;

  // Check for slash commands
  const slashResult = await handleSlashCommand(text);
  if (slashResult !== null) {
    // Display slash command result
    const slashMsg = ztoolkit.UI.createElement(doc, "div", {
      namespace: "html",
      classList: ["hermes-message", "hermes-message-assistant"],
      children: [
        {
          tag: "div",
          properties: {
            className: "hermes-message-content",
            innerHTML: renderMarkdown(slashResult),
          },
        },
      ],
    });
    messagesList.appendChild(slashMsg);
    messagesList.scrollTop = messagesList.scrollHeight;
    addon.data.hermes?.chat.addAssistantMessage(slashResult);
    addon.data.hermes?.conversations.addMessage("assistant", slashResult);
    return;
  }

  // Create assistant message container (will be updated with streaming content)
  const assistantMsg = ztoolkit.UI.createElement(doc, "div", {
    namespace: "html",
    classList: ["hermes-message", "hermes-message-assistant"],
    children: [
      {
        tag: "div",
        properties: {
          className: "hermes-message-content",
          innerHTML: renderMarkdown(""),
        },
      },
      {
        tag: "div",
        properties: {
          className: "hermes-typing-indicator",
        },
        children: [{ tag: "span" }, { tag: "span" }, { tag: "span" }],
      },
    ],
  });
  messagesList.appendChild(assistantMsg);

  // Auto-scroll to show typing indicator
  messagesList.scrollTop = messagesList.scrollHeight;

  // Get content element for updates
  const contentEl = assistantMsg.querySelector(
    ".hermes-message-content",
  ) as HTMLDivElement;
  const typingIndicator = assistantMsg.querySelector(
    ".hermes-typing-indicator",
  ) as HTMLDivElement;

  const stopBtn = ztoolkit.UI.createElement(doc, "button", {
    namespace: "html",
    properties: {
      className: "hermes-stop-btn",
      innerHTML: "🛑 Stop",
    },
    styles: {
      marginTop: "8px",
      padding: "4px 8px",
      background: "#ffebee",
      color: "#f44336",
      border: "1px solid #f44336",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "0.85em",
    },
    listeners: [
      {
        type: "click",
        listener: () => {
          addon.data.hermes?.client.cancelPrompt();
          stopBtn.style.display = "none";
        },
      },
    ],
  });
  assistantMsg.appendChild(stopBtn);

  // Get attached item context
  const contextItems = addon.data.hermes?.items.formatContextForPrompt() || [];

  // Add citation context if enabled
  if (addon.data.hermes?.preferences.areCitationsEnabled()) {
    const attachedItems = addon.data.hermes?.items.getAttachedItems() || [];
    for (const item of attachedItems) {
      const citation = await addon.data.hermes?.citations.generateCitation(
        item.id,
      );
      if (citation) {
        contextItems.push({
          type: "citation",
          content: `Citation: ${citation}`,
        });
      }
    }
  }

  // Add annotation context if enabled
  if (addon.data.hermes?.preferences.areAnnotationsEnabled()) {
    const attachedItems = addon.data.hermes?.items.getAttachedItems() || [];
    for (const item of attachedItems) {
      const annotations = await addon.data.hermes?.annotations.getAnnotations(
        item.id,
      );
      if (annotations && annotations.length > 0) {
        const formatted =
          addon.data.hermes?.annotations.formatAnnotationsForPrompt(
            annotations,
          );
        if (formatted) {
          contextItems.push(...formatted);
        }
      }
    }
  }

  // Send to Hermes and stream response
  let fullResponse = "";
  try {
    await addon.data.hermes?.client.sendPrompt(
      text,
      contextItems,
      // onMessage - streaming updates
      (responseText: string) => {
        fullResponse = responseText;
        // Hide typing indicator once we start receiving content
        if (typingIndicator) {
          typingIndicator.style.display = "none";
        }

        // Update content
        if (contentEl) {
          contentEl.innerHTML = renderMarkdown(responseText);
        }

        // Auto-scroll
        messagesList.scrollTop = messagesList.scrollHeight;
      },
      // onComplete
      () => {
        // Hide typing indicator
        if (typingIndicator) {
          typingIndicator.style.display = "none";
        }
        if (stopBtn) stopBtn.style.display = "none";

        // Save to chat manager
        if (contentEl) {
          addon.data.hermes?.chat.addAssistantMessage(fullResponse);
          addon.data.hermes?.conversations.addMessage(
            "assistant",
            fullResponse,
          );
        }

        // Auto-save conversation if enabled
        if (addon.data.hermes?.preferences.isAutoSaveEnabled()) {
          addon.data.hermes?.conversations.autoSave();
        }

        // Update connection status
        updateConnectionStatus(doc);
      },
      // onError
      (error: Error) => {
        // Hide typing indicator
        if (typingIndicator) {
          typingIndicator.style.display = "none";
        }
        if (stopBtn) stopBtn.style.display = "none";

        // Show error in message
        if (contentEl) {
          contentEl.innerHTML = renderMarkdown(`Error: ${error.message}`);
          contentEl.classList.add("hermes-message-error");
        }

        addon.data.hermes?.chat.addAssistantMessage(`Error: ${error.message}`);
        addon.data.hermes?.conversations.addMessage(
          "assistant",
          `Error: ${error.message}`,
        );

        // Update connection status
        updateConnectionStatus(doc);
      },
      // onToolUpdate
      (toolCallId: string, title: string, status: string, payload?: string) => {
        let toolEl = assistantMsg.querySelector(
          `[data-tool-id="${toolCallId}"]`,
        ) as HTMLDivElement;
        if (!toolEl) {
          toolEl = ztoolkit.UI.createElement(doc, "div", {
            namespace: "html",
            properties: {
              className: "hermes-tool-status",
            },
            attributes: {
              "data-tool-id": toolCallId,
            },
          });
          toolEl.style.fontSize = "0.9em";
          toolEl.style.margin = "4px 0";
          toolEl.style.padding = "4px 8px";
          toolEl.style.background = "#f5f5f5";
          toolEl.style.borderRadius = "4px";
          toolEl.style.borderLeft = "3px solid #ccc";
          assistantMsg.insertBefore(toolEl, contentEl);
        }

        if (payload) {
          toolEl.setAttribute("data-raw-payload", payload);
          toolEl.style.cursor = "pointer";
          toolEl.title =
            status === "error"
              ? "Click to view failure reason"
              : "Click to view raw JSON payload";
          if (!toolEl.hasAttribute("data-click-bound")) {
            toolEl.setAttribute("data-click-bound", "true");
            toolEl.addEventListener("click", () => {
              const rawPayload = toolEl.getAttribute("data-raw-payload")!;
              const parsed = JSON.parse(rawPayload);
              let desc = "Raw JSON payload for tool call:";
              let dialogTitle = "Tool Debug Payload";

              if (
                parsed.status === "failed" ||
                String(toolEl.innerHTML).includes("❌")
              ) {
                dialogTitle = "Tool Execution Failed";
                const resultObj = parsed.result || parsed.error;
                const errorReason =
                  typeof resultObj === "string"
                    ? resultObj
                    : resultObj?.error ||
                      resultObj?.message ||
                      JSON.stringify(resultObj) ||
                      "Unknown error occurred";
                const safeError = String(errorReason)
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;");
                desc = `<strong style="color: #d73a49;">Failure Reason:</strong> ${safeError}<br><br>Raw JSON payload:`;
              }

              addon.data.hermes?.approvalDialog.showPermissionApproval(
                dialogTitle,
                desc,
                parsed,
                [{ id: "close", name: "Close" }],
              );
            });
          }
        }

        if (status === "running") {
          toolEl.innerHTML = `⏳ <em>Running: ${title}...</em>`;
          toolEl.style.borderLeftColor = "#2196f3";
        } else if (status === "complete") {
          toolEl.innerHTML = `✅ <em>Finished: ${title}</em>`;
          toolEl.style.borderLeftColor = "#4caf50";
        } else if (status === "error") {
          toolEl.innerHTML = `❌ <strong>Failed: ${title}</strong>`;
          toolEl.style.borderLeftColor = "#f44336";
          toolEl.style.background = "#ffebee";
        }
        messagesList.scrollTop = messagesList.scrollHeight;

        // Track in managers so it persists when saving/exporting notes
        addon.data.hermes?.chat.addOrUpdateToolCall(
          toolCallId,
          title,
          status,
          payload,
        );
        addon.data.hermes?.conversations.addOrUpdateToolCall(
          toolCallId,
          title,
          status,
          payload,
        );
      },
    );
  } catch (error) {
    // Hide typing indicator
    if (typingIndicator) {
      typingIndicator.style.display = "none";
    }
    if (stopBtn) stopBtn.style.display = "none";

    // Show error in message
    if (contentEl) {
      contentEl.innerHTML = renderMarkdown(
        `Error: ${(error as Error).message}`,
      );
      contentEl.classList.add("hermes-message-error");
    }

    addon.data.hermes?.chat.addAssistantMessage(
      `Error: ${(error as Error).message}`,
    );
    addon.data.hermes?.conversations.addMessage(
      "assistant",
      `Error: ${(error as Error).message}`,
    );
  }
}

/**
 * Update connection status indicator.
 */
async function updateConnectionStatus(doc: Document): Promise<void> {
  const statusEl = doc.getElementById("hermes-connection-status");
  if (statusEl && addon.data.hermes?.client) {
    const isConnected = await addon.data.hermes.client.isReady();
    statusEl.textContent = isConnected ? "Connected" : "Disconnected";
    statusEl.className = isConnected ? "connected" : "disconnected";
  }
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
  // Add your notify handler here
  ztoolkit.log("notify", event, type, ids, extraData);
}

/**
 * Handle preference UI events
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    default:
      return;
  }
}

/**
 * Handle keyboard shortcuts (removed - shortcuts not used)
 */
function onShortcuts(type: string) {
  switch (type) {
    default:
      break;
  }
}

/**
 * Handle dialog events (removed - example dialogs not used)
 */
function onDialogEvents(type: string) {
  switch (type) {
    default:
      break;
  }
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
