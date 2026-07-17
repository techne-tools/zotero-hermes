import type Addon from "../../addon";

export interface SlashCommand {
  description: string;
  execute: (addon: Addon, args: string) => Promise<null | string>;
  name: string;
}

/**
 * Registry of built-in slash commands.
 * Commands are invoked with `/name [args]` in the chat input.
 */
const BUILT_IN_COMMANDS: SlashCommand[] = [
  {
    description: "Clear the current conversation",
    execute: async (_addon) => {
      return null;
    },
    name: "clear",
  },
  {
    description: "Add selected Zotero items to context",
    execute: async (addon) => {
      const items = addon.data.hermes!.items.getSelectedItems();
      if (items.length === 0) {
        return "No items selected in Zotero library.";
      }
      const titles = items
        .map((item: Zotero.Item) => item.getDisplayTitle())
        .join(", ");
      return `Added **${items.length} item(s)** to context: ${titles}`;
    },
    name: "context",
  },
  {
    description: "Show available slash commands",
    execute: async (_addon) => {
      const commands = getSlashCommands();
      const list = commands
        .map((cmd) => `**/${cmd.name}** — ${cmd.description}`)
        .join("\n");
      return `Available commands:\n\n${list}`;
    },
    name: "help",
  },
  {
    description: "Export conversation as Markdown",
    execute: async (addon, _args) => {
      const messages = addon.data.hermes!.chat.getMessages();
      if (messages.length === 0) {
        return "No conversation to export.";
      }
      const md = messages
        .map((m: { role: string; content: string }) => {
          if (
            m.role === "system" ||
            m.role === "reasoning" ||
            m.role === "tool"
          )
            return "";
          return `## ${m.role.toUpperCase()}\n\n${m.content}`;
        })
        .filter(Boolean)
        .join("\n\n");
      return `Conversation exported:\n\n\`\`\`markdown\n${md}\n\`\`\``;
    },
    name: "export",
  },
  {
    description: "Save current conversation as a Zotero note",
    execute: async (addon, _args) => {
      const messages = addon.data.hermes!.chat.getMessages();
      if (messages.length === 0) {
        return "No conversation to save.";
      }

      // Find parent item if any is attached in context
      const attachedItems = addon.data.hermes!.items.getAttachedItems();
      const parentItemID =
        attachedItems.length > 0 ? attachedItems[0].id : undefined;

      // Format conversation as simple HTML
      const html = messages
        .map((m: { role: string; content: string }) => {
          if (
            m.role === "system" ||
            m.role === "reasoning" ||
            m.role === "tool"
          )
            return "";
          const roleName = m.role === "user" ? "You" : "Hermes";
          const formattedContent = m.content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br/>")
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
          return `<p><strong>${roleName}:</strong> ${formattedContent}</p>`;
        })
        .filter(Boolean)
        .join("\n");

      if (!html) {
        return "No chat messages to save.";
      }

      const dateStr = new Date().toLocaleString();
      const title = `Hermes Chat - ${dateStr}`;

      try {
        const noteId = await addon.data.hermes!.notes.writeNote(
          null,
          html,
          title,
          parentItemID,
        );
        return `Conversation successfully saved as note (ID: ${noteId}).`;
      } catch (err) {
        return `Failed to save conversation: ${(err as Error).message}`;
      }
    },
    name: "savechat",
  },
  {
    description:
      "Search notes and library items (title, authors, tags, abstract) and add them to context",
    execute: async (addon, args) => {
      const query = args.trim();
      if (!query) {
        return "Please specify a search query. Usage: `/search [query]`";
      }

      try {
        const noteResults = await addon.data.hermes!.notes.searchNotes(query);

        const s = new Zotero.Search();
        s.addCondition("quicksearch-titleCreatorYear", "contains", query);
        s.addCondition("itemType", "isNot", "attachment");
        s.addCondition("itemType", "isNot", "note");
        const itemIDs = await s.search();
        const items = itemIDs ? await Zotero.Items.getAsync(itemIDs) : [];

        if (noteResults.length === 0 && items.length === 0) {
          return `No notes or items found matching: **${query}**`;
        }

        const noteList = noteResults
          .slice(0, 5)
          .map((note) => {
            const rawNote = note.getNote() || "";
            const cleanText = rawNote
              .replace(/<[^>]*>/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            const preview =
              cleanText.length > 80
                ? cleanText.substring(0, 80) + "..."
                : cleanText;
            const title = (note as any).getNoteTitle?.() || "Untitled Note";
            return `- 📝 **Note: ${title}**: "${preview}" [Add to Context](add-context:${note.id})`;
          })
          .join("\n");

        const itemList = items
          .slice(0, 5)
          .map((item) => {
            const creators = item
              .getCreators()
              .map((c: any) => c.lastName || c.firstName)
              .join(", ");
            const creatorStr = creators ? ` by ${creators}` : "";
            const yearStr = item.getField("date")
              ? ` (${item.getField("date")})`
              : "";
            return `- 📚 **Item: ${item.getDisplayTitle()}**${creatorStr}${yearStr} [Add to Context](add-context:${item.id})`;
          })
          .join("\n");

        let output = `Search results for **${query}**:\n\n`;
        if (noteList) {
          output += `### Notes\n${noteList}\n\n`;
        }
        if (itemList) {
          output += `### Library Items\n${itemList}\n`;
        }

        return output;
      } catch (err) {
        return `Search failed: ${(err as Error).message}`;
      }
    },
    name: "search",
  },
  {
    description: "List all PDF annotations for the attached Zotero item",
    execute: async (addon, _args) => {
      const attachedItems = addon.data.hermes!.items.getAttachedItems();
      if (attachedItems.length === 0) {
        return "No item attached to the conversation. Attach an item first.";
      }
      const parentItem = attachedItems[0];
      try {
        const annotations = await addon.data.hermes!.annotations.getAnnotations(
          parentItem.id,
        );
        if (annotations.length === 0) {
          return `No PDF annotations found for **${parentItem.title}**.`;
        }

        const list = annotations
          .map((ann) => {
            const commentStr = ann.comment
              ? ` *(Comment: ${ann.comment})*`
              : "";
            return `- **Page ${ann.page}** (${ann.type}): "${ann.text}"${commentStr}`;
          })
          .join("\n");

        return `PDF Annotations for **${parentItem.title}**:\n\n${list}`;
      } catch (err) {
        return `Failed to load annotations: ${(err as Error).message}`;
      }
    },
    name: "annotations",
  },
  {
    description:
      "Generate in-text citation and bibliography for the attached item",
    execute: async (addon, args) => {
      const attachedItems = addon.data.hermes!.items.getAttachedItems();
      if (attachedItems.length === 0) {
        return "No item attached to the conversation. Attach an item first.";
      }
      const parentItem = attachedItems[0];
      const styleName = args.trim();

      let styleID = addon.data.hermes!.citations.getCurrentStyle();
      let styleTitle = addon.data.hermes!.citations.getCurrentStyleName();

      if (styleName) {
        const resolvedStyleID =
          addon.data.hermes!.citations.getStyleByIDOrName(styleName);
        if (resolvedStyleID) {
          styleID = resolvedStyleID;
          const style = Zotero.Styles.get(styleID);
          styleTitle = style?.title || styleID;
        } else {
          return `Could not find citation style matching: **${styleName}**. Try another style name.`;
        }
      }

      try {
        const item = await Zotero.Items.getAsync(parentItem.id);
        if (!item) return "Attached item not found.";

        const citation = addon.data.hermes!.citations.generateCitationWithStyle(
          item.id,
          styleID,
        );
        const bibliography =
          addon.data.hermes!.citations.generateBibliographyWithStyle(
            [item],
            styleID,
          );
        const cleanBib = bibliography
          ? bibliography.replace(/<[^>]*>/g, "").trim()
          : "None";

        return `### Citation (${styleTitle})\n\n**In-text Citation:**\n${citation || "None"}\n\n**Bibliography:**\n${cleanBib}`;
      } catch (err) {
        return `Failed to generate citation: ${(err as Error).message}`;
      }
    },
    name: "cite",
  },
  {
    description:
      "Suggest or apply tags for the attached Zotero item. Usage: `/tag` (to suggest) or `/tag tag1, tag2` (to apply)",
    execute: async (addon, args) => {
      const attachedItems = addon.data.hermes!.items.getAttachedItems();
      if (attachedItems.length === 0) {
        return "No item attached to the conversation. Attach an item first.";
      }
      const parentItem = attachedItems[0];
      const tagsString = args.trim();

      if (tagsString) {
        const tags = tagsString
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        if (tags.length === 0) return "No valid tags specified.";
        try {
          await addon.data.hermes!.tags.addTags(parentItem.id, tags);
          return `Successfully applied **${tags.length}** tags to **${parentItem.title}**: ${tags.join(", ")}`;
        } catch (err) {
          return `Failed to apply tags: ${(err as Error).message}`;
        }
      }

      try {
        const suggestions = await addon.data.hermes!.tags.suggestTags(
          parentItem.id,
        );
        if (suggestions.length === 0) {
          return `No tag suggestions found for **${parentItem.title}** (ensure you have existing tags in your library).`;
        }

        const list = suggestions
          .slice(0, 10)
          .map(
            (s) =>
              `- **${s.tag}** (Confidence: ${s.confidence}) [Apply](apply-tag:${s.tag})`,
          )
          .join("\n");

        return `Tag suggestions for **${parentItem.title}**:\n\n${list}\n\n*Or type \`/tag tag1, tag2\` to apply specific tags.*`;
      } catch (err) {
        return `Failed to generate tag suggestions: ${(err as Error).message}`;
      }
    },
    name: "tag",
  },
  {
    description:
      "Switch agent persona (e.g. `/persona researcher`, `/persona citation`, `/persona analyst`)",
    execute: async (addon, args) => {
      const input = args.trim().toLowerCase();
      if (!input) {
        const current = addon.data.hermes!.preferences.get(
          "currentPersona",
          "default",
        );
        return `Current persona is: **${current}**. Available personas: \`researcher\`, \`citation\`, \`analyst\`.`;
      }
      let persona: string;
      let title: string;
      if (input === "citation" || input === "cite") {
        persona = "citation";
        title = "Citation Expert";
      } else if (input === "analyst" || input === "analysis") {
        persona = "analyst";
        title = "Literature Analyst";
      } else if (input === "researcher" || input === "default") {
        persona = "default";
        title = "Research Assistant";
      } else {
        return `Unknown persona **${input}**. Available: \`researcher\`, \`citation\`, \`analyst\`.`;
      }

      try {
        addon.data.hermes!.preferences.set("currentPersona", persona);
        return `Switched agent persona to: **${title}**. All subsequent prompts will use this system persona.`;
      } catch (err) {
        return `Failed to set persona: ${(err as Error).message}`;
      }
    },
    name: "persona",
  },
];

/**
 * Get all registered slash commands.
 */
export function getSlashCommands(): SlashCommand[] {
  return BUILT_IN_COMMANDS;
}

/**
 * Parse a slash command from user input.
 * Returns null if input doesn't start with '/'.
 */
export function parseSlashCommand(
  input: string,
): { args: string; command: SlashCommand } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const spaceIndex = trimmed.indexOf(" ");
  const commandName = trimmed
    .slice(1, spaceIndex === -1 ? undefined : spaceIndex)
    .toLowerCase();
  const args = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1);

  const command = BUILT_IN_COMMANDS.find(
    (cmd) => cmd.name.toLowerCase() === commandName,
  );

  if (!command) {
    // Return as a synthetic command to forward to Hermes
    return {
      args,
      command: {
        description: "Send command to Hermes",
        execute: async () => null,
        name: commandName,
      },
    };
  }

  return { args, command };
}
