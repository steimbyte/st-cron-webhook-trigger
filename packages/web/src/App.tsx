import { useEffect, useState } from "react";
import {
  Theme,
  Box,
  Container,
  Flex,
  Heading,
  Text,
  Button,
  Separator,
} from "@radix-ui/themes";
import { GearIcon, ClockIcon, CounterClockwiseClockIcon, ActivityLogIcon, PlusIcon } from "@radix-ui/react-icons";
import "@radix-ui/themes/styles.css";
import "./styles.css";

import { BackgroundMesh } from "./components/BackgroundMesh";
import { GlassCard } from "./components/GlassCard";

import Dashboard from "./pages/Dashboard";
import JobsPage from "./pages/JobsPage";
import JobEditor from "./pages/JobEditor";
import RunsPage from "./pages/RunsPage";
import SettingsPage from "./pages/SettingsPage";

type View = { kind: "dashboard" } | { kind: "jobs" } | { kind: "editor"; jobId?: string } | { kind: "runs"; jobId?: string } | { kind: "settings" };

export default function App() {
  const [view, setView] = useState<View>({ kind: "dashboard" });
  const [serverInfo, setServerInfo] = useState<{ ok: boolean; version: string } | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setServerInfo({ ok: d.status === "ok", version: d.version ?? "?" }))
      .catch(() => setServerInfo({ ok: false, version: "?" }));
  }, []);

  const navItem = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string) => (
    <Button
      size="2"
      variant={active ? "solid" : "soft"}
      color={active ? undefined : "gray"}
      onClick={onClick}
      style={{ justifyContent: "flex-start", width: "100%" }}
    >
      <Flex gap="2" align="center">
        {icon}
        <Text size="2">{label}</Text>
      </Flex>
    </Button>
  );

  return (
    <Theme appearance="dark" accentColor="violet" grayColor="slate" radius="medium" scaling="100%">
      <BackgroundMesh />
      <Flex style={{ minHeight: "100vh" }}>
        {/* Sidebar — solid Radix panel (per design decision #3) */}
        <Box
          style={{
            width: 240,
            flexShrink: 0,
            background: "var(--color-panel-solid)",
            borderRight: "1px solid var(--gray-a4)",
            padding: "var(--space-4)",
          }}
        >
          <Flex direction="column" gap="4" height="100%">
            <Flex align="center" gap="2">
              <Box
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-2)",
                  background: "var(--accent-9)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--accent-contrast)",
                }}
              >
                <ClockIcon />
              </Box>
              <Box>
                <Text size="3" weight="bold">
                  Cronboard
                </Text>
                <Text size="1" color="gray">
                  local cron scheduler
                </Text>
              </Box>
            </Flex>

            <Separator size="4" />

            <Flex direction="column" gap="1">
              {navItem(view.kind === "dashboard", () => setView({ kind: "dashboard" }), <ActivityLogIcon />, "Dashboard")}
              {navItem(view.kind === "jobs" || view.kind === "editor", () => setView({ kind: "jobs" }), <CounterClockwiseClockIcon />, "Jobs")}
              {navItem(view.kind === "runs", () => setView({ kind: "runs" }), <ActivityLogIcon />, "Runs")}
              {navItem(view.kind === "settings", () => setView({ kind: "settings" }), <GearIcon />, "Settings")}
            </Flex>

            <Box style={{ marginTop: "auto" }}>
              {serverInfo ? (
                <GlassCard strong p="3">
                  <Flex direction="column" gap="1">
                    <Flex align="center" gap="2">
                      <Box
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 8,
                          background: serverInfo.ok ? "var(--green-9)" : "var(--red-9)",
                        }}
                      />
                      <Text size="1" color="gray">
                        Server {serverInfo.ok ? "ok" : "down"}
                      </Text>
                    </Flex>
                    <Text size="1" color="gray">
                      v{serverInfo.version}
                    </Text>
                  </Flex>
                </GlassCard>
              ) : null}
            </Box>
          </Flex>
        </Box>

        {/* Main */}
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Container size="4" p="6">
            <Flex direction="column" gap="5">
              <Flex align="center" gap="2">
                <Heading size="6">
                  {view.kind === "dashboard" && "Dashboard"}
                  {view.kind === "jobs" && "Jobs"}
                  {view.kind === "editor" && (view.jobId ? "Edit job" : "New job")}
                  {view.kind === "runs" && "Run history"}
                  {view.kind === "settings" && "Settings"}
                </Heading>
                {view.kind !== "editor" ? (
                  <Button
                    size="2"
                    style={{ marginLeft: "auto" }}
                    onClick={() => setView({ kind: "editor" })}
                  >
                    <PlusIcon />
                    New job
                  </Button>
                ) : null}
              </Flex>

              {view.kind === "dashboard" && <Dashboard onNavigate={setView} />}
              {view.kind === "jobs" && <JobsPage onEdit={(id) => setView({ kind: "editor", jobId: id })} />}
              {view.kind === "editor" && (
                <JobEditor
                  jobId={view.jobId}
                  onDone={() => setView({ kind: "jobs" })}
                />
              )}
              {view.kind === "runs" && <RunsPage />}
              {view.kind === "settings" && <SettingsPage />}
            </Flex>
          </Container>
        </Box>
      </Flex>
    </Theme>
  );
}
