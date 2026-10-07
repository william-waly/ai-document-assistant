import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquarePlus,
  MessagesSquare,
  Settings,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { useAuth } from "../auth";
import { displayName } from "../format";
import { useWorkspace, WorkspaceProvider } from "../workspace";
import Brand from "./Brand";
import ThemeToggle from "./ThemeToggle";

interface NavItem {
  to: string;
  label: string;
  icon: typeof FileText;
  end?: boolean;
  /** Also highlighted while on a path starting with this prefix. */
  alsoActive?: string;
}

const NAV: NavItem[] = [
  { to: "/", label: "Oversikt", icon: LayoutDashboard, end: true },
  { to: "/documents", label: "Dokumenter", icon: FileText },
  { to: "/chat", label: "Ny samtale", icon: MessageSquarePlus, end: true },
  { to: "/conversations", label: "Samtaler", icon: MessagesSquare, alsoActive: "/chat/" },
  { to: "/account", label: "Konto", icon: Settings },
];

function sectionName(path: string): string {
  if (path.startsWith("/documents")) return "Dokumenter";
  if (path.startsWith("/chat")) return "Samtale";
  if (path.startsWith("/conversations")) return "Samtaler";
  if (path.startsWith("/account")) return "Konto";
  return "Oversikt";
}

function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { documents } = useWorkspace();
  const { pathname } = useLocation();
  const isChat = pathname.startsWith("/chat");
  const email = user?.email ?? "";
  const close = () => setMenuOpen(false);

  return (
    <div className="app-frame">
      {menuOpen && <button type="button" className="sidebar-scrim" aria-label="Lukk menyen" onClick={close} />}

      <aside className={`sidebar${menuOpen ? " sidebar--open" : ""}`}>
        <div className="sidebar-top">
          <Link to="/" className="brand-link" onClick={close}>
            <Brand />
          </Link>
          <button type="button" className="icon-button sidebar-close" onClick={close} aria-label="Lukk menyen">
            <X size={18} />
          </button>
        </div>

        <p className="nav-caption">ARBEIDSOMRÅDE</p>
        <nav className="main-nav" aria-label="Hovedmeny">
          {NAV.map(({ to, label, icon: Icon, end, alsoActive }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={close}
              className={({ isActive }) =>
                `nav-link${isActive || (alsoActive && pathname.startsWith(alsoActive)) ? " nav-link--active" : ""}`
              }
            >
              <Icon size={18} strokeWidth={1.85} aria-hidden="true" />
              <span>{label}</span>
              {to === "/documents" && documents.length > 0 && <span className="nav-count">{documents.length}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-lower">
          <div className="privacy-mini">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Dokumentene dine er private</span>
          </div>
          <div className="profile-menu">
            <div className="avatar avatar--profile" aria-hidden="true">
              {email.charAt(0).toUpperCase()}
            </div>
            <div className="profile-copy">
              <strong>{displayName(email)}</strong>
              <small>{email}</small>
            </div>
          </div>
          <button type="button" className="logout-link" onClick={() => logout()}>
            <LogOut size={15} aria-hidden="true" />
            <span>Logg ut</span>
          </button>
        </div>
      </aside>

      <div className="main-frame">
        <header className="topbar">
          <button type="button" className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Åpne menyen">
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>Arbeidsområde</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{sectionName(pathname)}</strong>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <Link to="/documents" className="button button--primary button--small">
              <Upload size={15} aria-hidden="true" /> <span>Last opp dokument</span>
            </Link>
          </div>
        </header>
        <main className={`page-content${isChat ? " page-content--chat" : ""}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** The logged-in frame: sidebar, top bar, and the user's shared data. */
export default function AppShell() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}
