import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import Spinner from "./Spinner";

/** Wraps every page that needs a logged-in user. The backend enforces access
 *  as well; this only decides what the UI shows. */
export default function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Laster…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
