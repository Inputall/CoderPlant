import { z } from "zod";

const streamChunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({
      content: z.string().nullable().optional()
    }).passthrough(),
    finish_reason: z.string().nullable().optional()
  }).passthrough()).min(1)
}).passthrough();

export interface StreamChunkValidation {
  valid: boolean;
  content?: string;
  finished?: boolean;
  issues?: string[];
}

export function validateStreamChunk(value: unknown): StreamChunkValidation {
  const result = streamChunkSchema.safeParse(value);
  if (!result.success) {
    return {
      valid: false,
      issues: result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "chunk";
        return `${path}: ${issue.message}`;
      })
    };
  }

  const choice = result.data.choices[0]!;
  const content = choice.delta.content;
  const output: StreamChunkValidation = { valid: true };
  if (typeof content === "string") {
    output.content = content;
  }
  if (typeof choice.finish_reason === "string") {
    output.finished = true;
  }
  return output;
}
