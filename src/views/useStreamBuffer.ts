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
 * Mirrors obsidian-hermes/src/Views/useStreamBuffer.ts
 *
 * PERFORMANCE NOTES:
 * - Buffers content in refs (not state) to avoid re-renders on every chunk.
 * - Flushes via requestAnimationFrame for smooth updates.
 *
 * USAGE:
 *   const { appendContent, appendReasoning, flushNow } = useStreamBuffer(
 *     setMessages, showReasoning, enableTypingSound, enableHaptic
 *   );
 *   appendContent("new chunk"); // queued for next rAF flush
 *   flushNow(); // force immediate flush (e.g., on stream end)
 */
export function useStreamBuffer(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  showReasoning: boolean,
  enableTypingSound = false,
  enableHaptic = false,
) {
  const streamingMessageIdRef = useRef<string | null>(null);
  const reasoningMessageIdRef = useRef<string | null>(null);
  const pendingContentRef = useRef("");
  const pendingReasoningRef = useRef("");
  const flushAnimationFrameRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSoundTimeRef = useRef<number>(0);

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
          // Insert reasoning BEFORE the assistant message so it appears first
          const assistantIndex = updated.findIndex(
            (m) => m.role === "assistant" && m.id === streamingMessageIdRef.current,
          );
          const reasoningMsg = {
            content: latestReasoning,
            id: newId,
            isCollapsed: true,
            role: "reasoning" as const,
            timestamp: Date.now(),
          };
          if (assistantIndex >= 0) {
            const newArray = [...updated];
            newArray.splice(assistantIndex, 0, reasoningMsg);
            updated = newArray;
          } else {
            updated = [...updated, reasoningMsg];
          }
        }
      }

      return updated;
    });
  }, [setMessages, showReasoning]);

  const scheduleFlush = useCallback(() => {
    if (flushAnimationFrameRef.current === null) {
      // Use setTimeout instead of requestAnimationFrame for Zotero sandbox compatibility
      flushAnimationFrameRef.current = setTimeout(flushBuffer, 50);
    }
  }, [flushBuffer]);

  const flushNow = useCallback(() => {
    if (flushAnimationFrameRef.current !== null) {
      clearTimeout(flushAnimationFrameRef.current as unknown as ReturnType<typeof setTimeout>);
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
        clearTimeout(flushAnimationFrameRef.current);
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
