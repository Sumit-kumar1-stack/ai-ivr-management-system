"use client";

import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";

export default function VoicePreview() {
  function preview() {
    alert(
      "Voice preview will be implemented in Sprint 6."
    );
  }

  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={preview}
    >
      <Volume2 className="mr-2 h-4 w-4" />
      Preview Voice
    </Button>
  );
}