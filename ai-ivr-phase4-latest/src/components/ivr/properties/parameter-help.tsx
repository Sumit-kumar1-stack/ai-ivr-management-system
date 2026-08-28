"use client";

export default function ParameterHelp() {
  return (
    <div className="rounded-lg border bg-blue-50 p-4 text-sm">

      <h4 className="font-semibold mb-2">

        LLM Parameter Guide

      </h4>

      <ul className="space-y-2 list-disc pl-5">

        <li>
          Temperature controls creativity.
        </li>

        <li>
          Top-P controls response diversity.
        </li>

        <li>
          Max Tokens limits response length.
        </li>

        <li>
          Presence Penalty encourages new topics.
        </li>

        <li>
          Frequency Penalty reduces repetition.
        </li>

      </ul>

    </div>
  );
}