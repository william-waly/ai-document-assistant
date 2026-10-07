import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import RequireAuth from "./components/RequireAuth";
import Account from "./pages/Account";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import DocumentDetail from "./pages/DocumentDetail";
import Documents from "./pages/Documents";
import NotFound from "./pages/NotFound";

/** Routes only. The router itself is added in main.tsx (and in tests). */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      {/* Everything below needs a logged-in user */}
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="documents" element={<Documents />} />
          <Route path="documents/:id" element={<DocumentDetail />} />
          <Route path="account" element={<Account />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
