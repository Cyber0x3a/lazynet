import net from "node:net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STREAM_HOST = "127.0.0.1";
const STREAM_PORT = Number(process.env.LAZYNET_STREAM_PORT ?? 7738);
const TOKEN = process.env.LAZYNET_TOKEN ?? "lazynet-dev";

export async function GET() {
  // boot the agent on first stream connection (page load) if it is not running
  const { ensureAgent } = await import("@/lib/agent-process");
  await ensureAgent();

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const socket = new net.Socket();
      let buffer = "";
      let closed = false;

      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
          );
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        try {
          socket.destroy();
        } catch {
          /* noop */
        }
        try {
          controller.close();
        } catch {
          /* noop */
        }
      };

      socket.once("error", () => {
        send({ type: "agent-offline" });
        cleanup();
      });

      socket.once("close", () => {
        cleanup();
      });

      socket.connect(STREAM_PORT, STREAM_HOST, () => {
        socket.write(JSON.stringify({ token: TOKEN }) + "\n");
      });

      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          try {
            const parsed = JSON.parse(line);
            // Normalize: the agent wraps hello as {type:"hello", data:{status:{...}}}
            if (parsed?.type === "hello" && parsed?.data?.status) {
              send({ type: "hello", data: parsed.data.status });
            } else {
              send(parsed);
            }
          } catch {
            /* ignore malformed line */
          }
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
