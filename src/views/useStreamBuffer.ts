import {
  useCallback,
  useEffect,
  useRef,
} from "react";

import type { ChatMessage } from "./HermesChatView";

/**
 * Custom hook to buffer rapid stream chunks and flush them into React state
 * via requestAnimationFrame to avoid UI stutter.
 *
 * PERFORMANCE NOTES:
 * - Buffers content in refs (not state) to avoid re-renders on every chunk.
 * - Flushes via requestAnimationFrame for smooth updates.
 */
export function useStreamBuffer(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  showReasoning: boolean,
) {
  const streamingMessageIdRef = useRef<string | null>(null);
  const reasoningMessageIdRef = useRef<string | null>(null);
  const pendingContentRef = useRef("");
  const pendingReasoningRef = useRef("");
  const flushAnimationFrameRef = useRef<number | null>(null);

  const flushBuffer = useCallback(() => {
    const content = pendingContentRef.current;
    const reasoning = pendingReasoningRef.current;

    if (!content && !reasoning) {
      flushAnimationFrameRef.current = null;
      return;
    }

    setMessages((prev) => {
      const latestContent = pendingContentRef.current;
      const latestReasoning = pendingReasoningRef.current;

      pendingContentRef.current = "";
      pendingReasoningRef.current = "";
      flushAnimationFrameRef.current = null;

      let updated = prev;

      if (latestContent) {
        const assistantIndex = updated.findIndex(
          (m) => m.role === "assistant" && m.id === streamingMessageIdRef.current,
        );
        if (assistantIndex >= 0) {
          const newArray = [...updated];
          newArray[assistantIndex] = {
            ...newArray[assistantIndex]!,
            content: newArray[assistantIndex]!.content + latestContent,
          };
          updated = newArray;
        }
      }

      if (latestReasoning && showReasoning) {
        const reasoningIndex = updated.findIndex(
          (m) => m.role === "reasoning" && m.id === reasoningMessageIdRef.current,
        );
        if (reasoningIndex >= 0) {
          const newArray = [...updated];
          newArray[reasoningIndex] = {
            ...newArray[reasoningIndex]!,
            content: newArray[reasoningIndex]!.content + latestReasoning,
          };
          updated = newArray;
        } else {
          const newId = `reason_${Date.now()}`;
          reasoningMessageIdRef.current = newId;
          updated = [
            ...updated,
            {
              content: latestReasoning,
              id: newId,
              role: "reasoning",
              timestamp: Date.now(),
            },
          ];
        }
      }

      return updated;
    });
  }, [setMessages, showReasoning]);

  const scheduleFlush = useCallback(() => {
    if (flushAnimationFrameRef.current === null) {
      flushAnimationFrameRef.current = requestAnimationFrame(flushBuffer);
    }
  }, [flushBuffer]);

  const flushNow = useCallback(() => {
    if (flushAnimationFrameRef.current !== null) {
      cancelAnimationFrame(flushAnimationFrameRef.current);
    }
    flushBuffer();
  }, [flushBuffer]);

  const appendContent = useCallback(
    (content: string) => {
      pendingContentRef.current += content;
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const appendReasoning = useCallback(
    (reasoning: string) => {
      pendingReasoningRef.current += reasoning;
      scheduleFlush();
    },
    [scheduleFlush],
  );

  useEffect(() => {
    return () => {
      if (flushAnimationFrameRef.current !== null) {
        cancelAnimationFrame(flushAnimationFrameRef.current);
      }
    };
  }, []);

  return {
    appendContent,
    appendReasoning,
    flushNow,
    reasoningMessageIdRef,
    streamingMessageIdRef,
  };
}
