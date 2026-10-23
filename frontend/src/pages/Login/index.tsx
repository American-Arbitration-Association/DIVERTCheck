//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import FormFieldError from "@/components/common/FormFieldError";
import { showValidationToast } from "@/components/ToastNotifications/showValidationToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/useAuth";
import {
  isStrongPassword,
  PASSWORD_RULES_MESSAGE,
} from "@/lib/passwordValidation";
import { loginUser, type LoginMessageResponse } from "@/services";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import axios from "axios";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
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

    const messageResponse = response as LoginMessageResponse & {
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

  const handleSubmit = async () => {
    const submitAttemptId = ++submitAttemptRef.current;
    const normalizedEmail = email.trim();
    let hasValidationError = false;

    setEmailError("");
    setPasswordError("");

    if (!normalizedEmail) {
      setEmailError("Enter a Valid email address");
      hasValidationError = true;
    } else if (!normalizedEmail.includes("@")) {
      setEmailError("Please enter a valid email address.");
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
      const response = await loginUser({
        email: normalizedEmail,
        password,
      });

      if (submitAttemptId !== submitAttemptRef.current) {
        return;
      }

      if (
        response &&
        typeof response === "object" &&
        "accessToken" in response &&
        typeof response.accessToken === "string" &&
        response.accessToken.trim()
      ) {
        await login(response);
        showValidationToast("success", "Logged in successfully", "", 2000);
        void navigate("/upload-case", { replace: true });
        return;
      }

      const responseMessage = getResponseMessage(response);
      showValidationToast("error", responseMessage || "Login Failed.");
    } catch (error) {
      if (submitAttemptId !== submitAttemptRef.current) {
        return;
      }

      const responseMessage = axios.isAxiosError(error)
        ? getResponseMessage(error.response?.data)
        : "";
      const isInvalidEmailPassword =
        axios.isAxiosError(error) &&
        error.response?.status === 401 &&
        responseMessage === "Invalid email/password.";

      showValidationToast(
        "error",
        isInvalidEmailPassword
          ? "Invalid credentials. Please try again."
          : responseMessage || "Login Failed.",
        responseMessage === "Account Temporarily Locked"
          ? "For security reasons, your account has been temporarily locked. Try again in 15 minutes or reset your password."
          : "",
      );
    } finally {
      if (submitAttemptId === submitAttemptRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8" data-qaautomationid="login-page">
      <div className="m-auto flex w-full max-w-[344px] flex-col">
        <h1
          className="m-0 text-center font-inter text-[32px] font-medium leading-[38.4px] tracking-[-0.32px] text-[#111827]"
          data-qaautomationid="login-page-title"
        >
          Log In
        </h1>
        <p
          className="mt-6 font-inter text-sm font-normal leading-[20px] text-[#1E1E1E]"
          data-qaautomationid="login-page-instructions"
        >
          Please enter your username and password. If you do not have an
          account, please{" "}
          <Link
            to="/register"
            className="text-[#01579b] underline decoration-[#01579b] underline-offset-2"
            data-qaautomationid="login-register-link"
          >
            Register Now
          </Link>
          .
        </p>
        <form
          id="login-form"
          className="mt-6 flex flex-col gap-6"
          noValidate
          data-qaautomationid="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="flex flex-col items-start gap-2.5 self-stretch">
            <Label
              htmlFor="login-email"
              className={
                emailError
                  ? errorLabelClassName
                  : `${labelClassName} text-[#272423]`
              }
            >
              Email Address
            </Label>
            <Input
              id="login-email"
              type="text"
              value={email}
              data-qaautomationid="login-email-input"
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) {
                  setEmailError("");
                }
              }}
              aria-invalid={emailError.length > 0}
              aria-describedby={emailError ? "login-email-error" : undefined}
            />
            {emailError ? (
              <FormFieldError id="login-email-error" message={emailError} />
            ) : null}
          </div>
          <div className="flex flex-col items-start gap-2.5 self-stretch">
            <Label
              htmlFor="login-password"
              className={
                passwordError
                  ? errorLabelClassName
                  : `${labelClassName} text-[#272423]`
              }
            >
              Password
            </Label>
            <div className="relative w-full">
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                className="pr-10"
                value={password}
                data-qaautomationid="login-password-input"
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
                aria-describedby={
                  passwordError ? "login-password-error" : undefined
                }
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 z-10 flex !h-6 !w-6 -translate-y-1/2 items-center justify-center !border-0 !bg-transparent !p-0 text-[#4A4442] !shadow-none"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                data-qaautomationid="login-password-toggle-button"
              >
                {showPassword ? (
                  <IconEye size={18} className="pointer-events-none" />
                ) : (
                  <IconEyeOff size={18} className="pointer-events-none" />
                )}
              </button>
            </div>
            {passwordError ? (
              <FormFieldError
                id="login-password-error"
                message={passwordError}
              />
            ) : null}
          </div>
        </form>

        <Button
          className="mt-6 w-full font-suisse text-sm font-medium leading-5 text-[#F7F6F5]"
          type="submit"
          form="login-form"
          disabled={isSubmitDisabled}
          data-qaautomationid="login-submit-button"
        >
          Log In
        </Button>

        <p
          className="mt-6 font-inter text-sm font-normal leading-[20px] text-[#1E1E1E]"
          data-qaautomationid="login-forgot-password-text"
        >
          Forgot{" "}
          <Link
            to="/forgot-password"
            className="text-[#01579b] underline decoration-[#01579b] underline-offset-2"
            data-qaautomationid="login-forgot-password-link"
          >
            password
          </Link>
          ?
        </p>

        <p
          className="mt-2 font-inter text-xs font-normal leading-[18px] text-[#1E1E1E]"
          data-qaautomationid="login-password-policy"
        >
          Your account will be locked after four or more unsuccessful login
          attempts. Should that occur, we recommend that you reset your password
          as that will allow you to immediately unlock your account and login
          using your new credentials.
        </p>
      </div>
    </div>
  );
}
