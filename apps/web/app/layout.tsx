import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'NeoBlock',
  description: 'NeoBlock monorepo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
