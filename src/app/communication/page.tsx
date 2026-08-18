import {
  redirect,
} from "next/navigation";

export default function CommunicationPage() {
  redirect(
    "/communication/campaigns/new/channels"
  );
}