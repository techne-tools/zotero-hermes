import React from "react";

interface SidePanelsProps {
  isConversationListOpen: boolean;
  isSearchOpen: boolean;
  isSessionSettingsOpen: boolean;
  isExportOpen: boolean;
  onCloseAll: () => void;
  // Panel content components/props would go here
}

export const SidePanels: React.FC<SidePanelsProps> = ({
  isConversationListOpen,
  isSearchOpen,
  isSessionSettingsOpen,
  isExportOpen,
  onCloseAll,
}) => {
  return (
    <>
      {isExportOpen && <div className="hermes-export-dropdown">Export Options...</div>}
      {isConversationListOpen && <div className="hermes-conversation-list">Conversations...</div>}
      {isSearchOpen && <div className="hermes-search-bar">Search...</div>}
      {isSessionSettingsOpen && <div className="hermes-session-settings">Settings...</div>}
    </>
  );
};
