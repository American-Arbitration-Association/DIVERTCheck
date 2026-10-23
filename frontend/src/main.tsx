//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "react-day-picker/style.css";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext";
import { JobRegistryProvider } from "./context/JobRegistryContext";
import "./index.css";
import "./styles/fonts.scss";
import "./styles/globals.scss";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <JobRegistryProvider>
        <Toaster richColors position="top-center" />
        <App />
      </JobRegistryProvider>
    </AuthProvider>
  </QueryClientProvider>,
);
