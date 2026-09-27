"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Select } from "antd";
import { adminGet, appendQuery, extractItems } from "../client";
import type { AdminCustomer, Paginated } from "../contracts";
import { useAdminSession } from "../gate/AdminGate";

/**
 * Picks a user by searching email / nickname / ID and returns the exact user
 * ID. Nothing is resolved automatically: the operator chooses a row that shows
 * email, nickname and ID together. Without customers.read it degrades to a
 * plain exact-ID input.
 */
export default function CustomerPicker({
  value,
  onChange,
  placeholder = "搜索邮箱、昵称或用户 ID",
}: {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}) {
  const { can } = useAdminSession();
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Array<{ value: string; label: React.ReactNode }>>([]);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const keyword = search.trim();
    if (!can("customers.read") || keyword.length < 2) {
      setOptions([]);
      return;
    }
    const requestId = ++requestRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      adminGet<Paginated<AdminCustomer> | AdminCustomer[]>(
        appendQuery("/api/admin/customers", { q: keyword, page: 1, pageSize: 10, range: "1d" }),
        controller.signal
      )
        .then((payload) => {
          if (requestId !== requestRef.current) return;
          setOptions(extractItems(payload).items.map((item) => ({
            value: item.id,
            label: (
              <span>
                <strong>{item.email || item.nickname}</strong>
                <span className="nf-admin-muted-text"> · {item.nickname} · </span>
                <code className="nf-admin-mono">{item.id}</code>
              </span>
            ),
          })));
        })
        .catch(() => {
          if (requestId === requestRef.current) setOptions([]);
        })
        .finally(() => {
          if (requestId === requestRef.current) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [can, search]);

  if (!can("customers.read")) {
    return <Input value={value} onChange={(event) => onChange?.(event.target.value.trim())} placeholder="用户 ID（精确）" />;
  }

  return (
    <Select
      showSearch={{ filterOption: false, onSearch: setSearch }}
      value={value || undefined}
      onChange={(next) => onChange?.(next)}
      options={options}
      loading={loading}
      placeholder={placeholder}
      notFoundContent={search.trim().length < 2 ? "至少输入 2 个字符" : loading ? "搜索中…" : "没有匹配的用户"}
      style={{ width: "100%" }}
      aria-label="选择用户"
    />
  );
}
