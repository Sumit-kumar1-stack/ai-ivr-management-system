import { Button } from "@/components/ui/button";
import UserTable from "@/components/users/user-table";

export default function UsersPage() {
  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">

        <h1 className="text-3xl font-bold">
          Users
        </h1>

        <Button>
          + Add User
        </Button>

      </div>

      <UserTable />

    </div>
  );
}