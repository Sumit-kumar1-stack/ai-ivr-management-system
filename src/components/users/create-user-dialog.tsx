"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/axios";
import {
  type AccessProfile,
  ACCESS_PROFILE_LABELS,
  ACCESS_PROFILE_DESCRIPTIONS,
  getCapabilitiesForAccessProfile,
  CAMPAIGN_CAPABILITIES,
} from "@/features/users/user-campaign-capabilities";
import {
  ShieldCheck,
  Pencil,
  CheckCircle2,
  Code2,
  Headphones,
  Sliders,
} from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const PROFILES: Array<{
  key: AccessProfile;
  title: string;
  desc: string;
  icon: typeof ShieldCheck;
}> = [
  {
    key: "ORGANIZATION_ADMIN",
    title: ACCESS_PROFILE_LABELS.ORGANIZATION_ADMIN,
    desc: ACCESS_PROFILE_DESCRIPTIONS.ORGANIZATION_ADMIN,
    icon: ShieldCheck,
  },
  {
    key: "MAKER",
    title: ACCESS_PROFILE_LABELS.MAKER,
    desc: ACCESS_PROFILE_DESCRIPTIONS.MAKER,
    icon: Pencil,
  },
  {
    key: "CHECKER",
    title: ACCESS_PROFILE_LABELS.CHECKER,
    desc: ACCESS_PROFILE_DESCRIPTIONS.CHECKER,
    icon: CheckCircle2,
  },
  {
    key: "DEVELOPER",
    title: ACCESS_PROFILE_LABELS.DEVELOPER,
    desc: ACCESS_PROFILE_DESCRIPTIONS.DEVELOPER,
    icon: Code2,
  },
  {
    key: "AGENT",
    title: ACCESS_PROFILE_LABELS.AGENT,
    desc: ACCESS_PROFILE_DESCRIPTIONS.AGENT,
    icon: Headphones,
  },
  {
    key: "CUSTOM",
    title: ACCESS_PROFILE_LABELS.CUSTOM,
    desc: ACCESS_PROFILE_DESCRIPTIONS.CUSTOM,
    icon: Sliders,
  },
];

export default function CreateUserDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [profile, setProfile] = useState<AccessProfile>("MAKER");
  const [customCaps, setCustomCaps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const role = profile === "AGENT" ? "AGENT" : "ADMIN";
      const capabilities =
        profile === "CUSTOM"
          ? customCaps
          : getCapabilitiesForAccessProfile(profile);

      const response = await api.post("/users", {
        fullName,
        email,
        password,
        role,
        campaignCapabilities: capabilities,
        phone: phone.trim() ? phone.trim() : undefined,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message || err?.message || "Failed to create user";
      setError(msg);
    },
  });

  const resetForm = () => {
    setFullName("");
    setEmail("");
    setPassword("");
    setPhone("");
    setProfile("MAKER");
    setCustomCaps([]);
    setError(null);
  };

  const handleCustomCapToggle = (cap: string) => {
    setCustomCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError("Name, email, and password are required.");
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Create Organization User
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {error && (
            <div className="p-3 text-sm rounded bg-rose-50 text-rose-700 border border-rose-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Full Name *
              </label>
              <Input
                placeholder="e.g. Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={3}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Email Address *
              </label>
              <Input
                type="email"
                placeholder="jane@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Password *
              </label>
              <Input
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Phone Number
              </label>
              <Input
                placeholder="+1 555 000 1234"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-700">
              Select Access Profile
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {PROFILES.map((p) => {
                const Icon = p.icon;
                const isSelected = profile === p.key;
                return (
                  <div
                    key={p.key}
                    onClick={() => setProfile(p.key)}
                    className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all ${
                      isSelected
                        ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 mb-1">
                      <div
                        className={`p-1.5 rounded-md ${
                          isSelected
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="font-semibold text-sm text-slate-900">
                        {p.title}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed pl-8">
                      {p.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {profile === "CUSTOM" && (
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Granular Capabilities
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CAMPAIGN_CAPABILITIES.map((cap: string) => (
                  <label
                    key={cap}
                    className="flex items-center gap-2 text-xs text-slate-700 font-mono cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={customCaps.includes(cap)}
                      onChange={() => handleCustomCapToggle(cap)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    {cap}
                  </label>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {createMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}