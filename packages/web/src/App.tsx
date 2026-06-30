import { useEffect, useState } from "react";
import {
  ActivityLogIcon,
  BarChartIcon,
  ClockIcon,
  GearIcon,
  RowsIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from "@radix-ui/react-icons";
import Dashboard from "./pages/Dashboard";
import JobsPage from "./pages/JobsPage";
import JobEditor from "./pages/JobEditor";
import RunsPage from "./pages/RunsPage";
import SettingsPage from "./pages/SettingsPage";
import { api } from "./lib/api";

type View = { kind: "dashboard" } | { kind: "jobs" } | { kind: "editor"; jobId?: string } | { kind: "runs"; jobId?: string } | { kind: "settings" };

const NAV: { id: View["kind"]; label: string; icon: React.ReactNode; section: string; badge?: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: <BarChartIcon />, section: "Overview" },
  { id: "jobs", label: "Jobs", icon: <RowsIcon />, section: "Schedule" },
  { id: "runs", label: "Run history", icon: <ActivityLogIcon />, section: "Schedule" },
  { id: "settings", label: "Settings", icon: <GearIcon />, section: "System" },
];

export default function App() {
  const [view, setView] = useState<View>({ kind: "dashboard" });
  const [serverInfo, setServerInfo] = useState<{ ok: boolean; version: string } | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    api.health().then((d) => setServerInfo({ ok: d.status === "ok", version: d.version })).catch(() => setServerInfo({ ok: false, version: "?" }));
  }, []);

  const sectionOf = (s: string) => NAV.filter((n) => n.section === s);

  return (
    <div className="cb-gradient-bg flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-base-300/60 bg-base-200/60 backdrop-blur-md hidden lg:flex flex-col">
        <div className="px-5 py-5 border-b border-base-300/60">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-content">
              <ClockIcon />
            </div>
            <div>
              <div className="text-base font-semibold text-base-content">Cronboard</div>
              <div className="text-xs text-base-content/60">Local-first scheduler</div>
            </div>
          </div>
        </div>

        <nav className="px-3 py-4 flex-1 overflow-y-auto">
          {(["Overview", "Schedule", "System"] as const).map((section) => (
            <div key={section} className="mb-4">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-base-content/40">
                {section}
              </div>
              <ul className="menu menu-sm w-full p-0">
                {sectionOf(section).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={
                        "flex items-center gap-3 " +
                        (view.kind === item.id
                          ? "menu-active bg-primary/15 text-primary font-medium"
                          : "text-base-content/80 hover:bg-base-300/50")
                      }
                      onClick={() => setView({ kind: item.id } as View)}
                    >
                      <span className="opacity-80">{item.icon}</span>
                      <span>{item.label}</span>
                      {item.badge ? (
                        <span className="badge badge-primary badge-sm ml-auto">{item.badge}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-base-300/60">
          <div className="rounded-lg bg-base-300/40 p-3 text-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className={"inline-block w-2 h-2 rounded-full " + (serverInfo?.ok ? "bg-success" : "bg-error")} />
              <span className="font-medium">{serverInfo?.ok ? "Server online" : "Server offline"}</span>
            </div>
            <div className="text-base-content/60">v{serverInfo?.version ?? "?"}</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-20 backdrop-blur-md bg-base-100/70 border-b border-base-300/60">
          <div className="flex items-center gap-3 px-6 py-3">
            <div className="lg:hidden w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-content mr-1">
              <ClockIcon />
            </div>
            <div className="text-sm breadcrumbs">
              <ul>
                <li>Cronboard</li>
                <li className="text-base-content/90 font-medium">
                  {view.kind === "dashboard" && "Dashboard"}
                  {view.kind === "jobs" && "Jobs"}
                  {view.kind === "editor" && (view.jobId ? "Edit job" : "New job")}
                  {view.kind === "runs" && "Run history"}
                  {view.kind === "settings" && "Settings"}
                </li>
              </ul>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2 px-3 h-9 rounded-lg bg-base-200 border border-base-300/60 text-sm text-base-content/60 w-72">
                <MagnifyingGlassIcon />
                <span>Search jobs, runs…</span>
                <kbd className="kbd kbd-sm ml-auto">⌘K</kbd>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-square"
                aria-label="Toggle theme"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              </button>
              {view.kind !== "editor" ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm gap-1"
                  onClick={() => setView({ kind: "editor" })}
                >
                  <PlusIcon />
                  New job
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <div className="flex-1 px-6 py-6">
          {view.kind === "dashboard" && <Dashboard onNavigate={setView} />}
          {view.kind === "jobs" && <JobsPage onEdit={(id) => setView({ kind: "editor", jobId: id })} />}
          {view.kind === "editor" && (
            <JobEditor jobId={view.jobId} onDone={() => setView({ kind: "jobs" })} />
          )}
          {view.kind === "runs" && <RunsPage />}
          {view.kind === "settings" && <SettingsPage />}
        </div>
      </main>
    </div>
  );
}