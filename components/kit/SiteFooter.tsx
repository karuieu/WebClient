import { LANDING_URL } from "@/app/siteUrl";
import { Logo } from "./Logo";
import { SocialLinks } from "./SocialIcons";
import { ThemeToggle } from "./ThemeToggle";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Security", href: `${LANDING_URL}/#security` },
      { label: "Features", href: `${LANDING_URL}/#features` },
      { label: "Models", href: `${LANDING_URL}/#models` },
      { label: "Pricing", href: `${LANDING_URL}/#pricing` },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", href: "mailto:support@karui.eu" },
      { label: "Security policy", href: `${LANDING_URL}/security` },
      { label: "Status", href: "https://status.karui.eu/", external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: `${LANDING_URL}/privacy` },
      { label: "Terms", href: `${LANDING_URL}/terms` },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mx-4 max-w-[1240px] border-x border-t border-line sm:mx-6 xl:mx-auto">
      <div className="grid gap-12 px-5 py-16 md:grid-cols-12 md:px-10">
        <div className="md:col-span-5">
          <Logo />
          <p className="mt-4 max-w-xs text-[0.9375rem] text-muted">Private AI, sealed in hardware.</p>
          <SocialLinks className="mt-6" />
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title} className="md:col-span-2">
            <p className="text-label text-muted">{col.title}</p>
            <ul className="mt-5 space-y-3">
              {col.links.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    {...("external" in l && { target: "_blank", rel: "noopener noreferrer" })}
                    className="text-[0.9375rem] transition-colors hover:text-muted"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="flex flex-col gap-4 border-t border-line px-5 py-6 font-mono text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between md:px-10">
        <p>© 2026 Karui · Antoni Krzykowski · All rights reserved</p>
        <ThemeToggle />
      </div>
    </footer>
  );
}
