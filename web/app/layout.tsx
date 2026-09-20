import type { Metadata } from "next";
import "./globals.css";
import { SettingsProvider } from "@/lib/settings-context";
import { SessionStoreProvider } from "@/lib/session-store";
import Header from "@/features/layout/Header";

export const metadata: Metadata = {
  title: "LazyNet Console",
  description: "ARP poisoning monitoring and control console",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-density="comfortable">
      <body>
        <SettingsProvider>
          <SessionStoreProvider>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100vh",
                overflow: "hidden",
              }}
            >
              <Header />
              <main style={{ flex: 1, minHeight: 0, display: "flex" }}>
                {children}
              </main>
            </div>
          </SessionStoreProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
