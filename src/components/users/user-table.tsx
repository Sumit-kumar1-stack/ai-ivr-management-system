"use client";

import { useState } from "react";
import { useUsers } from "@/features/users/use-users";
import { StatusBadge } from "./status-badge";
import { RoleBadge } from "./role-badge";
import { PersonaBadge } from "./persona-badge";
import EditUserDialog from "./edit-user-dialog";
import { Button } from "@/components/ui/button";
import type { User } from "@/features/users/user.types";
import { Edit2, ShieldAlert } from "lucide-react";

export default function UserTable() {
  const { data, isLoading, error } = useUsers();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setIsEditDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center border rounded-xl bg-white shadow-sm">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-blue-600 border-r-transparent mb-2" />
        <p className="text-sm text-slate-500 font-medium">Loading organization users...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 border border-rose-200 rounded-xl bg-rose-50/50 text-rose-800 flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 text-rose-600" />
        <div>
          <h4 className="font-semibold text-sm">Failed to load users</h4>
          <p className="text-xs text-rose-600 mt-0.5">
            {error instanceof Error ? error.message : "An unexpected error occurred."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-slate-200/80 rounded-xl bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <th className="py-3.5 px-4">User</th>
              <th className="py-3.5 px-4">Email</th>
              <th className="py-3.5 px-4">Base Role</th>
              <th className="py-3.5 px-4">Access Profile</th>
              <th className="py-3.5 px-4">Account Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data && data.length > 0 ? (
              data.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-slate-50/60 transition-colors"
                >
                  <td className="py-3.5 px-4 font-medium text-slate-900">
                    {user.fullName}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 font-mono text-xs">
                    {user.email}
                  </td>
                  <td className="py-3.5 px-4">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="py-3.5 px-4">
                    <PersonaBadge
                      role={user.role as any}
                      capabilities={user.campaignCapabilities}
                    />
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge active={user.isActive} />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(user)}
                      className="h-8 gap-1.5 text-xs text-slate-700 hover:text-blue-600 hover:border-blue-300"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="py-8 text-center text-sm text-slate-500"
                >
                  No users found in this organization.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EditUserDialog
        user={selectedUser}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />
    </div>
  );
}