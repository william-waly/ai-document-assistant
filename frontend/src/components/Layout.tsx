import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            DocAssistant
          </Link>
          <nav aria-label="Hovedmeny" className="nav">
            <NavLink to="/" end>
              Oversikt
            </NavLink>
            <NavLink to="/documents">Dokumenter</NavLink>
            <NavLink to="/chat">Samtaler</NavLink>
            <NavLink to="/account">Konto</NavLink>
          </nav>
          <div className="user">
            <span className="muted user-email">{user?.email}</span>
            <button type="button" className="btn btn-ghost" onClick={() => logout()}>
              Logg ut
            </button>
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
