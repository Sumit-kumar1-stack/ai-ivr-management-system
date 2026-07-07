import Link from "next/link";

const menu = [
  {
    label: "Dashboard",
    href: "/dashboard",
  },
  {
    label: "Users",
    href: "/users",
  },
  {
    label: "Campaigns",
    href: "/campaigns",
  },
  {
    label: "Contacts",
    href: "/contacts",
  },
  {
    label: "Calls",
    href: "/calls",
  },
  {
    label: "Agents",
    href: "/agents",
  },
  {
    label: "Analytics",
    href: "/analytics",
  },
  {
    label: "IVR Builder",
    href: "/ivr",
  },
  {
    label: "Settings",
    href: "/settings",
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