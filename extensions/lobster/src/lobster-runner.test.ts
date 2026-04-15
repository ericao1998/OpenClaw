import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmbeddedLobsterRunner, resolveLobsterCwd } from "./lobster-runner.js";

describe("resolveLobsterCwd", () => {
  it("defaults to the current working directory", () => {
    expect(resolveLobsterCwd(undefined)).toBe(process.cwd());
  });

  it("keeps relative paths inside the repo root", () => {
    expect(resolveLobsterCwd("extensions/lobster")).toBe(
      path.resolve(process.cwd(), "extensions/lobster"),
    );
  });
});

describe("createEmbeddedLobsterRunner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs inline pipelines through the embedded runtime", async () => {
    const runtime = {
      runToolRequest: vi.fn().mockResolvedValue({
        ok: true,
        protocolVersion: 1,
        status: "ok",
        output: [{ hello: "world" }],
        requiresApproval: null,
      }),
      resumeToolRequest: vi.fn(),
    };

    const runner = createEmbeddedLobsterRunner({
      loadRuntime: vi.fn().mockResolvedValue(runtime),
    });

    const envelope = await runner.run({
      action: "run",
      pipeline: "exec --json=true echo hi",
      cwd: process.cwd(),
      timeoutMs: 2000,
      maxStdoutBytes: 4096,
    });

    expect(runtime.runToolRequest).toHaveBeenCalledTimes(1);
    expect(runtime.runToolRequest).toHaveBeenCalledWith({
      pipeline: "exec --json=true echo hi",
      ctx: expect.objectContaining({
        cwd: process.cwd(),
        mode: "tool",
        signal: expect.any(AbortSignal),
      }),
    });
    expect(envelope).toEqual({
      ok: true,
      status: "ok",
      output: [{ hello: "world" }],
      requiresApproval: null,
    });
  });

  it("detects workflow files and parses argsJson", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-lobster-runner-"));
    const workflowPath = path.join(tempDir, "workflow.lobster");
    await fs.writeFile(workflowPath, "steps: []\n", "utf8");

    try {
      const runtime = {
        runToolRequest: vi.fn().mockResolvedValue({
          ok: true,
          protocolVersion: 1,
          status: "ok",
          output: [],
          requiresApproval: null,
        }),
        resumeToolRequest: vi.fn(),
      };

      const runner = createEmbeddedLobsterRunner({
        loadRuntime: vi.fn().mockResolvedValue(runtime),
      });

      await runner.run({
        action: "run",
        pipeline: "workflow.lobster",
        argsJson: '{"limit":3}',
        cwd: tempDir,
        timeoutMs: 2000,
        maxStdoutBytes: 4096,
      });

      expect(runtime.runToolRequest).toHaveBeenCalledWith({
        filePath: workflowPath,
        args: { limit: 3 },
        ctx: expect.objectContaining({
          cwd: tempDir,
          mode: "tool",
        }),
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("returns a parse error when workflow args are invalid JSON", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-lobster-runner-"));
    const workflowPath = path.join(tempDir, "workflow.lobster");
    await fs.writeFile(workflowPath, "steps: []\n", "utf8");

    try {
      const runtime = {
        runToolRequest: vi.fn(),
        resumeToolRequest: vi.fn(),
      };
      const runner = createEmbeddedLobsterRunner({
        loadRuntime: vi.fn().mockResolvedValue(runtime),
      });

      await expect(
        runner.run({
          action: "run",
          pipeline: "workflow.lobster",
          argsJson: "{bad",
          cwd: tempDir,
          timeoutMs: 2000,
          maxStdoutBytes: 4096,
        }),
      ).rejects.toThrow("run --args-json must be valid JSON");
      expect(runtime.runToolRequest).not.toHaveBeenCalled();
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("throws when the embedded runtime returns an error envelope", async () => {
    const runtime = {
      runToolRequest: vi.fn().mockResolvedValue({
        ok: false,
        protocolVersion: 1,
        error: {
          type: "runtime_error",
          message: "boom",
        },
      }),
      resumeToolRequest: vi.fn(),
    };

    const runner = createEmbeddedLobsterRunner({
      loadRuntime: vi.fn().mockResolvedValue(runtime),
    });

    await expect(
      runner.run({
        action: "run",
        pipeline: "exec --json=true echo hi",
        cwd: process.cwd(),
        timeoutMs: 2000,
        maxStdoutBytes: 4096,
      }),
    ).rejects.toThrow("boom");
  });

  it("routes resume through the embedded runtime", async () => {
    const runtime = {
      runToolRequest: vi.fn(),
      resumeToolRequest: vi.fn().mockResolvedValue({
        ok: true,
        protocolVersion: 1,
        status: "cancelled",
        output: [],
        requiresApproval: null,
      }),
    };

    const runner = createEmbeddedLobsterRunner({
      loadRuntime: vi.fn().mockResolvedValue(runtime),
    });

    const envelope = await runner.run({
      action: "resume",
      token: "resume-token",
      approve: false,
      cwd: process.cwd(),
      timeoutMs: 2000,
      maxStdoutBytes: 4096,
    });

    expect(runtime.resumeToolRequest).toHaveBeenCalledWith({
      token: "resume-token",
      approved: false,
      ctx: expect.objectContaining({
        cwd: process.cwd(),
        mode: "tool",
        signal: expect.any(AbortSignal),
      }),
    });
    expect(envelope).toEqual({
      ok: true,
      status: "cancelled",
      output: [],
      requiresApproval: null,
    });
  });

  it("resumes workflow-file approvals when the token only carries stateKey", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-lobster-runner-"));
    const workflowPath = path.join(tempDir, "workflow.lobster");
    const stateDir = path.join(tempDir, "state");
    const previousStateDir = process.env.LOBSTER_STATE_DIR;

    await fs.writeFile(
      workflowPath,
      JSON.stringify(
        {
          name: "resume-smoke",
          steps: [
            {
              id: "gate",
              command:
                "node -e \"process.stdout.write(JSON.stringify({requiresApproval:{prompt:'Proceed?',items:[{id:1}]}}))\"",
              approval: "required",
            },
            {
              id: "done",
              command:
                "node -e \"process.stdout.write(JSON.stringify({phase:'smoke',status:'approved'}))\"",
              condition: "$gate.approved",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    process.env.LOBSTER_STATE_DIR = stateDir;

    try {
      const runner = createEmbeddedLobsterRunner();

      const first = await runner.run({
        action: "run",
        pipeline: "workflow.lobster",
        cwd: tempDir,
        timeoutMs: 2000,
        maxStdoutBytes: 4096,
      });

      expect(first).toMatchObject({
        ok: true,
        status: "needs_approval",
      });
      if (!first.ok || first.status !== "needs_approval") {
        throw new Error("expected approval envelope");
      }
      const resumeToken = first.requiresApproval?.resumeToken;
      expect(resumeToken).toBeTruthy();

      const resumed = await runner.run({
        action: "resume",
        token: resumeToken ?? "",
        approve: true,
        cwd: tempDir,
        timeoutMs: 2000,
        maxStdoutBytes: 4096,
      });

      expect(resumed).toEqual({
        ok: true,
        status: "ok",
        output: [{ phase: "smoke", status: "approved" }],
        requiresApproval: null,
      });
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.LOBSTER_STATE_DIR;
      } else {
        process.env.LOBSTER_STATE_DIR = previousStateDir;
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("cancels workflow-file approvals and clears saved state when approval is rejected", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-lobster-runner-"));
    const workflowPath = path.join(tempDir, "workflow.lobster");
    const stateDir = path.join(tempDir, "state");
    const previousStateDir = process.env.LOBSTER_STATE_DIR;

    await fs.writeFile(
      workflowPath,
      JSON.stringify(
        {
          name: "reject-smoke",
          steps: [
            {
              id: "gate",
              command:
                "node -e \"process.stdout.write(JSON.stringify({requiresApproval:{prompt:'Proceed?',items:[{id:1}]}}))\"",
              approval: "required",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    process.env.LOBSTER_STATE_DIR = stateDir;

    try {
      const runner = createEmbeddedLobsterRunner();

      const first = await runner.run({
        action: "run",
        pipeline: "workflow.lobster",
        cwd: tempDir,
        timeoutMs: 2000,
        maxStdoutBytes: 4096,
      });

      expect(first).toMatchObject({
        ok: true,
        status: "needs_approval",
      });
      if (!first.ok || first.status !== "needs_approval") {
        throw new Error("expected approval envelope");
      }
      const resumeToken = first.requiresApproval?.resumeToken;
      expect(resumeToken).toBeTruthy();
      expect(await fs.readdir(stateDir)).toHaveLength(1);

      const rejected = await runner.run({
        action: "resume",
        token: resumeToken ?? "",
        approve: false,
        cwd: tempDir,
        timeoutMs: 2000,
        maxStdoutBytes: 4096,
      });

      expect(rejected).toEqual({
        ok: true,
        status: "cancelled",
        output: [],
        requiresApproval: null,
      });
      expect(await fs.readdir(stateDir)).toHaveLength(0);
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.LOBSTER_STATE_DIR;
      } else {
        process.env.LOBSTER_STATE_DIR = previousStateDir;
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("loads the embedded runtime once per runner", async () => {
    const runtime = {
      runToolRequest: vi.fn().mockResolvedValue({
        ok: true,
        protocolVersion: 1,
        status: "ok",
        output: [],
        requiresApproval: null,
      }),
      resumeToolRequest: vi.fn().mockResolvedValue({
        ok: true,
        protocolVersion: 1,
        status: "cancelled",
        output: [],
        requiresApproval: null,
      }),
    };
    const loadRuntime = vi.fn().mockResolvedValue(runtime);

    const runner = createEmbeddedLobsterRunner({ loadRuntime });

    await runner.run({
      action: "run",
      pipeline: "exec --json=true echo hi",
      cwd: process.cwd(),
      timeoutMs: 2000,
      maxStdoutBytes: 4096,
    });
    await runner.run({
      action: "resume",
      token: "resume-token",
      approve: false,
      cwd: process.cwd(),
      timeoutMs: 2000,
      maxStdoutBytes: 4096,
    });

    expect(loadRuntime).toHaveBeenCalledTimes(1);
  });

  it("requires a pipeline for run", async () => {
    const runner = createEmbeddedLobsterRunner({
      loadRuntime: vi.fn().mockResolvedValue({
        runToolRequest: vi.fn(),
        resumeToolRequest: vi.fn(),
      }),
    });

    await expect(
      runner.run({
        action: "run",
        cwd: process.cwd(),
        timeoutMs: 2000,
        maxStdoutBytes: 4096,
      }),
    ).rejects.toThrow(/pipeline required/);
  });

  it("requires token and approve for resume", async () => {
    const runner = createEmbeddedLobsterRunner({
      loadRuntime: vi.fn().mockResolvedValue({
        runToolRequest: vi.fn(),
        resumeToolRequest: vi.fn(),
      }),
    });

    await expect(
      runner.run({
        action: "resume",
        approve: true,
        cwd: process.cwd(),
        timeoutMs: 2000,
        maxStdoutBytes: 4096,
      }),
    ).rejects.toThrow(/token required/);

    await expect(
      runner.run({
        action: "resume",
        token: "resume-token",
        cwd: process.cwd(),
        timeoutMs: 2000,
        maxStdoutBytes: 4096,
      }),
    ).rejects.toThrow(/approve required/);
  });

  it("aborts long-running embedded work", async () => {
    const runtime = {
      runToolRequest: vi.fn(
        async ({ ctx }: { ctx?: { signal?: AbortSignal } }) =>
          await new Promise((resolve, reject) => {
            ctx?.signal?.addEventListener("abort", () => {
              reject(ctx.signal?.reason ?? new Error("aborted"));
            });
            setTimeout(
              () => resolve({ ok: true, status: "ok", output: [], requiresApproval: null }),
              500,
            );
          }),
      ),
      resumeToolRequest: vi.fn(),
    };

    const runner = createEmbeddedLobsterRunner({
      loadRuntime: vi.fn().mockResolvedValue(runtime),
    });

    await expect(
      runner.run({
        action: "run",
        pipeline: "exec --json=true echo hi",
        cwd: process.cwd(),
        timeoutMs: 200,
        maxStdoutBytes: 4096,
      }),
    ).rejects.toThrow(/timed out|aborted/);
  });
});
