"use client";

import { useState } from "react";

export interface HistoryEntry {
  id: string;
  timestamp: number;
  model: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  systemPrompt?: string;
  input: string;
}

const STORAGE_KEY = "playground_history";
const MAX_HISTORY = 20;

export function saveToHistory(entry: Omit<HistoryEntry, "id" | "timestamp">) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const history: HistoryEntry[] = stored ? JSON.parse(stored) : [];

    const newEntry: HistoryEntry = {
      id: `history_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      ...entry,
    };

    // Add to front, limit to MAX_HISTORY
    history.unshift(newEntry);
    if (history.length > MAX_HISTORY) {
      history.pop();
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    return true;
  } catch {
    return false;
  }
}

export function loadHistory(): HistoryEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

export function deleteHistoryEntry(id: string) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const history: HistoryEntry[] = stored ? JSON.parse(stored) : [];
    const filtered = history.filter(h => h.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}

interface PlaygroundHistoryProps {
  onSelect: (entry: HistoryEntry) => void;
  currentModel: string;
}

export default function PlaygroundHistory({ onSelect, currentModel }: PlaygroundHistoryProps) {
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === "undefined") return [];
    return loadHistory();
  });
  const [showHistory, setShowHistory] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  function handleSelect(entry: HistoryEntry) {
    onSelect(entry);
    setShowHistory(false);
  }

  function handleClear() {
    clearHistory();
    setHistory([]);
    setConfirmClear(false);
  }

  function handleDelete(id: string) {
    deleteHistoryEntry(id);
    setHistory(loadHistory());
  }

  function formatTime(timestamp: number) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (history.length === 0) return null;

  return (
    <div style={{ position: "relative" }}>
      {/* Toggle button */}
      <button
        type="button"
        className="btn-secondary"
        onClick={() => setShowHistory(!showHistory)}
        style={{
          padding: "6px 12px",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span>History ({history.length})</span>
      </button>

      {/* Dropdown */}
      {showHistory && (
        <div
          className="animate-fadeIn"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 12,
            minWidth: 280,
            maxWidth: 320,
            maxHeight: 400,
            overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            zIndex: 100,
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}>
            <span style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}>
              Recent Conversations
            </span>
            <button
              onClick={() => setConfirmClear(true)}
              style={{
                padding: "4px 10px",
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 500,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-tertiary)",
                cursor: "pointer",
              }}
            >
              Clear All
            </button>
          </div>

          {confirmClear && (
            <div style={{ padding: 10, border: "1px solid var(--danger-border)", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: 8, marginBottom: 10, fontSize: 12 }}>
              <div style={{ marginBottom: 8 }}>Clear all history?</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-danger" onClick={handleClear} style={{ padding: "4px 10px", fontSize: 11 }}>Clear</button>
                <button className="btn-secondary" onClick={() => setConfirmClear(false)} style={{ padding: "4px 10px", fontSize: 11 }}>Cancel</button>
              </div>
            </div>
          )}

          {/* History list */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            {history.map(entry => (
              <div
                key={entry.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: entry.model === currentModel ? "var(--accent-bg)" : "var(--bg)",
                  cursor: "pointer",
                }}
              >
                {/* Header */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)",
                  }}>
                    {entry.model}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                  }}>
                    {formatTime(entry.timestamp)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(entry.id);
                    }}
                    style={{
                      marginLeft: "auto",
                      padding: 2,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-tertiary)",
                      fontSize: 12,
                    }}
                  >
                    ×
                  </button>
                </div>

                {/* Preview */}
                <div style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {entry.input.slice(0, 50)}...
                </div>

                {/* Action */}
                <button
                  onClick={() => handleSelect(entry)}
                  style={{
                    marginTop: 8,
                    padding: "5px 10px",
                    borderRadius: 5,
                    fontSize: 11,
                    fontWeight: 600,
                    border: "none",
                    background: "var(--accent)",
                    color: "#fff",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
