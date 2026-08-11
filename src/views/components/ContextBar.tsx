import React from "react";
import { ContextItem } from "../types";

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
        padding: "6px 12px",
        borderTop: "1px solid var(--hermes-border, #e0e0e0)",
        backgroundColor: "var(--hermes-bg-secondary, #fafafa)",
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
              ✕
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
