import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { AUTH_COOKIE_KEY } from "@/lib/auth";
import { getInboundOrderByNo } from "@/features/inbound/api";
import { InboundDetailView } from "@/features/inbound/InboundDetailView";

export default async function InboundDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ inboundNo: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { inboundNo } = await params;
  const routeNo = decodeURIComponent(inboundNo);
  const { tab } = await searchParams;
  const token = (await cookies()).get(AUTH_COOKIE_KEY)?.value;
  const order = await getInboundOrderByNo(routeNo, { token });
  if (!order) notFound();
  return <InboundDetailView order={order} initialTab={tab} />;
}
