# CoderPlant 码源：官网入口、API 接入与使用指南

CoderPlant（码源）提供面向 AI 编程与通用模型调用的 API 中转服务，可通过 OpenAI、Anthropic 和 Gemini 兼容协议接入常见客户端与开发工具。

本文根据 CoderPlant 官方文档整理，包含官网入口、账户开通、API 地址、工具配置、套餐信息和常见问题。模型、价格与可用线路可能调整，请以控制台实时显示为准。

> 更新时间：2026-07-22  
> 文档版本：1.0.0.1

---

## 官方入口

- 官网：[https://coderplant.com/](https://coderplant.com/)
- 使用文档：[https://coderplant.com/docs/](https://coderplant.com/docs/)
- 注册账户：[https://coderplant.com/register](https://coderplant.com/register)
- 用户控制台：[https://coderplant.com/dashboard](https://coderplant.com/dashboard)
- 兑换额度：[https://coderplant.com/redeem](https://coderplant.com/redeem)
- 购买兑换码：[官方店铺](https://catfk.com/shop/1PSAE01M)

---

## 服务特点

- 兼容 OpenAI API 协议；
- 兼容 Anthropic API 协议；
- 兼容 Gemini `generateContent` 协议；
- 可接入 Codex CLI、Claude Code 及其他兼容客户端；
- 支持按用途创建独立 API Key；
- API Key 可设置有效期、额度和模型范围；
- 支持按量使用和包月套餐。

模型范围会随套餐和线路变化，不建议在程序中长期写死模型列表。使用前请从控制台复制当前可用的模型 ID。

---

## 快速开始

1. 在[注册页面](https://coderplant.com/register)创建账户并登录。
2. 从[官方店铺](https://catfk.com/shop/1PSAE01M)购买兑换码。
3. 前往[兑换页面](https://coderplant.com/redeem)，将兑换码兑换到账户。
4. 在控制台创建 API Key，并按需要设置有效期、额度或模型权限。
5. 从控制台复制一个当前可用的模型 ID，完成首次请求测试。

> 兑换成功后，额度会进入当时登录的账户。提交兑换码前请确认账号无误。

---

## API 地址与鉴权

| 兼容协议 | 基础地址 | 常用鉴权方式 |
| --- | --- | --- |
| OpenAI | `https://coderplant.com/v1` | `Authorization: Bearer YOUR_API_KEY` |
| Anthropic | `https://coderplant.com` | `x-api-key` 或 Bearer |
| Gemini | `https://coderplant.com` | `x-goog-api-key` |

请将示例中的 `YOUR_API_KEY` 和 `YOUR_MODEL_ID` 替换为自己的密钥与模型 ID。不要把真实 API Key 提交到 GitHub。

---

## 测试 OpenAI 兼容接口

```bash
curl https://coderplant.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "YOUR_MODEL_ID",
    "messages": [
      {"role": "user", "content": "你好，请回复连接成功"}
    ],
    "stream": false
  }'
```

如果响应 JSON 中包含 `choices` 和模型回复，说明 API 地址、密钥与模型配置基本正确。

---

## Codex CLI 接入

### 1. 安装 Codex CLI

```bash
npm install -g --ignore-scripts @openai/codex@latest
codex --version
```

### 2. 配置 `config.toml`

配置文件位置：

- Windows：`%USERPROFILE%\.codex\config.toml`
- macOS / Linux：`~/.codex/config.toml`

```toml
model_provider = "coderplant"
model = "YOUR_MODEL_ID"
model_reasoning_effort = "high"
disable_response_storage = true
preferred_auth_method = "apikey"

[model_providers.coderplant]
name = "CoderPlant"
base_url = "https://coderplant.com/v1"
wire_api = "responses"
requires_openai_auth = true
```

### 3. 配置 `auth.json`

文件位置：

- Windows：`%USERPROFILE%\.codex\auth.json`
- macOS / Linux：`~/.codex/auth.json`

```json
{
  "OPENAI_API_KEY": "YOUR_API_KEY"
}
```

完成后运行：

```bash
codex "你好"
```

> `auth.json` 包含敏感信息，禁止上传到 GitHub、网盘或公开聊天记录。

---

## Claude Code 接入

Claude Code 使用 Anthropic 兼容地址连接 CoderPlant。

### Windows PowerShell

```powershell
npm install -g @anthropic-ai/claude-code

[Environment]::SetEnvironmentVariable(
  "ANTHROPIC_BASE_URL", "https://coderplant.com", "User"
)

[Environment]::SetEnvironmentVariable(
  "ANTHROPIC_AUTH_TOKEN", "YOUR_API_KEY", "User"
)
```

### macOS / Linux

```bash
npm install -g @anthropic-ai/claude-code
export ANTHROPIC_BASE_URL="https://coderplant.com"
export ANTHROPIC_AUTH_TOKEN="YOUR_API_KEY"
claude
```

设置持久化环境变量后，请关闭并重新打开终端，再运行 `claude`。

---

## Gemini 兼容接口

```bash
curl "https://coderplant.com/v1beta/models/YOUR_MODEL_ID:generateContent" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {"parts": [{"text": "你好，请回复连接成功"}]}
    ]
  }'
```

模型必须是控制台当前已启用、并支持 Gemini 兼容协议的模型。

---

## 套餐与倍率

### 按量使用

| 线路 | 计费倍率 |
| --- | ---: |
| Plus | 0.2 倍率 |
| Pro | 0.35 倍率 |

### Plus 包月

| 套餐档位 | 文档标示价格 |
| --- | ---: |
| 标准 | ¥159 |
| 加量 | ¥299 |
| 高级 | ¥560 |

### Pro 包月

| 套餐档位 | 文档标示价格 |
| --- | ---: |
| 标准 | ¥269 |
| 加量 | ¥560 |
| 高级 | ¥909 |

> 套餐额度、可用模型、倍率和价格可能调整，购买前请以官方店铺及控制台实时规则为准。

---

## 常见问题

### `401 API key is required / invalid`

检查请求头中是否包含完整密钥，并确认密钥前后没有空格、换行或多余引号。仍无法使用时，可停用旧密钥并重新创建。

### `403` 没有模型权限

检查 API Key 的模型限制、账户套餐，以及目标模型当前是否在控制台中可用。

### `404` 端点不存在

OpenAI 兼容客户端通常填写 `https://coderplant.com/v1`。检查是否误写成了 `/v1/v1`。

### `429` 请求过多或额度不足

降低并发请求数量，并检查余额、套餐额度和速率限制。不要持续进行高频重试。

### 安装后提示命令不存在

重新打开终端，确认 Node.js 全局安装目录已加入 `PATH`，再运行对应工具的 `--version` 命令。

### 请求长时间没有返回

先使用短提示词和非流式请求测试。长上下文或高推理强度任务可能需要更长的客户端超时时间。

---

## 安全建议

- 不同设备、项目和人员应使用不同的 API Key；
- 优先通过环境变量或系统密钥存储提供密钥；
- 为 API Key 设置合理的额度、有效期和模型权限；
- 不要将 API Key 写入公开代码、截图、日志或聊天记录；
- 发现异常用量后，立即停用旧密钥并创建新密钥；
- 建议将 `auth.json`、`.env` 等敏感配置加入 `.gitignore`。

示例 `.gitignore`：

```gitignore
.env
.env.*
auth.json
.codex/auth.json
```

---

## 使用前说明

- 本文仅整理 CoderPlant 官方公开信息，不代替控制台中的实时说明；
- API 中转服务的可用模型、线路、倍率和价格可能随运营情况调整；
- 开发前建议先用短请求测试接口，再逐步增加上下文长度与推理强度；
- 重要项目应准备超时、限流、重试和备用服务策略；
- 账户、兑换、套餐及售后问题请通过 CoderPlant 官方渠道处理。

---

## 资料来源

- [CoderPlant 官方使用文档](https://coderplant.com/docs/)
- [CoderPlant 官方控制台](https://coderplant.com/dashboard)

