import { z } from "zod";

const chatResponseSchema = z.object({
  id: z.string().min(1),
  object: z.string().min(1),
  created: z.number(),
  model: z.string().min(1),
  choices: z.array(z.object({
    message: z.object({
      role: z.string().min(1),
      content: z.string()
    }).passthrough(),
    finish_reason: z.string().nullable()
  }).passthrough()).min(1),
  usage: z.unknown().optional()
}).passthrough();

export interface ValidChatResponse {
  valid: true;
  content: string;
  hasUsage: boolean;
}

export interface InvalidChatResponse {
  valid: false;
  issues: string[];
}

export type ChatValidationResult = ValidChatResponse | InvalidChatResponse;

export function validateChatResponse(value: unknown): ChatValidationResult {
  const result = chatResponseSchema.safeParse(value);
  if (!result.success) {
    return {
      valid: false,
      issues: result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "response";
        return `${path}: ${issue.message}`;
      })
    };
  }
  return {
    valid: true,
    content: result.data.choices[0]!.message.content,
    hasUsage: result.data.usage !== undefined
  };
}
