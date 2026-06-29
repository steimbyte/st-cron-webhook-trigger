import { useEffect, useState } from "react";
import {
  Flex,
  Heading,
  Text,
  TextField,
  Button,
  Box,
  Switch,
  Separator,
  Badge,
  Callout,
} from "@radix-ui/themes";
import { GlassCard } from "../components/GlassCard";

export default function SettingsPage() {
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setInfo);
  }, []);

  return (
    <Flex direction="column" gap="4">
      <GlassCard>
        <Flex direction="column" gap="3">
          <Heading size="4">Server info</Heading>
          <Separator size="4" />
          {info ? (
            <Flex direction="column" gap="2">
              <KV k="Status" v={<Badge color={info.status === "ok" ? "green" : "red"}>{info.status}</Badge>} />
              <KV k="Version" v={<Text size="2" style={{ fontFamily: "monospace" }}>{info.version}</Text>} />
              <KV k="Server time" v={<Text size="2" style={{ fontFamily: "monospace" }}>{info.time}</Text>} />
              <KV k="Endpoint" v={<Text size="2" style={{ fontFamily: "monospace" }}>http://localhost:3737/api</Text>} />
            </Flex>
          ) : (
            <Text size="2" color="gray">loading…</Text>
          )}
        </Flex>
      </GlassCard>

      <GlassCard>
        <Flex direction="column" gap="3">
          <Heading size="4">How to start cronboard</Heading>
          <Separator size="4" />
          <Flex direction="column" gap="2">
            <Text size="2">
              The daemon was started by running <code style={{ background: "var(--gray-3)", padding: "2px 4px", borderRadius: 3 }}>npm start</code> or <code style={{ background: "var(--gray-3)", padding: "2px 4px", borderRadius: 3 }}>npx tsx src/cli.ts start</code> in the <code style={{ background: "var(--gray-3)", padding: "2px 4px", borderRadius: 3 }}>packages/core</code> folder.
            </Text>
            <Text size="2" color="gray">
              Configuration (port, host, data dir, token) is controlled via flags:
            </Text>
            <pre className="cb-code">{`npm start -- --port 8080 --host 0.0.0.0 --token YOUR_SECRET`}</pre>
            <Text size="2" color="gray">
              When binding to non-localhost, you must provide <code>--token</code> for security.
            </Text>
          </Flex>
        </Flex>
      </GlassCard>

      <GlassCard>
        <Flex direction="column" gap="3">
          <Heading size="4">Storage</Heading>
          <Separator size="4" />
          <Text size="2" color="gray">
            All jobs and runs are stored as JSON in your user config directory:
          </Text>
          <pre className="cb-code">{`~/.config/cronboard/jobs.json
~/.config/cronboard/runs.json
~/.config/cronboard/cronboard.log
~/.config/cronboard/cronboard.pid`}</pre>
          <Text size="2" color="gray">
            Override via env <code>CRONBOARD_DATA_DIR</code>.
          </Text>
        </Flex>
      </GlassCard>

      <Callout.Root>
        <Callout.Text>
          Settings UI for server-side configuration is intentionally minimal. Cronboard is designed to be configured at start time via CLI flags — restarting the daemon picks up new settings.
        </Callout.Text>
      </Callout.Root>
    </Flex>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <Flex gap="3" align="center">
      <Text size="2" color="gray" style={{ width: 120 }}>{k}</Text>
      <Box>{v}</Box>
    </Flex>
  );
}
