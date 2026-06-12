"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NexusflowLogo } from "./QuadrantLogo";

interface OnboardingGuideProps {
  hasApiKey: boolean;
  apiKey?: string;
  onClose: () => void;
}

export default function OnboardingGuide({ hasApiKey, apiKey, onClose }: OnboardingGuideProps) {
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const steps = [
    {
      title: "Welcome to NexusFlow",
      description: "One platform for 40+ AI models — call them through a single API.",
      icon: "🎉",
      action: null,
    },
    {
      title: "Get your API key",
      description: "The API key authenticates your model calls. Copy it once and you're ready to go.",
      icon: "🔑",
      action: hasApiKey ? "copy" : "create",
    },
    {
      title: "Pick a model",
      description: "From chat to reasoning, coding, image and video — choose what fits your scenario.",
      icon: "🧠",
      action: "models",
    },
    {
      title: "Make your first call",
      description: "Test in Playground or paste the example into your app to call the API for real.",
      icon: "🚀",
      action: "playground",
    },
  ];

  const currentStep = steps[step];

  function copyApiKey() {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleAction() {
    if (currentStep.action === "copy") {
      copyApiKey();
    } else if (currentStep.action === "create") {
      router.push("/keys");
      onClose();
    } else if (currentStep.action === "models") {
      router.push("/models");
      onClose();
    } else if (currentStep.action === "playground") {
      router.push("/playground");
      onClose();
    }
  }

  function handleNext() {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onClose();
    }
  }

  function handleSkip() {
    localStorage.setItem("onboarding_completed", "true");
    onClose();
  }

  return (
    <div className="animate-fadeIn" style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}>
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 32,
        maxWidth: 420,
        width: "90%",
        boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{currentStep.icon}</div>
          <h2 style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: 8,
          }}>
            {currentStep.title}
          </h2>
          <p style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}>
            {currentStep.description}
          </p>
        </div>

        {/* API Key display */}
        {step === 1 && hasApiKey && apiKey && (
          <div style={{
            marginBottom: 20,
            padding: 14,
            background: "var(--bg-elevated)",
            borderRadius: 10,
            border: "1px solid var(--border)",
          }}>
            <div style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              marginBottom: 8,
              fontWeight: 600,
            }}>
              Your API key
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}>
              <code style={{
                flex: 1,
                fontSize: 13,
                fontFamily: "var(--font-mono)",
                color: "var(--text-primary)",
                wordBreak: "break-all",
                background: "var(--bg)",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
              }}>
                {apiKey.slice(0, 12)}...{apiKey.slice(-8)}
              </code>
              <button
                onClick={copyApiKey}
                className={copied ? "btn-success" : "btn-secondary"}
                style={{ padding: "8px 14px", fontSize: 13 }}
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Step indicator */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: 8,
          marginBottom: 24,
        }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: i === step ? "var(--accent)" : "var(--border)",
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>

        {/* Actions */}
        <div style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
        }}>
          {currentStep.action && (
            <button
              className="btn-primary"
              onClick={handleAction}
              style={{ padding: "10px 24px", fontSize: 14 }}
            >
              {currentStep.action === "copy" && (copied ? "Copied" : "Copy key")}
              {currentStep.action === "create" && "Create key"}
              {currentStep.action === "models" && "Browse models"}
              {currentStep.action === "playground" && "Start testing"}
            </button>
          )}
          <button
            className="btn-secondary"
            onClick={handleNext}
            style={{ padding: "10px 24px", fontSize: 14 }}
          >
            {step === steps.length - 1 ? "Done" : "Next"}
          </button>
        </div>

        {/* Skip */}
        <div style={{
          textAlign: "center",
          marginTop: 16,
        }}>
          <button
            onClick={handleSkip}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-tertiary)",
              fontSize: 13,
              cursor: "pointer",
              padding: 4,
            }}
          >
            Skip onboarding
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook to check if onboarding should show
export function useOnboarding() {
  const [shouldShow, setShouldShow] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem("onboarding_completed");
  });

  function markCompleted() {
    localStorage.setItem("onboarding_completed", "true");
    setShouldShow(false);
  }

  return { shouldShow, markCompleted };
}
