# NexusFlow ACK Serverless 部署与切换 Runbook

> 状态：预发实施基线，**尚未部署生产**
>
> 日期：2026-08-02
> 适用 chart：`deploy/helm/nexusflow`

## 1. 决策与当前边界

当前规模优先采用 **ACK Serverless Pro + ECI**，而不是先购买固定 Worker ECS：API 与 Web 以 Pod 计费，可独立扩缩，同时保留 Kubernetes 的 Deployment、Service、HPA、PDB、Ingress 和声明式回滚能力。现有 ECS、ALB、RDS、Redis 和域名在验证期保持不变。

本仓库交付的是可测试的容器与 Helm 基线，不代表生产已切换。以下任一门禁未通过时，`ingress.enabled` 必须保持 `false`：

- Backend、Frontend 和 Gateway 镜像均已在 CI 中真实构建或镜像同步，并按不可变 digest 推送到生产 ACR；
- ECI 到 RDS、Redis、Provider、OSS、SLS 的网络和权限已验证；
- ALB 长连接、请求体、慢请求、连接数和速率保护与当前 nginx 等价；
- 活跃流/inflight 自定义扩缩容指标已落地；CPU HPA 只用于预发，不作为生产最终依据；
- 流式排空、计费闭合、版本一致、成本追溯和 ECS 回滚演练通过。

## 2. 资源基线与成本边界

默认最小副本：

| 工作负载 | 副本 | 单 Pod 申请 | HPA |
| --- | ---: | ---: | --- |
| API Runtime | 2 | 0.5 vCPU / 1 GiB | 2–8，预发先看 CPU 65% |
| Web Console | 2 | 0.25 vCPU / 0.5 GiB | 首期固定 2 |
| Edge Gateway | 2 | 0.25 vCPU / 0.5 GiB | 首期固定 2 |

常驻资源现为六个 Pod，历史“四 Pod 约 ¥242/月”的估算已不适用。实际还需计入 ALB、NAT、ACR、日志、监控和公网流量；创建前必须用阿里云价格计算器按当日价格重新确认。

不要为了 Serverless 立即释放现有 ECS。生产全量后至少保留一个观察周期，确认账本、SSE、P95 和回滚均稳定，再评估降配或释放。

## 3. 云侧前置条件

创建任何付费资源前完成并记录评审：

1. ACK Serverless Pro 与现有 RDS/Redis 位于同地域、同 VPC；为两个可用区准备 vSwitch。
2. ECI Pod 有稳定出网路径。优先共享 NAT Gateway/SNAT，不给每个 Pod 配公网 EIP；Provider 出站域名仍受应用 allowlist 约束。
3. RDS 白名单和 Redis 网络规则允许 ECI vSwitch/Pod 地址段，数据库连接总预算不因扩容被突破。
4. ACR 使用北京企业版经济版（99.95% SLA）、生产命名空间、镜像扫描和不可变 tag；个人版仅限开发测试，不进入生产。Helm 最终只引用 digest。
5. 创建或复用 `AlbConfig`，HTTPS 证书正确。ALB 当前上限是 idle 60 秒、request 180 秒，因此 API 必须每 15 秒发送 SSE 注释心跳，且 Gateway 读超时保持 3600 秒；不能把“将 ALB 调到 600 秒”作为方案。
6. SLS、OSS、RDS、Redis 均做最小权限。长期应迁移到 RAM Role/Workload Identity；迁移前仅允许受控 Kubernetes Secret 投射现有凭据。
7. 生产与预发使用不同 namespace，Secret、域名和账本数据不得混用。

## 4. Secret 与配置

Secret 名默认是 `nexusflow-runtime-secrets`。它只能由受控发布环境创建，禁止写入 values、Git、CI 输出或工单正文。

以当前受管生产环境变量清单为源，至少核对以下类别，不在本文记录值：

- PostgreSQL：`DATABASE_URL` 或完整 `PG_*`；
- Redis：`REDIS_*`；
- Provider、支付、邮件、会话、Provider Secret 加密相关变量；
- OSS 与 SLS 访问配置；
- `PROVIDER_OUTBOUND_HOST_ALLOWLIST`；
- `SLS_LOG_FULL_CONTENT` 等隐私/保留策略。

禁止把主机时代的 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 注入受管运行时。容器固定设置 `NODE_ENV=production`、`NEXUSFLOW_ENV=production`、`NEXUSFLOW_RELEASE_RUNTIME=true` 和 `NEXUSFLOW_CONTAINER_RUNTIME=true`。

从生产配置生成 Kubernetes Secret 前先执行本地只读校验；脚本不会显示任何值，
`--apply` 时也不会把渲染后的 Secret 保存到磁盘：

```bash
chmod 600 '<controlled-env-file>'
bash scripts/prepare-ack-runtime-secret.sh --env-file '<controlled-env-file>'
bash scripts/prepare-ack-runtime-secret.sh \
  --env-file '<controlled-env-file>' \
  --namespace nexusflow-staging \
  --apply
```

`/admin` 继续保留现网 nginx Basic Auth，不能只依赖应用管理员登录。使用现有受控
htpasswd 文件创建独立 Secret，脚本只检查哈希格式和条目数：

```bash
chmod 600 '<controlled-htpasswd-file>'
bash scripts/prepare-ack-gateway-auth.sh --htpasswd-file '<controlled-htpasswd-file>'
bash scripts/prepare-ack-gateway-auth.sh \
  --htpasswd-file '<controlled-htpasswd-file>' \
  --namespace nexusflow-staging \
  --apply
```

生产与 staging 当前必须使用相同的完整运行配置，差异由非秘密 Helm values 表达；不得手工挑几项 Key 后让缺失渠道在运行时才暴露。`values.staging.example.yaml` 只包含非秘密覆盖项，镜像地址和 digest 必须由发布命令单独传入。

## 5. 构建与静态验证

```bash
export BUILD_SHA="$(git rev-parse HEAD)"
bash scripts/test-container-images.sh

digest='sha256:<64-hex-digest>'
helm lint deploy/helm/nexusflow \
  --set images.backend.repository='<acr>/nexusflow/backend' \
  --set images.backend.digest="$digest" \
  --set images.frontend.repository='<acr>/nexusflow/frontend' \
  --set images.frontend.digest="$digest" \
  --set images.gateway.repository='<acr>/nexusflow/nginx-unprivileged' \
  --set images.gateway.digest="$gateway_digest"
```

三个镜像应分别取得真实 digest；示例只说明参数格式，禁止复用占位 digest 发布。Gateway 基于固定 OCI digest 的非 root nginx 1.30.4 包装镜像，最终同样推送 ACR 并按 digest 引用。CI 会真实构建三个镜像，并对 chart 做严格 Kubernetes schema 校验。

## 6. 预发部署顺序

1. 创建 namespace、最小权限 Secret 和 ACR 拉取权限。
2. 先部署 `ingress.enabled=false`，确认 Pod 选择到了预期 ECI 规格，且两个副本分布满足故障域要求。
3. 从集群内经 Gateway 验证 `/api/health/live`、`/api/health/ready` 和 `/api/version`；ALB 只允许指向 `nexusflow-gateway`，不得直接暴露 API/Web Service。
   同时由集群内 Prometheus 抓取 `/_internal/metrics`，确认
   `nexusflow_public_api_inflight_requests` 随长请求开始/结束准确增减。该路径不允许加入公网 Ingress。
4. 若有迁移，先做加密备份和 PG16 异地恢复；迁移使用独立 Job，并遵循 expand/contract。应用 rollout 与 migration 不同时启动。
5. 使用独立预发 host 打开 Ingress，不修改生产 DNS/ALB 权重。
6. 连续通过下面的验收矩阵后，才进入生产影子/小权重阶段。

Helm upgrade 必须使用原子等待，并保存前一 revision：

```bash
helm upgrade --install nexusflow deploy/helm/nexusflow \
  --namespace nexusflow-staging --create-namespace \
  --atomic --wait --timeout 15m \
  -f '<controlled-values-file>'
```

## 7. 必测矩阵

| 类别 | 验证项 | 通过标准 |
| --- | --- | --- |
| 生命周期 | live、ready、启动失败、依赖中断 | live 只反映进程；ready 在 drain/依赖异常时摘流 |
| SSE | 正常完成、客户端取消、上游中断、上游静默 2 分钟 | 每 15 秒出现合法 SSE 注释心跳；无异常断流；取消传递；账本和容量租约闭合 |
| 发布 | 持有 5–10 分钟长流时滚动更新 | 旧 Pod 先摘流并排空；不强杀；`maxUnavailable=0` |
| 安全 | 无 Key、大 body、慢 body、高并发、`/proxy/v1*`、编码模型 ID | 门禁与当前 nginx 等价；旧代理路径 404；模型 ID 不被改写 |
| 计费 | 非流式、流式失败、重试、缓存、折扣缺失 | 不重扣；无折扣按原价；成功成本 100% 可追溯 |
| 容量 | Redis 故障、Provider 429/5xx、多 Pod 并发 | 不误判容量耗尽；全局配额一致；故障分类正确 |
| 版本 | Web/API `/api/version` 与镜像 digest | 同一发布无静态资源混发 |
| 扩缩 | 2→N→2，有活跃流时缩容 | 不丢流；不打爆 RDS；缩容稳定窗生效 |

生产前必须把 HPA 从“仅 CPU”升级为至少包含活跃流或 inflight 指标，并用 ARMS/Prometheus Adapter 验证。chart 已提供默认关闭的
`backend.autoscaling.inflight` Pods 指标；只有在 Adapter 的 Custom Metrics API 能稳定返回每 Pod 的
`nexusflow_public_api_inflight_requests` 后才能启用。流式代理主要是 I/O 负载，CPU 低不代表容量充足。

## 8. 生产灰度与停止条件

生产入口按 `0% → 1% → 5% → 20% → 50% → 100%` 推进，每级至少覆盖代表性流量窗口。ECS 始终保留为可回退后端。

以下任一指标越界立即停止并回到 ECS：

- 平台 5xx、异常断流、P95 相对 ECS 基线上升；
- Pod restart、readiness 抖动、ALB 502/504；
- 未闭合预占、重复扣费、成本 `unknown` 或对账差异；
- Redis/RDS 错误率、连接数或 Provider 容量异常；
- 前端 chunk/version 不一致。

回滚优先恢复 ALB 权重到 ECS，再执行 `helm rollback`；禁止在故障时临时修改价本、路由或数据库 schema 掩盖问题。若新版本包含 contract migration，必须先确保旧版本兼容，不能直接回滚应用。

## 9. 当前实现说明

- Backend 有独立 `/api/health/live` 和 `/api/health/ready`；ready 在 drain 后返回 503。
- 所有 SSE 入口统一发送默认 15 秒注释心跳，配置被限制在 5–45 秒，确保低于 ALB 60 秒 idle 上限。
- Pod `preStop` 先发送 `SIGUSR2` 摘流，再由 `SIGTERM` 启动连接排空；默认排空 540 秒，Pod grace period 600 秒。
- liveness 不依赖 RDS/Redis，避免短暂依赖故障触发重启风暴。
- API/Web/Gateway 均至少两个副本、`maxUnavailable=0`，并配置 PDB。
- chart 默认关闭公网 Ingress 和 migration，避免误操作直接切流或改库。
- 集群内 Gateway 固化现网入口契约：大上下文 50 MiB、Embedding 8 MiB、上传 101 MiB、音频/上传限流、`/proxy/v1*` 与 `/api/proxy/v1*` 返回 404、流式不缓冲、管理页 Basic Auth。

这些是必要条件，不等于已达到生产切换条件。云侧网络、ALB、真实镜像、长流压测和资金对账仍必须在预发环境完成。
