import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'EngineOS Admin Console',
  description: 'Browse and stage changes to the EngineOS plugin capability graph.',
};

const NAV_LINKS = [
  { href: '/decisions', label: 'Decisions' },
  { href: '/skills', label: 'Skills' },
  { href: '/publish', label: 'Publish' },
  { href: '/history', label: 'History' },
] as const;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="en">
      <body>
        <Providers>
          <nav aria-label="Main" className="border-b border-gray-200 px-4 py-3">
            <ul className="flex gap-4">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm font-medium text-gray-700 hover:underline">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {children}
        </Providers>
      </body>
    </html>
  );
}
