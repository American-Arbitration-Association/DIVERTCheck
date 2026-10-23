//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import FormFieldError from "@/components/common/FormFieldError";
import { showValidationToast } from "@/components/ToastNotifications/showValidationToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isStrongPassword,
  PASSWORD_RULES_MESSAGE,
} from "@/lib/passwordValidation";
import {
  forgotPassword,
  getResponseMessage,
  resetPassword,
  verifyResetPasswordEmail,
} from "@/services";
import { IconEye, IconEyeOff, IconInfoCircle } from "@tabler/icons-react";
import axios from "axios";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<"code" | "password">("code");
  const [securityCode, setSecurityCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityCodeError, setSecurityCodeError] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isResendingCode, setIsResendingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const labelClassName = "text-sm leading-5";
  const errorLabelClassName = `${labelClassName} text-[#ef2b2a]`;
  const email = searchParams.get("email")?.trim() ?? "";
  const hasValidEmail = email.includes("@");

  const handleResendCode = async () => {
    if (!hasValidEmail || isResendingCode) {
      return;
    }

    setIsResendingCode(true);

    try {
      const response = await forgotPassword({ email });
      const responseMessage =
        getResponseMessage(response) ||
        "If an account exists for that email, a security code has been sent.";

      showValidationToast("success", responseMessage);
    } catch (error) {
      const responseMessage = axios.isAxiosError(error)
        ? getResponseMessage(error.response?.data)
        : "";

      showValidationToast(
        "error",
        responseMessage || "Unable to resend security code.",
      );
    } finally {
      setIsResendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    const normalizedCode = securityCode.trim();

    if (!normalizedCode) {
      setSecurityCodeError("Please enter the security code.");
      return;
    }

    setSecurityCodeError("");
    setIsVerifyingCode(true);
    try {
      const response = await verifyResetPasswordEmail({
        email,
        securityCode: normalizedCode,
      });
      const responseMessage =
        getResponseMessage(response) || "Security code verified successfully.";

      showValidationToast("success", responseMessage);
      setStep("password");
    } catch (error) {
      const responseMessage = axios.isAxiosError(error)
        ? getResponseMessage(error.response?.data)
        : "";
      const validationMessage =
        responseMessage.trim().toLowerCase() ===
        "security code is invalid or expired."
          ? "Invalid security code"
          : responseMessage || "Unable to verify security code.";

      showValidationToast("error", validationMessage);
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleResetPassword = async () => {
    setNewPasswordError("");
    setConfirmPasswordError("");

    if (!newPassword) {
      setNewPasswordError("Please enter a new password.");
    } else if (!isStrongPassword(newPassword)) {
      setNewPasswordError(PASSWORD_RULES_MESSAGE);
    }

    if (!confirmPassword) {
      setConfirmPasswordError("Please confirm your password.");
    }

    if (!newPassword || !confirmPassword || !isStrongPassword(newPassword)) {
      return;
    }

    if (newPassword !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await resetPassword({
        email,
        securityCode,
        newPassword,
      });
      const responseMessage =
        getResponseMessage(response) || "Password has been reset.";

      showValidationToast("success", responseMessage);
      void navigate("/login", { replace: true });
    } catch (error) {
      const responseMessage = axios.isAxiosError(error)
        ? getResponseMessage(error.response?.data)
        : "";

      showValidationToast(
        "error",
        responseMessage || "Unable to reset password.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="px-4 py-6 sm:px-8 sm:py-8"
      data-qaautomationid="reset-password-page"
    >
      <div className="m-auto flex w-full max-w-[344px] flex-col">
        {step === "code" ? (
          <>
            <h1
              className="m-0 text-center text-[32px] font-medium leading-[40px] text-[#272423]"
              data-qaautomationid="reset-password-code-title"
            >
              Check Your Email
            </h1>
            <p
              className="mt-5 text-sm leading-5 text-[#272423]"
              data-qaautomationid="reset-password-code-instructions"
            >
              We sent a security code to your registered email address. Please
              enter the code below to continue resetting your password.
            </p>

            <form
              className="mt-5 flex flex-col gap-5"
              data-qaautomationid="reset-password-code-form"
              onSubmit={(event) => {
                event.preventDefault();
                void handleVerifyCode();
              }}
            >
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="reset-security-code"
                  className={
                    securityCodeError
                      ? errorLabelClassName
                      : `${labelClassName} text-[#272423]`
                  }
                >
                  Security Code <span className="text-[#cf2a1b]">*</span>
                </Label>
                <Input
                  id="reset-security-code"
                  type="text"
                  value={securityCode}
                  data-qaautomationid="reset-password-security-code-input"
                  onChange={(e) => {
                    setSecurityCode(e.target.value);
                    if (securityCodeError) {
                      setSecurityCodeError("");
                    }
                  }}
                  aria-invalid={securityCodeError.length > 0}
                  aria-describedby="reset-security-code-error"
                />
                <FormFieldError
                  id="reset-security-code-error"
                  message={securityCodeError}
                />
              </div>

              <div className="flex items-center gap-1 text-sm leading-5 text-[#272423]">
                <IconInfoCircle size={14} className="text-[#5a4fdc]" />
                <span>The code expires in 10 minutes.</span>
              </div>

              <Button
                className="w-full"
                type="submit"
                disabled={isVerifyingCode}
                data-qaautomationid="reset-password-verify-button"
              >
                {isVerifyingCode ? "Verifying..." : "Verify & Continue"}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                type="button"
                disabled={!hasValidEmail || isResendingCode}
                data-qaautomationid="reset-password-resend-button"
                onClick={() => {
                  void handleResendCode();
                }}
              >
                {isResendingCode ? "Resending..." : "Resend Code"}
              </Button>
              <Button
                variant="link"
                className="w-full px-0"
                type="button"
                data-qaautomationid="reset-password-back-to-login-button"
                onClick={() => void navigate("/login")}
              >
                Back to Log In
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1
              className="m-0 text-center text-[32px] font-medium leading-[40px] text-[#272423]"
              data-qaautomationid="reset-password-new-title"
            >
              Create New Password
            </h1>
            <p
              className="mt-5 text-sm leading-5 text-[#272423]"
              data-qaautomationid="reset-password-new-instructions"
            >
              Please create and confirm your new password below.
            </p>

            <form
              className="mt-5 flex flex-col gap-5"
              data-qaautomationid="reset-password-new-form"
              onSubmit={(event) => {
                event.preventDefault();
                void handleResetPassword();
              }}
            >
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="reset-new-password"
                  className={
                    newPasswordError
                      ? errorLabelClassName
                      : `${labelClassName} text-[#272423]`
                  }
                >
                  New Password <span className="text-[#cf2a1b]">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="reset-new-password"
                    type={showNewPassword ? "text" : "password"}
                    className="pr-10"
                    value={newPassword}
                    data-qaautomationid="reset-password-new-input"
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (newPasswordError) {
                        setNewPasswordError(
                          e.target.value && !isStrongPassword(e.target.value)
                            ? PASSWORD_RULES_MESSAGE
                            : "",
                        );
                      }
                    }}
                    aria-invalid={newPasswordError.length > 0}
                    aria-describedby="reset-new-password-error"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center border-0 bg-transparent p-0 text-[#78716C]"
                    onClick={() => setShowNewPassword((value) => !value)}
                    aria-label={
                      showNewPassword ? "Hide password" : "Show password"
                    }
                    data-qaautomationid="reset-password-new-toggle-button"
                  >
                    {showNewPassword ? (
                      <IconEye size={16} className="pointer-events-none" />
                    ) : (
                      <IconEyeOff size={16} className="pointer-events-none" />
                    )}
                  </button>
                </div>
                <FormFieldError
                  id="reset-new-password-error"
                  message={newPasswordError}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="reset-confirm-password"
                  className={
                    confirmPasswordError
                      ? errorLabelClassName
                      : `${labelClassName} text-[#272423]`
                  }
                >
                  Confirm Password <span className="text-[#cf2a1b]">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="reset-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    className="pr-10"
                    value={confirmPassword}
                    data-qaautomationid="reset-password-confirm-input"
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (confirmPasswordError) {
                        setConfirmPasswordError("");
                      }
                    }}
                    aria-invalid={confirmPasswordError.length > 0}
                    aria-describedby="reset-confirm-password-error"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center border-0 bg-transparent p-0 text-[#78716C]"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                    data-qaautomationid="reset-password-confirm-toggle-button"
                  >
                    {showConfirmPassword ? (
                      <IconEye size={16} className="pointer-events-none" />
                    ) : (
                      <IconEyeOff size={16} className="pointer-events-none" />
                    )}
                  </button>
                </div>
                <FormFieldError
                  id="reset-confirm-password-error"
                  message={confirmPasswordError}
                />
              </div>

              <Button
                className="w-full"
                type="submit"
                disabled={isSubmitting}
                data-qaautomationid="reset-password-submit-button"
              >
                {isSubmitting ? "Resetting..." : "Reset Password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
