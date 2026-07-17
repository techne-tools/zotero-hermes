/**
 * Most of this code is from Zotero team's official Make It Red example[1]
 * or the Zotero 7 documentation[2].
 * [1] https://github.com/zotero/make-it-red
 * [2] https://www.zotero.org/support/dev/zotero_7_for_developers
 */

var chromeHandle;
var console = ChromeUtils.importESModule(
  "resource://gre/modules/Console.sys.mjs",
).console;

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  var aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "__addonRef__", rootURI + "content/"],
  ]);

  /**
   * Global variables for plugin code.
   * The `_globalThis` is the global root variable of the plugin sandbox environment
   * and all child variables assigned to it is globally accessible.
   * See `src/index.ts` for details.
   */
  const ctx = { rootURI };
  ctx._globalThis = ctx;

  // Ensure browser globals are available in sandbox for React
  const mainWindow = Zotero.getMainWindow();
  if (mainWindow) {
    ctx.window = mainWindow;
    ctx.document = mainWindow.document;
    ctx.navigator = mainWindow.navigator;
  }
  const consoleMock = {
    log: (msg, ...args) =>
      Zotero.debug(`[Hermes-log] ${msg} ${args.join(" ")}`),
    warn: (msg, ...args) =>
      Zotero.debug(`[Hermes-warn] ${msg} ${args.join(" ")}`),
    error: (msg, ...args) =>
      Zotero.debug(`[Hermes-error] ${msg} ${args.join(" ")}`),
    info: (msg, ...args) =>
      Zotero.debug(`[Hermes-info] ${msg} ${args.join(" ")}`),
    group: () => {},
    groupCollapsed: () => {},
    groupEnd: () => {},
    trace: () => {},
  };
  ctx.console = consoleMock;

  Services.scriptloader.loadSubScript(
    `${rootURI}/content/scripts/__addonRef__.js?cacheBuster=${Date.now()}`,
    ctx,
  );
  try {
    await Zotero.__addonInstance__.hooks.onStartup();
  } catch (e) {
    Zotero.debug(`[Hermes] Bootstrap startup error: ${e}`);
    Zotero.debug(`[Hermes] Stack: ${e.stack}`);
    throw e;
  }
}

async function onMainWindowLoad({ window }, reason) {
  await Zotero.__addonInstance__?.hooks.onMainWindowLoad(window);
}

async function onMainWindowUnload({ window }, reason) {
  await Zotero.__addonInstance__?.hooks.onMainWindowUnload(window);
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }

  await Zotero.__addonInstance__?.hooks.onShutdown();

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

async function uninstall(data, reason) {}
