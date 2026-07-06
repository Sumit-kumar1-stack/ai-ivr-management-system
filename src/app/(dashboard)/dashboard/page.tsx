import StatsCard from "@/components/layout/stats-card";

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">
        Dashboard
      </h1>

      <div className="grid grid-cols-4 gap-4">
        <StatsCard
          title="Total Calls"
          value="0"
        />

        <StatsCard
          title="Campaigns"
          value="0"
        />

        <StatsCard
          title="Agents"
          value="0"
        />

        <StatsCard
          title="Contacts"
          value="0"
        />
      </div>
    </div>
  );
}