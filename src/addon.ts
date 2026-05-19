import { config } from "../package.json";
import { ColumnOptions, DialogHelper } from "zotero-plugin-toolkit";
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
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    // Env type, see build.js
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    hermes?: {
      client: HermesClient;
      chat: ChatManager;
      notes: NoteManager;
      items: ItemManager;
      citations: CitationManager;
      annotations: AnnotationManager;
      tags: TagManager;
      conversations: ConversationManager;
      preferences: PreferencesManager;
      approvalDialog: ApprovalDialog;
    };
    locale?: {
      current: any;
    };
    prefs?: {
      window: Window;
      columns: Array<ColumnOptions>;
      rows: Array<{ [dataKey: string]: string }>;
    };
    dialog?: DialogHelper;
  };
  // Lifecycle hooks
  public hooks: typeof hooks;
  // APIs
  public api: object;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
    this.api = {};
  }

  /**
   * Log a message with plugin prefix.
   */
  public log(message: string, ...data: any[]): void {
    Zotero.debug(`[Hermes] ${message}`);
    Zotero.log(`[Hermes] ${message}`);
  }
}

export default Addon;
