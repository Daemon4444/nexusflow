import type { FormInstance } from "antd";

/**
 * antd rejects validateFields() when a rule fails; the form already shows the
 * messages, so callers only need to stop. Returning null avoids an unhandled
 * promise rejection in every submit handler.
 */
export async function validateOrNull<T>(form: FormInstance<T>): Promise<T | null> {
  try {
    return await form.validateFields();
  } catch {
    return null;
  }
}
