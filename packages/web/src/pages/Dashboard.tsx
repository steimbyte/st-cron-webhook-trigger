import { useEffect, useState } from "react";
import {
  Card,
  Flex,
  Heading,
  Text,
  Grid,
  Badge,
  Button,
  Box,
  Separator,
  Table,
} from "@radix-ui/themes";
import { ChevronRightIcon, ExternalLinkIcon } from "@radix-ui/react-icons";
import { api } from "../lib/api";
import type { Job, Run } from "../types";

interface Props {
  onNavigate: (v: any) => void;
}

export default function Dashboard({ onNavigate }: Props) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);

  useEffect(() => {
    Promise.all([api.jobs.list(), api.runs.list({ limit: 20 })]).then(([j, r]) => {
      setJobs(j);
      setRuns(r);
    });
  }, []);

  return (
    <Flex direction="column" gap="5">
      <Grid columns="3" gap="4">
        <Card>
          <Text size="2" color="gray">Active jobs</Text>
          <Heading size="7">{jobs ? jobs.filter((j) => j.enabled).length : "…"}</Heading>
        </Card>
        <Card>
          <Text size="2" color="gray">All jobs</Text>
          <Heading size="7">{jobs ? jobs.length : "…"}</Heading>
        </Card>
        <Card>
          <Text size="2" color="gray">Runs (24h)</Text>
          <Heading size="7">{runs ? recentCount(runs, 24 * 60 * 60 * 1000) : "…"}</Heading>
        </Card>
      </Grid>

      <Grid columns="2" gap="4">
        <Card>
          <Flex direction="column" gap="3">
            <Flex align="center">
              <Heading size="4">Upcoming runs</Heading>
              <Button size="1" variant="ghost" style={{ marginLeft: "auto" }} onClick={() => onNavigate({ kind: "jobs" })}>
                all jobs <ChevronRightIcon />
              </Button>
            </Flex>
            <Separator size="4" />
            {jobs === null ? (
              <Text size="2" color="gray">loading…</Text>
            ) : jobs.length === 0 ? (
              <Flex direction="column" align="start" gap="2">
                <Text size="2" color="gray">No jobs yet.</Text>
                <Button size="2" onClick={() => onNavigate({ kind: "editor" })}>Create your first job</Button>
              </Flex>
            ) : (
              <Flex direction="column" gap="2">
                {jobs
                  .filter((j) => j.enabled && j.nextRunAt)
                  .sort((a, b) => (a.nextRunAt! < b.nextRunAt! ? -1 : 1))
                  .slice(0, 5)
                  .map((j) => (
                    <Flex key={j.id} align="center" gap="2">
                      <Badge color="gray" variant="soft">{j.cronExpression}</Badge>
                      <Text size="2">{j.name}</Text>
                      <Text size="1" color="gray" style={{ marginLeft: "auto" }}>
                        next: {new Date(j.nextRunAt!).toLocaleString()}
                      </Text>
                    </Flex>
                  ))}
                {jobs.filter((j) => j.enabled && j.nextRunAt).length === 0 ? (
                  <Text size="2" color="gray">No upcoming runs.</Text>
                ) : null}
              </Flex>
            )}
          </Flex>
        </Card>

        <Card>
          <Flex direction="column" gap="3">
            <Flex align="center">
              <Heading size="4">Recent runs</Heading>
              <Button size="1" variant="ghost" style={{ marginLeft: "auto" }} onClick={() => onNavigate({ kind: "runs" })}>
                all runs <ChevronRightIcon />
              </Button>
            </Flex>
            <Separator size="4" />
            {runs === null ? (
              <Text size="2" color="gray">loading…</Text>
            ) : runs.length === 0 ? (
              <Text size="2" color="gray">No runs yet.</Text>
            ) : (
              <Table.Root size="1">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Job</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>When</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Duration</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {runs.slice(0, 8).map((r) => (
                    <Table.Row key={r.id}>
                      <Table.Cell>
                        <RunStatusBadge status={r.status} />
                      </Table.Cell>
                      <Table.Cell>{r.jobName}</Table.Cell>
                      <Table.Cell>{new Date(r.startedAt).toLocaleString()}</Table.Cell>
                      <Table.Cell>{r.durationMs ? `${r.durationMs}ms` : "—"}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}
          </Flex>
        </Card>
      </Grid>

      <Card>
        <Flex direction="column" gap="3">
          <Heading size="4">Quick start</Heading>
          <Separator size="4" />
          <Flex direction="column" gap="2">
            <Text size="2">
              <code style={{ background: "var(--gray-3)", padding: "2px 4px", borderRadius: 3 }}>cronboard add my-job --cron '*/5 * * * *' --url https://example.com/ping</code>
            </Text>
            <Text size="2" color="gray">Or use the UI: click "New job" in the top right.</Text>
          </Flex>
        </Flex>
      </Card>
    </Flex>
  );
}

function RunStatusBadge({ status }: { status: Run["status"] }) {
  const color =
    status === "success" ? "green" :
    status === "failed" ? "red" :
    status === "partial" ? "amber" :
    status === "timeout" ? "orange" : "blue";
  const label =
    status === "success" ? "ok" :
    status === "failed" ? "failed" :
    status === "partial" ? "partial" :
    status === "timeout" ? "timeout" : "running";
  return <Badge color={color}>{label}</Badge>;
}

function recentCount(runs: Run[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return runs.filter((r) => new Date(r.startedAt).getTime() >= cutoff).length;
}
