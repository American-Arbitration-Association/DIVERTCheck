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
import type { RegistrationMessageResponse } from "@/services";
import { registerUser } from "@/services";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import axios from "axios";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Registration() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [confirmEmailError, setConfirmEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitAttemptRef = useRef(0);
  const isSubmitDisabled = isSubmitting;
  const labelClassName = "font-suisse text-sm font-normal leading-none";
  const errorLabelClassName = `${labelClassName} text-[#ef2b2a]`;
  function getResponseMessage(response: unknown) {
    if (typeof response === "string") {
      return response.trim();
    }

    if (!response || typeof response !== "object") {
      return "";
    }

    const messageResponse = response as RegistrationMessageResponse & {
      accessToken?: string;
    };

    return (
      [
        messageResponse.message,
        messageResponse.title,
        messageResponse.detail,
        messageResponse.error,
      ]
        .find((message) => message?.trim())
        ?.trim() ?? ""
    );
  }

  function isSuccessfulRegistrationResponse(response: unknown) {
    if (!response || typeof response !== "object") {
      return false;
    }

    if ("userId" in response) {
      return (
        Number.isSafeInteger(response.userId) && Number(response.userId) > 0
      );
    }

    if (
      !("user" in response) ||
      !response.user ||
      typeof response.user !== "object"
    ) {
      return false;
    }

    return (
      "userId" in response.user &&
      Number.isSafeInteger(response.user.userId) &&
      Number(response.user.userId) > 0
    );
  }

  const handleSubmit = async () => {
    const submitAttemptId = ++submitAttemptRef.current;
    const normalizedEmail = email.trim();
    const normalizedConfirmEmail = confirmEmail.trim();
    let hasValidationError = false;

    setEmailError("");
    setConfirmEmailError("");
    setPasswordError("");

    if (!normalizedEmail) {
      setEmailError("Enter a Valid email address");
      hasValidationError = true;
    } else if (!normalizedEmail.includes("@")) {
      setEmailError("Enter a Valid email address");
      hasValidationError = true;
    }

    if (!normalizedConfirmEmail) {
      setConfirmEmailError("Please confirm your email address.");
      hasValidationError = true;
    } else if (!normalizedConfirmEmail.includes("@")) {
      setConfirmEmailError("Please confirm with a valid email address.");
      hasValidationError = true;
    }

    if (
      normalizedEmail.toLowerCase() !== normalizedConfirmEmail.toLowerCase()
    ) {
      setConfirmEmailError("Email addresses do not match.");
      hasValidationError = true;
    }

    if (!password) {
      setPasswordError("Please enter your password.");
      hasValidationError = true;
    } else if (!isStrongPassword(password)) {
      setPasswordError(PASSWORD_RULES_MESSAGE);
      hasValidationError = true;
    }

    if (hasValidationError) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await registerUser({
        email: normalizedEmail,
        password,
      });

      if (submitAttemptId !== submitAttemptRef.current) {
        return;
      }

      if (isSuccessfulRegistrationResponse(response)) {
        showValidationToast("success", "Successfully user registered");
        void navigate("/login", { replace: true });
        return;
      }

      const responseMessage = getResponseMessage(response);
      showValidationToast(
        "error",
        responseMessage || "Unable to register user.",
      );
    } catch (error) {
      if (submitAttemptId !== submitAttemptRef.current) {
        return;
      }

      const responseMessage = axios.isAxiosError(error)
        ? getResponseMessage(error.response?.data)
        : "";
      showValidationToast(
        "error",
        responseMessage || "Unable to register user.",
      );
    } finally {
      if (submitAttemptId === submitAttemptRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div
      className="px-4 py-6 sm:px-8 sm:py-8"
      data-qaautomationid="registration-page"
    >
      <div className="m-auto flex w-full max-w-[344px] flex-col">
        <h1
          className="m-0 text-center font-inter text-[32px] font-medium leading-[38.4px] tracking-[-0.32px] text-[#111827]"
          data-qaautomationid="registration-page-title"
        >
          Register
        </h1>
        <p
          className="mt-6 font-inter text-sm font-normal leading-[20px] text-[#1E1E1E]"
          data-qaautomationid="registration-page-instructions"
        >
          Please register to create a unified login for DIVERTCheck.
        </p>
        <form
          className="mt-6 flex flex-col gap-6"
          noValidate
          data-qaautomationid="registration-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="flex flex-col items-start gap-2.5 self-stretch">
            <Label
              htmlFor="registration-email"
              className={
                emailError
                  ? errorLabelClassName
                  : `${labelClassName} text-[#272423]`
              }
            >
              Email Address <span className="required">*</span>
            </Label>
            <Input
              id="registration-email"
              type="text"
              value={email}
              data-qaautomationid="registration-email-input"
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) {
                  setEmailError("");
                }
              }}
              aria-invalid={emailError.length > 0}
              aria-describedby="registration-email-error"
            />
            <FormFieldError
              id="registration-email-error"
              message={emailError}
            />
          </div>
          <div className="flex flex-col items-start gap-2.5 self-stretch">
            <Label
              htmlFor="registration-confirm-email"
              className={
                confirmEmailError
                  ? errorLabelClassName
                  : `${labelClassName} text-[#272423]`
              }
            >
              Confirm Email Address <span className="required">*</span>
            </Label>
            <Input
              id="registration-confirm-email"
              type="text"
              value={confirmEmail}
              data-qaautomationid="registration-confirm-email-input"
              onChange={(e) => {
                setConfirmEmail(e.target.value);
                if (confirmEmailError) {
                  setConfirmEmailError("");
                }
              }}
              aria-invalid={confirmEmailError.length > 0}
              aria-describedby="registration-confirm-email-error"
            />
            <FormFieldError
              id="registration-confirm-email-error"
              message={confirmEmailError}
            />
          </div>
          <div className="flex flex-col items-start gap-2.5 self-stretch">
            <Label
              htmlFor="registration-password"
              className={
                passwordError
                  ? errorLabelClassName
                  : `${labelClassName} text-[#272423]`
              }
            >
              Password <span className="required">*</span>
            </Label>
            <div className="relative w-full">
              <Input
                id="registration-password"
                type={showPassword ? "text" : "password"}
                className="pr-10"
                value={password}
                data-qaautomationid="registration-password-input"
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) {
                    setPasswordError(
                      e.target.value && !isStrongPassword(e.target.value)
                        ? PASSWORD_RULES_MESSAGE
                        : "",
                    );
                  }
                }}
                aria-invalid={passwordError.length > 0}
                aria-describedby="registration-password-error"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 z-10 flex !h-6 !w-6 -translate-y-1/2 items-center justify-center !border-0 !bg-transparent !p-0 text-[#4A4442] !shadow-none"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                data-qaautomationid="registration-password-toggle-button"
              >
                {showPassword ? (
                  <IconEye size={18} className="pointer-events-none" />
                ) : (
                  <IconEyeOff size={18} className="pointer-events-none" />
                )}
              </button>
            </div>
            <FormFieldError
              id="registration-password-error"
              message={passwordError}
            />
          </div>
          <Button
            className="w-full font-suisse text-sm font-medium leading-5 text-[#F7F6F5]"
            type="submit"
            disabled={isSubmitDisabled}
            data-qaautomationid="registration-submit-button"
          >
            {isSubmitting ? "Registering..." : "Register"}
          </Button>
        </form>
      </div>
    </div>
  );
}
