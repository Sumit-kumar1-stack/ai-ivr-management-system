import Link from "next/link";
import CreateCampaignDialog from "@/components/campaigns/create-campaign-dialog";

export default function CampaignsPage() {
  return (
    <div className="space-y-6">

      <div className="flex justify-between items-center">

        <h1 className="text-3xl font-bold">
          Campaigns
        </h1>

        <CreateCampaignDialog />

      </div>

      <div className="rounded-lg border p-6">

        <h2 className="font-semibold">
          July Loan Campaign
        </h2>

        <p className="text-gray-500">
          Hindi • Draft
        </p>

        <Link
          href="/campaigns/demo"
          className="text-blue-600 mt-3 inline-block"
        >
          Manage →
        </Link>

      </div>

    </div>
  );
}