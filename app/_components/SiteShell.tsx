import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-grow mx-auto w-full max-w-site px-5 sm:px-8 py-8 sm:py-12">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
