"use client";

import {
  AlertTriangle,
  Bot,
  Loader2,
  RefreshCw,
  Sparkles,
  WandSparkles,
  CheckCircle2,
  X,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import {
  Button,
} from "@/components/ui/button";

import {
  Textarea,
} from "@/components/ui/textarea";

import {
  api,
} from "@/lib/axios";

import {
  useIVRBuilder,
} from "./ivr-builder-context";

import type {
  FlowCopilotMode,
} from "@/services/ivr/flow-copilot.service";

interface CopilotResponse {
  success: boolean;
  data?: {
    summary: string;
    warnings: string[];
    candidateFlow?: {
      name?: string;
      nodes: Array<{
        id: string;
        type: string;
        position: { x: number; y: number };
        data: Record<string, unknown>;
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        type?: string;
        sourceHandle?: string;
        targetHandle?: string;
        data?: Record<string, unknown>;
      }>;
    };
  };
  message?: string;
}

interface CandidateFlow {
  name?: string;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type?: string;
    sourceHandle?: string;
    targetHandle?: string;
    data?: Record<string, unknown>;
  }>;
}

export default function FlowCopilotPanel() {
  const {
    nodes,
    edges,
    flowName,
    campaignId,
    setMode,
    setNodes,
    setEdges,
  } = useIVRBuilder();

  const [command, setCommand] = useState<FlowCopilotMode>("GENERATE");
  const [prompt, setPrompt] = useState(
    "Create a friendly outbound flow with a greeting, AI conversation, lead capture for interested callers, callback handling, and human transfer when requested."
  );
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [candidateFlow, setCandidateFlow] = useState<CandidateFlow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const capabilitySummary = useMemo(() => {
    return [
      `Campaign: ${campaignId || "none"}`,
      `Current flow nodes: ${nodes.length}`,
      `Current flow edges: ${edges.length}`,
    ];
  }, [campaignId, nodes.length, edges.length]);

  async function requestSuggestion() {
    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post<CopilotResponse>("/ivr-flows/copilot", {
        mode: command,
        prompt,
        flowName,
        campaignId: campaignId || null,
        currentFlow: {
          nodes,
          edges,
        },
      });

      if (!data.success || !data.data) {
        throw new Error(data.message ?? "IVR copilot could not generate a suggestion");
      }

      setSummary(data.data.summary);
      setWarnings(data.data.warnings ?? []);
      setCandidateFlow(data.data.candidateFlow ?? null);
    } catch (suggestionError) {
      setError(
        suggestionError instanceof Error
          ? suggestionError.message
          : "IVR copilot could not generate a suggestion"
      );
      setCandidateFlow(null);
      setWarnings([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  function applySuggestion() {
    if (!candidateFlow) {
      return;
    }

    setNodes(candidateFlow.nodes as never);
    setEdges(candidateFlow.edges as never);
    setMode("MANUAL");
  }

  function clearSuggestion() {
    setSummary(null);
    setWarnings([]);
    setCandidateFlow(null);
    setError(null);
  }

  return (
    <div className="w-96 border-l border-slate-200 bg-white p-6 overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Bot className="h-5 w-5 text-blue-600" />
            Build with AI
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            The copilot proposes changes against the current canonical draft.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMode("MANUAL")}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          <X className="inline-block h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        {capabilitySummary.map(line => (
          <div key={line} className="py-0.5">
            {line}
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700">Command</label>
          <select
            value={command}
            onChange={event => setCommand(event.target.value as FlowCopilotMode)}
            className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          >
            <option value="GENERATE">Generate</option>
            <option value="MODIFY">Modify</option>
            <option value="EXPLAIN">Explain</option>
            <option value="VALIDATE">Validate</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Prompt</label>
          <Textarea
            rows={10}
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            placeholder="Describe the flow change you want..."
            className="mt-2"
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => void requestSuggestion()}
            disabled={loading}
            className="flex-1"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Working...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Preview Changes
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={clearSuggestion}
            disabled={loading}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerate
          </Button>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {summary && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="flex items-center gap-2 font-semibold">
              <WandSparkles className="h-4 w-4" />
              Suggested Result
            </div>
            <p className="mt-2 leading-6">{summary}</p>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Warnings
            </div>
            <ul className="mt-2 space-y-1 leading-6">
              {warnings.map(warning => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          </div>
        )}

        {candidateFlow && (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2 text-sm text-slate-700">
              <span className="font-semibold">Preview</span>
              <span className="text-xs text-slate-500">
                {candidateFlow.nodes.length} nodes, {candidateFlow.edges.length} edges
              </span>
            </div>

            <div className="max-h-52 overflow-auto rounded-xl bg-white p-3 text-xs text-slate-600">
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(candidateFlow, null, 2)}
              </pre>
            </div>

            <Button type="button" className="w-full" onClick={applySuggestion}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Apply to Builder
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
