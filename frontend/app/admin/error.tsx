"use client";

import { Button, Result } from "antd";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Result
      status="error"
      title="管理模块渲染失败"
      subTitle={error.message || "页面出现未预期错误，请重试。"}
      extra={<Button type="primary" onClick={reset}>重试</Button>}
    />
  );
}
