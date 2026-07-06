import Link from "next/link";

const menu = [
  {
    label: "Dashboard",
    href: "/dashboard",
  },
  {
    label: "Users",
    href: "/dashboard/users",
  },
  {
    label: "Campaigns",
    href: "/dashboard/campaigns",
  },
  {
    label: "Contacts",
    href: "/dashboard/contacts",
  },
  {
    label: "IVR Builder",
    href: "/dashboard/ivr",
  },
];

export default function Sidebar() {
  return (
    <aside className="w-64 border-r min-h-screen p-4">
      <h2 className="text-xl font-bold mb-6">
        AI IVR
      </h2>

      <ul className="space-y-3">
        {menu.map((item) => (
          <li
            key={item.href}
            className="cursor-pointer hover:font-semibold"
          >
            <Link href={item.href}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}