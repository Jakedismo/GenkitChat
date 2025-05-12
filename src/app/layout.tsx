import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggleButton } from "@/components/theme-toggle-button"; // Import the new component
import PdfWorkerSetup from "@/components/PdfWorkerSetup"; // Import PdfWorkerSetup

const roboto = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GenkitChat",
  description: "Vibe Coding Project",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${roboto.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PdfWorkerSetup /> {/* Initialize PDF.js worker for client-side */}
          <div className="flex flex-col min-h-screen">
            <header className="flex items-center justify-between py-4 px-6">
              <div>GenkitChat</div>
              <ThemeToggleButton /> {/* Use the new component */}
            </header>
            <main className="flex-1">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
