//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import FormFieldError from "@/components/common/FormFieldError";
import { showValidationToast } from "@/components/ToastNotifications/showValidationToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPassword, getResponseMessage } from "@/services";
import axios from "axios";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitAttemptRef = useRef(0);
  const isSubmitDisabled = isSubmitting;
  const labelClassName = "font-suisse text-sm font-normal leading-none";
  const errorLabelClassName = `${labelClassName} text-[#ef2b2a]`;

  const handleSubmit = async () => {
    const submitAttemptId = ++submitAttemptRef.current;
    const normalizedEmail = email.trim();
    setEmailError("");

    if (!normalizedEmail) {
      setEmailError("Enter a Valid email address");
      return;
    }

    if (!normalizedEmail.includes("@")) {
      setEmailError("Enter a Valid email address");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await forgotPassword({
        email: normalizedEmail,
      });

      if (submitAttemptId !== submitAttemptRef.current) {
        return;
      }

      const responseMessage =
        getResponseMessage(response) ??
        "If an account exists for that email, a security code has been sent.";

      showValidationToast("success", responseMessage);
      void navigate(
        `/reset-password?email=${encodeURIComponent(normalizedEmail)}`,
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
        responseMessage || "Unable to send security code.",
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
      data-qaautomationid="forgot-password-page"
    >
      <div className="m-auto flex w-full max-w-[344px] flex-col">
        <h1
          className="m-0 text-center font-inter text-[32px] font-medium leading-[38.4px] tracking-[-0.32px] text-[#111827]"
          data-qaautomationid="forgot-password-page-title"
        >
          Forgot Password
        </h1>
        <p
          className="mt-6 font-inter text-sm font-normal leading-[20px] text-[#1E1E1E]"
          data-qaautomationid="forgot-password-page-instructions"
        >
          Please enter the email address associated with your account.
        </p>
        <form
          className="mt-6 flex flex-col"
          noValidate
          data-qaautomationid="forgot-password-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="flex flex-col items-start gap-2.5 self-stretch">
            <Label
              htmlFor="forgot-password-email"
              className={
                emailError
                  ? errorLabelClassName
                  : `${labelClassName} text-[#272423]`
              }
            >
              Email Address
            </Label>
            <Input
              id="forgot-password-email"
              type="text"
              value={email}
              data-qaautomationid="forgot-password-email-input"
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) {
                  setEmailError("");
                }
              }}
              aria-invalid={emailError.length > 0}
              aria-describedby="forgot-password-email-error"
            />
            <FormFieldError
              id="forgot-password-email-error"
              message={emailError}
            />
          </div>

          <Button
            className="mt-6 w-full font-suisse text-sm font-medium leading-5 text-[#F7F6F5]"
            type="submit"
            disabled={isSubmitDisabled}
            data-qaautomationid="forgot-password-submit-button"
          >
            {isSubmitting ? "Sending..." : "Continue"}
          </Button>
          <Button
            variant="secondary"
            className="mt-3 w-full font-suisse text-sm font-medium leading-5 text-[#4A4442]"
            type="button"
            data-qaautomationid="forgot-password-cancel-button"
            onClick={() => void navigate("/login")}
          >
            Cancel
          </Button>
        </form>
      </div>
    </div>
  );
}
