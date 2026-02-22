import { LoginForm } from "@/app/(auth)/login/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextUrl = next && next.startsWith("/") ? next : "/outbounds";

  return <LoginForm nextUrl={nextUrl} />;
}
