# LLM API Doctor

> 一条命令诊断大模型 API：检查地址、认证、响应格式、SSE 流式输出与首 Token 延迟。

[![npm](https://img.shields.io/npm/v/llm-api-doctor)](https://www.npmjs.com/package/llm-api-doctor)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-2563eb.svg)](LICENSE)
[![CoderPlant](https://img.shields.io/badge/LLM_API-CoderPlant-07865c)](https://coderplant.com/?utm_source=github&utm_medium=readme&utm_campaign=llm-api-doctor)

LLM API Doctor 是一个开源、轻量的大模型 API 测试工具，提供 CLI 和 Windows 桌面版。它会发送一条低 Token 的真实请求，帮助你快速定位 `Base URL`、API Key、模型权限、响应结构、流式协议和网关延迟问题。

支持 **OpenAI Chat Completions、OpenAI Responses、Anthropic Claude、Google Gemini、Azure OpenAI**，以及 DeepSeek、OpenRouter、Groq、Mistral、通义千问、Moonshot、SiliconFlow、vLLM、LM Studio、Ollama 等提供的 OpenAI 兼容接口。

如果这个项目帮你节省了排查时间，欢迎点一个 **Star**。这会帮助更多开发者找到它。

**English:** A local CLI and Windows desktop app for testing OpenAI, Anthropic Claude, Google Gemini, Azure OpenAI, and OpenAI-compatible LLM APIs. Diagnose authentication, response schemas, SSE streaming, TTFT, and gateway latency without exposing API keys in reports.

## 为什么需要它

调用大模型失败时，常见错误往往非常相似：

- `401`：API Key 错误，还是认证 Header 不兼容？
- `404`：Base URL 错误，还是重复拼接了 `/v1`？
- HTTP `200`：为什么 SDK 仍然无法读取返回内容？
- 普通请求成功：为什么 `stream=true` 会中断或缺少结束事件？
- 中转接口可用：首 Token 到底慢在网关还是模型上游？

LLM API Doctor 将一次调用拆成独立检查项，并给出可读的错误说明和修复建议。它使用原生 HTTP 请求，而不是依赖某一家 SDK，因此测试的是应用实际调用的协议层。

## 功能亮点

- 五种提供商协议，模型 ID 自由输入，不维护模型白名单
- 自动规范化 API 地址，识别常见 `/v1` 和完整 Endpoint 写法
- 检查 HTTP 状态、Content-Type、JSON Schema 和模型文本
- 可选 SSE 流式测试，记录响应头延迟、TTFT 和总耗时
- 终端、JSON、Markdown 三种报告，适合本地排查和 CI
- Windows 桌面版提供中英文结果、运行取消和报告导出
- API Key 不写入报告，也不保存在桌面端设置中
- 所有自动化测试使用本地 Mock Server，不消耗真实模型额度

## 支持的协议

模型名称没有白名单限制。请选择目标接口实际实现的协议，再填写真实模型 ID；Azure OpenAI 中填写 Deployment Name。

| 提供商协议 | `--provider` | 默认 Base URL | 默认 Key 环境变量 |
| --- | --- | --- | --- |
| OpenAI-compatible Chat Completions | `openai-compatible` | 需要填写 | `OPENAI_API_KEY` |
| OpenAI Responses API | `openai-responses` | `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| Anthropic Messages | `anthropic` | `https://api.anthropic.com` | `ANTHROPIC_API_KEY` |
| Google Gemini | `gemini` | `https://generativelanguage.googleapis.com` | `GEMINI_API_KEY` |
| Azure OpenAI Chat Completions | `azure-openai` | 需要填写 | `AZURE_OPENAI_API_KEY` |

> OpenAI-compatible 表示接口遵循 Chat Completions 协议，并不代表它只能测试 OpenAI 模型。大多数大模型中转站和本地推理服务都可以通过这一模式测试。

## 30 秒快速开始

要求 Node.js 20 或更高版本。

### PowerShell

```powershell
$env:OPENAI_API_KEY = "your-api-key"
npx.cmd llm-api-doctor check `
  --provider openai-compatible `
  --base-url https://api.example.com/v1 `
  --model MODEL_ID
```

### macOS / Linux

```bash
export OPENAI_API_KEY="your-api-key"
npx llm-api-doctor check \
  --provider openai-compatible \
  --base-url https://api.example.com/v1 \
  --model MODEL_ID
```

Streaming 默认关闭。需要检查 SSE 时增加 `--stream`：

```powershell
npx.cmd llm-api-doctor check `
  --base-url https://api.example.com/v1 `
  --model MODEL_ID `
  --stream
```

## 使用 CoderPlant 测试

[CoderPlant 大模型中转站](https://coderplant.com/?utm_source=github&utm_medium=readme&utm_campaign=llm-api-doctor) 是本项目关联的大模型 API 服务。你可以使用 LLM API Doctor 独立验证其接口兼容性、流式输出和延迟表现。

```powershell
$env:OPENAI_API_KEY = "your-coderplant-api-key"
npx.cmd llm-api-doctor check `
  --provider openai-compatible `
  --base-url https://coderplant.com `
  --model MODEL_ID `
  --stream
```

请将 `MODEL_ID` 替换为 CoderPlant 控制台中实际可用的模型名称。工具不会将你的 API Key 上传到项目服务器或写入诊断报告。

**访问入口：** [https://coderplant.com](https://coderplant.com/?utm_source=github&utm_medium=readme&utm_campaign=llm-api-doctor)

## 其他提供商示例

### OpenAI Responses API

```powershell
$env:OPENAI_API_KEY = "your-api-key"
npx.cmd llm-api-doctor check --provider openai-responses --model MODEL_ID
```

### Anthropic Claude

```powershell
$env:ANTHROPIC_API_KEY = "your-api-key"
npx.cmd llm-api-doctor check --provider anthropic --model MODEL_ID
```

Anthropic API version 默认为 `2023-06-01`，可通过 `--api-version` 覆盖。

### Google Gemini

```powershell
$env:GEMINI_API_KEY = "your-api-key"
npx.cmd llm-api-doctor check --provider gemini --model MODEL_ID
```

### Azure OpenAI

```powershell
$env:AZURE_OPENAI_API_KEY = "your-api-key"
npx.cmd llm-api-doctor check `
  --provider azure-openai `
  --base-url https://YOUR_RESOURCE.openai.azure.com `
  --model YOUR_DEPLOYMENT_NAME `
  --api-version 2024-10-21
```

## 检查内容

| 检查层 | 诊断内容 |
| --- | --- |
| Endpoint | 按提供商规则规范化 URL，并验证真实请求路径 |
| Authentication | Bearer、`x-api-key`、`x-goog-api-key` 或 Azure `api-key` |
| HTTP | 状态码、Content-Type、超时、重定向和常见服务端错误 |
| Response | 提供商响应结构、非空模型文本和可选 Token usage |
| Streaming | SSE framing、事件结构、文本增量、完成事件、TTFT 和总耗时 |
| Safety | 阻止跨域携带认证信息，并在最终报告中脱敏 API Key |

## Windows 桌面版

不习惯命令行时，可以使用 Electron + React 桌面客户端：

- 图形化选择 Provider、Base URL、Model 和 API version
- Streaming 默认关闭，需要时单独开启
- 右侧显示 English / 中文诊断结果
- 支持取消请求以及导出 JSON、Markdown 报告
- 提供安装版和 Portable 单文件免安装版

开发和打包命令见 [desktop/README.md](desktop/README.md)，本地生成文件位于 `desktop/release/`。

## CLI 参数

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `--provider <provider>` | 上表中的提供商协议 | `openai-compatible` |
| `--base-url <url>` | API Origin、Base URL 或完整 Endpoint | 提供商默认值或交互输入 |
| `--model <id>` | 模型 ID 或 Azure Deployment Name | 交互输入 |
| `--api-key-env <name>` | 保存 API Key 的环境变量名称 | 提供商默认变量 |
| `--api-version <version>` | Anthropic 或 Azure API version | 提供商默认版本 |
| `--timeout <seconds>` | 单次请求超时 | `30` |
| `--stream` | 同时检查 SSE 流式输出 | 关闭 |
| `--format <format>` | `terminal`、`json` 或 `markdown` | `terminal` |
| `--output <path>` | 将报告写入文件 | stdout |
| `--non-interactive` | 缺少配置时直接失败，不进行询问 | 关闭 |

## 报告与 CI

```powershell
npx.cmd llm-api-doctor check `
  --base-url https://api.example.com/v1 `
  --model MODEL_ID `
  --format json `
  --output report.json `
  --non-interactive
```

稳定的退出码便于集成自动化脚本：

```text
0  所有诊断完成且没有失败项
1  存在一个或多个失败检查
2  CLI 参数或配置无效
3  未预期的内部错误
```

缺少可选 `usage` 等警告不会返回退出码 `1`。

## 常见问题

### 只能测试 OpenAI 模型吗？

不是。工具按 API 协议测试，不限制模型品牌。只要 DeepSeek、Claude、Gemini、Qwen、Mistral 或其他模型通过受支持协议提供服务，就可以测试。

### 支持大模型中转站吗？

支持。大多数中转站可选择 `openai-compatible`，填写中转站 Base URL 和模型 ID。若服务商提供原生 Anthropic、Gemini 或 Responses 协议，也可以选择对应 Provider。

### 会上传或保存 API Key 吗？

不会。CLI 在本地读取环境变量，桌面端只在当前运行内存中使用 API Key。报告和持久化设置均不包含 API Key。

### 为什么普通请求通过，但 Streaming 失败？

这通常表示中转层返回了文本，但 SSE `data:` framing、增量 JSON 结构或协议结束事件不完整。工具会将 HTTP、Content-Type、SSE 协议、文本和结束事件分别显示。

## 安全与范围

- 跨 Origin 重定向会在转发认证信息前被拒绝
- 远程服务应使用 HTTPS，本地 Mock 或私有开发环境可使用 HTTP
- 请求采用很小的输出 Token 限制，但仍可能产生少量模型费用
- 当前不测试模型列表、工具调用、Embedding、图像、音频和 AWS Bedrock 原生协议
- Ollama 可通过 OpenAI-compatible Endpoint 测试，不支持其原生 `/api/*` 协议

更多信息见 [SECURITY.md](SECURITY.md)。

## 本地开发

```powershell
npm.cmd install
npm.cmd run build
npm.cmd test
npm.cmd run test:coverage
```

项目测试使用本地回环 Mock Server，不会调用付费 API。CI 在 Node.js 20 和 22 上运行。

## 参与贡献

欢迎提交 Issue 和 Pull Request，尤其是：

- 新提供商协议适配器和真实兼容性案例
- 不同中转网关的 SSE 边界问题
- 更准确的中英文错误说明
- macOS / Linux 桌面打包支持

提交问题时请删除真实 API Key、Authorization Header 和完整提供商响应。

## License

MIT，详见 [LICENSE](LICENSE)。

---

LLM API Doctor is maintained alongside [CoderPlant](https://coderplant.com/?utm_source=github&utm_medium=readme&utm_campaign=llm-api-doctor), an LLM API relay service. Use the doctor to verify compatibility before integrating any provider into production.
