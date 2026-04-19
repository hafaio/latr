import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import ThemeProvider from "../components/theme";
import { TodoProvider } from "../utils/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "latr",
  description: "Do it latr.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <TodoProvider>{children}</TodoProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
