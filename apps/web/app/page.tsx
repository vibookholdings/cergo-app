"use client";

import type { Me } from "@cergo/contracts";
import { useEffect } from "react";
import { TopBar, MeProvider, useMe } from "@/components/shell";
import { EmptyState, Loading } from "@/components/ui";
import { Building2 } from "lucide-react";

function Redirect() {
  const me: Me = useMe();
  const target = me.hotels[0] ? `/h/${me.hotels[0].id}` : me.user.isStaff ? "/admin" : null;
  useEffect(() => {
    if (target) window.location.replace(target);
  }, [target]);
  if (target) return <Loading label="Abriendo tu panel" />;
  return (
    <>
      <TopBar />
      <main className="max-w-[640px] mx-auto py-16 px-4">
        <EmptyState title="Todavía no tenés un hotel asignado" icon={<Building2 className="size-5" />}>
          Pedile al dueño del hotel que te invite desde la sección Equipo, o escribinos y lo configuramos.
        </EmptyState>
      </main>
    </>
  );
}

export default function Home() {
  return (
    <MeProvider>
      <Redirect />
    </MeProvider>
  );
}
