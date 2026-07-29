export interface OpenAiStreamState {
  sawData: boolean;
  sawDone: boolean;
  sawFinishReason: boolean;
  sawUsage: boolean;
  upstreamErrorCode: string | null;
}

export type OpenAiStreamObservation =
  | { kind: "other" }
  | { kind: "done" }
  | { kind: "data" }
  | { kind: "error"; code: string };

export type OpenAiStreamOutcome =
  | {
      ok: true;
      synthesizeDone: boolean;
      terminalReason: "upstream_done" | "finish_reason";
    }
  | {
      ok: false;
      code: "upstream_stream_error" | "upstream_stream_interrupted" | "upstream_timeout";
    };

export function createOpenAiStreamState(): OpenAiStreamState {
  return {
    sawData: false,
    sawDone: false,
    sawFinishReason: false,
    sawUsage: false,
    upstreamErrorCode: null,
  };
}

export function observeOpenAiStreamLine(
  state: OpenAiStreamState,
  line: string
): OpenAiStreamObservation {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return { kind: "other" };

  const payload = trimmed.slice(5).trimStart();
  if (payload === "[DONE]") {
    state.sawDone = true;
    return { kind: "done" };
  }

  if (!payload) return { kind: "other" };
  state.sawData = true;
  try {
    const event = JSON.parse(payload);
    if (event?.error) {
      const code = String(event.error.code || event.error.type || "upstream_stream_error").slice(0, 100);
      state.upstreamErrorCode = code;
      return { kind: "error", code };
    }
    if (event?.usage && typeof event.usage === "object") state.sawUsage = true;
    if (event?.choices?.some?.((choice: any) => choice?.finish_reason)) {
      state.sawFinishReason = true;
    }
  } catch {
    // A malformed data line is forwarded unchanged. If no valid terminal
    // event follows, finishOpenAiStream() classifies the stream as interrupted.
  }
  return { kind: "data" };
}

export function finishOpenAiStream(
  state: OpenAiStreamState,
  readError?: { name?: string; code?: string } | null
): OpenAiStreamOutcome {
  if (state.upstreamErrorCode) {
    return { ok: false, code: "upstream_stream_error" };
  }
  if (state.sawDone) {
    return { ok: true, synthesizeDone: false, terminalReason: "upstream_done" };
  }

  // Some OpenAI-compatible providers close after a valid finish_reason (and
  // often usage) without the optional final [DONE] sentinel. Normalize that
  // harmless tail difference so strict clients do not report a false failure.
  if (state.sawFinishReason) {
    return { ok: true, synthesizeDone: true, terminalReason: "finish_reason" };
  }

  const errorName = String(readError?.name || "");
  const errorCode = String(readError?.code || "");
  if (
    errorName === "AbortError" ||
    errorName === "TimeoutError" ||
    errorCode === "ABORT_ERR" ||
    errorCode === "UND_ERR_ABORTED"
  ) {
    return { ok: false, code: "upstream_timeout" };
  }
  return { ok: false, code: "upstream_stream_interrupted" };
}
