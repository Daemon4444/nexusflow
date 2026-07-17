// 子账号模型权限判定（纯函数，无 DB 调用）
// 语义详见 db/migrations/009_sub_account_model_permissions.sql

/** 判定该用户是否被允许调用某模型。主账号恒放行；子账号按白名单。 */
export function isModelAllowed(
  parentUserId: string | null | undefined,
  allowedModelsRaw: string | null | undefined,
  modelId: string
): boolean {
  if (!parentUserId) return true; // 非子账号（主账号/匿名 key 已由既有 guard 处理）→ 放行
  if (allowedModelsRaw == null) return true; // NULL = 不限（存量老号，向后兼容）
  try {
    const arr = JSON.parse(allowedModelsRaw);
    return Array.isArray(arr) && arr.includes(modelId);
  } catch {
    return false; // 数据损坏 → 保守拒绝
  }
}

/** 解析 allowed_models 原始值：NULL→null（不限），否则返回 string[]（可能为空数组=全禁） */
export function parseAllowedModels(raw: string | null | undefined): string[] | null {
  if (raw == null) return null;
  try {
    const a = JSON.parse(raw);
    if (!Array.isArray(a)) return [];
    return a.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

/** 校验/规整前端提交的 allowedModels：过滤非 string、去重；输入 null 视为"不设置"。 */
export function normalizeAllowedModels(input: unknown): string[] | null {
  if (input === null || input === undefined) return null;
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const x of input) {
    if (typeof x === "string" && x.trim()) seen.add(x.trim());
  }
  return [...seen];
}
