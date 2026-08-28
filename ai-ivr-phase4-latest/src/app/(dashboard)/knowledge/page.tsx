import { redirect } from "next/navigation";

import KnowledgeUpload from "@/components/knowledge/knowledge-upload";
import KnowledgeTable from "@/components/knowledge/knowledge-table";
import { getCurrentUser } from "@/lib/auth";

export default async function KnowledgePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const canMutate = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Knowledge Base
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Upload, archive, and manage the documents that can be attached to
            campaigns.
          </p>
        </div>

        <KnowledgeUpload disabled={!canMutate} />
      </div>

      <KnowledgeTable canMutate={canMutate} />

    </div>
  );
}
