import type { Metadata } from "next";
import "./globals.css";

import QueryProvider from "@/providers/query-provider";
import { SocketProvider } from "@/contexts/socket-context";
import { Toaster } from "sonner";

import { bootstrap } from "@/core/bootstrap";
bootstrap();

export const metadata: Metadata = {
  title: "AI IVR Management System",
  description: "Enterprise AI IVR Management Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full">
        <QueryProvider>
          <SocketProvider>
            {children}
          </SocketProvider>
        </QueryProvider>

        <Toaster
          position="top-right"
          richColors
        />
      </body>
    </html>
  );
}