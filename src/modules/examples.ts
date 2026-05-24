import { getLocaleID, getString } from "../utils/locale";

/**
 * Minimal examples module - only essential code kept
 * All template example factories removed to reduce bloat
 */

export class UIExampleFactory {
  /**
   * Register stylesheet for the main window
   * This is the only example method still in use
   */
  static registerStyleSheet(win: _ZoteroTypes.MainWindow) {
    const doc = win.document;
    const styles = ztoolkit.UI.createElement(doc, "link", {
      properties: {
        type: "text/css",
        rel: "stylesheet",
        href: `chrome://${addon.data.config.addonRef}/content/zoteroPane.css`,
      },
    });
    doc.documentElement?.appendChild(styles);
  }
}

// All other example factories removed:
// - BasicExampleFactory (notifier, prefs - not used)
// - KeyExampleFactory (keyboard shortcuts - not used)
// - PromptExampleFactory (command palette - not used)
// - HelperExampleFactory (dialog helpers - not used)
