import { expect } from "chai";
import { ItemManager } from "../src/modules/hermes/ItemManager";
import type Addon from "../src/addon";

/**
 * Build a minimal mock Zotero.Item. extractItemData only touches the
 * passed item object (no Zotero globals), so a plain object cast is
 * sufficient and deterministic.
 */
function mockItem(overrides: Record<string, unknown> = {}) {
  const fields = new Map<string, string>(
    Object.entries((overrides.fields as Record<string, string>) || {}),
  );
  let creators = (overrides.creators as any[]) || [];
  const tags = (overrides.tags as any[]) || [];
  const bestAttachment = overrides.bestAttachment as
    | { key: string; getFilePath?: () => string }
    | false
    | undefined;

  let saved = false;

  return {
    id: (overrides.id as number) ?? 1,
    key: (overrides.key as string) ?? "ABC123",
    itemType: (overrides.itemType as string) ?? "journalArticle",
    getField: (name: string) => fields.get(name) || "",
    setField: (name: string, val: string) => {
      fields.set(name, val);
    },
    getCreators: () => creators,
    setCreators: (newCreators: any[]) => {
      creators = newCreators;
    },
    getTags: () => tags,
    getBestAttachment: bestAttachment
      ? async () => bestAttachment
      : async () => false,
    getDisplayTitle: () => fields.get("title") || "Untitled",
    saveTx: async () => {
      saved = true;
    },
    isSaved: () => saved,
  } as unknown as Zotero.Item;
}

function mockAddon(): Addon {
  return {
    log: () => {},
  } as unknown as Addon;
}

describe("ItemManager.extractItemData", function () {
  it("should extract core fields from an item", async function () {
    const manager = new ItemManager(mockAddon());
    const item = mockItem({
      id: 42,
      key: "ABC123",
      itemType: "book",
      fields: {
        title: "The Soundscape",
        date: "1977",
        abstractNote: "A classic.",
        url: "https://example.com/soundscape",
        DOI: "10.1234/soundscape",
      },
      creators: [{ firstName: "R.", lastName: "Murray" }],
      tags: [{ tag: "acoustic-ecology" }],
    });

    const result = await manager.extractItemData(item);
    expect(result).to.not.be.null;
    expect(result?.id).to.equal(42);
    expect(result?.key).to.equal("ABC123");
    expect(result?.itemType).to.equal("book");
    expect(result?.title).to.equal("The Soundscape");
    expect(result?.date).to.equal("1977");
    expect(result?.abstract).to.equal("A classic.");
    expect(result?.url).to.equal("https://example.com/soundscape");
    expect(result?.doi).to.equal("10.1234/soundscape");
    expect(result?.creators).to.deep.equal(["R. Murray"]);
    expect(result?.tags).to.deep.equal(["acoustic-ecology"]);
  });

  it("should default title to Untitled when missing", async function () {
    const manager = new ItemManager(mockAddon());
    const item = mockItem({ fields: {} });
    const result = await manager.extractItemData(item);
    expect(result?.title).to.equal("Untitled");
  });

  it("should resolve the best attachment key and file path", async function () {
    const manager = new ItemManager(mockAddon());
    const item = mockItem({
      bestAttachment: {
        key: "XYZ789",
        getFilePath: () => "/Users/test/Zotero/storage/XYZ789/paper.pdf",
      },
    });
    const result = await manager.extractItemData(item);
    expect(result?.attachmentKey).to.equal("XYZ789");
    expect(result?.storagePath).to.equal(
      "/Users/test/Zotero/storage/XYZ789/paper.pdf",
    );
  });

  it("should leave attachment fields undefined when no attachment exists", async function () {
    const manager = new ItemManager(mockAddon());
    const item = mockItem({ bestAttachment: false });
    const result = await manager.extractItemData(item);
    expect(result?.attachmentKey).to.be.undefined;
    expect(result?.storagePath).to.be.undefined;
  });

  it("should tolerate a throwing getBestAttachment", async function () {
    const manager = new ItemManager(mockAddon());
    const item = mockItem({
      bestAttachment: undefined,
    });
    // Force getBestAttachment to throw
    (item as any).getBestAttachment = async () => {
      throw new Error("boom");
    };
    const result = await manager.extractItemData(item);
    expect(result).to.not.be.null;
    expect(result?.attachmentKey).to.be.undefined;
  });

  it("should handle creators with only a name (institutional)", async function () {
    const manager = new ItemManager(mockAddon());
    const item = mockItem({
      creators: [{ name: "World Health Organization" }],
    });
    const result = await manager.extractItemData(item);
    expect(result?.creators).to.deep.equal(["World Health Organization"]);
  });

  it("should extract child notes when available", async function () {
    const manager = new ItemManager(mockAddon());
    const item = mockItem({
      fields: { title: "Note Test Item" },
    });
    (item as any).getNotes = () => [101];

    const realZotero = (globalThis as any).Zotero;
    (globalThis as any).__realZotero = realZotero;
    (globalThis as any).Zotero = {
      ...realZotero,
      Items: {
        getAsync: async (id: number) => {
          if (id === 101) {
            return {
              isNote: () => true,
              getNote: () => "<p>Key insight from reading chapter 1.</p>",
              getNoteTitle: () => "Key insight",
            };
          }
          return null;
        },
      },
    };

    try {
      const result = await manager.extractItemData(item);
      expect(result?.notes).to.deep.equal([
        {
          title: "Key insight",
          content: "Key insight from reading chapter 1.",
        },
      ]);
    } finally {
      (globalThis as any).Zotero = (globalThis as any).__realZotero;
      delete (globalThis as any).__realZotero;
    }
  });

  it("should return null when item access throws", async function () {
    const manager = new ItemManager(mockAddon());
    const item = mockItem({});
    (item as any).getField = () => {
      throw new Error("boom");
    };
    const result = await manager.extractItemData(item);
    expect(result).to.be.null;
  });
});

describe("ItemManager.attachSelectedItems", function () {
  after(function () {
    // Restore the real Zotero global (the reporter needs Zotero.HTTP).
    (globalThis as any).Zotero = (globalThis as any).__realZotero;
    delete (globalThis as any).__realZotero;
  });

  function stubZoteroPane(items: unknown[] | null) {
    // Build a mock Zotero by SPREADING the real object and overriding
    // only getActiveZoteroPane. Replacing the whole object breaks the
    // test runner's reporter, which calls Zotero.HTTP.request to stream
    // results back to the server.
    const realZotero = (globalThis as any).Zotero;
    (globalThis as any).__realZotero = realZotero;
    (globalThis as any).Zotero = {
      ...realZotero,
      getActiveZoteroPane: () =>
        items === null
          ? null
          : {
              getSelectedItems: () => items,
            },
    };
  }

  it("should attach all selected items and track them", async function () {
    const manager = new ItemManager(mockAddon());
    const itemA = mockItem({ id: 1, key: "AAA", fields: { title: "A" } });
    const itemB = mockItem({ id: 2, key: "BBB", fields: { title: "B" } });

    stubZoteroPane([itemA, itemB]);

    const attached = await manager.attachSelectedItems();
    expect(attached).to.have.length(2);
    expect(attached[0].key).to.equal("AAA");
    expect(attached[1].key).to.equal("BBB");
    expect(manager.getAttachedItems()).to.have.length(2);
  });

  it("should attach a single item via attachItem (C1 regression)", async function () {
    const manager = new ItemManager(mockAddon());
    const item = mockItem({ id: 7, key: "CCC", fields: { title: "C" } });

    const attached = await manager.attachItem(item);
    expect(attached).to.not.be.null;
    expect(attached?.id).to.equal(7);
    expect(manager.getAttachedItems()).to.have.length(1);
    expect(manager.getAttachedItems()[0].key).to.equal("CCC");
  });

  it("should dedupe items attached twice via addAttachedItem (C1 regression)", async function () {
    const manager = new ItemManager(mockAddon());
    const item = mockItem({ id: 7, key: "CCC", fields: { title: "C" } });

    await manager.attachItem(item);
    await manager.attachItem(item);
    expect(manager.getAttachedItems()).to.have.length(1);
  });

  it("should clear attached items", async function () {
    const manager = new ItemManager(mockAddon());
    const item = mockItem({ id: 1, key: "AAA", fields: { title: "A" } });
    stubZoteroPane([item]);
    await manager.attachSelectedItems();
    manager.clearAttachedItems();
    expect(manager.getAttachedItems()).to.have.length(0);
  });

  it("should return empty when no pane is active", async function () {
    const manager = new ItemManager(mockAddon());
    stubZoteroPane(null);
    const attached = await manager.attachSelectedItems();
    expect(attached).to.have.length(0);
  });
});

describe("ItemManager.updateItemMetadata", function () {
  after(function () {
    if ((globalThis as any).__realZotero) {
      (globalThis as any).Zotero = (globalThis as any).__realZotero;
      delete (globalThis as any).__realZotero;
    }
  });

  function stubGetAsync(itemMap: Map<number, any>) {
    const realZotero = (globalThis as any).Zotero;
    if (!(globalThis as any).__realZotero) {
      (globalThis as any).__realZotero = realZotero;
    }
    (globalThis as any).Zotero = {
      ...realZotero,
      Items: {
        ...(realZotero?.Items || {}),
        getAsync: async (id: number) => itemMap.get(id) || null,
      },
    };
  }

  it("should update scalar fields and map aliases", async function () {
    const manager = new ItemManager(mockAddon());
    const item = mockItem({
      id: 10,
      fields: {
        title: "Old Title",
        abstractNote: "Old Abstract",
        DOI: "old-doi",
      },
    });
    stubGetAsync(new Map([[10, item]]));

    const result = await manager.updateItemMetadata(10, {
      title: "New Title",
      abstract: "New Abstract",
      doi: "10.1234/new-doi",
    });

    expect(result).to.be.true;
    expect(item.getField("title")).to.equal("New Title");
    expect(item.getField("abstractNote")).to.equal("New Abstract");
    expect(item.getField("DOI")).to.equal("10.1234/new-doi");
    expect((item as any).isSaved()).to.be.true;
  });

  it("should parse and set creators from string array", async function () {
    const manager = new ItemManager(mockAddon());
    const item = mockItem({
      id: 11,
      fields: { title: "Paper" },
      creators: [{ firstName: "Old", lastName: "Author" }],
    });
    stubGetAsync(new Map([[11, item]]));

    const result = await manager.updateItemMetadata(11, {
      creators: ["Alice Walker", "SingleNameAuthor"],
    });

    expect(result).to.be.true;
    const creators = item.getCreators();
    expect(creators).to.have.length(2);
    expect(creators[0]).to.deep.equal({
      firstName: "Alice",
      lastName: "Walker",
      creatorType: "author",
    });
    expect(creators[1]).to.deep.equal({
      firstName: "",
      lastName: "SingleNameAuthor",
      creatorType: "author",
    });
  });

  it("should ignore protected system fields and return false if no valid updates", async function () {
    const manager = new ItemManager(mockAddon());
    const item = mockItem({
      id: 12,
      key: "KEY123",
      fields: { title: "Untouched" },
    });
    stubGetAsync(new Map([[12, item]]));

    const result = await manager.updateItemMetadata(12, {
      id: 999,
      key: "NEWKEY",
      itemType: "book",
    });

    expect(result).to.be.false;
    expect(item.id).to.equal(12);
    expect(item.key).to.equal("KEY123");
    expect((item as any).isSaved()).to.be.false;
  });

  it("should gate with ApprovalDialog when present and reject if denied", async function () {
    let dialogCalled = false;
    const mockApproval = {
      addPendingChange: async () => {
        dialogCalled = true;
        return false; // Denied by user
      },
    };
    const addon = mockAddon();
    (addon as any).data = { hermes: { approvalDialog: mockApproval } };
    const manager = new ItemManager(addon);
    const item = mockItem({ id: 13, fields: { title: "Before" } });
    stubGetAsync(new Map([[13, item]]));

    let threw = false;
    try {
      await manager.updateItemMetadata(13, { title: "After" });
    } catch {
      threw = true;
    }

    expect(dialogCalled).to.be.true;
    expect(threw).to.be.true;
    expect(item.getField("title")).to.equal("Before");
    expect((item as any).isSaved()).to.be.false;
  });
});
