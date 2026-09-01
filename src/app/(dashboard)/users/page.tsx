"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import UserTable from "@/components/users/user-table";
import CreateUserDialog from "@/components/users/create-user-dialog";
import { UserPlus } from "lucide-react";

export default function UsersPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Users &amp; Team
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage organization members, assign access profiles, and configure operational permissions.
          </p>
        </div>

        <Button
          onClick={() => setIsCreateOpen(true)}
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
        >
          <UserPlus className="h-4 w-4" />
          Add Member
        </Button>
      </div>

      <UserTable />

      <CreateUserDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
    </div>
  );
}