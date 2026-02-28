# 安全审计报告: OffCKB (@offckb/cli)

## 1. 执行摘要

| 项目 | 详情 |
|------|------|
| **项目名称** | OffCKB (@offckb/cli) |
| **版本** | 0.4.4 |
| **语言** | TypeScript (Node.js ≥20) |
| **项目类型** | CLI 工具 / CKB 区块链开发网络工具 |
| **审计日期** | 2026-02-28 |
| **审计范围** | 全部 57 个源文件，22 个运行时依赖 |
| **审计维度** | 输入验证、密码学、业务逻辑、资源安全、依赖安全、错误处理、序列化 |
| **审计项总数** | 20 |
| **发现漏洞** | 5 项（3 Critical + 1 High + 1 Medium），全部已修复 |

---

## 2. 风险评级

| 级别 | 数量 | 详情 |
|------|------|------|
| ■ **Critical** | 3 项（已修复） | 命令注入 ×2, 弱 PRNG 私钥生成 |
| ■ **High** | 1 项（已修复） | tar 依赖 CVE (路径遍历/硬链接逃逸) |
| ■ **Medium** | 1 项（已修复） | 原型污染 (deepMerge) |
| □ **Low/Info** | 6 项（建议改进） | 输入验证、信息泄露、凭据存储等 |

---

## 3. 关键发现（按严重级别降序）

### 3.1 🔴 AUDIT-LOGIC-001: Shell 命令注入 — CKB 二进制执行 (Critical)

**描述**: `src/cmd/node.ts` 中使用 `exec()` 通过 shell 执行命令字符串，其中包含用户可控的 `binaryPath` 和配置路径。`encodeBinPathForTerminal()` 仅用双引号包裹路径，可被 `$()` 或反引号绕过。

**影响**: 攻击者可通过恶意的 `--binary-path` 参数执行任意系统命令。

**复现路径**:
```bash
offckb node --binary-path '$(whoami > /tmp/pwned)'
```

**关键代码** (修复前):
```typescript
// src/cmd/node.ts:48-53
const ckbCmd = `${ckbBinPath} run -C ${devnetConfigPath}`;
const ckbProcess = exec(ckbCmd); // shell injection!
```

**修复方案**: 替换 `exec()` 为 `execFile()`（不经过 shell，参数以数组传递）:
```typescript
const ckbProcess = execFile(ckbBinRawPath, ['run', '-C', devnetConfigRawPath]);
```

**状态**: ✅ 已修复

---

### 3.2 🔴 AUDIT-LOGIC-002: Shell 命令注入 — CKB 调试器 (Critical)

**描述**: `src/tools/ckb-debugger.ts` 的 `execute()` 方法使用 `execSync()` 拼接命令字符串，包含从 CLI 参数传入的 `txHash`、`cellIndex`、`cellType`、`scriptType` 和文件路径。

**影响**: 攻击者可通过 `--tx-hash` 或 `--bin` 参数注入任意 shell 命令。

**关键代码** (修复前):
```typescript
// src/tools/ckb-debugger.ts:74-75
const command = `ckb-debugger ${args.join(' ')}`;
execSync(command, { stdio: 'inherit' }); // shell injection!
```

**修复方案**: 替换为 `spawnSync()` 数组参数:
```typescript
const result = spawnSync('ckb-debugger', args, { stdio: 'inherit' });
```

**状态**: ✅ 已修复

---

### 3.3 🔴 AUDIT-CRYPTO-001: 使用 Math.random() 生成私钥 (Critical)

**描述**: `src/cmd/deposit.ts` 中的 `generateHex()` 函数使用 `Math.random()` 生成 testnet faucet 的临时私钥。`Math.random()` 不是密码学安全随机数生成器 (CSPRNG)，输出可预测。

**影响**: 攻击者可预测生成的临时私钥，在 faucet 充值到临时账户和转出之间窃取资金。

**关键代码** (修复前):
```typescript
// src/cmd/deposit.ts:103-110
function generateHex(length: number) {
  const characters = 'abcdef0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters[Math.floor(Math.random() * characters.length)];
  }
  return result;
}
```

**修复方案**: 替换为 `crypto.randomBytes()`:
```typescript
function generateHex(length: number) {
  const crypto = require('crypto');
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}
```

**状态**: ✅ 已修复

---

### 3.4 🟠 AUDIT-DEPS-001: tar 依赖存在 3 个 CVE (High)

**描述**: `tar` 7.5.3 存在 3 个已知安全漏洞:
1. **Arbitrary File Read/Write via Hardlink Target Escape** (修复版本: 7.5.8)
2. **Arbitrary File Creation/Overwrite via Hardlink Path Traversal** (修复版本: 7.5.7)
3. **Race Condition via Unicode Ligature Collisions on macOS APFS** (修复版本: 7.5.4)

**影响**: CKB 二进制下载解压时可能被恶意 tar 包利用，覆盖任意文件。实际利用需 MITM 篡改 GitHub releases 下载。

**修复方案**: 升级 `tar` 到 `^7.5.8`（实际安装 7.5.9）。

**状态**: ✅ 已修复

---

### 3.5 🟡 AUDIT-LOGIC-005: deepMerge 原型污染 (Medium)

**描述**: `src/cfg/setting.ts` 的 `deepMerge()` 函数未过滤 `__proto__`、`constructor`、`prototype` 等危险键名。如果 `settings.json` 被恶意修改，可通过原型链污染影响所有 JavaScript 对象。

**影响**: 可导致远程代码执行、逻辑绕过或拒绝服务。需要攻击者能修改 settings.json 文件（本地攻击向量）。

**关键代码** (修复前):
```typescript
function deepMerge(target: any, source: any): any {
  for (const key in source) { // no key filtering!
    ...
  }
}
```

**修复方案**: 添加危险键名黑名单:
```typescript
if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
  continue;
}
```

**状态**: ✅ 已修复

---

## 4. 审计覆盖矩阵

| 模块 | 输入验证 | 密码学 | 业务逻辑 | 资源安全 | 依赖安全 | 错误处理 | 序列化 |
|------|---------|--------|---------|---------|---------|---------|--------|
| src/cmd/node.ts | ⚠️ | - | ✅修复 | ⚠️ | - | ✅ | - |
| src/cmd/deposit.ts | ⚠️ | ✅修复 | ✅ | ✅ | - | ⚠️ | - |
| src/cmd/transfer.ts | ⚠️ | ✅ | ✅ | ✅ | - | ✅ | - |
| src/cmd/debug.ts | ⚠️ | - | ✅修复 | ✅ | - | ✅ | ✅ |
| src/tools/ckb-debugger.ts | ✅ | - | ✅修复 | ✅ | - | ✅ | - |
| src/tools/rpc-proxy.ts | ✅ | - | ✅ | ⚠️ | - | ✅ | ✅ |
| src/cfg/setting.ts | ✅ | - | ✅修复 | ✅ | - | ⚠️ | ✅ |
| src/cfg/account.ts | - | ✅ | ✅ | - | - | - | - |
| src/node/install.ts | ✅ | - | ✅修复 | ✅ | ✅修复 | ✅ | - |
| src/deploy/index.ts | ✅ | - | ✅ | ⚠️ | - | ✅ | - |
| src/sdk/ckb.ts | ✅ | ✅ | ✅ | ✅ | - | ✅ | - |
| src/util/request.ts | ✅ | - | ✅ | ✅ | - | ⚠️ | - |
| src/devnet/config-editor.ts | ✅ | - | ✅ | ✅ | - | ✅ | ✅ |

图例: ✅ 审计通过 | ✅修复 已发现并修复 | ⚠️ 建议改进 | - 不适用

---

## 5. 依赖安全状态

| 依赖 | 版本 | CVE | 状态 |
|------|------|-----|------|
| tar | 7.5.3 → ^7.5.8 | GHSA-3 个 | ✅ 已修复 |
| node-fetch | 2.x | 无 | ✅ 安全 |
| http-proxy | 1.18.1 | 无 | ✅ 安全 |
| adm-zip | ^0.5.10 | 无 | ✅ 安全 |
| blessed | 0.1.81 | 无 | ⚠️ 不活跃维护 |
| @ckb-ccc/core | 1.5.3 | 无 | ✅ 安全 |
| semver | ^7.6.0 | 无 | ✅ 安全 |
| commander | ^12.0.0 | 无 | ✅ 安全 |
| winston | ^3.17.0 | 无 | ✅ 安全 |
| https-proxy-agent | ^7.0.5 | 无 | ✅ 安全 |
| child_process | 1.0.2 | 无（空包） | ⚠️ 建议移除 |

---

## 6. 改进建议（非漏洞类）

### 6.1 输入验证增强
- 建议在 CLI 入口层添加 `txHash` 格式验证 (`/^0x[0-9a-f]{64}$/`)
- 建议在 `transfer`/`deposit` 命令中验证 `amountInCKB` 为正数

### 6.2 敏感信息处理
- `deposit.ts:43` 中临时私钥日志输出可考虑只显示地址
- `settings.json` 写入后可设置文件权限 `0600`

### 6.3 依赖优化
- `child_process` npm 包是安全占位包，不包含实际代码，可从 dependencies 中移除
- `blessed` 0.1.81 不活跃维护，未来可考虑替代方案

### 6.4 节点启动可靠性
- 硬编码 3 秒延迟启动 miner 可改为轮询 RPC 端口是否就绪

---

## 7. 附录: 变更文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| src/cmd/deposit.ts | 修复 | Math.random() → crypto.randomBytes() |
| src/cmd/node.ts | 修复 | exec() → execFile(), 移除 shell 注入风险 |
| src/node/install.ts | 修复 | execSync() → execFileSync(), 移除 shell 注入风险 |
| src/tools/ckb-debugger.ts | 修复 | execSync(string) → spawnSync(array), 移除 shell 注入风险 |
| src/cfg/setting.ts | 修复 | deepMerge 添加原型污染防护 |
| package.json | 修复 | tar ^7.5.3 → ^7.5.8 |
| tests/security-fixes.test.ts | 新增 | 安全修复的测试用例 (6 tests) |
| SECURITY_AUDIT_TODO.md | 新增 | 审计 TODO 跟踪文档 |
| SECURITY_AUDIT_REPORT.md | 新增 | 本审计报告 |
