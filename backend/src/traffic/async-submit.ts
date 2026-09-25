/**
 * Shared submission of async (video) tasks: the adapter call is described
 * by a serializable {kind, args} so a queued task can be submitted later by
 * the queue worker with freshly resolved credentials.
 */
import {
  adaptHappyHorseRequest,
  adaptImageRequest,
  adaptPixVerseRequest,
  adaptSeedanceRequest,
  adaptVideoRequest,
} from "../services/adapters";

export type AsyncAdapterKind = "image" | "pixverse" | "seedance" | "happyhorse" | "video";

export interface AsyncAdapterCall {
  kind: AsyncAdapterKind;
  args: Record<string, unknown>;
}

export function adaptAsync(call: AsyncAdapterCall, apiKey: string, nativeBaseUrl: string) {
  const args = call.args as any;
  switch (call.kind) {
    case "image":
      return adaptImageRequest(apiKey, args, { nativeBase: nativeBaseUrl });
    case "pixverse":
      return adaptPixVerseRequest(apiKey, args, nativeBaseUrl);
    case "seedance":
      return adaptSeedanceRequest(apiKey, args, nativeBaseUrl);
    case "happyhorse":
      return adaptHappyHorseRequest(apiKey, args, nativeBaseUrl);
    default:
      return adaptVideoRequest(apiKey, args, nativeBaseUrl);
  }
}

export type AsyncSubmitOutcome =
  | { ok: true; upstreamTaskId: string }
  | { ok: false; status: number; message: string };

/** Interprets an upstream submission response (all task protocols). */
export function parseAsyncSubmit(
  protocol: "dashscope" | "pixverse" | "volcengine",
  httpStatus: number,
  httpOk: boolean,
  data: any
): AsyncSubmitOutcome {
  const volcEngineError = protocol === "volcengine" && data?.error;
  if (!httpOk || data?.code || (data?.ErrCode !== undefined && data.ErrCode !== 0) || volcEngineError) {
    return {
      ok: false,
      status: httpOk ? 400 : httpStatus,
      message: data?.message || data?.error?.message || data?.ErrMsg || `HTTP ${httpStatus}`,
    };
  }
  let upstreamTaskId: string | undefined;
  if (data?.output?.task_id) upstreamTaskId = String(data.output.task_id);
  if (data?.Resp?.video_id) upstreamTaskId = String(data.Resp.video_id);
  if (data?.Resp?.task_id) upstreamTaskId = String(data.Resp.task_id);
  if (protocol === "volcengine" && typeof data?.id === "string" && data.id) upstreamTaskId = data.id;
  if (!upstreamTaskId) return { ok: false, status: 502, message: "Upstream did not return a task ID" };
  return { ok: true, upstreamTaskId };
}
