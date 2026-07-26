# LLM API Doctor V1 Coding Plan

## 1. 项目目标

开发一个本地命令行工具，通过实际调用 OpenAI Chat Completions 接口，检测：

- API 地址是否正确
- API Key 是否有效
- 指定模型是否可用
- 非流式请求是否兼容
- 流式 SSE 请求是否兼容
- 响应格式是否符合预期
- 首字延迟和总响应时间
- 常见错误原因

项目名称：`llm-api-doctor`

调用端点：

```text
POST /v1/chat/completions
```

## 2. V1 不实现的功能

第一版明确不实现：

- `GET /v1/models`
- Responses API
- Tool Calling
- JSON Mode
- Embeddings
- 图片输入
- Anthropic 原生协议
- Gemini 原生协议
- 多服务商并发对比
- Token 价格计算
- HTML 报告
- 远程状态监控

## 3. 技术选型

- Node.js 20+
- TypeScript
- npm
- 原生 `fetch`
- `commander`：命令行参数
- `prompts`：交互式输入
- `picocolors`：终端颜色
- `ora`：检测进度
- `zod`：响应验证
- `vitest`：自动化测试

不使用 OpenAI SDK，直接检测原始 HTTP 接口兼容性。

## 4. CLI 设计

```bash
npx llm-api-doctor check \
  --base-url https://example.com/v1 \
  --model MODEL_ID \
  --api-key-env OPENAI_API_KEY
```

支持参数：

```text
--base-url         API 基础地址
--model            测试模型 ID
--api-key-env      密钥环境变量，默认 OPENAI_API_KEY
--timeout          请求超时，默认 30 秒
--stream           同时测试流式输出
--format           terminal、json 或 markdown
--output           报告保存路径
--non-interactive  禁止交互输入
```

没有提供必要参数时，进入交互模式：

```text
API 基础地址：https://example.com/v1
模型 ID：model-name
API Key：************
是否测试流式输出：是
```

## 5. 地址处理规则

用户可以输入：

```text
https://example.com
https://example.com/v1
https://example.com/v1/chat/completions
```

内部统一转换为：

```text
https://example.com/v1/chat/completions
```

需要识别并阻止：

```text
/v1/v1/chat/completions
/chat/completions/chat/completions
```

禁止自动将请求重定向到不同域名，避免 API Key 泄漏。

## 6. 测试请求

### 非流式请求

```json
{
  "model": "MODEL_ID",
  "messages": [
    {
      "role": "user",
      "content": "Reply with OK only."
    }
  ],
  "max_tokens": 5,
  "stream": false
}
```

请求头：

```http
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

### 流式请求

请求正文保持一致，只修改：

```json
{
  "stream": true
}
```

## 7. 检测流程

```text
读取配置
    ↓
规范化 URL
    ↓
发送非流式请求
    ↓
检查 HTTP 状态和 Content-Type
    ↓
验证 Chat Completions 响应结构
    ↓
可选发送流式请求
    ↓
解析 SSE 数据
    ↓
计算延迟
    ↓
生成检测报告
```

## 8. 非流式响应验证

至少检查：

```text
id
object
created
model
choices
choices[0].message
choices[0].message.role
choices[0].message.content
choices[0].finish_reason
```

以下情况标记为失败：

- 返回 HTML
- 返回内容不是有效 JSON
- `choices` 缺失或为空
- `message.content` 缺失
- HTTP 状态不是 `2xx`

`usage` 缺失只标记为警告，不判定失败。

## 9. 流式响应验证

检查：

- Content-Type 是否包含 `text/event-stream`
- 是否存在以 `data:` 开头的数据行
- 每个数据块是否是有效 JSON
- 是否能读取 `choices[0].delta`
- 是否出现有效文本内容
- 是否正确结束
- 流是否中途断开

记录：

```text
请求开始时间
收到响应头时间
收到首个有效文本时间
流结束时间
```

计算：

```text
响应头延迟
首字延迟 TTFT
总响应时间
```

如果没有返回精确 Token 数，不计算或只显示估算速度。

## 10. 项目结构

```text
llm-api-doctor/
├── src/
│   ├── cli.ts
│   ├── commands/check.ts
│   ├── config/input.ts
│   ├── core/context.ts
│   ├── core/runner.ts
│   ├── url/normalize.ts
│   ├── checks/chat.ts
│   ├── checks/stream.ts
│   ├── validation/chat-response.ts
│   ├── validation/stream-chunk.ts
│   ├── errors/classify.ts
│   ├── security/redact.ts
│   ├── reporters/terminal.ts
│   ├── reporters/json.ts
│   └── reporters/markdown.ts
├── tests/
├── examples/
├── .github/workflows/ci.yml
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE
└── SECURITY.md
```

## 11. 核心类型

```ts
type CheckStatus = "pass" | "fail" | "warn" | "skip";

interface DiagnosticConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  testStream: boolean;
}

interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  durationMs?: number;
  message: string;
  suggestion?: string;
  details?: Record<string, unknown>;
}

interface DiagnosticReport {
  version: string;
  endpoint: string;
  model: string;
  startedAt: string;
  results: CheckResult[];
}
```

报告中禁止包含 `apiKey`。

## 12. 错误分类

| 状态或现象 | 判断 | 建议 |
| --- | --- | --- |
| `400` | 请求参数不兼容 | 检查模型和参数 |
| `401` | API Key 无效 | 检查密钥和 Bearer Header |
| `403` | 无模型或账户权限 | 检查套餐和模型权限 |
| `404` | API 端点错误 | 检查 `/v1/chat/completions` |
| `408` | 服务端超时 | 稍后重试或增加超时 |
| `429` | 限流或额度不足 | 检查余额并降低并发 |
| `5xx` | 网关或上游异常 | 稍后重试并联系服务商 |
| HTML 响应 | 填写了网页地址 | 改用 API 基础地址 |
| 请求中止 | 客户端超时 | 增加 `--timeout` |
| SSE JSON 错误 | 流式协议不兼容 | 检查中转层流处理 |

## 13. 安全要求

- API Key 默认从环境变量读取
- 交互输入必须隐藏
- 禁止将 API Key 写入报告
- 所有错误和请求头必须脱敏
- 不保存完整请求或响应
- 不启用遥测
- 不向项目服务器上传检测数据
- 跨域重定向时停止请求
- 日志中的密钥只显示为 `sk-****`
- `SECURITY.md` 解释密钥处理过程

## 14. 测试计划

使用本地 Mock Server 测试：

- 正常非流式响应
- 正常 SSE 流式响应
- `usage` 缺失
- `choices` 缺失
- 无效 JSON
- HTML 错误页
- `400/401/403/404/429/500`
- 请求超时
- SSE 中途断开
- SSE 缺少结束标记
- URL 自动规范化
- `/v1/v1` 修正
- 跨域重定向阻止
- API Key 脱敏
- Markdown 和 JSON 报告

测试不得调用真实付费 API。

## 15. 开发顺序

### Phase 1：项目骨架

完成 TypeScript、CLI、构建命令、Vitest 和 GitHub Actions。

### Phase 2：非流式检测

完成 URL 处理、HTTP 请求、响应验证和错误分类。

### Phase 3：流式检测

完成 SSE 解析、首字延迟和异常中断检测。

### Phase 4：报告和安全

完成终端、JSON、Markdown 报告与密钥脱敏。

### Phase 5：发布

完成 README、使用示例、npm 发布配置和 GitHub Release。

## 16. 验收标准

- 可通过 `npx llm-api-doctor check` 运行
- 支持 Windows、macOS 和 Linux
- 能检测任意 OpenAI Chat Completions 兼容接口
- 能正确处理非流式和流式响应
- 能识别主要 HTTP 错误
- 能生成终端、JSON 和 Markdown 报告
- 所有输出均不包含完整 API Key
- 默认测试最多生成 5 个 Token
- 自动化测试覆盖率不低于 80%
- Node.js 20 和 22 的 CI 全部通过

第一版的核心成功标准是：用户输入地址、模型和密钥后，工具能够明确回答“能否调用、流式是否正常、速度如何、失败原因是什么”。
