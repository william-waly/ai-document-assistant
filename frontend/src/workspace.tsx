import { createContext, useContext, useMemo, type ReactNode } from "react";
import * as api from "./api";
import { useLoad } from "./hooks";

interface WorkspaceValue {
  documents: api.DocumentInfo[];
  conversations: api.ConversationSummary[];
  loading: boolean;
  error: string | null;
  /** Call after anything that changes the lists (upload, delete, new message). */
  reload: () => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/** The user's documents and conversations, loaded once and shared by the sidebar and all pages. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data, error, loading, reload } = useLoad(async () => {
    const [documents, conversations] = await Promise.all([api.listDocuments(), api.listConversations()]);
    return { documents, conversations };
  });

  const value = useMemo<WorkspaceValue>(
    () => ({
      documents: data?.documents ?? [],
      conversations: data?.conversations ?? [],
      loading: loading && !data, // keep showing the old data while reloading
      error,
      reload,
    }),
    [data, loading, error, reload],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return context;
}
