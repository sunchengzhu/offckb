# OffCKB 安全审计 TODO

> 版本: v2 | 最后更新: 2026-02-28 | 状态: 已完成

## 项目概况
  - 语言: TypeScript (Node.js ≥20)
  - 类型: CLI 工具 / 区块链开发工具
  - 依赖数: 35 (22 runtime + 13 dev)
  - 源文件数: 57
  - 现有测试数: 4 (test files, 40 tests)

## 审计进度
  - 总 TODO 项: 20
  - ✅ 已完成: 20 | ❌ 发现问题: 5 (已修复 4) | ⏳ 待审计: 0

---

## 第 1 章: DIM-INPUT 输入验证

- [x] 🔴 **AUDIT-INPUT-001**: CLI 用户输入缺少验证 — txHash/address/amount 参数
  - **关联代码**: src/cmd/debug.ts:debugTransaction:11, src/cmd/deposit.ts:deposit:12, src/cmd/transfer.ts:transfer:11
  - **审计内容**:
    - txHash 参数是否校验为合法的 hex 格式 (0x + 64 hex chars)
    - toAddress 参数是否校验 CKB 地址格式
    - amountInCKB 是否校验为正数且在合理范围
  - **现有覆盖**: 无测试覆盖
  - **发现记录**: ⚠️ 建议改进 — txHash、address、amount 均未在 CLI 入口层校验。不过 CCC SDK 在实际执行时会抛出异常（如 address 格式不合法），因此不会导致资金损失。txHash 用于文件路径时，因为来自 CLI 用户本地输入且用于本地文件操作（非远程攻击向量），实际风险较低。建议在 CLI 层添加格式校验以提升用户体验。

- [x] 🟠 **AUDIT-INPUT-002**: 版本号注入风险
  - **关联代码**: src/node/install.ts:installCKBBinary:13, src/util/validator.ts:isValidVersion:65
  - **审计内容**:
    - 版本字符串是否在用于 URL 和路径构造前被充分验证
    - 是否可通过精心构造的版本字符串实现路径遍历
  - **现有覆盖**: 无测试覆盖
  - **发现记录**: ✅ 通过 — isValidVersion() 使用 `/^v?\d+\.\d+\.\d+(-rc\d+)?$/` 正则严格校验版本格式，且 path.join() 会规范化路径，不存在路径遍历风险。版本号仅包含数字、点和 `-rc` 后缀，无法注入 shell 命令或路径分隔符。

- [x] 🟡 **AUDIT-INPUT-003**: JSON-RPC 请求解析安全性
  - **关联代码**: src/tools/rpc-proxy.ts:proxy.on('proxyReq'):18-49
  - **审计内容**:
    - 畸形 JSON 输入是否安全处理
    - 超大 JSON payload 是否有大小限制
    - send_transaction 中的 tx hash 是否可被操控
  - **现有覆盖**: 无测试覆盖
  - **发现记录**: ⚠️ 建议改进 — JSON 解析失败已在 try-catch 中处理。txHash 由 CCC 库的 cccTx.hash() 计算（SHA256），不可被操控。但代理无请求体大小限制（理论上可 OOM，但仅影响本地开发环境）。实际风险低，因为 RPC 代理仅监听 127.0.0.1。

- [x] 🟡 **AUDIT-INPUT-004**: TOML 配置文件解析安全性
  - **关联代码**: src/devnet/config-editor.ts, src/node/init-chain.ts
  - **审计内容**:
    - TOML 解析是否正确处理恶意输入
    - 字符串替换是否可被注入破坏 TOML 格式
  - **现有覆盖**: tests/devnet-config-editor.test.ts 部分覆盖
  - **发现记录**: ⚠️ 建议改进 — init-chain.ts 的 `data.replace('http://ckb:8114/', settings.devnet.rpcUrl)` 中 rpcUrl 来自 defaultSettings（硬编码为 http://127.0.0.1:8114）或用户配置的 settings.json，理论上可注入特殊字符破坏 TOML。但 devnet-config-editor.ts 有良好的 URL 格式验证。实际风险低。

---

## 第 2 章: DIM-CRYPTO 密码学操作

- [x] 🔴 **AUDIT-CRYPTO-001**: 使用 Math.random() 生成私钥
  - **关联代码**: src/cmd/deposit.ts:generateHex:103-110
  - **审计内容**:
    - Math.random() 不是 CSPRNG，用于生成密钥材料存在可预测性
    - 生成的私钥是否可被猜测/枚举
    - 是否应替换为 crypto.randomBytes()
  - **现有覆盖**: tests/security-fixes.test.ts
  - **发现记录**: ❌ 发现漏洞 → ✅ 已修复 — Math.random() 是伪随机数，生成的私钥可被预测。已替换为 crypto.randomBytes()。虽然该密钥仅用于 testnet faucet 临时账户（资金会立即转出），但使用 CSPRNG 是密码学最佳实践。

- [x] 🟡 **AUDIT-CRYPTO-002**: 硬编码开发密钥安全性
  - **关联代码**: src/cfg/account.ts:1-68
  - **审计内容**:
    - 硬编码私钥是否有足够的警告标识
    - 是否存在这些密钥被用于非开发环境的风险
    - 是否有防护措施防止用户混淆开发密钥与生产密钥
  - **现有覆盖**: 无测试覆盖
  - **发现记录**: ✅ 通过 — 这些是有意公开的开发网测试密钥（devnet 预资金账户）。文件首行有 `//!note: do not use any accounts from OffCKB for real money!` 警告。主网操作已被 validateNetworkOpt() 阻止（process.exit）。账户信息也在 account/ 目录中以 JSON 形式公开，这是区块链开发工具的标准做法。

---

## 第 3 章: DIM-LOGIC 业务逻辑

- [x] 🔴 **AUDIT-LOGIC-001**: Shell 命令注入 — CKB 二进制执行
  - **关联代码**: src/cmd/node.ts:nodeDevnet:48-49, src/node/install.ts:getVersionFromBinary:118
  - **审计内容**:
    - exec()/execSync() 使用字符串拼接构造命令
    - encodeBinPathForTerminal() 仅用双引号包裹是否足够
    - binaryPath 自定义路径是否可包含 shell 元字符
  - **现有覆盖**: 无直接测试
  - **发现记录**: ❌ 发现漏洞 → ✅ 已修复 — exec() 通过 shell 执行字符串命令，允许命令注入。encodeBinPathForTerminal() 仅用双引号包裹路径，可被 `"$(malicious)"` 或 `` `cmd` `` 绕过。已将 exec() 替换为 execFile()（不经过 shell），将 execSync() 替换为 execFileSync()（传递参数数组）。

- [x] 🔴 **AUDIT-LOGIC-002**: Shell 命令注入 — CKB 调试器
  - **关联代码**: src/tools/ckb-debugger.ts:execute:74, src/cmd/debug.ts:debugRaw:121
  - **审计内容**:
    - execSync(command) 中 command 由用户输入拼接
    - txHash, cellIndex, cellType, scriptType 等参数直接嵌入命令字符串
    - 文件路径参数是否可被利用执行任意命令
  - **现有覆盖**: 无直接测试
  - **发现记录**: ❌ 发现漏洞 → ✅ 已修复 — `ckb-debugger ${args.join(' ')}` 使用 execSync 字符串拼接。cellIndex, cellType, scriptType 虽然有部分验证（通过 parseSingleScriptOption 正则），但 txHash 和 bin 路径可被注入。已替换为 spawnSync('ckb-debugger', args)，避免 shell 解释。

- [x] 🟠 **AUDIT-LOGIC-003**: 路径遍历 — 交易文件保存和读取
  - **关联代码**: src/tools/rpc-proxy.ts:42, src/cmd/debug.ts:buildTransactionJsonFilePath:99-108
  - **审计内容**:
    - txHash 用于构造文件路径，是否可注入 `../` 进行路径遍历
    - 实际上 txHash 来自 CCC 库的 hash() 计算，但需验证是否所有路径都如此
  - **现有覆盖**: 无测试覆盖
  - **发现记录**: ✅ 通过 — 在 rpc-proxy.ts 中，txHash 由 cccTx.hash() 计算（SHA256 哈希的 hex 编码），只包含 0x 和十六进制字符，不可能包含路径遍历字符。在 debug.ts 中，txHash 来自 CLI --tx-hash 参数，理论上可包含 `../`，但它会在 fs.existsSync/readFileSync 处失败（找不到文件），不会造成安全影响。

- [x] 🟠 **AUDIT-LOGIC-004**: 竞态条件 — 节点启动时序
  - **关联代码**: src/cmd/node.ts:nodeDevnet:64
  - **审计内容**:
    - 硬编码 3 秒延迟启动 miner 和 proxy 是否可靠
    - 如果 CKB 节点未在 3 秒内就绪，是否导致错误
  - **现有覆盖**: 无测试覆盖
  - **发现记录**: ⚠️ 建议改进 — 硬编码 3 秒延迟不可靠。在低性能机器上 CKB 节点可能需要更长时间初始化。但这是功能可靠性问题，非安全漏洞。miner 和 proxy 启动失败会被 catch 捕获并记录，不会导致数据损坏。

- [x] 🟡 **AUDIT-LOGIC-005**: deepMerge 原型污染
  - **关联代码**: src/cfg/setting.ts:deepMerge:132-144
  - **审计内容**:
    - deepMerge 是否容易受到 __proto__ / constructor / prototype 污染
    - 来自 settings.json 的不可信数据是否可通过 deepMerge 污染 Settings 原型
  - **现有覆盖**: tests/security-fixes.test.ts
  - **发现记录**: ❌ 发现漏洞 → ✅ 已修复 — deepMerge 未过滤 __proto__、constructor、prototype 键。如果 settings.json 被恶意修改（或通过配置命令注入），可污染 Object.prototype，导致 RCE 或逻辑绕过。已添加键名黑名单过滤。

---

## 第 4 章: DIM-MEMORY 资源安全

- [x] 🟡 **AUDIT-MEMORY-001**: 大文件读取导致 OOM
  - **关联代码**: src/util/fs.ts:isBinaryFile, src/deploy/index.ts:deployBinary:106
  - **审计内容**:
    - 读取整个文件到内存 (readFileSync / readFileToUint8Array)
    - 超大二进制文件是否导致内存耗尽
    - JSON.parse 对超大 JSON 的处理
  - **现有覆盖**: 无测试覆盖
  - **发现记录**: ⚠️ 建议改进 — readFileToUint8Array 将整个文件读入内存，对于大型智能合约二进制文件可能导致 OOM。但这是 CLI 本地工具，用户部署的文件大小在用户控制范围内。CKB 链上也有 cell 大小限制，因此实际风险极低。

- [x] 🟢 **AUDIT-MEMORY-002**: 无限轮询超时
  - **关联代码**: src/sdk/ckb.ts:waitFor:266-282
  - **审计内容**:
    - while(true) 循环是否有可靠超时机制
    - timeout 参数是否总是被传递
  - **现有覆盖**: 无测试覆盖
  - **发现记录**: ✅ 通过 — waitFor 函数有完整的超时机制：`if (Date.now() - startTime > timeout) throw new Error('Operation timed out')`。所有调用者都传递了 timeout（waitForTxConfirm 默认 60s，waitForBlocksBy 使用 interval * 50000）。

---

## 第 5 章: DIM-DEPS 依赖安全

- [x] 🟠 **AUDIT-DEPS-001**: 依赖版本 CVE 检查
  - **关联代码**: package.json
  - **审计内容**:
    - 所有 runtime 依赖是否有已知 CVE
    - node-fetch v2 是否有已知漏洞
    - http-proxy 是否有已知漏洞
    - adm-zip 是否有已知漏洞 (zipslip)
    - blessed 0.1.81 是否有已知漏洞
  - **现有覆盖**: 无 audit 覆盖
  - **发现记录**: ❌ 发现漏洞 → ✅ 已修复 — tar 7.5.3 有 3 个已知 CVE（路径遍历、硬链接逃逸、竞态条件）。已升级到 ^7.5.8（实际安装 7.5.9）。node-fetch v2、http-proxy、adm-zip、blessed 无已知 CVE。

- [x] 🟢 **AUDIT-DEPS-002**: 废弃/不维护的依赖
  - **关联代码**: package.json
  - **审计内容**:
    - blessed 0.1.81 — 最后更新时间
    - node-fetch v2 — 是否应迁移到 v3 或 Node.js 内置 fetch
    - child_process 包 — npm 上的 child_process 是否为合法包
  - **现有覆盖**: 无覆盖
  - **发现记录**: ⚠️ 建议改进 — (1) blessed 0.1.81 虽不活跃维护，但是终端 UI 的稳定选择，无已知 CVE。(2) node-fetch v2 是因为需要 CommonJS 兼容性（v3 是纯 ESM），合理选择。项目要求 Node ≥20，可考虑未来迁移到内置 fetch。(3) child_process npm 包是 npm 安全占位包（来自 npm/security-holder），不包含实际代码，可安全移除以减少依赖。

---

## 第 6 章: DIM-ERRINFO 错误处理与信息泄露

- [x] 🟡 **AUDIT-ERRINFO-001**: 错误消息泄露敏感信息
  - **关联代码**: src/cmd/deposit.ts:43, src/util/request.ts:18
  - **审计内容**:
    - 随机私钥在日志中输出 (deposit.ts:43)
    - HTTP 错误消息是否泄露内部 URL 结构
    - 代理凭据是否可能在错误消息中暴露
  - **现有覆盖**: 无测试覆盖
  - **发现记录**: ⚠️ 建议改进 — deposit.ts:43 在 logger.info 中输出临时随机私钥 `private key: ${randomAccountPrivateKey}`。这是有意设计（让用户在 faucet 失败时可手动转账），但属于信息泄露风险。HTTP 错误消息 `HTTP error! Status: ${response.status}, URL: ${response.url}` 泄露内部 URL 但仅在本地终端显示。代理凭据在 proxyConfigToUrl 中嵌入 URL 字符串，如果 URL 出现在日志中会泄露凭据，但当前代码未记录代理 URL。总体风险低（CLI 本地工具）。

- [x] 🟡 **AUDIT-ERRINFO-002**: 代理凭据明文存储
  - **关联代码**: src/cfg/setting.ts:writeSettings:111-118, src/util/request.ts:proxyConfigToUrl:44-50
  - **审计内容**:
    - 代理用户名/密码以明文 JSON 存储在 settings.json
    - 代理凭据在 URL 字符串中传递
    - 是否应加密或限制文件权限
  - **现有覆盖**: 无测试覆盖
  - **发现记录**: ⚠️ 建议改进 — 代理凭据以明文存储在 `~/.config/offckb/settings.json`，权限继承用户默认 umask。这是 CLI 工具的常见做法（类似 .npmrc、.gitconfig 中的凭据），但应考虑设置 0600 文件权限。风险中等，因为仅影响本地文件系统安全。

---

## 第 7 章: DIM-SERDE 序列化/反序列化

- [x] 🟡 **AUDIT-SERDE-001**: JSON 反序列化安全性
  - **关联代码**: src/cfg/setting.ts:readSettings:101, src/cmd/debug.ts:22, src/deploy/migration.ts
  - **审计内容**:
    - JSON.parse 对不可信文件是否安全
    - 缺少 schema 验证的反序列化
    - 解析后的对象是否被类型安全地使用
  - **现有覆盖**: 无测试覆盖
  - **发现记录**: ✅ 通过 — JSON.parse 在 JavaScript 中是安全的（不会执行代码，不像 eval()）。readSettings 使用 deepMerge（现已修复原型污染），且有 try-catch 回退到 defaultSettings。debug.ts 中 JSON.parse 后数据传给 CCC 库的 transactionTo 做严格验证。migration.ts 的 JSON.parse 用于本地文件，风险可接受。

---

## 附录 A: 审计执行日志
| 日期 | 审计项 | 发现摘要 | 状态 |
|------|--------|---------|------|
| 2026-02-28 | AUDIT-CRYPTO-001 | Math.random() 用于私钥生成 → 已替换为 crypto.randomBytes() | ✅ 已修复 |
| 2026-02-28 | AUDIT-LOGIC-001 | Shell 命令注入 (exec 字符串拼接) → 已替换为 execFile 数组参数 | ✅ 已修复 |
| 2026-02-28 | AUDIT-LOGIC-002 | Shell 命令注入 (ckb-debugger) → 已替换为 spawnSync 数组参数 | ✅ 已修复 |
| 2026-02-28 | AUDIT-LOGIC-005 | deepMerge 原型污染 → 已添加键名黑名单 | ✅ 已修复 |
| 2026-02-28 | AUDIT-DEPS-001 | tar 7.5.3 有 3 个 CVE → 已升级到 ^7.5.8 | ✅ 已修复 |
| 2026-02-28 | 其余 15 项 | 审计完成，无需代码修复 | ✅ 完成 |

## 附录 B: 新增项跟踪
| 日期 | 新增项 ID | 来源 | 描述 |
|------|----------|------|------|
| (无新增项) | | | |

## 附录 C: 修复建议
| 审计项 | 严重级别 | 建议方案 | 修复状态 |
|--------|---------|---------|---------|
| AUDIT-CRYPTO-001 | 🔴 Critical | 替换 Math.random() 为 crypto.randomBytes() | ✅ 已修复 |
| AUDIT-LOGIC-001 | 🔴 Critical | 替换 exec()/execSync() 为 execFile()/execFileSync() | ✅ 已修复 |
| AUDIT-LOGIC-002 | 🔴 Critical | 替换 execSync() 字符串为 spawnSync() 数组 | ✅ 已修复 |
| AUDIT-LOGIC-005 | 🟡 Medium | 添加 __proto__/constructor/prototype 过滤 | ✅ 已修复 |
| AUDIT-DEPS-001 | 🟠 High | 升级 tar 到 ≥7.5.8 | ✅ 已修复 |
| AUDIT-INPUT-001 | 🔴→⚠️ | 建议添加 CLI 输入格式验证 | 📋 建议 |
| AUDIT-ERRINFO-001 | 🟡 Medium | 考虑减少日志中的敏感信息 | 📋 建议 |
| AUDIT-ERRINFO-002 | 🟡 Medium | 考虑设置 settings.json 文件权限 0600 | 📋 建议 |
| AUDIT-DEPS-002 | 🟢 Low | 考虑移除无用的 child_process npm 包 | 📋 建议 |
