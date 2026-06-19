/**
 * Zod 验证 Middleware
 *
 * 提供统一的请求参数验证，防止无效输入
 */

import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError, z } from "zod";

/**
 * 验证请求体的 middleware
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues;
        res.status(400).json({
          error: {
            message: "Invalid request body",
            type: "validation_error",
            code: "invalid_request",
            details: issues.map((e: any) => ({
              path: e.path.join("."),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(error);
    }
  };
}

/**
 * 验证查询参数的 middleware
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues;
        res.status(400).json({
          error: {
            message: "Invalid query parameters",
            type: "validation_error",
            code: "invalid_request",
            details: issues.map((e: any) => ({
              path: e.path.join("."),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(error);
    }
  };
}

// ============ 常用 Schema ============

/** Chat Completions 请求验证 */
export const ChatCompletionSchema = z.object({
  model: z.string().min(1, "Model ID is required"),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant", "tool"]),
      content: z.string().or(z.array(z.any())).optional(),
      name: z.string().optional(),
      tool_call_id: z.string().optional(),
      tool_calls: z.array(z.any()).optional(),
    })
  ).min(1, "At least one message is required"),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.union([z.string(), z.object({})]).optional(),
  response_format: z.object({ type: z.enum(["text", "json_object"]) }).optional(),
});

/** Embeddings 请求验证 */
export const EmbeddingSchema = z.object({
  model: z.string().min(1, "Model ID is required"),
  input: z.union([
    z.string().min(1),
    z.array(z.string().min(1)),
    z.array(z.number()),
  ]),
  dimensions: z.number().int().positive().optional(),
  encoding_format: z.enum(["float", "base64"]).optional(),
});

/** 发送验证码请求验证 */
export const SendCodeSchema = z.object({
  email: z.string().email("Invalid email format"),
});

/** 验证码登录请求验证 */
export const LoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits").or(z.string().regex(/^\d{4}$/, "Code must be 4 digits")),
});

/** API Key 创建请求验证 */
export const CreateKeySchema = z.object({
  name: z.string().min(1).max(50, "Name must be 1-50 characters"),
  rate_limit: z.number().int().min(1).max(30000).optional().default(30000),
});

/** 充值请求验证 */
export const RechargeSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  method: z.enum(["alipay", "mock"]).optional().default("mock"),
});