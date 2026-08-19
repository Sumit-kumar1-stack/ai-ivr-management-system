import {
  redirect,
} from "next/navigation";

export default function CommunicationHomePage() {
  redirect(
    "/communication/campaigns/new/audience"
  );
}
