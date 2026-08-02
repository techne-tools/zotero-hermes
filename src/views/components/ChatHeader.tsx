import React from "react";
import type Addon from "../../../addon";
import { SearchIcon, MenuIcon, AttachIcon, PlusIcon, SettingsIcon } from "../Icons"; // Will need to move icons too

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
    <div className="hermes-chat-header">
      <div className="hermes-chat-header-left">
        <span className="hermes-chat-agent-name">
          {settings?.get("chatAgentName", "Hermes")}
        </span>
      </div>
      <div className="hermes-chat-header-right">
        <button onClick={onSearchToggle} title="Search Messages (Ctrl+F)">
          <SearchIcon />
        </button>
        <button onClick={onConversationListToggle} title="Previous Conversations">
          <MenuIcon />
        </button>
        <button onClick={onAttachItems} title="Attach Selected Items">
          <AttachIcon />
        </button>
        <button onClick={onNewChat} title="New Chat">
          <PlusIcon />
        </button>
        <button onClick={onSettingsToggle} title="Session Settings">
          <SettingsIcon />
        </button>
        <button onClick={onExportToggle} title="Export Conversation">
          📥
        </button>
      </div>
    </div>
  );
};
