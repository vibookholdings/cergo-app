"use client";

import type { HotelContext, Me, Permission } from "@cergo/contracts";
import {
  AudioLines,
  BellRing,
  CalendarCheck,
  ChevronDown,
  Eye,
  LayoutDashboard,
  LogOut,
  Menu,
  PhoneCall,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { Alert, Loading } from "./ui";

// ---------------------------------------------------------------------------
// Sesión y hotel actuales
// ---------------------------------------------------------------------------

const MeContext = createContext<Me | null>(null);
const HotelCtx = createContext<HotelContext | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe fuera de MeProvider");
  return me;
}

export function useHotel(): HotelContext & { can: (p: Permission) => boolean; base: string } {
  const hotel = useContext(HotelCtx);
  if (!hotel) throw new Error("useHotel fuera de HotelShell");
  return { ...hotel, can: (p) => hotel.permissions.includes(p), base: `/h/${hotel.id}` };
}

export function MeProvider({ children }: { children: ReactNode }) {
  const { data, error } = useApi<Me>("/me");
  if (error) return <div className="p-8"><Alert tone="error">{error.message}</Alert></div>;
  if (!data) return <Loading />;
  return <MeContext.Provider value={data}>{children}</MeContext.Provider>;
}

async function logout() {
  await api("/auth/logout", { method: "POST", redirectOnAuth: false }).catch(() => undefined);
  window.location.assign("/entrar");
}

// ---------------------------------------------------------------------------
// Barra superior
// ---------------------------------------------------------------------------

function UserMenu() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  const initials = (me.user.name || me.user.email).split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 h-10 pl-1 pr-2 rounded-chip hover:bg-brand/6"
      >
        <span className="size-8 rounded-full bg-brand text-brand-ink grid place-items-center text-[0.78rem] font-bold">{initials}</span>
        <ChevronDown className="size-4 text-muted" aria-hidden />
        <span className="sr-only">Menú de la cuenta</span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-30 w-64 rounded-tile border border-line bg-surface shadow-card p-1.5">
          <div className="px-3 py-2 border-b border-line mb-1">
            <p className="font-bold text-[0.92rem] truncate">{me.user.name || "Sin nombre"}</p>
            <p className="text-[0.82rem] text-muted truncate">{me.user.email}</p>
          </div>
          <Link href="/cuenta" className="flex items-center gap-2.5 px-3 h-10 rounded-chip hover:bg-brand/6 text-[0.92rem]">
            <UserRound className="size-4 text-brand" aria-hidden /> Mi cuenta
          </Link>
          {me.user.isStaff && (
            <Link href="/admin" className="flex items-center gap-2.5 px-3 h-10 rounded-chip hover:bg-brand/6 text-[0.92rem]">
              <ShieldCheck className="size-4 text-brand" aria-hidden /> Panel interno
            </Link>
          )}
          <button type="button" onClick={logout} className="w-full flex items-center gap-2.5 px-3 h-10 rounded-chip hover:bg-brand/6 text-[0.92rem]">
            <LogOut className="size-4 text-brand" aria-hidden /> Salir
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 h-[64px] bg-bg/94 backdrop-blur border-b border-line">
      <div className="h-full max-w-[1320px] mx-auto px-[clamp(16px,3vw,28px)] flex items-center gap-3">
        <Link href="/" className="shrink-0" aria-label="CERGO, inicio">
          <img src="/cergo-logo.svg" alt="CERGO" className="h-8 w-auto" />
        </Link>
        <div className="flex-1 min-w-0 flex items-center gap-2">{children}</div>
        <UserMenu />
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Panel del hotel
// ---------------------------------------------------------------------------

const nav: { href: string; label: string; icon: typeof PhoneCall; perm: Permission }[] = [
  { href: "", label: "Inicio", icon: LayoutDashboard, perm: "dashboard:view" },
  { href: "/llamadas", label: "Llamadas", icon: PhoneCall, perm: "calls:view" },
  { href: "/pendientes", label: "Pendientes", icon: BellRing, perm: "handoffs:view" },
  { href: "/reservas", label: "Reservas", icon: CalendarCheck, perm: "bookings:view" },
  { href: "/agente", label: "Agente", icon: AudioLines, perm: "agent:view" },
  { href: "/equipo", label: "Equipo", icon: Users, perm: "team:manage" },
  { href: "/ajustes", label: "Ajustes", icon: Settings, perm: "hotel:settings" },
];

function HotelSwitcher({ current }: { current: HotelContext }) {
  const me = useMe();
  const router = useRouter();
  if (me.hotels.length <= 1) {
    return (
      <div className="min-w-0">
        <p className="font-bold truncate leading-tight">{current.name}</p>
        {current.city && <p className="text-[0.8rem] text-soft truncate">{current.city}</p>}
      </div>
    );
  }
  return (
    <label className="min-w-0 flex items-center gap-2">
      <span className="sr-only">Cambiar de hotel</span>
      <select
        value={current.id}
        onChange={(e) => router.push(`/h/${e.target.value}`)}
        className="max-w-[260px] truncate bg-transparent font-bold h-10 pr-6 rounded-chip hover:bg-brand/6 px-2"
      >
        {me.hotels.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function HotelShell({ hotelId, children }: { hotelId: string; children: ReactNode }) {
  const { data: hotel, error } = useApi<HotelContext>(`/h/${hotelId}`);
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);

  if (error) {
    return (
      <>
        <TopBar />
        <main className="max-w-[720px] mx-auto p-8">
          <Alert tone="error" title="No pudimos abrir este hotel">
            {error.status === 404 ? "No existe o no tenés acceso. Si creés que es un error, pedile acceso al dueño del hotel." : error.message}
          </Alert>
        </main>
      </>
    );
  }
  if (!hotel) return <Loading />;
  const base = `/h/${hotel.id}`;
  const items = nav.filter((n) => hotel.permissions.includes(n.perm));
  const isActive = (href: string) => (href === "" ? pathname === base : pathname.startsWith(base + href));

  const links = (
    <nav aria-label="Secciones del hotel" className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={label}
          href={base + href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 h-11 px-3 rounded-field text-[0.95rem] font-medium transition-colors",
            isActive(href) ? "bg-surface text-ink border border-line shadow-card font-semibold" : "text-muted hover:text-ink hover:bg-brand/6",
          )}
        >
          <Icon className="size-[19px] text-brand" strokeWidth={1.7} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );

  return (
    <HotelCtx.Provider value={hotel}>
      <TopBar>
        <button
          type="button"
          className="lg:hidden size-10 grid place-items-center rounded-chip hover:bg-brand/6"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <HotelSwitcher current={hotel} />
      </TopBar>
      {hotel.viaStaff && (
        <div className="bg-brand text-brand-ink text-[0.86rem]">
          <div className="max-w-[1320px] mx-auto px-[clamp(16px,3vw,28px)] py-2 flex items-center gap-2">
            <Eye className="size-4 text-lime" aria-hidden />
            Estás viendo el panel de este hotel como equipo CERGO. Lo que cambies queda registrado a tu nombre.
          </div>
        </div>
      )}
      <div className="max-w-[1320px] mx-auto px-[clamp(16px,3vw,28px)] flex gap-8">
        <aside className="hidden lg:block w-[220px] shrink-0 py-8 sticky top-[64px] self-start">{links}</aside>
        {menuOpen && <div className="lg:hidden fixed inset-x-0 top-[64px] z-10 bg-bg border-b border-line p-4 shadow-card">{links}</div>}
        <main className="flex-1 min-w-0 py-8 pb-24">{children}</main>
      </div>
    </HotelCtx.Provider>
  );
}
