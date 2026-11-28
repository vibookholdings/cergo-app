import type { ReactNode } from "react";
import { HotelShell, MeProvider } from "@/components/shell";

export default async function HotelLayout({ children, params }: { children: ReactNode; params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await params;
  return (
    <MeProvider>
      <HotelShell hotelId={hotelId}>{children}</HotelShell>
    </MeProvider>
  );
}
