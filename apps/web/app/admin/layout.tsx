"use client";

import type { ReactNode } from "react";
import { MeProvider, TopBar, useMe } from "@/components/shell";
import { Alert } from "@/components/ui";

function StaffOnly({ children }: { children: ReactNode }) {
  const me = useMe();
  if (!me.user.isStaff) {
    return (
      <main className="max-w-[720px] mx-auto p-8">
        <Alert tone="error" title="Sin acceso">Esta sección es solo para el equipo de CERGO.</Alert>
      </main>
    );
  }
  return <main className="max-w-[1320px] mx-auto px-[clamp(16px,3vw,28px)] py-8 pb-24">{children}</main>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <MeProvider>
      <TopBar>
        <span className="text-[0.8rem] font-bold uppercase tracking-[0.1em] text-soft">Panel interno</span>
      </TopBar>
      <StaffOnly>{children}</StaffOnly>
    </MeProvider>
  );
}
