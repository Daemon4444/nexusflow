/**
 * 错误处理 Middleware
 *
 * 统一所有 API 的错误响应格式
 */

import { Request, Response, NextFunction } from "express";

/** 自定义 API 错误类 */
export class ApiError extends Error {
  public status: number;
  public type: string;
  public code: string;

  constructor(status: number, message: string, type: string = "api_error", code: string = "error") {
    super(message);
    this.status = status;
    this.type = type;
    this.code = code;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /** 401 认证错误 */
  static unauthorized(message: string = "Unauthorized"): ApiError {
    return new ApiError(401, message, "authentication_error", "unauthorized");
  }

  /** 403 权限错误 */
  static forbidden(message: string = "Forbidden"): ApiError {
    return new ApiError(403, message, "permission_error", "forbidden");
  }

  /** 404 资源不存在 */
  static notFound(message: string = "Resource not found"): ApiError {
    return new ApiError(404, message, "not_found_error", "not_found");
  }

  /** 400 参数错误 */
  static badRequest(message: string, code: string = "invalid_request"): ApiError {
    return new ApiError(400, message, "invalid_request_error", code);
  }

  /** 429 限流错误 */
  static rateLimited(message: string = "Rate limit exceeded"): ApiError {
    return new ApiError(429, message, "rate_limit_error", "rate_limit_exceeded");
  }

  /** 402 余额不足 */
  static insufficientBalance(message: string = "Insufficient balance"): ApiError {
    return new ApiError(402, message, "billing_error", "insufficient_balance");
  }

  /** 500 服务器错误 */
  static internal(message: string = "Internal server error"): ApiError {
    return new ApiError(500, message, "server_error", "internal_error");
  }
}

/** 统一错误响应格式 */
export function errorHandler(
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 如果是 ApiError，使用统一格式
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: {
        message: err.message,
        type: err.type,
        code: err.code,
      },
    });
    return;
  }

  // 其他错误，统一为 500
  console.error("[Error]", err.message, err.stack);
  res.status(500).json({
    error: {
      message: "Internal server error",
      type: "server_error",
      code: "internal_error",
    },
  });
}

/** 404 处理 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Endpoint ${req.method} ${req.path} not found`,
      type: "not_found_error",
      code: "not_found",
    },
  });
}

/** 成功响应包装器（用于 /api/* 路由） */
export function successResponse<T>(data: T, message?: string) {
  return {
    success: true,
    data,
    message,
  };
}

/** 错误响应包装器（用于 /api/* 路由） */
export function errorResponse(message: string, code?: string) {
  return {
    success: false,
    message,
    code,
  };
}