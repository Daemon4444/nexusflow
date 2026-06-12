/**
 * Error handling middleware
 *
 * Provides a unified error response format for all APIs.
 */

import { Request, Response, NextFunction } from "express";

/** Custom API error class */
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

  /** 401 Authentication error */
  static unauthorized(message: string = "Unauthorized"): ApiError {
    return new ApiError(401, message, "authentication_error", "unauthorized");
  }

  /** 403 Permission error */
  static forbidden(message: string = "Forbidden"): ApiError {
    return new ApiError(403, message, "permission_error", "forbidden");
  }

  /** 404 Resource not found */
  static notFound(message: string = "Resource not found"): ApiError {
    return new ApiError(404, message, "not_found_error", "not_found");
  }

  /** 400 Bad request */
  static badRequest(message: string, code: string = "invalid_request"): ApiError {
    return new ApiError(400, message, "invalid_request_error", code);
  }

  /** 429 Rate limit error */
  static rateLimited(message: string = "Rate limit exceeded"): ApiError {
    return new ApiError(429, message, "rate_limit_error", "rate_limit_exceeded");
  }

  /** 402 Insufficient balance */
  static insufficientBalance(message: string = "Insufficient balance"): ApiError {
    return new ApiError(402, message, "billing_error", "insufficient_balance");
  }

  /** 500 Internal server error */
  static internal(message: string = "Internal server error"): ApiError {
    return new ApiError(500, message, "server_error", "internal_error");
  }
}

/** Unified error response format */
export function errorHandler(
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If it is an ApiError, use the unified format
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

  // Other errors are normalized to 500
  console.error("[Error]", err.message, err.stack);
  res.status(500).json({
    error: {
      message: "Internal server error",
      type: "server_error",
      code: "internal_error",
    },
  });
}

/** 404 handler */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Endpoint ${req.method} ${req.path} not found`,
      type: "not_found_error",
      code: "not_found",
    },
  });
}

/** Success response wrapper (for /api/* routes) */
export function successResponse<T>(data: T, message?: string) {
  return {
    success: true,
    data,
    message,
  };
}

/** Error response wrapper (for /api/* routes) */
export function errorResponse(message: string, code?: string) {
  return {
    success: false,
    message,
    code,
  };
}