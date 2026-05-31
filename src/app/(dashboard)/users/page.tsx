import { UsersTable } from "@/components/dashboard/users-table";

export default function Page() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        All users who have signed up to your AI platform.
      </p>
      <UsersTable />
    </div>
  );
}
