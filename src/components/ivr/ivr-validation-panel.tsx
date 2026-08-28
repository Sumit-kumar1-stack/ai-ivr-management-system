"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/axios";

interface ValidationIssue {
  code: string;
  nodeId: string | null;
  edgeId?: string | null;
  category?: string;
  title?: string;
  description?: string;
  suggestedFix?: string | null;
  message: string;
  severity: "ERROR" | "WARNING" | "INFO";
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  issues: ValidationIssue[];
}

interface Props {
  flowId?: string;
  onFocusNode?: (nodeId: string) => void;
}

export default function IVRValidationPanel({ flowId, onFocusNode }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runValidation() {
    if (!flowId || loading) return;

    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get(`/ivr-flows/${flowId}/validate`);
      if (!data?.success || !data.data) {
        throw new Error(data?.message ?? "IVR flow validation could not be loaded");
      }
      setResult(data.data as ValidationResult);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "IVR flow validation could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  const summary = useMemo(() => {
    const issues = result?.issues ?? [];
    return {
      errors: issues.filter(issue => issue.severity === "ERROR").length,
      warnings: issues.filter(issue => issue.severity === "WARNING").length,
      info: issues.filter(issue => issue.severity === "INFO").length,
    };
  }, [result]);

  return (
    <aside className="w-[390px] overflow-y-auto border-l border-slate-200/80 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Validation</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Pre-publish checks</h3>
          <p className="mt-1 text-sm text-slate-500">
            Validate the saved IVR flow before publishing it to production runtime.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {!flowId && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Save the flow before running validation.
          </div>
        )}

        <div className="flex gap-2">
          <Button type="button" className="flex-1" onClick={() => void runValidation()} disabled={!flowId || loading}>
            {loading ? "Validating..." : "Run validation"}
          </Button>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">
                  {result.valid ? "Validation passed" : "Validation failed"}
                </div>
                <Badge variant={result.valid ? "default" : "destructive"}>
                  {result.valid ? "Valid" : "Invalid"}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{summary.errors} errors</Badge>
                <Badge variant="secondary">{summary.warnings} warnings</Badge>
                <Badge variant="secondary">{summary.info} info</Badge>
              </div>
            </div>

            {groupIssues(result.issues).map(([category, issues]) => (
              <div key={category} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold capitalize">{category}</div>
                  <Badge variant="secondary">{issues.length}</Badge>
                </div>
                <div className="space-y-2">
                  {issues.map(issue => (
                    <IssueButton key={`${issue.code}-${issue.nodeId ?? "global"}-${issue.message}`} issue={issue} onFocusNode={onFocusNode} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function groupIssues(issues: ValidationIssue[]): Array<[string, ValidationIssue[]]> {
  const buckets = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    const category = issue.category ?? "general";
    const list = buckets.get(category) ?? [];
    list.push(issue);
    buckets.set(category, list);
  }
  return [...buckets.entries()];
}

function IssueButton({ issue, onFocusNode }: { issue: ValidationIssue; onFocusNode?: (nodeId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => issue.nodeId && onFocusNode?.(issue.nodeId)}
      className="block w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-slate-300 hover:bg-slate-100"
    >
      <div className="flex items-center gap-2">
        <Badge variant={issue.severity === "ERROR" ? "destructive" : "secondary"}>{issue.severity}</Badge>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{issue.code}</span>
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{issue.title ?? issue.message}</div>
      <div className="mt-1 text-sm text-slate-600">{issue.description ?? issue.message}</div>
      {issue.suggestedFix && <div className="mt-2 text-xs text-slate-500">Suggested fix: {issue.suggestedFix}</div>}
      {issue.nodeId && <div className="mt-1 text-xs text-slate-500">Node: {issue.nodeId}</div>}
    </button>
  );
}
