# OffCKB 安全审计 TODO

> 版本: v1 | 最后更新: 2026-02-28 | 状态: 进行中

## 项目概况
  - 语言: TypeScript (Node.js ≥20)
  - 类型: CLI 工具 / 区块链开发工具
  - 依赖数: 35 (22 runtime + 13 dev)
  - 源文件数: 57
  - 现有测试数: 3 (test files)

## 审计进度
  - 总 TODO 项: 20
  - ✅ 已完成: 0 | ❌ 发现问题: 0 | ⏳ 待审计: 20

---

## 第 1 章: DIM-INPUT 输入验证

- [ ] 🔴 **AUDIT-INPUT-001**: CLI 用户输入缺少验证 — txHash/address/amount 参数
  - **关联代码**: src/cmd/debug.ts:debugTransaction:11, src/cmd/deposit.ts:deposit:12, src/cmd/transfer.ts:transfer:11
  - **审计内容**:
    - txHash 参数是否校验为合法的 hex 格式 (0x + 64 hex chars)
    - toAddress 参数是否校验 CKB 地址格式
    - amountInCKB 是否校验为正数且在合理范围
  - **现有覆盖**: 无测试覆盖

- [ ] 🟠 **AUDIT-INPUT-002**: 版本号注入风险
  - **关联代码**: src/node/install.ts:installCKBBinary:13, src/util/validator.ts:isValidVersion:65
  - **审计内容**:
    - 版本字符串是否在用于 URL 和路径构造前被充分验证
    - 是否可通过精心构造的版本字符串实现路径遍历
  - **现有覆盖**: 无测试覆盖

- [ ] 🟡 **AUDIT-INPUT-003**: JSON-RPC 请求解析安全性
  - **关联代码**: src/tools/rpc-proxy.ts:proxy.on('proxyReq'):18-49
  - **审计内容**:
    - 畸形 JSON 输入是否安全处理
    - 超大 JSON payload 是否有大小限制
    - send_transaction 中的 tx hash 是否可被操控
  - **现有覆盖**: 无测试覆盖

- [ ] 🟡 **AUDIT-INPUT-004**: TOML 配置文件解析安全性
  - **关联代码**: src/devnet/config-editor.ts, src/node/init-chain.ts
  - **审计内容**:
    - TOML 解析是否正确处理恶意输入
    - 字符串替换是否可被注入破坏 TOML 格式
  - **现有覆盖**: tests/devnet-config-editor.test.ts 部分覆盖

---

## 第 2 章: DIM-CRYPTO 密码学操作

- [ ] 🔴 **AUDIT-CRYPTO-001**: 使用 Math.random() 生成私钥
  - **关联代码**: src/cmd/deposit.ts:generateHex:103-110
  - **审计内容**:
    - Math.random() 不是 CSPRNG，用于生成密钥材料存在可预测性
    - 生成的私钥是否可被猜测/枚举
    - 是否应替换为 crypto.randomBytes()
  - **现有覆盖**: 无测试覆盖

- [ ] 🟡 **AUDIT-CRYPTO-002**: 硬编码开发密钥安全性
  - **关联代码**: src/cfg/account.ts:1-68
  - **审计内容**:
    - 硬编码私钥是否有足够的警告标识
    - 是否存在这些密钥被用于非开发环境的风险
    - 是否有防护措施防止用户混淆开发密钥与生产密钥
  - **现有覆盖**: 无测试覆盖

---

## 第 3 章: DIM-LOGIC 业务逻辑

- [ ] 🔴 **AUDIT-LOGIC-001**: Shell 命令注入 — CKB 二进制执行
  - **关联代码**: src/cmd/node.ts:nodeDevnet:48-49, src/node/install.ts:getVersionFromBinary:118
  - **审计内容**:
    - exec()/execSync() 使用字符串拼接构造命令
    - encodeBinPathForTerminal() 仅用双引号包裹是否足够
    - binaryPath 自定义路径是否可包含 shell 元字符
  - **现有覆盖**: 无测试覆盖

- [ ] 🔴 **AUDIT-LOGIC-002**: Shell 命令注入 — CKB 调试器
  - **关联代码**: src/tools/ckb-debugger.ts:execute:74, src/cmd/debug.ts:debugRaw:121
  - **审计内容**:
    - execSync(command) 中 command 由用户输入拼接
    - txHash, cellIndex, cellType, scriptType 等参数直接嵌入命令字符串
    - 文件路径参数是否可被利用执行任意命令
  - **现有覆盖**: 无测试覆盖

- [ ] 🟠 **AUDIT-LOGIC-003**: 路径遍历 — 交易文件保存和读取
  - **关联代码**: src/tools/rpc-proxy.ts:42, src/cmd/debug.ts:buildTransactionJsonFilePath:99-108
  - **审计内容**:
    - txHash 用于构造文件路径，是否可注入 `../` 进行路径遍历
    - 实际上 txHash 来自 CCC 库的 hash() 计算，但需验证是否所有路径都如此
  - **现有覆盖**: 无测试覆盖

- [ ] 🟠 **AUDIT-LOGIC-004**: 竞态条件 — 节点启动时序
  - **关联代码**: src/cmd/node.ts:nodeDevnet:64
  - **审计内容**:
    - 硬编码 3 秒延迟启动 miner 和 proxy 是否可靠
    - 如果 CKB 节点未在 3 秒内就绪，是否导致错误
  - **现有覆盖**: 无测试覆盖

- [ ] 🟡 **AUDIT-LOGIC-005**: deepMerge 原型污染
  - **关联代码**: src/cfg/setting.ts:deepMerge:132-144
  - **审计内容**:
    - deepMerge 是否容易受到 __proto__ / constructor / prototype 污染
    - 来自 settings.json 的不可信数据是否可通过 deepMerge 污染 Settings 原型
  - **现有覆盖**: 无测试覆盖

---

## 第 4 章: DIM-MEMORY 资源安全

- [ ] 🟡 **AUDIT-MEMORY-001**: 大文件读取导致 OOM
  - **关联代码**: src/util/fs.ts:isBinaryFile, src/deploy/index.ts:deployBinary:106
  - **审计内容**:
    - 读取整个文件到内存 (readFileSync / readFileToUint8Array)
    - 超大二进制文件是否导致内存耗尽
    - JSON.parse 对超大 JSON 的处理
  - **现有覆盖**: 无测试覆盖

- [ ] 🟢 **AUDIT-MEMORY-002**: 无限轮询超时
  - **关联代码**: src/sdk/ckb.ts:waitFor:266-282
  - **审计内容**:
    - while(true) 循环是否有可靠超时机制
    - timeout 参数是否总是被传递
  - **现有覆盖**: 无测试覆盖

---

## 第 5 章: DIM-DEPS 依赖安全

- [ ] 🟠 **AUDIT-DEPS-001**: 依赖版本 CVE 检查
  - **关联代码**: package.json
  - **审计内容**:
    - 所有 runtime 依赖是否有已知 CVE
    - node-fetch v2 是否有已知漏洞
    - http-proxy 是否有已知漏洞
    - adm-zip 是否有已知漏洞 (zipslip)
    - blessed 0.1.81 是否有已知漏洞
  - **现有覆盖**: 无 audit 覆盖

- [ ] 🟢 **AUDIT-DEPS-002**: 废弃/不维护的依赖
  - **关联代码**: package.json
  - **审计内容**:
    - blessed 0.1.81 — 最后更新时间
    - node-fetch v2 — 是否应迁移到 v3 或 Node.js 内置 fetch
    - child_process 包 — npm 上的 child_process 是否为合法包
  - **现有覆盖**: 无覆盖

---

## 第 6 章: DIM-ERRINFO 错误处理与信息泄露

- [ ] 🟡 **AUDIT-ERRINFO-001**: 错误消息泄露敏感信息
  - **关联代码**: src/cmd/deposit.ts:43, src/util/request.ts:18
  - **审计内容**:
    - 随机私钥在日志中输出 (deposit.ts:43)
    - HTTP 错误消息是否泄露内部 URL 结构
    - 代理凭据是否可能在错误消息中暴露
  - **现有覆盖**: 无测试覆盖

- [ ] 🟡 **AUDIT-ERRINFO-002**: 代理凭据明文存储
  - **关联代码**: src/cfg/setting.ts:writeSettings:111-118, src/util/request.ts:proxyConfigToUrl:44-50
  - **审计内容**:
    - 代理用户名/密码以明文 JSON 存储在 settings.json
    - 代理凭据在 URL 字符串中传递
    - 是否应加密或限制文件权限
  - **现有覆盖**: 无测试覆盖

---

## 第 7 章: DIM-SERDE 序列化/反序列化

- [ ] 🟡 **AUDIT-SERDE-001**: JSON 反序列化安全性
  - **关联代码**: src/cfg/setting.ts:readSettings:101, src/cmd/debug.ts:22, src/deploy/migration.ts
  - **审计内容**:
    - JSON.parse 对不可信文件是否安全
    - 缺少 schema 验证的反序列化
    - 解析后的对象是否被类型安全地使用
  - **现有覆盖**: 无测试覆盖

---

## 附录 A: 审计执行日志
| 日期 | 审计项 | 发现摘要 | 状态 |
|------|--------|---------|------|

## 附录 B: 新增项跟踪
| 日期 | 新增项 ID | 来源 | 描述 |
|------|----------|------|------|

## 附录 C: 修复建议
| 审计项 | 严重级别 | 建议方案 | 修复状态 |
|--------|---------|---------|---------|
