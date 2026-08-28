import { redirect } from "next/navigation";

export default function QuickTestCallPage() {
  redirect("/communication/campaigns/new/audience?mode=test");
}
