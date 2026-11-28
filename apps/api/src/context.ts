import type { HotelAccess, ServerDeps, ValidSession } from "@cergo/core";
import type { Deps } from "@cergo/core";
import type { RateLimiter } from "./rate-limit";

export type ApiOptions = {
  /** "voice": webhook y server tools. "panel": lo que usa el panel. "all": todo (desarrollo y staging). */
  role: "all" | "panel" | "voice";
  webhookSecret: string | null;
  cookieSecure: boolean;
  trustProxy: boolean;
  rateLimiter: RateLimiter;
};

export type AppEnv = {
  Variables: {
    deps: Deps | ServerDeps;
    opts: ApiOptions;
    requestId: string;
    ip: string;
    session: ValidSession | null;
    hotel: HotelAccess;
  };
};
