import { Response } from "express";
import { BillingReservationFailureReason } from "../data/billing";

export interface BillingFailurePayload {
  status: number;
  message: string;
  type: "billing_error" | "permission_error" | "invalid_request_error";
  code: string;
}

export function getBillingFailurePayload(reason: BillingReservationFailureReason): BillingFailurePayload {
  switch (reason) {
    case "sub_account_quota_exceeded":
      return {
        status: 402,
        message: "Sub-account quota exceeded. Ask the main account owner to increase the quota.",
        type: "billing_error",
        code: "sub_account_quota_exceeded",
      };
    case "sub_account_suspended":
      return {
        status: 403,
        message: "This sub-account is suspended.",
        type: "permission_error",
        code: "sub_account_suspended",
      };
    case "account_inactive":
    case "account_not_found":
      return {
        status: 403,
        message: "This account is not active.",
        type: "permission_error",
        code: "account_inactive",
      };
    case "invalid_request":
    case "duplicate_reservation":
      return {
        status: 400,
        message: "Unable to create a billing reservation for this request.",
        type: "invalid_request_error",
        code: "billing_reservation_failed",
      };
    case "insufficient_balance":
    default:
      return {
        status: 402,
        message: "Insufficient available balance. Please recharge your account.",
        type: "billing_error",
        code: "insufficient_balance",
      };
  }
}

export function sendBillingReservationFailure(
  res: Response,
  reason: BillingReservationFailureReason,
  envelope: "openai" | "api" = "openai"
): void {
  const failure = getBillingFailurePayload(reason);
  if (envelope === "api") {
    res.status(failure.status).json({
      success: false,
      message: failure.message,
      code: failure.code,
    });
    return;
  }
  res.status(failure.status).json({
    error: {
      message: failure.message,
      type: failure.type,
      code: failure.code,
    },
  });
}
