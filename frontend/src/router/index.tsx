//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import MainLayout from "@/components/layout/MainLayout";
import CaseListing from "@/pages/CaseListing";
import CaseReview from "@/pages/CaseReview";
import DocumentPreview from "@/pages/DocumentPreview";
import ForgotPassword from "@/pages/ForgotPassword";
import Login from "@/pages/Login";
import PromptConfiguration from "@/pages/PromptConfiguration";
import Registration from "@/pages/Registration";
import ResetPassword from "@/pages/ResetPassword";
import UploadCase from "@/pages/UploadCase";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import AdminRoute from "./AdminRoute";
import PrivateRoute from "./PrivateRoute";
import PublicRoute from "./PublicRoute";

const router = createBrowserRouter([
  {
    path: "/",
    children: [
      {
        path: "/",
        element: <PrivateRoute />,
        children: [
          {
            element: <MainLayout />,
            children: [
              {
                path: "/upload-case",
                element: <UploadCase />,
              },
              {
                path: "/cases",
                element: <CaseListing />,
              },
              {
                path: "/cases/:caseId",
                element: <CaseReview />,
              },
              {
                element: <AdminRoute />,
                children: [
                  {
                    path: "/prompts",
                    element: <PromptConfiguration />,
                  },
                ],
              },
            ],
          },
          {
            path: "/cases/:caseId/documents/:documentId/preview",
            element: <DocumentPreview />,
          },
        ],
      },
      {
        path: "/",
        element: <PublicRoute />,
        children: [
          {
            element: <MainLayout />,
            children: [
              {
                path: "/register",
                element: <Registration />,
              },
              {
                path: "/login",
                element: <Login />,
              },
              {
                path: "/forgot-password",
                element: <ForgotPassword />,
              },
              {
                path: "/reset-password",
                element: <ResetPassword />,
              },
            ],
          },
        ],
      },
    ],
  },
]);

export const Router = () => {
  return <RouterProvider router={router} />;
};
