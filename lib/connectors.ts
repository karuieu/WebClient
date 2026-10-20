export type ConnectorRoute = "browser" | "server";

export type ConnectorCategory = "everyday" | "development" | "business";

export type ConnectorAbility = { label: string; changes?: boolean };

export type ConnectorApp = "github" | "google" | "asana" | "hubspot" | "slack";

export type GoogleConnector = "gmail" | "drive" | "docs";

export type ConnectorInfo = {
  id: string;
  name: string;
  description: string;
  url: string;
  browser: boolean;
  app?: ConnectorApp;
  api?: GoogleConnector;
  scopes?: string;
  notice?: { text: string; href: string };
  category?: ConnectorCategory;
  pitch?: string;
  abilities: ConnectorAbility[];
};

export const CONNECTOR_CATEGORIES: { id: ConnectorCategory; label: string }[] = [
  { id: "everyday", label: "Everyday" },
  { id: "development", label: "Development" },
  { id: "business", label: "Business" },
];

// 'browser' means the service answers CORS preflight from the relay origin, so the browser can call it directly.
// 'app' means sign-in needs Karui's registered OAuth app, so the code is exchanged on Karui's server, which holds the secret.
export const CONNECTOR_CATALOG: readonly ConnectorInfo[] = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Messages, threads and drafts",
    url: "https://gmail.googleapis.com/gmail/v1/users/me",
    browser: true,
    app: "google",
    api: "gmail",
    scopes: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
    category: "everyday",
    abilities: [
      { label: "Search and read messages and threads" },
      { label: "Create drafts", changes: true },
    ],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Find files and read their text",
    url: "https://www.googleapis.com/drive/v3",
    browser: true,
    app: "google",
    api: "drive",
    scopes: "https://www.googleapis.com/auth/drive.readonly",
    category: "everyday",
    abilities: [{ label: "Search files and folders" }, { label: "Read text files and Google Docs" }],
  },
  {
    id: "google-docs",
    name: "Google Docs",
    description: "Save Karui documents to Google Docs",
    url: "https://docs.googleapis.com/v1/documents",
    browser: true,
    app: "google",
    api: "docs",
    scopes: "https://www.googleapis.com/auth/drive.file",
    category: "everyday",
    abilities: [
      { label: "Read documents created by Karui" },
      { label: "Save an artifact as a Google Doc", changes: true },
      { label: "Update its Google copy after your approval", changes: true },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Messages, channels and threads",
    url: "https://mcp.slack.com/mcp",
    browser: false,
    app: "slack",
    scopes: "search:read.public search:read.private search:read.im search:read.mpim search:read.files channels:history groups:history im:history mpim:history channels:read groups:read im:read mpim:read chat:write",
    notice: {
      text: "Your workspace admin may need to approve Karui. Slack MCP access requires a published Marketplace app or an internal app.",
      href: "https://docs.slack.dev/ai/slack-mcp-server/",
    },
    category: "business",
    abilities: [{ label: "Search messages and read threads" }, { label: "Send messages after your approval", changes: true }],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Events, free time and invitations",
    url: "https://calendarmcp.googleapis.com/mcp/v1",
    browser: false,
    app: "google",
    scopes: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
    category: "everyday",
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
    category: "everyday",
    pitch: "Your notes, one question away.",
    abilities: [{ label: "Search your pages and databases" }, { label: "Read a page" }, { label: "Create and edit pages", changes: true }],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Code, issues and pull requests",
    url: "https://api.githubcopilot.com/mcp/",
    browser: true,
    app: "github",
    scopes: "repo read:org read:user",
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
    notice: {
      text: "Your Atlassian admin has to allow karui.eu first, in the Rovo MCP server domain settings.",
      href: "https://support.atlassian.com/security-and-access-policies/docs/available-atlassian-rovo-mcp-server-domains/",
    },
    category: "development",
    abilities: [{ label: "Search tickets and pages" }, { label: "Read a ticket or page" }, { label: "Create tickets and pages", changes: true }],
  },
  {
    id: "asana",
    name: "Asana",
    description: "Tasks and projects",
    url: "https://mcp.asana.com/v2/mcp",
    browser: false,
    app: "asana",
    category: "everyday",
    abilities: [{ label: "See your tasks and projects" }, { label: "Create and complete tasks", changes: true }],
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Actions across thousands of apps",
    url: "https://mcp.zapier.com/api/mcp/mcp",
    browser: false,
    category: "everyday",
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
    app: "hubspot",
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
