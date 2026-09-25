# 控制面 YAML 快照

`backend/src/cli/control-plane-export.ts` 把当前发布版本导出为本目录下的
`version.yaml`、`models.yaml`、`accounts.yaml`、`pools.yaml`、`routes.yaml`、`policies.yaml`：
每个文件是按 `id` 排序的列表，键按字母排序、字符串统一双引号，同样的配置总是得到逐字节相同的文件。
内容不含任何密钥（上游账号只有 `secret_ref`）。

生产快照由 `ops/cron/nexusflow-cp-export.cron`（需人工安装）每天写到
`/var/lib/nexusflow/cp-snapshots` 并在那里提交 git，不提交回本仓库。本目录下的 `example/` 是离线
回填（`docs/control-plane/backfill-offline-2026-09-25.content.json`）的导出示例，用于评审格式，
不代表生产现状。
