import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_KEY } from "@/lib/auth";

export default async function ConsoleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const token = (await cookies()).get(AUTH_COOKIE_KEY)?.value;
  if (!token) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-[#f7f9fc]">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <Topbar />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
