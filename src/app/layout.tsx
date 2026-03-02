import "./globals.css";

export const metadata = {
  title: "UTM Guard",
  description: "Gerador de UTMs com regras, templates, histórico e bulk.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}