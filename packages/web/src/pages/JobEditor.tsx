import { useEffect, useMemo, useState } from "react";
import {
  Card,
  Flex,
  Heading,
  Text,
  TextField,
  TextArea,
  Switch,
  Button,
  Badge,
  Select,
  Separator,
  IconButton,
  Box,
  Callout,
  Grid,
} from "@radix-ui/themes";
import { PlusIcon, TrashIcon, PlayIcon, GlobeIcon, CodeIcon } from "@radix-ui/react-icons";
import CronBuilder from "../components/CronBuilder";
import { api } from "../lib/api";
import type { Job, JobAction, WebhookConfig, ShellConfig } from "../types";

interface Props {
  jobId?: string;
  onDone: () => void;
}

const COMMON_TZ = [
  "UTC",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

export default function JobEditor({ jobId, onDone }: Props) {
  const isNew = !jobId;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testRunning, setTestRunning] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpression, setCronExpression] = useState("*/5 * * * *");
  const [timezone, setTimezone] = useState("UTC");
  const [enabled, setEnabled] = useState(true);
  const [actions, setActions] = useState<JobAction[]>([]);

  useEffect(() => {
    if (jobId) {
      api.jobs.get(jobId).then((j) => {
        hydrate(j);
        setLoading(false);
      }).catch((e) => setError(e.message));
    }
  }, [jobId]);

  // Live cron preview
  function hydrate(j: Job) {
    setName(j.name);
    setDescription(j.description ?? "");
    setCronExpression(j.cronExpression);
    setTimezone(j.timezone);
    setEnabled(j.enabled);
    setActions(j.actions);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        description: description || undefined,
        cronExpression,
        timezone,
        enabled,
        actions,
      };
      if (isNew) {
        await api.jobs.create(payload);
      } else {
        await api.jobs.update(jobId!, payload);
      }
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function testRun() {
    setTestRunning(true);
    setError(null);
    try {
      // Save first if needed (so run target exists)
      const payload = { name, description, cronExpression, timezone, enabled, actions };
      let targetId = jobId;
      if (!targetId) {
        const j = await api.jobs.create(payload);
        targetId = j.id;
        hydrate(j);
        // After save we want to keep editing — jump to "edit" mode by replacing URL/state
      } else {
        await api.jobs.update(targetId, payload);
      }
      await api.jobs.run(targetId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTestRunning(false);
    }
  }

  function addWebhook() {
    const newAction: JobAction = {
      id: crypto.randomUUID(),
      jobId: "",
      type: "webhook",
      position: actions.length,
      continueOnError: false,
      config: {
        method: "POST",
        url: "https://example.com/webhook",
        timeoutMs: 30000,
      },
    } as JobAction;
    setActions([...actions, newAction]);
  }

  function addShell() {
    const newAction: JobAction = {
      id: crypto.randomUUID(),
      jobId: "",
      type: "shell",
      position: actions.length,
      continueOnError: false,
      config: { command: 'echo "hello"', timeoutMs: 60000 },
    } as JobAction;
    setActions([...actions, newAction]);
  }

  function removeAction(idx: number) {
    setActions(actions.filter((_, i) => i !== idx).map((a, i) => ({ ...a, position: i })));
  }

  function updateAction(idx: number, patch: Partial<JobAction>) {
    setActions(actions.map((a, i) => (i === idx ? ({ ...a, ...patch } as JobAction) : a)));
  }

  if (loading) {
    return <Text size="2" color="gray">loading…</Text>;
  }

  return (
    <Flex direction="column" gap="4">
      {error ? (
        <Callout.Root color="red">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      ) : null}

      <Card>
        <Flex direction="column" gap="4">
          <Flex gap="3" wrap="wrap">
            <Box style={{ flex: 1, minWidth: 240 }}>
              <Text size="2" weight="medium" as="div" mb="1">Name</Text>
              <TextField.Root
                placeholder="e.g. heartbeat"
                value={name}
                onChange={(e) => setName(e.target.value)}
                size="3"
              />
            </Box>
            <Flex align="end" gap="2">
              <Flex direction="column">
                <Text size="2" weight="medium" as="div" mb="1">Enabled</Text>
                <Switch checked={enabled} onCheckedChange={setEnabled} size="3" />
              </Flex>
            </Flex>
          </Flex>

          <Box>
            <Text size="2" weight="medium" as="div" mb="1">Description</Text>
            <TextArea
              placeholder="optional"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </Box>

          <Grid columns="3" gap="3">
            <Box style={{ gridColumn: "span 2" }}>
              <Text size="2" weight="medium" as="div" mb="1">Schedule</Text>
              <CronBuilder
                value={cronExpression}
                onChange={setCronExpression}
                timezone={timezone}
              />
            </Box>
            <Box>
              <Text size="2" weight="medium" as="div" mb="1">Timezone</Text>
              <Select.Root value={timezone} onValueChange={setTimezone}>
                <Select.Trigger style={{ width: "100%" }} />
                <Select.Content>
                  {COMMON_TZ.map((tz) => (
                    <Select.Item key={tz} value={tz}>{tz}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>
          </Grid>
        </Flex>
      </Card>

      <Card>
        <Flex direction="column" gap="3">
          <Flex align="center">
            <Heading size="4">Actions</Heading>
            <Box style={{ marginLeft: "auto" }}>
              <Flex gap="2">
                <Button variant="soft" onClick={addWebhook}>
                  <GlobeIcon /> Webhook
                </Button>
                <Button variant="soft" onClick={addShell}>
                  <CodeIcon /> Shell
                </Button>
              </Flex>
            </Box>
          </Flex>
          <Separator size="4" />
          {actions.length === 0 ? (
            <Text size="2" color="gray">
              No actions yet. Click <strong>Webhook</strong> or <strong>Shell</strong> above to add one.
              A run is only useful with at least one action.
            </Text>
          ) : (
            <Flex direction="column" gap="3">
              {actions.map((a, i) => (
                <ActionEditor
                  key={(a as any).id ?? i}
                  action={a}
                  index={i}
                  onChange={(patch) => updateAction(i, patch)}
                  onRemove={() => removeAction(i)}
                />
              ))}
            </Flex>
          )}
        </Flex>
      </Card>

      <Flex gap="2" justify="end">
        <Button variant="soft" color="gray" onClick={onDone}>Cancel</Button>
        <Button variant="soft" onClick={testRun} disabled={testRunning || !name || !cronExpression}>
          <PlayIcon /> {testRunning ? "Running…" : "Test run"}
        </Button>
        <Button onClick={save} disabled={saving || !name || !cronExpression}>
          {isNew ? "Create" : "Save"}
        </Button>
      </Flex>
    </Flex>
  );
}

function ActionEditor({
  action,
  index,
  onChange,
  onRemove,
}: {
  action: JobAction;
  index: number;
  onChange: (patch: Partial<JobAction>) => void;
  onRemove: () => void;
}) {
  return (
    <Card>
      <Flex direction="column" gap="3">
        <Flex align="center">
          <Badge color={action.type === "webhook" ? "violet" : "cyan"}>
            {action.type === "webhook" ? "webhook" : "shell"} #{index + 1}
          </Badge>
          <Switch
            checked={action.continueOnError}
            onCheckedChange={(v) => onChange({ continueOnError: v })}
            size="2"
          />
          <Text size="1" color="gray">continue on error</Text>
          <IconButton variant="ghost" color="red" style={{ marginLeft: "auto" }} onClick={onRemove}>
            <TrashIcon />
          </IconButton>
        </Flex>
        {action.type === "webhook" ? (
          <WebhookFields
            config={action.config as WebhookConfig}
            onChange={(cfg) => onChange({ config: cfg } as any)}
          />
        ) : (
          <ShellFields
            config={action.config as ShellConfig}
            onChange={(cfg) => onChange({ config: cfg } as any)}
          />
        )}
      </Flex>
    </Card>
  );
}

function WebhookFields({ config, onChange }: { config: WebhookConfig; onChange: (cfg: WebhookConfig) => void }) {
  const [header, setHeader] = useState("");
  return (
    <Flex direction="column" gap="3">
      <Flex gap="2">
        <Box style={{ width: 120 }}>
          <Text size="1" color="gray" as="div">Method</Text>
          <Select.Root value={config.method} onValueChange={(v) => onChange({ ...config, method: v as WebhookConfig["method"] })}>
            <Select.Trigger style={{ width: "100%" }} />
            <Select.Content>
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <Select.Item key={m} value={m}>{m}</Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Box>
        <Box style={{ flex: 1 }}>
          <Text size="1" color="gray" as="div">URL</Text>
          <TextField.Root
            value={config.url}
            onChange={(e) => onChange({ ...config, url: e.target.value })}
            placeholder="https://example.com/webhook"
          />
        </Box>
      </Flex>
      <Box>
        <Text size="1" color="gray" as="div">Body (raw text)</Text>
        <TextArea
          rows={3}
          value={config.body ?? ""}
          onChange={(e) => onChange({ ...config, body: e.target.value })}
          placeholder='{"event":"heartbeat"}'
          style={{ fontFamily: "monospace" }}
        />
      </Box>
      <Box>
        <Text size="1" color="gray" as="div">Headers</Text>
        <Flex direction="column" gap="2">
          {Object.entries(config.headers ?? {}).map(([k, v], i) => (
            <Flex key={i} gap="2" align="center">
              <TextField.Root value={k} readOnly style={{ width: 160 }} />
              <TextField.Root
                value={v}
                onChange={(e) =>
                  onChange({
                    ...config,
                    headers: { ...(config.headers ?? {}), [k]: e.target.value },
                  })
                }
                style={{ flex: 1 }}
              />
              <IconButton
                variant="ghost"
                color="red"
                onClick={() => {
                  const next = { ...(config.headers ?? {}) };
                  delete next[k];
                  onChange({ ...config, headers: next });
                }}
              >
                <TrashIcon />
              </IconButton>
            </Flex>
          ))}
          <Flex gap="2">
            <TextField.Root
              placeholder="X-Api-Key=…"
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button
              variant="soft"
              onClick={() => {
                if (!header.includes("=")) return;
                const idx = header.indexOf("=");
                const k = header.slice(0, idx).trim();
                const v = header.slice(idx + 1);
                if (!k) return;
                onChange({
                  ...config,
                  headers: { ...(config.headers ?? {}), [k]: v },
                });
                setHeader("");
              }}
            >
              <PlusIcon /> Add
            </Button>
          </Flex>
        </Flex>
      </Box>
    </Flex>
  );
}

function ShellFields({ config, onChange }: { config: ShellConfig; onChange: (cfg: ShellConfig) => void }) {
  return (
    <Flex direction="column" gap="3">
      <Box>
        <Text size="1" color="gray" as="div">Command</Text>
        <TextArea
          rows={3}
          value={config.command}
          onChange={(e) => onChange({ ...config, command: e.target.value })}
          style={{ fontFamily: "monospace" }}
          placeholder='curl -X POST https://example.com/api -d "{}"'
        />
      </Box>
      <Flex gap="2">
        <Box style={{ flex: 1 }}>
          <Text size="1" color="gray" as="div">Working directory (optional)</Text>
          <TextField.Root
            value={config.cwd ?? ""}
            onChange={(e) => onChange({ ...config, cwd: e.target.value })}
          />
        </Box>
        <Box style={{ width: 160 }}>
          <Text size="1" color="gray" as="div">Timeout (ms)</Text>
          <TextField.Root
            type="number"
            value={config.timeoutMs ?? ""}
            onChange={(e) => onChange({ ...config, timeoutMs: parseInt(e.target.value, 10) || undefined })}
          />
        </Box>
      </Flex>
      <Callout.Root color="amber" size="1">
        <Callout.Text>
          Shell actions run on your machine with your user permissions. Be careful with arbitrary input.
        </Callout.Text>
      </Callout.Root>
    </Flex>
  );
}
