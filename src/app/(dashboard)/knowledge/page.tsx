import KnowledgeUpload from "@/components/knowledge/knowledge-upload";
import KnowledgeTable from "@/components/knowledge/knowledge-table";

export default function KnowledgePage() {
  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            Knowledge Base
          </h1>

          <p className="text-gray-500 mt-1">
            Upload documents for the AI Voice Agent.
          </p>

        </div>

        <KnowledgeUpload />

      </div>

      <KnowledgeTable />

    </div>
  );
}