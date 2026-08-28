import {
  redirect,
} from "next/navigation";

export default function CommunicationHomePage() {
  redirect(
    "/communication/quick-test-call"
  );
}
