import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Image / Image — Your product, in a good light",
  description:
    "Turn your real product photo into an ad. Keep original product detail, edit the scene and text, export a crisp PNG.",
};
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
