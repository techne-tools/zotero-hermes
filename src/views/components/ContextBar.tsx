import React from "react";
import { ContextItem } from "../types";
import { CloseIcon } from "./Icons";

interface ContextBarProps {
  items: ContextItem[];
  onRemoveItem: (id: string) => void;
  onClear: () => void;
}

export const ContextBar: React.FC<ContextBarProps> = ({
  items,
  onRemoveItem,
  onClear,
}) => {
  if (items.length === 0) return null;

  return (
    <div
      className="hermes-context-bar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 14px",
        borderTop: "1px solid var(--hermes-border, #dee1db)",
        backgroundColor: "var(--hermes-bg-secondary, #f7f8f5)",
      }}
    >
      <div className="hermes-context-chips">
        {items.map((item) => (
          <div key={item.id} className="hermes-context-chip">
            <span style={{ fontSize: "0.8em" }}>{item.text}</span>
            <button
              onClick={() => onRemoveItem(item.id)}
              className="hermes-context-chip-remove"
            >
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>
      <button onClick={onClear} className="hermes-context-clear">
        Clear
      </button>
    </div>
  );
};
