import {
  readFile,
} from "node:fs/promises";

const metricNames = [
  "speechEndToFirstAudioSentMs",
  "speechEndToSttFinalMs",
  "routingMs",
  "ragTotalMs",
  "llmFirstResponseMs",
  "ttsFirstAudioMs",
] as const;

type MetricName = typeof metricNames[number];

type LatencyRecord = {
  event?: string;
  [key: string]: unknown;
};

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const index = Math.ceil((percentileValue / 100) * values.length) - 1;
  return values[Math.max(0, index)] ?? null;
}

function numbersFor(records: LatencyRecord[], metric: MetricName): number[] {
  return records
    .map(record => record[metric])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((first, second) => first - second);
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: npx tsx scripts/analyze-cascaded-latency.ts <structured-log-file>");
  }

  const content = await readFile(filePath, "utf8");
  const records = content
    .split(/\r?\n/)
    .flatMap(line => {
      try {
        const record = JSON.parse(line) as LatencyRecord;
        return record.event === "cascaded.turn.latency" ? [record] : [];
      } catch {
        return [];
      }
    });

  console.log(`Cascaded latency samples: ${records.length}`);

  for (const metric of metricNames) {
    const values = numbersFor(records, metric);
    const mean = values.length === 0
      ? null
      : values.reduce((total, value) => total + value, 0) / values.length;

    console.log(JSON.stringify({
      metric,
      sampleCount: values.length,
      p50: percentile(values, 50),
      p95: percentile(values, 95),
      max: values.at(-1) ?? null,
      mean: mean === null ? null : Math.round(mean * 100) / 100,
    }));
  }
}

void main();
