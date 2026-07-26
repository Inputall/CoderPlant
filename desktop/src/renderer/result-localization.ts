import type { CheckResult } from "../../../dist/index.js";

export interface LocalizedResult {
  nameZh: string;
  messageZh: string;
  suggestionZh?: string;
}

const names: Record<string, string> = {
  "url.normalization": "API 端点",
  "chat.http": "非流式 HTTP 请求",
  "chat.request": "非流式请求",
  "chat.content_type": "非流式内容类型",
  "chat.schema": "响应结构",
  "chat.content": "模型文本响应",
  "chat.usage": "Token 使用量元数据",
  "stream.http": "流式 HTTP 请求",
  "stream.request": "流式请求",
  "stream.content_type": "流式内容类型",
  "stream.protocol": "SSE 协议",
  "stream.content": "流式文本响应",
  "stream.termination": "流式结束标记",
  "stream.timing": "流式延迟"
};

function httpMessage(message: string): string | undefined {
  const received = message.match(/Received HTTP (\d+)\./);
  if (received) return `收到 HTTP ${received[1]}。`;
  const status = message.match(/\(HTTP (\d+)\)$/);
  if (status) return `服务端返回 HTTP ${status[1]}。`;
  if (message.includes("API key was rejected")) return "API Key 被服务端拒绝。";
  if (message.includes("request parameters")) return "API 拒绝了请求参数。";
  if (message.includes("not allowed to use")) return "当前账号无权使用此端点或模型。";
  if (message.includes("endpoint was not found")) return "找不到 Chat Completions 端点。";
  if (message.includes("rate limiting")) return "API 返回了限流或额度不足。";
  if (message.includes("gateway or upstream")) return "网关或上游服务异常。";
  return undefined;
}

function messageFor(result: CheckResult): string {
  const http = httpMessage(result.message);
  if (http) return http;
  switch (result.id) {
    case "url.normalization": return "API 端点已完成规范化。";
    case "chat.content_type": return result.message.startsWith("Received") ? "已收到 JSON 响应。" : "非流式响应的 Content-Type 不是标准 JSON。";
    case "chat.schema": return result.status === "pass" ? "响应包含当前协议要求的必要字段。" : "JSON 响应结构不符合当前提供商协议要求。";
    case "chat.content": return result.status === "pass" ? "模型遵循了最小文本指令。" : "API 返回了文本，但内容不是严格的 OK。";
    case "chat.usage": return result.status === "pass" ? "响应包含 usage 元数据。" : "响应缺少可选的 usage 元数据。";
    case "stream.content_type": return result.status === "pass" ? "已收到 text/event-stream。" : "流式响应的 Content-Type 不是 text/event-stream。";
    case "stream.protocol": return result.status === "pass" ? "SSE 数据块解析成功。" : "流中存在缺失或无效的协议事件数据。";
    case "stream.content": return result.status === "pass" ? "流产生了非空文本内容。" : "流没有产生文本内容。";
    case "stream.termination": return result.status === "pass" ? "流式响应已按提供商协议正常结束。" : "流结束时缺少提供商要求的完成事件。";
    case "stream.timing": return result.status === "warn" ? "已收到响应头，但无法计算 TTFT。" : "已记录响应头延迟、TTFT 和总耗时。";
    case "stream.request": return "未请求流式诊断。";
    case "chat.request": return "请求未能完成，请查看上方英文错误信息。";
    default: return "详细信息请参考上方英文诊断信息。";
  }
}

function suggestionFor(suggestion: string): string {
  if (suggestion.includes("model ID")) return "检查模型 ID 和 Chat Completions 参数兼容性。";
  if (suggestion.includes("Bearer authentication")) return "检查 API Key 和 Bearer 认证支持。";
  if (suggestion.includes("plan, and model permissions")) return "检查账号套餐和模型权限。";
  if (suggestion.includes("base URL")) return "检查基础地址和 /v1/chat/completions 路径。";
  if (suggestion.includes("text/event-stream")) return "stream=true 时应返回 text/event-stream。";
  if (suggestion.includes("delta.content")) return "确认 delta.content 包含生成文本。";
  if (suggestion.includes("[DONE]")) return "确保 SSE 关闭前发送 data: [DONE]。";
  if (suggestion.includes("timeout")) return "增加超时时间或检查上游延迟。";
  if (suggestion.includes("same-origin")) return "直接使用最终的同源 API 端点。";
  return "详细建议请参考上方英文提示。";
}

export function localizeResult(result: CheckResult): LocalizedResult {
  const localized: LocalizedResult = {
    nameZh: names[result.id] ?? "诊断检查",
    messageZh: messageFor(result)
  };
  if (result.suggestion) localized.suggestionZh = suggestionFor(result.suggestion);
  return localized;
}
