// GAS版の入り口：画面の切り替え・読み込みを始める
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRoot } from "react-dom/client";
import type { ComponentType } from "react";
import { AppShell } from "@/components/AppShell";
import { initRouter, useLoc } from "./shim/router";
import { matchRoute, type RoutePattern } from "./routes-match";
import { sessionGen, startSession, useSession, watchFocus } from "./session";
import { hasGas } from "./shim/gas";

import Home from "@/app/page";
import Activities from "@/app/activities/page";
import ActivityNew from "@/app/activities/new/page";
import ActivityBulk from "@/app/activities/bulk/page";
import ActivityEdit from "@/app/activities/[id]/page";
import Menu from "@/app/menu/page";
import Teams from "@/app/teams/page";
import Staff from "./pages/staff";
import Players from "@/app/players/page";
import Print from "@/app/print/page";
import Notices from "@/app/notices/page";
import NoticeEdit from "@/app/notices/[id]/page";
import Lineups from "@/app/lineups/page";
import LineupEdit from "@/app/lineups/[id]/page";
import Ops from "@/app/ops/page";
import OpsEdit from "@/app/ops/[id]/page";
import { PageHead } from "@/components/ui";
import Link from "next/link";

declare const google: any;

const PAGES: Record<RoutePattern, ComponentType> = {
  "/": Home,
  "/activities": Activities,
  "/activities/new": ActivityNew,
  "/activities/bulk": ActivityBulk,
  "/activities/:id": ActivityEdit,
  "/menu": Menu,
  "/teams": Teams,
  "/staff": Staff,
  "/players": Players,
  "/print": Print,
  "/notices": Notices,
  "/notices/:id": NoticeEdit,
  "/lineups": Lineups,
  "/lineups/:id": LineupEdit,
  "/ops": Ops,
  "/ops/:id": OpsEdit,
};

// 読み直したデータで出し直してよい画面（入力の途中が消えない画面）
const REFRESHABLE = new Set<RoutePattern>(["/", "/activities", "/menu", "/notices", "/lineups", "/ops"]);

function NotFound() {
  return (
    <>
      <PageHead kicker="NOT FOUND" title="この画面はありません" lead="アドレスが変わったか、消された可能性があります。" />
      <Link href="/" className="btn btn--primary">
        ホームへ
      </Link>
    </>
  );
}

function RouteView() {
  const { path } = useLoc();
  useSession();
  const m = matchRoute(path);
  const Page = m ? PAGES[m.pattern] : NotFound;
  const key = path + (m && REFRESHABLE.has(m.pattern) ? `#${sessionGen()}` : "");
  return <Page key={key} />;
}

function start(hash: string) {
  initRouter(hash);
  const root = createRoot(document.getElementById("app")!);
  root.render(
    <AppShell>
      <RouteView />
    </AppShell>,
  );
  void startSession();
  watchFocus();
}

if (hasGas() && google.script.url) {
  google.script.url.getLocation((l: any) => start(l?.hash ?? ""));
} else {
  start(window.location.hash);
}
