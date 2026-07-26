"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface ContactStatistics {
  total: number;
  pending: number;
  called: number;
  failed: number;
}

interface ContactStatsProps {
  statistics: ContactStatistics;
  loading?: boolean;
}

function StatCard({
  title,
  value,
  loading,
}: {
  title: string;
  value: number;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle
          className="
            text-sm
            font-medium
            text-muted-foreground
          "
        >
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div
            className="
              h-8
              w-20
              animate-pulse
              rounded-md
              bg-muted
            "
          />
        ) : (
          <p
            className="
              text-3xl
              font-bold
              tracking-tight
            "
          >
            {value.toLocaleString(
              "en-IN"
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ContactStats({
  statistics,
  loading = false,
}: ContactStatsProps) {
  return (
    <div
      className="
        grid
        gap-5
        sm:grid-cols-2
        xl:grid-cols-4
      "
    >
      <StatCard
        title="Total Contacts"
        value={
          statistics.total
        }
        loading={
          loading
        }
      />

      <StatCard
        title="Pending"
        value={
          statistics.pending
        }
        loading={
          loading
        }
      />

      <StatCard
        title="Called"
        value={
          statistics.called
        }
        loading={
          loading
        }
      />

      <StatCard
        title="Failed"
        value={
          statistics.failed
        }
        loading={
          loading
        }
      />
    </div>
  );
}