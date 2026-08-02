import React from "react";
import { ContextItem } from "../types";

interface ContextBarProps {
  items: ContextItem[];
  onClear: () => void;
}

export const ContextBar: React.FC<ContextBarProps> = ({ items, onClear }) => {
  if (items.length === 0) return null;

  return (
    <div className="hermes-context-bar">
      <div className="hermes-context-chips">
        {items.map((item) => (
          <span key={item.id} className="hermes-context-chip">
            {item.text}
          </span>
        ))}
      </div>
      <button onClick={onClear}>Clear</button>
    </div>
  );
};
