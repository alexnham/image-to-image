import { z } from "zod";
import {
  owner,
  lock,
  unlock,
  errorResponse,
  UserError,
} from "@/lib/server/access";
import { runPrompt } from "@/lib/engine/engine";
import { versionStore } from "@/lib/server/versions";
import { providers } from "@/lib/server/providers";
import { planner } from "@/lib/server/planner";
export const maxDuration = 300;
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/projects/[id]/edit">,
) {
  let held: { userId: string; token: string } | undefined;
  try {
    const { id } = await params;
    const { userId } = await owner(id);
    const input = z
      .object({
        prompt: z.string().trim().min(1).max(2000),
        fromVersion: z.number().int().min(0),
        variations: z.number().int().min(1).max(3).default(1),
      })
      .parse(await request.json());
    const { token, used } = await lock(userId);
    held = { userId, token };
    if (used + input.variations > 20)
      throw new UserError(
        "You've used your 20 free prompts. Manual editing and export are still free.",
        403,
      );
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
          } catch {
            /* Client disconnected; finish atomic save and release the lock. */
          }
        };
        let charged = 0;
        try {
          for (let i = 0; i < input.variations; i++) {
            send({
              type: "progress",
              label: `Planning edit${input.variations > 1 ? ` ${i + 1} of ${input.variations}` : ""}…`,
            });
            const result = await runPrompt(
              {
                planner: planner(),
                providers: providers(id, userId),
                store: versionStore(userId, token, true),
              },
              {
                projectId: id,
                prompt: input.prompt,
                fromVersion: input.fromVersion,
                onProgress: (label) => send({ type: "progress", label }),
              },
            );
            if (result.kind !== "done") {
              send({ type: "error", message: result.message });
              break;
            }
            charged++;
            send({
              type: "version",
              version: result.version,
              remaining: 20 - used - charged,
            });
          }
        } catch (e) {
          send({
            type: "error",
            message:
              e instanceof UserError
                ? e.message
                : "Edit failed. No prompt was charged for the failed variation.",
          });
        } finally {
          await unlock(userId, token);
          try {
            controller.close();
          } catch {}
        }
      },
    });
    held = undefined;
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return errorResponse(e);
  } finally {
    if (held) await unlock(held.userId, held.token);
  }
}
