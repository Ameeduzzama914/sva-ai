import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "SVA Trust Engine",
  description:
    "Verify AI answers using multi-model agreement, evidence, source quality, contradiction analysis, and SVA Judge."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
