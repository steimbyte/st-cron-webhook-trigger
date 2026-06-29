import { useEffect, useState } from "react";
import {
  Flex,
  Heading,
  Text,
  Table,
  Switch,
  Button,
  Badge,
  IconButton,
  AlertDialog,
  Tooltip,
  Select,
  TextField,
} from "@radix-ui/themes";
import { Pencil1Icon, PlayIcon, TrashIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { api } from "../lib/api";
import type { Job } from "../types";
import { GlassCard } from "../components/GlassCard";

interface Props {
  onEdit: (id: string) => void;
}

export default function JobsPage({ onEdit }: Props) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [query, setQuery] = useState("");
  const [filterEnabled, setFilterEnabled] = useState<"all" | "enabled" | "disabled">("all");
  const [confirmDelete, setConfirmDelete] = useState<Job | null>(null);

  const refresh = () => api.jobs.list().then(setJobs);
  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 3000);
    return () => clearInterval(i);
  }, []);

  const filtered = jobs?.filter((j) => {
    if (filterEnabled === "enabled" && !j.enabled) return false;
    if (filterEnabled === "disabled" && j.enabled) return false;
    if (query && !j.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <Flex direction="column" gap="4">
      <GlassCard>
        <Flex align="center" gap="3" wrap="wrap">
          <TextField.Root
            placeholder="Search jobs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            size="2"
            style={{ minWidth: 240 }}
          >
            <TextField.Slot>
              <MagnifyingGlassIcon />
            </TextField.Slot>
          </TextField.Root>
          <Select.Root value={filterEnabled} onValueChange={(v) => setFilterEnabled(v as any)}>
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="all">All</Select.Item>
              <Select.Item value="enabled">Enabled only</Select.Item>
              <Select.Item value="disabled">Disabled only</Select.Item>
            </Select.Content>
          </Select.Root>
          <Text size="2" color="gray" style={{ marginLeft: "auto" }}>
            {jobs === null ? "…" : `${filtered?.length ?? 0} of ${jobs.length}`}
          </Text>
        </Flex>
      </GlassCard>

      <GlassCard>
        {jobs === null ? (
          <Text size="2" color="gray">loading…</Text>
        ) : (filtered ?? []).length === 0 ? (
          <Flex direction="column" align="center" gap="3" p="6">
            <Text size="2" color="gray">No jobs yet.</Text>
            <Button onClick={() => onEdit("")}>Create one</Button>
          </Flex>
        ) : (
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell style={{ width: 60 }}>On</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Cron</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>TZ</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Next</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Last</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(filtered ?? []).map((j) => (
                <Table.Row key={j.id}>
                  <Table.Cell>
                    <Switch
                      checked={j.enabled}
                      onCheckedChange={async () => {
                        await api.jobs.toggle(j.id);
                        refresh();
                      }}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <Flex direction="column">
                      <Text size="2" weight="medium">{j.name}</Text>
                      {j.description ? <Text size="1" color="gray">{j.description}</Text> : null}
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color="gray" variant="soft">{j.cronExpression}</Badge>
                  </Table.Cell>
                  <Table.Cell><Text size="1" color="gray">{j.timezone}</Text></Table.Cell>
                  <Table.Cell>
                    <Text size="1" color="gray">{j.nextRunAt ? new Date(j.nextRunAt).toLocaleString() : "—"}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="1" color="gray">{j.lastRunAt ? new Date(j.lastRunAt).toLocaleString() : "—"}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap="1">
                      <Tooltip content="Edit">
                        <IconButton variant="ghost" onClick={() => onEdit(j.id)}>
                          <Pencil1Icon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip content="Run now">
                        <IconButton
                          variant="ghost"
                          onClick={async () => {
                            await api.jobs.run(j.id);
                            refresh();
                          }}
                        >
                          <PlayIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip content="Delete">
                        <IconButton variant="ghost" color="red" onClick={() => setConfirmDelete(j)}>
                          <TrashIcon />
                        </IconButton>
                      </Tooltip>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        )}
      </GlassCard>

      <AlertDialog.Root open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialog.Content>
          <AlertDialog.Title>Delete "{confirmDelete?.name}"?</AlertDialog.Title>
          <AlertDialog.Description>This cannot be undone. Run history will be preserved.</AlertDialog.Description>
          <Flex justify="end" gap="2" mt="4">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                color="red"
                onClick={async () => {
                  if (confirmDelete) {
                    await api.jobs.remove(confirmDelete.id);
                    setConfirmDelete(null);
                    refresh();
                  }
                }}
              >
                Delete
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Flex>
  );
}
