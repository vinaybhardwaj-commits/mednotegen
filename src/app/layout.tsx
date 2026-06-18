import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedNoteGen",
  description: "Structured, NABH-aware clinical note generator",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
