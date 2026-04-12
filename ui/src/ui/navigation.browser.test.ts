import { describe, expect, it, vi } from "vitest";
import "../test-helpers/load-styles.ts";
import { mountApp as mountTestApp, registerAppMountHooks } from "./test-helpers/app-mount.ts";

registerAppMountHooks();

function mountApp(pathname: string) {
  return mountTestApp(pathname);
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function setViewport(width: number, height = 900) {
  const matchMedia = vi.fn((query: string) => {
    const maxWidthMatch = query.match(/\(max-width:\s*(\d+)px\)/);
    const minWidthMatch = query.match(/\(min-width:\s*(\d+)px\)/);
    const matches =
      (maxWidthMatch ? width <= Number.parseInt(maxWidthMatch[1] ?? "0", 10) : true) &&
      (minWidthMatch ? width >= Number.parseInt(minWidthMatch[1] ?? "0", 10) : true);
    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  });
  vi.stubGlobal("matchMedia", matchMedia);
  Object.defineProperty(window, "matchMedia", {
    value: matchMedia,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, "innerWidth", {
    value: width,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: height,
    writable: true,
    configurable: true,
  });
}

function findConfirmButton(app: ReturnType<typeof mountApp>) {
  return Array.from(app.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === "Confirm",
  );
}

async function confirmPendingGatewayChange(app: ReturnType<typeof mountApp>) {
  const confirmButton = findConfirmButton(app);
  expect(confirmButton).not.toBeUndefined();
  confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  await app.updateComplete;
}

function expectConfirmedGatewayChange(app: ReturnType<typeof mountApp>) {
  expect(app.settings.gatewayUrl).toBe("wss://other-gateway.example/openclaw");
  expect(app.settings.token).toBe("abc123");
  expect(window.location.search).toBe("");
  expect(window.location.hash).toBe("");
}

describe("control UI routing", () => {
  it("hydrates the tab from the location", async () => {
    const app = mountApp("/sessions");
    await app.updateComplete;

    expect(app.tab).toBe("sessions");
    expect(window.location.pathname).toBe("/sessions");
  });

  it("respects /ui base paths", async () => {
    const app = mountApp("/ui/cron");
    await app.updateComplete;

    expect(app.basePath).toBe("/ui");
    expect(app.tab).toBe("cron");
    expect(window.location.pathname).toBe("/ui/cron");
  });

  it("infers nested base paths", async () => {
    const app = mountApp("/apps/openclaw/cron");
    await app.updateComplete;

    expect(app.basePath).toBe("/apps/openclaw");
    expect(app.tab).toBe("cron");
    expect(window.location.pathname).toBe("/apps/openclaw/cron");
  });

  it("honors explicit base path overrides", async () => {
    window.__OPENCLAW_CONTROL_UI_BASE_PATH__ = "/openclaw";
    const app = mountApp("/openclaw/sessions");
    await app.updateComplete;

    expect(app.basePath).toBe("/openclaw");
    expect(app.tab).toBe("sessions");
    expect(window.location.pathname).toBe("/openclaw/sessions");
  });

  it("updates the URL when clicking nav items", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    const link = app.querySelector<HTMLAnchorElement>('a.nav-item[href="/channels"]');
    expect(link).not.toBeNull();
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));

    await app.updateComplete;
    expect(app.tab).toBe("channels");
    expect(window.location.pathname).toBe("/channels");
  });

  it("keeps dreams navigation visible even when dreaming is disabled", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    const dreamsLink = app.querySelector<HTMLAnchorElement>('a.nav-item[href="/dreaming"]');
    expect(dreamsLink).not.toBeNull();
  });

  it("renders the dreaming view on the /dreaming route", async () => {
    const app = mountApp("/dreaming");
    app.dreamingStatus = {
      enabled: true,
      timezone: "Europe/Madrid",
      verboseLogging: false,
      storageMode: "inline",
      separateReports: false,
      shortTermCount: 2,
      recallSignalCount: 1,
      dailySignalCount: 1,
      groundedSignalCount: 0,
      totalSignalCount: 2,
      phaseSignalCount: 0,
      lightPhaseHitCount: 0,
      remPhaseHitCount: 0,
      promotedTotal: 1,
      promotedToday: 1,
      shortTermEntries: [],
      signalEntries: [],
      promotedEntries: [],
      phases: {
        light: { enabled: true, cron: "", managedCronPresent: false, lookbackDays: 7, limit: 20 },
        deep: {
          enabled: true,
          cron: "",
          managedCronPresent: false,
          limit: 20,
          minScore: 0.75,
          minRecallCount: 3,
          minUniqueQueries: 2,
          recencyHalfLifeDays: 7,
        },
        rem: {
          enabled: true,
          cron: "",
          managedCronPresent: false,
          lookbackDays: 7,
          limit: 20,
          minPatternStrength: 0.6,
        },
      },
    };
    app.dreamDiaryPath = "DREAMS.md";
    app.dreamDiaryContent = [
      "# Dream Diary",
      "",
      "<!-- openclaw:dreaming:diary:start -->",
      "",
      "---",
      "",
      "*January 1, 2026*",
      "",
      "What Happened",
      "1. Stable operator rule surfaced.",
      "",
      "<!-- openclaw:dreaming:diary:end -->",
    ].join("\n");
    app.requestUpdate();
    await app.updateComplete;

    expect(app.tab).toBe("dreams");
    expect(app.querySelector(".dreams__tab")).not.toBeNull();
    expect(app.querySelector(".dreams__lobster")).not.toBeNull();
  });

  it("renders the refreshed top navigation shell", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    expect(app.querySelector(".topnav-shell")).not.toBeNull();
    expect(app.querySelector(".topnav-shell__content")).not.toBeNull();
    expect(app.querySelector(".topnav-shell__actions")).not.toBeNull();
    expect(app.querySelector(".topnav-shell .brand-title")).toBeNull();
  });

  it("renders the refreshed sidebar shell structure", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    expect(app.querySelector(".sidebar-shell")).not.toBeNull();
    expect(app.querySelector(".sidebar-shell__header")).not.toBeNull();
    expect(app.querySelector(".sidebar-shell__body")).not.toBeNull();
    expect(app.querySelector(".sidebar-shell__footer")).not.toBeNull();
    expect(app.querySelector(".sidebar-brand")).not.toBeNull();
    expect(app.querySelector(".sidebar-brand__logo")).not.toBeNull();
    expect(app.querySelector(".sidebar-brand__copy")).not.toBeNull();
  });

  it("renders a desktop sidebar resizer and applies custom nav width", async () => {
    setViewport(1440, 900);
    const app = mountApp("/chat");
    await app.updateComplete;

    app.applySettings({ ...app.settings, navWidth: 360 });
    await app.updateComplete;

    expect(app.querySelector(".sidebar-resizer")).not.toBeNull();
    const shell = app.querySelector<HTMLElement>(".shell");
    expect(shell?.style.getPropertyValue("--shell-nav-width")).toBe("360px");
  });

  it("updates sidebar width from desktop drag gestures", async () => {
    setViewport(1440, 900);
    const app = mountApp("/chat");
    await app.updateComplete;

    const resizer = app.querySelector<HTMLElement>(".sidebar-resizer");
    expect(resizer).not.toBeNull();
    resizer?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 220, button: 0 }));
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 300 }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    await app.updateComplete;

    expect(app.settings.navWidth).toBe(300);
    const shell = app.querySelector<HTMLElement>(".shell");
    expect(shell?.style.getPropertyValue("--shell-nav-width")).toBe("300px");
  });

  it("keeps project folders structural until an explicit chat leaf is created", async () => {
    setViewport(1440, 900);
    const app = mountApp("/chat");
    app.missionControlRegistry = {
      id: "ppv",
      name: "Prime Property Ventures",
      domains: [],
      sessionLanes: [],
      intakeRoutes: [],
      treeNodes: [
        {
          id: "workspace:ppv",
          parentId: null,
          kind: "workspace",
          label: "Prime Property Ventures Workspace",
        },
        {
          id: "repo:ppv",
          parentId: "workspace:ppv",
          kind: "repo",
          label: "PPV",
        },
        {
          id: "module:operator-os",
          parentId: "repo:ppv",
          kind: "module",
          label: "Operator OS",
        },
      ],
    };
    app.applySettings({
      ...app.settings,
      navGroupsCollapsed: {
        ...app.settings.navGroupsCollapsed,
        project: false,
        "tree:workspace:ppv": false,
        "tree:repo:ppv": false,
        "tree:module:operator-os": false,
      },
    });
    await app.updateComplete;

    expect(app.querySelectorAll(".nav-project-row--leaf")).toHaveLength(0);
    expect(
      Array.from(app.querySelectorAll(".nav-project-group__text")).some(
        (el) => el.textContent?.trim() === "Project Chat",
      ),
    ).toBe(false);
  });

  it("shows the curated default project hierarchy from a fresh app state", async () => {
    setViewport(1440, 900);
    const app = mountApp("/chat");
    app.applySettings({
      ...app.settings,
      navGroupsCollapsed: {
        ...app.settings.navGroupsCollapsed,
        project: false,
        "tree:workspace:ppv": false,
        "tree:repo:control": false,
      },
    });
    await app.updateComplete;

    expect(
      Array.from(app.querySelectorAll(".nav-project-group__text")).some(
        (el) => el.textContent?.trim() === "Mission Control UI",
      ),
    ).toBe(true);
  });

  it("treats plain child names as modules in the project tree add flow", async () => {
    setViewport(1440, 900);
    const app = mountApp("/chat");
    app.missionControlRegistry = {
      id: "ppv",
      name: "Prime Property Ventures",
      domains: [],
      sessionLanes: [],
      intakeRoutes: [],
      treeNodes: [
        {
          id: "workspace:ppv",
          parentId: null,
          kind: "workspace",
          label: "Prime Property Ventures Workspace",
        },
        {
          id: "repo:ppv",
          parentId: "workspace:ppv",
          kind: "repo",
          label: "PPV",
        },
      ],
    };
    app.applySettings({
      ...app.settings,
      navGroupsCollapsed: {
        ...app.settings.navGroupsCollapsed,
        project: false,
        "tree:workspace:ppv": false,
        "tree:repo:ppv": false,
      },
    });
    await app.updateComplete;

    vi.spyOn(window, "prompt").mockReturnValueOnce("Operator OS");

    const repoGroup = Array.from(app.querySelectorAll<HTMLElement>(".nav-project-group")).find(
      (el) => el.querySelector(".nav-project-group__text")?.textContent?.trim() === "PPV",
    );
    const addButton = repoGroup?.querySelector<HTMLButtonElement>(".nav-project-group__add");
    expect(addButton).not.toBeNull();
    addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    await app.updateComplete;

    expect(app.lastError).toBeNull();
    expect(app.missionControlRegistry.treeNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parentId: "repo:ppv",
          kind: "module",
          label: "Operator OS",
        }),
      ]),
    );
  });

  it("adds chat nodes directly under project folders", async () => {
    setViewport(1440, 900);
    const app = mountApp("/chat");
    app.missionControlRegistry = {
      id: "ppv",
      name: "Prime Property Ventures",
      domains: [],
      sessionLanes: [],
      intakeRoutes: [],
      treeNodes: [
        {
          id: "workspace:ppv",
          parentId: null,
          kind: "workspace",
          label: "Prime Property Ventures Workspace",
        },
        {
          id: "repo:ppv",
          parentId: "workspace:ppv",
          kind: "repo",
          label: "PPV",
        },
        {
          id: "module:operator-os",
          parentId: "repo:ppv",
          kind: "module",
          label: "Operator OS",
        },
      ],
    };
    app.applySettings({
      ...app.settings,
      navGroupsCollapsed: {
        ...app.settings.navGroupsCollapsed,
        project: false,
        "tree:workspace:ppv": false,
        "tree:repo:ppv": false,
        "tree:module:operator-os": false,
      },
    });
    await app.updateComplete;

    vi.spyOn(window, "prompt").mockReturnValueOnce("Discovery");

    const moduleGroup = Array.from(app.querySelectorAll<HTMLElement>(".nav-project-group")).find(
      (el) => el.querySelector(".nav-project-group__text")?.textContent?.trim() === "Operator OS",
    );
    const addButton = moduleGroup?.querySelector<HTMLButtonElement>(
      ".nav-project-action--add-chat",
    );
    expect(addButton).not.toBeNull();
    addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    await app.updateComplete;

    expect(app.lastError).toBeNull();
    expect(app.missionControlRegistry.treeNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parentId: "module:operator-os",
          kind: "chat-module",
          label: "Discovery",
        }),
      ]),
    );
    expect(
      Array.from(app.querySelectorAll(".nav-project-group__text")).some(
        (el) => el.textContent?.trim() === "Discovery",
      ),
    ).toBe(true);
  });

  it("spawns ACP sessions from the folder's main chat context", async () => {
    setViewport(1440, 900);
    const app = mountApp("/chat");
    const request = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === "sessions.create") {
        expect(params).toMatchObject({
          agentId: "prime-salesforce-dev",
          parentSessionKey: "agent:main:dashboard:main-chat",
        });
        expect(String(params?.message ?? "")).toContain("Investigate the SMS leak");
        return { ok: true, key: "agent:main:dashboard:acp-patch" };
      }
      if (method === "sessions.list") {
        return {
          ts: 1,
          path: "",
          count: 2,
          defaults: { modelProvider: null, model: null, contextTokens: null },
          sessions: [
            {
              key: "agent:main:dashboard:main-chat",
              kind: "direct",
              updatedAt: 20,
            },
            {
              key: "agent:main:dashboard:acp-patch",
              kind: "direct",
              updatedAt: 10,
              spawnedBy: "agent:main:dashboard:main-chat",
            },
          ],
        };
      }
      if (method === "chat.history") {
        return { messages: [], thinkingLevel: null };
      }
      return {};
    });
    app.client = { request, stop: vi.fn() } as never;
    app.connected = true;
    app.sessionKey = "agent:main:dashboard:main-chat";
    app.chatMessages = [
      {
        role: "user",
        content: [{ type: "text", text: "Investigate the SMS leak in Twilio sync." }],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "We should isolate the leak, patch it, and validate the fix." },
        ],
      },
    ];
    app.missionControlRegistry = {
      id: "ppv",
      name: "Prime Property Ventures",
      domains: [],
      sessionLanes: [],
      intakeRoutes: [],
      treeNodes: [
        {
          id: "workspace:ppv",
          parentId: null,
          kind: "workspace",
          label: "Prime Property Ventures Workspace",
        },
        {
          id: "repo:salesforce",
          parentId: "workspace:ppv",
          kind: "repo",
          label: "Salesforce",
          linkedDomainId: "salesforce",
        },
        {
          id: "module:sms",
          parentId: "repo:salesforce",
          kind: "module",
          label: "SMS",
        },
        {
          id: "module:sms-leak",
          parentId: "module:sms",
          kind: "module",
          label: "SMS Leak",
        },
        {
          id: "chat:main",
          parentId: "module:sms-leak",
          kind: "chat-module",
          label: "Main Chat",
          linkedSessionKey: "agent:main:dashboard:main-chat",
        },
        {
          id: "acp:patch",
          parentId: "module:sms-leak",
          kind: "acp-module",
          label: "Patch Worker",
        },
      ],
    };
    app.applySettings({
      ...app.settings,
      navGroupsCollapsed: {
        ...app.settings.navGroupsCollapsed,
        project: false,
        "tree:workspace:ppv": false,
        "tree:repo:salesforce": false,
        "tree:module:sms": false,
        "tree:module:sms-leak": false,
      },
    });
    await app.updateComplete;

    const acpRow = Array.from(
      app.querySelectorAll<HTMLButtonElement>(".nav-project-row--leaf"),
    ).find((button) => button.textContent?.includes("Patch Worker"));
    expect(acpRow).not.toBeNull();
    acpRow?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await nextFrame();
    await app.updateComplete;

    expect(request).toHaveBeenCalledWith(
      "sessions.create",
      expect.objectContaining({
        agentId: "prime-salesforce-dev",
        parentSessionKey: "agent:main:dashboard:main-chat",
      }),
    );
    expect(app.sessionKey).toBe("agent:main:dashboard:acp-patch");
  });

  it("removes a project subtree from the tree without deleting sessions", async () => {
    setViewport(1440, 900);
    const app = mountApp("/chat");
    app.missionControlRegistry = {
      id: "ppv",
      name: "Prime Property Ventures",
      domains: [],
      sessionLanes: [],
      intakeRoutes: [],
      treeNodes: [
        {
          id: "workspace:ppv",
          parentId: null,
          kind: "workspace",
          label: "Prime Property Ventures Workspace",
        },
        {
          id: "repo:ppv",
          parentId: "workspace:ppv",
          kind: "repo",
          label: "PPV",
        },
        {
          id: "module:operator-os",
          parentId: "repo:ppv",
          kind: "module",
          label: "Operator OS",
        },
      ],
    };
    app.applySettings({
      ...app.settings,
      selectedProjectRepo: "main",
      selectedProjectGroup: "module:operator-os",
      navGroupsCollapsed: {
        ...app.settings.navGroupsCollapsed,
        project: false,
        "tree:workspace:ppv": false,
        "tree:repo:ppv": false,
      },
    });
    await app.updateComplete;

    vi.spyOn(window, "confirm").mockReturnValueOnce(true);

    const repoGroup = Array.from(app.querySelectorAll<HTMLElement>(".nav-project-group")).find(
      (el) => el.querySelector(".nav-project-group__text")?.textContent?.trim() === "PPV",
    );
    const removeButton = repoGroup?.querySelector<HTMLButtonElement>(".nav-project-group__remove");
    expect(removeButton).not.toBeNull();
    removeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    await app.updateComplete;

    expect(app.lastError).toBeNull();
    expect(app.missionControlRegistry.treeNodes).toEqual([
      expect.objectContaining({
        id: "workspace:ppv",
        kind: "workspace",
      }),
    ]);
    expect(app.selectedProjectGroup).toBe("workspace:ppv");
  });

  it("hides section labels in collapsed mode", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    app.applySettings({ ...app.settings, navCollapsed: true });
    await app.updateComplete;

    expect(app.querySelector(".nav-section__label")).toBeNull();
    expect(app.querySelector(".sidebar-brand__logo")).toBeNull();
  });

  it("keeps footer utilities available in collapsed mode", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    app.applySettings({ ...app.settings, navCollapsed: true });
    await app.updateComplete;

    expect(app.querySelector(".sidebar-shell__footer")).not.toBeNull();
    expect(app.querySelector(".sidebar-utility-link")).not.toBeNull();
  });

  it("keeps the collapsed desktop rail compact", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    app.applySettings({ ...app.settings, navCollapsed: true });
    await app.updateComplete;

    const item = app.querySelector<HTMLElement>(".sidebar .nav-item");
    const header = app.querySelector<HTMLElement>(".sidebar-shell__header");
    const sidebar = app.querySelector<HTMLElement>(".sidebar");
    expect(item).not.toBeNull();
    expect(header).not.toBeNull();
    expect(sidebar).not.toBeNull();
    if (!item || !header || !sidebar) {
      return;
    }

    expect(sidebar.classList.contains("sidebar--collapsed")).toBe(true);
    expect(item.querySelector(".nav-item__icon")).not.toBeNull();
    expect(item.querySelector(".nav-item__text")).toBeNull();
    expect(app.querySelector(".sidebar-brand__copy")).toBeNull();
    expect(header.querySelector(".nav-collapse-toggle")).not.toBeNull();
  });

  it("resets to the main session when opening chat from sidebar navigation", async () => {
    const app = mountApp("/sessions?session=agent:main:subagent:task-123");
    await app.updateComplete;

    const link = app.querySelector<HTMLAnchorElement>('a.nav-item[href="/chat"]');
    expect(link).not.toBeNull();
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));

    await app.updateComplete;
    expect(app.tab).toBe("chat");
    expect(app.sessionKey).toBe("main");
    expect(window.location.pathname).toBe("/chat");
    expect(window.location.search).toBe("?session=main");
  });

  it("keeps chat and nav usable on narrow viewports", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    expect(window.matchMedia("(max-width: 768px)").matches).toBe(true);

    const split = app.querySelector(".chat-split-container");
    expect(split).not.toBeNull();
    if (split) {
      expect(getComputedStyle(split).position).not.toBe("fixed");
    }

    const chatMain = app.querySelector(".chat-main");
    expect(chatMain).not.toBeNull();
    if (chatMain) {
      expect(getComputedStyle(chatMain).display).not.toBe("none");
    }

    if (split) {
      split.classList.add("chat-split-container--open");
      await app.updateComplete;
      expect(split.classList.contains("chat-split-container--open")).toBe(true);
    }
    if (chatMain) {
      expect(chatMain).not.toBeNull();
    }
  });

  it("stacks the refreshed top navigation for narrow viewports", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    expect(window.matchMedia("(max-width: 768px)").matches).toBe(true);

    const shell = app.querySelector<HTMLElement>(".topnav-shell");
    const content = app.querySelector<HTMLElement>(".topnav-shell__content");
    expect(shell).not.toBeNull();
    expect(content).not.toBeNull();
    if (!shell || !content) {
      return;
    }

    expect(shell.classList.contains("topnav-shell")).toBe(true);
    expect(content.classList.contains("topnav-shell__content")).toBe(true);
    expect(shell.querySelector(".topbar-nav-toggle")).not.toBeNull();
    expect(shell.children[1]).toBe(content);
    expect(shell.querySelector(".topnav-shell__actions")).not.toBeNull();
  });

  it("keeps the mobile topbar nav toggle visible beside the search row", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    expect(window.matchMedia("(max-width: 768px)").matches).toBe(true);

    const shell = app.querySelector<HTMLElement>(".topnav-shell");
    const toggle = app.querySelector<HTMLElement>(".topbar-nav-toggle");
    const actions = app.querySelector<HTMLElement>(".topnav-shell__actions");
    expect(shell).not.toBeNull();
    expect(toggle).not.toBeNull();
    expect(actions).not.toBeNull();
    if (!shell || !toggle || !actions) {
      return;
    }

    expect(toggle.classList.contains("topbar-nav-toggle")).toBe(true);
    expect(actions.classList.contains("topnav-shell__actions")).toBe(true);
    expect(shell.firstElementChild).toBe(toggle);
    expect(shell.querySelector(".topbar-nav-toggle")).toBe(toggle);
    expect(actions.querySelector(".topbar-search")).not.toBeNull();
    expect(toggle.getAttribute("aria-label")).toBeTruthy();
  });

  it("opens the mobile sidenav as a drawer from the topbar toggle", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    expect(window.matchMedia("(max-width: 768px)").matches).toBe(true);

    const toggle = app.querySelector<HTMLButtonElement>(".topbar-nav-toggle");
    const shell = app.querySelector<HTMLElement>(".shell");
    const nav = app.querySelector<HTMLElement>(".shell-nav");
    expect(toggle).not.toBeNull();
    expect(shell).not.toBeNull();
    expect(nav).not.toBeNull();
    if (!toggle || !shell || !nav) {
      return;
    }

    expect(shell.classList.contains("shell--nav-drawer-open")).toBe(false);
    toggle.click();
    await app.updateComplete;

    expect(shell.classList.contains("shell--nav-drawer-open")).toBe(true);
    expect(nav.classList.contains("shell-nav")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes the mobile sidenav drawer after navigation", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    expect(window.matchMedia("(max-width: 768px)").matches).toBe(true);

    const toggle = app.querySelector<HTMLButtonElement>(".topbar-nav-toggle");
    expect(toggle).not.toBeNull();
    toggle?.click();
    await app.updateComplete;

    const link = app.querySelector<HTMLAnchorElement>('a.nav-item[href="/channels"]');
    const shell = app.querySelector<HTMLElement>(".shell");
    expect(link).not.toBeNull();
    expect(shell?.classList.contains("shell--nav-drawer-open")).toBe(true);
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));

    await app.updateComplete;
    expect(app.tab).toBe("channels");
    expect(shell?.classList.contains("shell--nav-drawer-open")).toBe(false);
  });

  it("auto-scrolls chat history to the latest message", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    const initialContainer: HTMLElement | null = app.querySelector(".chat-thread");
    expect(initialContainer).not.toBeNull();
    if (!initialContainer) {
      return;
    }
    initialContainer.style.maxHeight = "180px";
    initialContainer.style.overflow = "auto";
    let scrollTop = 0;
    Object.defineProperty(initialContainer, "clientHeight", {
      configurable: true,
      get: () => 180,
    });
    Object.defineProperty(initialContainer, "scrollHeight", {
      configurable: true,
      get: () => 2400,
    });
    Object.defineProperty(initialContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    initialContainer.scrollTo = ((options?: ScrollToOptions | number, y?: number) => {
      const top =
        typeof options === "number" ? (y ?? 0) : typeof options?.top === "number" ? options.top : 0;
      scrollTop = Math.max(0, Math.min(top, 2400 - 180));
    }) as typeof initialContainer.scrollTo;

    app.chatMessages = Array.from({ length: 60 }, (_, index) => ({
      role: "assistant",
      content: `Line ${index} - ${"x".repeat(200)}`,
      timestamp: Date.now() + index,
    }));

    await app.updateComplete;
    for (let i = 0; i < 6; i++) {
      await nextFrame();
    }

    const container = app.querySelector(".chat-thread");
    expect(container).not.toBeNull();
    if (!container) {
      return;
    }
    let finalScrollTop = 0;
    Object.defineProperty(container, "clientHeight", {
      value: 180,
      configurable: true,
    });
    Object.defineProperty(container, "scrollHeight", {
      value: 960,
      configurable: true,
    });
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      get: () => finalScrollTop,
      set: (value: number) => {
        finalScrollTop = value;
      },
    });
    Object.defineProperty(container, "scrollTo", {
      configurable: true,
      value: ({ top }: { top: number }) => {
        finalScrollTop = top;
      },
    });
    const targetScrollTop = container.scrollHeight;
    expect(targetScrollTop).toBeGreaterThan(container.clientHeight);
    app.chatMessages = [
      ...app.chatMessages,
      {
        role: "assistant",
        content: `Line 60 - ${"x".repeat(200)}`,
        timestamp: Date.now() + 60,
      },
    ];
    await app.updateComplete;
    for (let i = 0; i < 10; i++) {
      if (container.scrollTop === targetScrollTop) {
        break;
      }
      await nextFrame();
    }
    expect(container.scrollTop).toBe(targetScrollTop);
  });

  it("hydrates token from query params and strips them", async () => {
    const app = mountApp("/ui/overview?token=abc123");
    await app.updateComplete;

    expect(app.settings.token).toBe("abc123");
    expect(JSON.parse(localStorage.getItem("openclaw.control.settings.v1") ?? "{}").token).toBe(
      undefined,
    );
    expect(window.location.pathname).toBe("/ui/overview");
    expect(window.location.search).toBe("");
  });

  it("strips password URL params without importing them", async () => {
    const app = mountApp("/ui/overview?password=sekret");
    await app.updateComplete;

    expect(app.password).toBe("");
    expect(window.location.pathname).toBe("/ui/overview");
    expect(window.location.search).toBe("");
  });

  it("hydrates token from URL hash when settings already set", async () => {
    localStorage.setItem(
      "openclaw.control.settings.v1",
      JSON.stringify({ token: "existing-token", gatewayUrl: "wss://gateway.example/openclaw" }),
    );
    const app = mountApp("/ui/overview#token=abc123");
    await app.updateComplete;

    expect(app.settings.token).toBe("abc123");
    expect(JSON.parse(localStorage.getItem("openclaw.control.settings.v1") ?? "{}")).toMatchObject({
      gatewayUrl: "wss://gateway.example/openclaw",
    });
    expect(JSON.parse(localStorage.getItem("openclaw.control.settings.v1") ?? "{}").token).toBe(
      undefined,
    );
    expect(window.location.pathname).toBe("/ui/overview");
    expect(window.location.hash).toBe("");
  });

  it("hydrates token from URL hash and strips it", async () => {
    const app = mountApp("/ui/overview#token=abc123");
    await app.updateComplete;

    expect(app.settings.token).toBe("abc123");
    expect(JSON.parse(localStorage.getItem("openclaw.control.settings.v1") ?? "{}").token).toBe(
      undefined,
    );
    expect(window.location.pathname).toBe("/ui/overview");
    expect(window.location.hash).toBe("");
  });

  it("clears the current token when the gateway URL changes", async () => {
    const app = mountApp("/ui/overview#token=abc123");
    await app.updateComplete;

    const gatewayUrlInput = app.querySelector<HTMLInputElement>(
      'input[placeholder="ws://100.x.y.z:18789"]',
    );
    expect(gatewayUrlInput).not.toBeNull();
    gatewayUrlInput!.value = "wss://other-gateway.example/openclaw";
    gatewayUrlInput!.dispatchEvent(new Event("input", { bubbles: true }));
    await app.updateComplete;

    expect(app.settings.gatewayUrl).toBe("wss://other-gateway.example/openclaw");
    expect(app.settings.token).toBe("");
  });

  it("keeps a hash token pending until the gateway URL change is confirmed", async () => {
    const app = mountApp(
      "/ui/overview?gatewayUrl=wss://other-gateway.example/openclaw#token=abc123",
    );
    await app.updateComplete;

    expect(app.settings.gatewayUrl).not.toBe("wss://other-gateway.example/openclaw");
    expect(app.settings.token).toBe("");

    await confirmPendingGatewayChange(app);

    expectConfirmedGatewayChange(app);
  });

  it("keeps a query token pending until the gateway URL change is confirmed", async () => {
    const app = mountApp(
      "/ui/overview?gatewayUrl=wss://other-gateway.example/openclaw&token=abc123",
    );
    await app.updateComplete;

    expect(app.settings.gatewayUrl).not.toBe("wss://other-gateway.example/openclaw");
    expect(app.settings.token).toBe("");

    await confirmPendingGatewayChange(app);

    expectConfirmedGatewayChange(app);
  });

  it("restores the token after a same-tab refresh", async () => {
    const first = mountApp("/ui/overview#token=abc123");
    await first.updateComplete;
    first.remove();

    const refreshed = mountApp("/ui/overview");
    await refreshed.updateComplete;

    expect(refreshed.settings.token).toBe("abc123");
    expect(JSON.parse(localStorage.getItem("openclaw.control.settings.v1") ?? "{}").token).toBe(
      undefined,
    );
  });
});
