import React from "react";
import type Addon from "../../addon";
import {
  SearchIcon,
  MenuIcon,
  AttachIcon,
  PlusIcon,
  SettingsIcon,
} from "./Icons";

interface ChatHeaderProps {
  addon: Addon;
  onSearchToggle: () => void;
  onConversationListToggle: () => void;
  onAttachItems: () => void;
  onNewChat: () => void;
  onSettingsToggle: () => void;
  onExportToggle: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  addon,
  onSearchToggle,
  onConversationListToggle,
  onAttachItems,
  onNewChat,
  onSettingsToggle,
  onExportToggle,
}) => {
  const settings = addon.data.hermes?.preferences;

  return (
    <div
      className="hermes-chat-header"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 12px",
        borderBottom: "1px solid var(--hermes-border, #e0e0e0)",
        backgroundColor: "var(--hermes-bg-secondary, #fafafa)",
        minHeight: "40px",
      }}
    >
      <div
        className="hermes-chat-header-left"
        style={{ display: "flex", alignItems: "center", gap: "8px" }}
      >
        <span
          className="hermes-chat-agent-name"
          style={{ fontWeight: 600, fontSize: "0.95em" }}
        >
          {settings?.get("chatAgentName", "Hermes")}
        </span>
      </div>
      <div
        className="hermes-chat-header-right"
        style={{ display: "flex", gap: "4px", alignItems: "center" }}
      >
        <button
          onClick={onSearchToggle}
          className="hermes-icon-btn"
          title="Search Messages (Ctrl+F)"
        >
          <SearchIcon />
        </button>
        <button
          onClick={onConversationListToggle}
          className="hermes-icon-btn"
          title="Previous Conversations"
        >
          <MenuIcon />
        </button>
        <button
          onClick={onAttachItems}
          className="hermes-icon-btn"
          title="Attach Selected Items"
        >
          <AttachIcon />
        </button>
        <button
          onClick={onNewChat}
          className="hermes-icon-btn"
          title="New Chat"
        >
          <PlusIcon />
        </button>
        <button
          onClick={onSettingsToggle}
          className="hermes-icon-btn"
          title="Session Settings"
        >
          <SettingsIcon />
        </button>
        <button
          onClick={onExportToggle}
          className="hermes-icon-btn"
          title="Export Conversation"
          style={{ fontSize: "1.1em", padding: 0 }}
        >
          📥
        </button>
      </div>
    </div>
  );
};
