# NexusFlow ACK Serverless 云侧变更计划

> 状态：只读盘点与代码准备完成；ACK 产品开通仍被账户风控拦截。本文不授权自动切换生产。

## 当前事实

- ACK 所需官方服务角色已齐全，目标地域当前没有 ACK 集群。
- 两个目标 vSwitch 与 RDS、Redis、ALB 位于同一 VPC，地址余量充足。
- 已建立 staging 专用安全组；未创建集群、NAT、ECI 或其它持续计费资源。
- 目标地域没有可用 ACR 实例，镜像仓库仍是部署阻塞项。生产选型固定为北京 ACR 企业版经济版（99.95% SLA），不使用无 SLA、官方限定开发测试的新个人版。
- RDS/Redis 白名单尚未覆盖 ACK 工作负载 vSwitch；在 Pod 网络实际创建前不得提前放宽。
- 现有 ALB 是 Basic 版，服务器组无法开启连接排空；`UpdateLoadBalancerEdition` 的 Standard 升级 dry-run 已通过，生产灰度前仍需确认价格并在维护窗口单独执行，不能和应用切流同时操作。
- ALB idle/request 的产品上限分别为 60/180 秒。应用已采用默认 15 秒 SSE 心跳，Gateway 读超时 3600 秒。
- 当前云身份不能管理 `nexusflow.hk` DNS，staging 记录与最终切换需要 DNS 所属账号配合。

## 每次执行前的只读门禁

资源 ID 只通过受控环境变量传入，不写入 Git：

```bash
export ACK_REGION='<region>'
export ACK_VPC_ID='<vpc-id>'
export ACK_VSWITCH_IDS='<vswitch-a>,<vswitch-b>'
export ACK_SECURITY_GROUP_ID='<security-group-id>'
export ACK_ALB_ID='<alb-id>'
export ACK_HTTPS_LISTENER_ID='<https-listener-id>'
export ACK_SERVER_GROUP_ID='<ecs-server-group-id>'
export ACK_RDS_INSTANCE_ID='<rds-id>'
export ACK_REDIS_INSTANCE_ID='<redis-id>'
export ACK_DNS_DOMAIN='nexusflow.hk'
bash scripts/ack-cloud-preflight.sh
```

脚本无写操作，不打印资源 ID 或凭据。`FAIL` 是阻塞项；白名单和 DNS 在集群创建前允许为
`WARN`，进入 Ingress/流量验证前必须关闭相应告警。

## 风控解除后的唯一顺序

1. 只创建 ACK Serverless Pro staging 集群：同地域、同 VPC、双 vSwitch、不开放公网 API Server、不开公网 Ingress。
2. 创建北京 ACR 企业版经济版，绑定目标 VPC，建立私有命名空间，启用扫描与不可变版本；把三类镜像推送/同步后记录 digest。创建付费实例前以购买页当日价格再次确认。
3. 创建 staging namespace；通过受控脚本投射完整运行 Secret 和 Gateway Basic Auth Secret。
4. 仅把 ACK 工作负载 vSwitch CIDR加入 RDS/Redis 独立白名单组；禁止 `0.0.0.0/0`。
5. `ingress.enabled=false` 部署 API/Web/Gateway；验证副本跨故障域、健康、版本、SLS、OSS、Provider、RDS、Redis。
6. 接入 ARMS/Prometheus；先验证指标抓取，再开启 inflight HPA。CPU HPA 不能单独作为生产扩容依据。
7. 用独立 staging host 启用 Ingress，完成安全、长流、断流、账本、压力和滚动排空矩阵。
8. 评审 ALB Standard/连接排空方案并演练。只有 DNS 所属账号、ALB 灰度规则和一键 ECS 回退均就绪，才允许生产 1% 灰度。

## 明确禁止

- 风控解除后直接点“确认配置”创建默认网络或首尔集群；
- 在 ACR、白名单、Gateway、心跳、监控未就绪时打开生产 Ingress；
- 把本机代理变量或明文 `.env` 写入镜像、values、CI 日志；
- 以 DNS 全量切换替代 1%/5% 的可回滚 ALB 灰度；
- 在账本、成功率或成本追溯异常时继续放量；
- ACK 稳定前释放现有 ECS。
