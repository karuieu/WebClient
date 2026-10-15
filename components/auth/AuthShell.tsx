import Link from "next/link";
import { CipherField } from "@/components/kit/CipherField";
import { Cross } from "@/components/kit/Frame";
import { SiteFooter } from "@/components/kit/SiteFooter";
import { Logo } from "@/components/kit/Logo";
import { ThemeToggle } from "@/components/kit/ThemeToggle";
import { cx } from "@/lib/cx";

/**
 * `form` is the narrow column for sign-in screens. `system` is the wide, centred
 * page for 404s: ciphertext backdrop and the full site footer.
 */
export function AuthShell({ children, variant = "form" }: { children: React.ReactNode; variant?: "form" | "system" }) {
  const system = variant === "system";
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-inverse focus:px-4 focus:py-2 focus:text-sm focus:text-on-inverse"
      >
        Skip to content
      </a>

      <header className="px-4 sm:px-6">
        <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between px-1 md:px-2">
          <Link href="/" aria-label="Karui home" className="rounded-lg">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 flex-col px-4 sm:px-6">
        <main
          id="main"
          className="relative mx-auto grid w-full max-w-[1240px] flex-1 place-items-center border-x border-t border-line px-5 py-14 md:py-20"
        >
          <Cross className="-left-[6px] -top-[6px]" />
          <Cross className="-right-[6px] -top-[6px]" />
          {system && (
            <CipherField className="absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black_80%)]" />
          )}
          <div className={cx("w-full", system ? "relative max-w-3xl" : "max-w-[26rem]")}>{children}</div>
        </main>
      </div>

      {system ? (
        <div>
          <SiteFooter />
        </div>
      ) : (
        <footer className="px-4 sm:px-6">
          <div className="relative mx-auto flex h-14 w-full max-w-[1240px] items-center justify-between gap-4 border-x border-t border-line px-5 md:px-10">
            <Cross className="-left-[6px] -top-[6px]" />
            <Cross className="-right-[6px] -top-[6px]" />
            <p className="text-label text-muted">© {new Date().getFullYear()} Karui</p>
            <nav aria-label="Legal" className="flex items-center gap-5">
              <Link href="/terms" className="text-label text-muted transition-colors duration-150 hover:text-fg">
                Terms
              </Link>
              <Link href="/privacy" className="text-label text-muted transition-colors duration-150 hover:text-fg">
                Privacy
              </Link>
            </nav>
          </div>
        </footer>
      )}
    </div>
  );
}
