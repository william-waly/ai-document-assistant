import { Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import RequireAuth from "./components/RequireAuth";
import { ToastProvider } from "./components/Toast";
import Account from "./pages/Account";
import AuthPage from "./pages/AuthPage";
import ChatPage from "./pages/ChatPage";
import Conversations from "./pages/Conversations";
import Dashboard from "./pages/Dashboard";
import DocumentDetail from "./pages/DocumentDetail";
import Documents from "./pages/Documents";
import NotFound from "./pages/NotFound";

/** Routes only. The router itself is added in main.tsx (and in tests). */
export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />

        {/* Everything below needs a logged-in user (the backend enforces it as well) */}
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="documents" element={<Documents />} />
            <Route path="documents/:id" element={<DocumentDetail />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="chat/:id" element={<ChatPage />} />
            <Route path="conversations" element={<Conversations />} />
            <Route path="account" element={<Account />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </ToastProvider>
  );
}
