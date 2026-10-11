export type ConnectorRoute = "browser" | "server";

export type ConnectorCategory = "productivity" | "development" | "business";

export type ConnectorAbility = { label: string; changes?: boolean };

export type ConnectorInfo = {
  id: string;
  name: string;
  description: string;
  url: string;
  browser: boolean;
  category?: ConnectorCategory;
  pitch?: string;
  abilities: ConnectorAbility[];
};

export const CONNECTOR_CATEGORIES: { id: ConnectorCategory; label: string }[] = [
  { id: "productivity", label: "Productivity" },
  { id: "development", label: "Development" },
  { id: "business", label: "Business" },
];

// 'browser' means the MCP server answers CORS preflight from our origin, so the browser can call it directly.
export const CONNECTOR_CATALOG: readonly ConnectorInfo[] = [
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Events, free time and invitations",
    url: "https://calendarmcp.googleapis.com/mcp/v1",
    browser: false,
    category: "productivity",
    pitch: "Ask about your week, then plan around it.",
    abilities: [
      { label: "See your events and free time" },
      { label: "Find a time that works" },
      { label: "Create and move events", changes: true },
      { label: "Reply to invitations", changes: true },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Pages, notes and databases",
    url: "https://mcp.notion.com/mcp",
    browser: true,
    category: "productivity",
    pitch: "Your notes, one question away.",
    abilities: [{ label: "Search your pages and databases" }, { label: "Read a page" }, { label: "Create and edit pages", changes: true }],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Repositories, issues and pull requests",
    url: "https://api.githubcopilot.com/mcp/",
    browser: true,
    category: "development",
    abilities: [
      { label: "Browse repositories and code" },
      { label: "Read issues and pull requests" },
      { label: "Open issues and leave comments", changes: true },
    ],
  },
  {
    id: "linear",
    name: "Linear",
    description: "Issues, projects and cycles",
    url: "https://mcp.linear.app/mcp",
    browser: true,
    category: "development",
    abilities: [{ label: "Find issues and projects" }, { label: "Read comments and status" }, { label: "Create and update issues", changes: true }],
  },
  {
    id: "atlassian",
    name: "Jira & Confluence",
    description: "Tickets and team pages",
    url: "https://mcp.atlassian.com/v1/mcp",
    browser: true,
    category: "productivity",
    abilities: [{ label: "Search tickets and pages" }, { label: "Read a ticket or page" }, { label: "Create tickets and pages", changes: true }],
  },
  {
    id: "asana",
    name: "Asana",
    description: "Tasks and projects",
    url: "https://mcp.asana.com/sse",
    browser: true,
    category: "productivity",
    abilities: [{ label: "See your tasks and projects" }, { label: "Create and complete tasks", changes: true }],
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Actions across thousands of apps",
    url: "https://mcp.zapier.com/api/mcp/mcp",
    browser: false,
    category: "productivity",
    abilities: [{ label: "See the actions you set up" }, { label: "Run an action in another app", changes: true }],
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Errors and performance issues",
    url: "https://mcp.sentry.dev/mcp",
    browser: false,
    category: "development",
    abilities: [
      { label: "Look up errors and stack traces" },
      { label: "See how often an issue happens" },
      { label: "Resolve or assign issues", changes: true },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Payments, customers and invoices",
    url: "https://mcp.stripe.com",
    browser: false,
    category: "business",
    abilities: [
      { label: "Look up customers and payments" },
      { label: "Read invoices and subscriptions" },
      { label: "Issue refunds and invoices", changes: true },
    ],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Contacts, companies and deals",
    url: "https://mcp.hubspot.com",
    browser: false,
    category: "business",
    abilities: [{ label: "Look up contacts, companies and deals" }, { label: "Read notes and activity" }, { label: "Update records", changes: true }],
  },
];

export function defaultRoute(connector: Pick<ConnectorInfo, "browser">): ConnectorRoute {
  return connector.browser ? "browser" : "server";
}

export function categoryLabel(category: ConnectorCategory | undefined): string {
  return CONNECTOR_CATEGORIES.find((c) => c.id === category)?.label ?? "Your own";
}
