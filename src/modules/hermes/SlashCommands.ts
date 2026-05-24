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
      const titles = items.map((item: Zotero.Item) => item.getDisplayTitle()).join(", ");
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
        .map((m: { role: string; content: string }) => `## ${m.role}\n\n${m.content}`)
        .join("\n\n");
      return `Conversation exported:\n\n\`\`\`markdown\n${md}\n\`\`\``;
    },
    name: "export",
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
