export const NEW_PASSWORD_POLICY_MESSAGE =
  "新密码至少 12 个字符并包含三类字符，或使用至少 16 个字符的长密码";

export function isStrongNewPassword(password: string): boolean {
  if (password.length >= 16) return true;
  const categories = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  return password.length >= 12 && categories >= 3;
}

export function validateNewPassword(password: string): string | null {
  return isStrongNewPassword(password) ? null : NEW_PASSWORD_POLICY_MESSAGE;
}
