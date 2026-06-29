import { useEffect, useState } from "react";
import {
  Card,
  Flex,
  Heading,
  Text,
  Table,
  Badge,
  Dialog,
  Tabs,
  Button,
  Select,
  Box,
  Separator,
} from "@radix-ui/themes";
import { api } from "../lib/api";
import type { Run, RunStatus } from "../types";
import { GlassCard } from "../components/GlassCard";

const STATUSES: ("all" | RunStatus)[] = ["all", "success", "partial", "failed", "timeout", "running"];

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [filter, setFilter] = useState<"all" | RunStatus>("all");
  const [openRun, setOpenRun] = useState<Run | null>(null);

  useEffect(() => {
    const refresh = () => api.runs.list({ limit: 200 }).then(setRuns);
    refresh();
    const i = setInterval(refresh, 2000);
    return () => clearInterval(i);
  }, []);

  const filtered = runs?.filter((r) => filter === "all" || r.status === filter);

  return (
    <Flex direction="column" gap="4">
      <GlassCard>
        <Flex align="center" gap="3">
          <Heading size="3">All runs</Heading>
          <Select.Root value={filter} onValueChange={(v) => setFilter(v as any)}>
            <Select.Trigger />
            <Select.Content>
              {STATUSES.map((s) => (
                <Select.Item key={s} value={s}>{s}</Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Text size="2" color="gray" style={{ marginLeft: "auto" }}>
            {runs === null ? "…" : `${filtered?.length ?? 0} of ${runs.length}`}
          </Text>
        </Flex>
      </GlassCard>

      <GlassCard>
        {runs === null ? (
          <Text size="2" color="gray">loading…</Text>
        ) : (filtered ?? []).length === 0 ? (
          <Flex direction="column" align="center" p="6" gap="2">
            <Text size="2" color="gray">No runs yet.</Text>
            <Text size="1" color="gray">Trigger a job manually or wait for its scheduled tick.</Text>
          </Flex>
        ) : (
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Job</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Trigger</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Started</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Duration</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(filtered ?? []).map((r) => (
                <Table.Row key={r.id}>
                  <Table.Cell>
                    <RunStatusBadge status={r.status} />
                  </Table.Cell>
                  <Table.Cell>{r.jobName}</Table.Cell>
                  <Table.Cell><Badge variant="soft" color="gray">{r.trigger}</Badge></Table.Cell>
                  <Table.Cell><Text size="1">{new Date(r.startedAt).toLocaleString()}</Text></Table.Cell>
                  <Table.Cell><Text size="1">{r.durationMs ? `${r.durationMs}ms` : "—"}</Text></Table.Cell>
                  <Table.Cell>
                    <Button size="1" variant="soft" onClick={() => setOpenRun(r)}>Details</Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        )}
      </GlassCard>

      <Dialog.Root open={!!openRun} onOpenChange={(o) => !o && setOpenRun(null)}>
        {openRun ? (
          <Dialog.Content style={{ maxWidth: 720 }}>
            <Dialog.Title>{openRun.jobName} — run</Dialog.Title>
            <Dialog.Description>{openRun.trigger} · {new Date(openRun.startedAt).toLocaleString()}</Dialog.Description>
            <Box mt="4">
              <RunDetail run={openRun} />
            </Box>
            <Flex justify="end" mt="4">
              <Dialog.Close>
                <Button variant="soft">Close</Button>
              </Dialog.Close>
            </Flex>
          </Dialog.Content>
        ) : null}
      </Dialog.Root>
    </Flex>
  );
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  const color =
    status === "success" ? "green" :
    status === "failed" ? "red" :
    status === "partial" ? "amber" :
    status === "timeout" ? "orange" : "blue";
  return <Badge color={color}>{status}</Badge>;
}

function RunDetail({ run }: { run: Run }) {
  return (
    <Flex direction="column" gap="3">
      <Card>
        <Flex align="center" gap="3">
          <RunStatusBadge status={run.status} />
          <Text size="2">started {new Date(run.startedAt).toLocaleString()}</Text>
          <Text size="2" color="gray">·</Text>
          <Text size="2">{run.durationMs ?? "—"} ms</Text>
          {run.error ? (
            <>
              <Text size="2" color="gray">·</Text>
              <Text size="2" color="red">{run.error}</Text>
            </>
          ) : null}
        </Flex>
      </Card>

      {run.actionRuns.map((ar, i) => (
        <Card key={ar.id}>
          <Tabs.Root defaultValue="req">
            <Tabs.List>
              <Tabs.Trigger value="req">Request</Tabs.Trigger>
              <Tabs.Trigger value="res">Response</Tabs.Trigger>
              {ar.error ? <Tabs.Trigger value="err">Error</Tabs.Trigger> : null}
            </Tabs.List>
            <Box pt="3">
              <Tabs.Content value="req">
                <pre className="cb-code">{JSON.stringify(ar.request ?? {}, null, 2)}</pre>
              </Tabs.Content>
              <Tabs.Content value="res">
                <pre className="cb-code">{JSON.stringify(ar.response ?? {}, null, 2)}</pre>
              </Tabs.Content>
              {ar.error ? (
                <Tabs.Content value="err">
                  <pre className="cb-code">{ar.error}</pre>
                </Tabs.Content>
              ) : null}
            </Box>
            <Separator size="4" />
            <Flex align="center" gap="2" mt="2">
              <Badge color={ar.status === "success" ? "green" : "red"}>{ar.status}</Badge>
              <Text size="1" color="gray">action #{i + 1}</Text>
              <Text size="1" color="gray" style={{ marginLeft: "auto" }}>{ar.durationMs ?? "—"} ms</Text>
            </Flex>
          </Tabs.Root>
        </Card>
      ))}
    </Flex>
  );
}
