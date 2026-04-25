import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Plus,
  CheckCircle2,
  XCircle,
  FileCheck,
  X,
  ChevronUp,
  ChevronDown,
  Pencil,
  Layers,
} from "lucide-react";
import {
  exposureProviderSchema,
  changePasswordSchema,
  type ExposureProviderInput,
  type ChangePasswordInput,
} from "@shared/schemas";
import type {
  ExposureProviderConfig,
  Settings as SettingsType,
  ProjectGroup,
  Project,
} from "@shared/types";
import {
  useGroups,
  useCreateGroup,
  useRenameGroup,
  useDeleteGroup,
  useReorderGroups,
  useReorderProjects,
} from "../hooks/useGroups";
import { useProjects } from "../hooks/useProjects";
import { api } from "../lib/api";
import { inputCls } from "../lib/styles";
import {
  resolveCloudflareBeforeSave,
  deployCloudflaredProject,
} from "../lib/cloudflare";
import {
  CloudflareProviderForm,
  type CloudflareProviderFormValue,
} from "../components/CloudflareProviderForm";

// ─── anchor sections ─────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "groups", label: "Project Groups" },
  { id: "account", label: "Account" },
  { id: "providers", label: "Providers" },
  { id: "data", label: "Data" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function AnchorNav({ active }: { active: SectionId }) {
  const scrollTo = (id: SectionId) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    window.location.hash = id;
  };

  return (
    <nav className="flex items-stretch gap-6 px-6 mb-8 border-b border-white/[0.22] sticky top-0 bg-background z-10">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => scrollTo(s.id)}
          className={`relative flex items-center py-3 text-sm font-medium transition-colors ${
            active === s.id
              ? "text-foreground"
              : "text-muted-foreground hover:text-muted-foreground"
          }`}
        >
          {s.label}
          <span
            className={`absolute bottom-0 left-0 right-0 h-0.5 bg-primary transition-opacity duration-200 ${
              active === s.id ? "opacity-100" : "opacity-0"
            }`}
          />
        </button>
      ))}
    </nav>
  );
}

// ─── section wrapper ──────────────────────────────────────────────────────────

function Section({
  id,
  heading,
  description,
  children,
  first,
}: {
  id: SectionId;
  heading: string;
  description: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <>
      {!first && <div className="h-px bg-white/[0.06] my-16" />}
      <section id={id} className="scroll-mt-14">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </section>
    </>
  );
}

// ─── setup check display ─────────────────────────────────────────────────────

interface SetupCheck {
  name: string;
  passed: boolean;
  message: string;
  resolution?: string;
}

interface ProviderSetupResult {
  allPassed: boolean;
  checks: SetupCheck[];
}

function SetupCheckDisplay({ result }: { result: ProviderSetupResult }) {
  return (
    <div className="mt-3 space-y-2">
      {result.checks.map((check) => (
        <div key={check.name} className="flex gap-3">
          {check.passed ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4ade80]" />
          ) : (
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgba(248,113,113,0.85)]" />
          )}
          <div>
            <span className="text-sm text-foreground">{check.name}</span>
            <span className="text-sm text-muted-foreground">
              {" "}
              — {check.message}
            </span>
            {!check.passed && check.resolution && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Fix: {check.resolution}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── provider type toggle ─────────────────────────────────────────────────────

function ProviderTypeToggle({
  value,
  onChange,
  disabled,
}: {
  value: "caddy" | "cloudflare";
  onChange: (t: "caddy" | "cloudflare") => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`inline-flex rounded-xl border border-white/[0.15] p-0.5 ${disabled ? "opacity-50" : ""}`}
    >
      {(["cloudflare", "caddy"] as const).map((type) => (
        <button
          key={type}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onChange(type)}
          className={`rounded-[10px] px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
            value === type
              ? "bg-primary/[0.15] text-primary"
              : "text-muted-foreground hover:text-muted-foreground"
          }`}
        >
          {type}
        </button>
      ))}
    </div>
  );
}

// ─── provider form ────────────────────────────────────────────────────────────

function ProviderForm({
  provider,
  formRef,
  onSubmit,
  onDirty,
}: {
  provider?: ExposureProviderConfig;
  formRef: React.RefObject<HTMLFormElement>;
  onSubmit: (data: ExposureProviderInput) => void;
  onDirty: () => void;
}) {
  const defaultType: "caddy" | "cloudflare" =
    (provider?.providerType as "caddy" | "cloudflare") ?? "cloudflare";
  const typeLabel = (t: "caddy" | "cloudflare") =>
    t === "cloudflare" ? "Cloudflare" : "Caddy";

  const [providerType, setProviderType] = useState<"caddy" | "cloudflare">(
    defaultType,
  );
  const [isPresaving, setIsPresaving] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    getValues,
  } = useForm<ExposureProviderInput>({
    resolver: zodResolver(exposureProviderSchema),
    defaultValues: {
      providerType: defaultType,
      name: provider?.name ?? typeLabel(defaultType),
      enabled: provider?.enabled ?? true,
      configuration: provider?.configuration ?? {},
    },
  });

  const currentConfig = watch("configuration");

  const [cfFormValue, setCfFormValue] = useState<CloudflareProviderFormValue>({
    apiToken: (provider?.configuration as any)?.apiToken ?? "",
    accountId: (provider?.configuration as any)?.accountId ?? "",
    tunnelId: (provider?.configuration as any)?.tunnelId ?? "__new__",
    tunnelName: "",
    deployContainer: true,
    adoptStackName: null,
  });

  const handleTypeChange = (type: "caddy" | "cloudflare") => {
    if (!provider && getValues("name") === typeLabel(providerType)) {
      setValue("name", typeLabel(type));
    }
    setProviderType(type);
    setValue("providerType", type);
    setValue(
      "configuration",
      type === "caddy" ? { apiUrl: "http://localhost:2019" } : {},
    );
  };

  const handleFormSubmit = handleSubmit(async (data) => {
    if (providerType === "cloudflare") {
      if (!cfFormValue.apiToken || !cfFormValue.accountId) {
        toast.error("Connect your token and select an account before saving");
        return;
      }
      if (
        cfFormValue.tunnelId === "__new__" &&
        !cfFormValue.tunnelName.trim()
      ) {
        toast.error("Enter a tunnel name");
        return;
      }
      setIsPresaving(true);
      try {
        const { tunnelId, tunnelToken } =
          await resolveCloudflareBeforeSave(cfFormValue);
        if (cfFormValue.deployContainer && tunnelToken)
          await deployCloudflaredProject(tunnelToken);
        onSubmit({
          ...data,
          configuration: {
            apiToken: cfFormValue.apiToken,
            accountId: cfFormValue.accountId,
            tunnelId,
          },
        });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to create tunnel",
        );
      } finally {
        setIsPresaving(false);
      }
      return;
    }
    onSubmit(data);
  });

  return (
    <form
      ref={formRef}
      onSubmit={handleFormSubmit}
      onChange={onDirty}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Type
        </label>
        <div>
          <ProviderTypeToggle
            value={providerType}
            onChange={handleTypeChange}
            disabled={!!provider}
          />
        </div>
        {!!provider && (
          <p className="text-xs text-muted-foreground">
            Provider type cannot be changed after creation.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Name
        </label>
        <input
          type="text"
          placeholder="e.g. My Caddy Server"
          className={inputCls}
          {...register("name")}
        />
        {errors.name && (
          <p className="text-xs text-[rgba(254,202,202,0.85)]">
            {errors.name.message}
          </p>
        )}
      </div>

      {providerType === "caddy" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            API URL
          </label>
          <input
            type="text"
            placeholder="http://localhost:2019"
            className={inputCls}
            value={(currentConfig as Record<string, string>).apiUrl ?? ""}
            onChange={(e) =>
              setValue("configuration", { apiUrl: e.target.value })
            }
          />
        </div>
      )}

      {providerType === "cloudflare" && (
        <CloudflareProviderForm value={cfFormValue} onChange={setCfFormValue} />
      )}

      {/* Hidden submit used by modal footer Save button via formRef.current.requestSubmit() */}
      <button
        type="submit"
        className="hidden"
        disabled={isPresaving}
        aria-hidden="true"
      />
    </form>
  );
}

// ─── provider modal ───────────────────────────────────────────────────────────

function ProviderModal({
  provider,
  onClose,
  onSave,
  isPending,
}: {
  provider?: ExposureProviderConfig;
  onClose: () => void;
  onSave: (data: ExposureProviderInput) => void;
  isPending: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target !== dialogRef.current) return;
    if (isDirtyRef.current && !window.confirm("Discard unsaved changes?"))
      return;
    onClose();
  };

  const handleCancel = () => {
    if (isDirtyRef.current && !window.confirm("Discard unsaved changes?"))
      return;
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onCancel={(e) => {
        e.preventDefault();
        handleCancel();
      }}
      className="m-auto w-full max-w-lg rounded-2xl border border-white/[0.22] bg-popover p-0 shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex flex-col" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.20] px-6 py-4 shrink-0">
          <h3 className="text-lg font-semibold text-foreground">
            {provider ? "Edit Provider" : "Add Provider"}
          </h3>
          <button
            type="button"
            onClick={handleCancel}
            className="text-muted-foreground transition-colors hover:text-muted-foreground"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          <ProviderForm
            provider={provider}
            formRef={formRef}
            onSubmit={(data) => {
              isDirtyRef.current = false;
              onSave(data);
            }}
            onDirty={() => {
              isDirtyRef.current = true;
            }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.20] px-6 py-4 shrink-0">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-muted-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => formRef.current?.requestSubmit()}
            className="rounded-xl bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

// ─── providers section ───────────────────────────────────────────────────────

function ProvidersSection() {
  const queryClient = useQueryClient();
  const [modalState, setModalState] = useState<
    { mode: "add" } | { mode: "edit"; provider: ExposureProviderConfig } | null
  >(null);
  const [setupResults, setSetupResults] = useState<
    Record<string, ProviderSetupResult>
  >({});
  const [checkingSetup, setCheckingSetup] = useState<Record<string, boolean>>(
    {},
  );
  const [deletingProviderId, setDeletingProviderId] = useState<string | null>(
    null,
  );

  const settingsQuery = useQuery<SettingsType>({
    queryKey: ["settings"],
    queryFn: () => api.get("/settings"),
  });

  const providersQuery = useQuery<ExposureProviderConfig[]>({
    queryKey: ["settings", "providers"],
    queryFn: () => api.get("/settings/exposure-providers"),
  });

  const createProvider = useMutation({
    mutationFn: (data: ExposureProviderInput) =>
      api.post("/settings/exposure-providers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setModalState(null);
      toast.success("Provider added");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Failed to add provider"),
  });

  const updateProvider = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExposureProviderInput }) =>
      api.put(`/settings/exposure-providers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setModalState(null);
      toast.success("Provider updated");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Failed to update provider"),
  });

  const deleteProvider = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/settings/exposure-providers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setDeletingProviderId(null);
      toast.success("Provider deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete provider");
      setDeletingProviderId(null);
    },
  });

  const setDefaultProvider = useMutation({
    mutationFn: (providerId: string | null) =>
      api.put("/settings", { defaultExposureProviderId: providerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Default provider updated");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Failed to update default provider"),
  });

  const runCheckSetup = async (provider: ExposureProviderConfig) => {
    setCheckingSetup((prev) => ({ ...prev, [provider.id]: true }));
    try {
      const result = await api.post<ProviderSetupResult>(
        "/settings/exposure-providers/check-setup",
        {
          providerType: provider.providerType,
          configuration: provider.configuration,
        },
      );
      setSetupResults((prev) => ({ ...prev, [provider.id]: result }));
    } catch (err: any) {
      toast.error(err.message || "Failed to check setup");
    } finally {
      setCheckingSetup((prev) => ({ ...prev, [provider.id]: false }));
    }
  };

  const providers = providersQuery.data ?? [];
  const settings = settingsQuery.data;
  const modalIsPending =
    (modalState?.mode === "add" && createProvider.isPending) ||
    (modalState?.mode === "edit" && updateProvider.isPending);

  return (
    <>
      <div className="flex items-center justify-end gap-4 mb-4">
        <button
          onClick={() => setModalState({ mode: "add" })}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-primary/[0.4] px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary/[0.08]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Provider
        </button>
      </div>

      {providersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading providers…</p>
      ) : providers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.22] px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No providers yet.{" "}
            <button
              onClick={() => setModalState({ mode: "add" })}
              className="text-primary hover:underline"
            >
              Add one
            </button>{" "}
            to expose your services.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.22] overflow-hidden">
          {providers.map((provider, i) => (
            <div
              key={provider.id}
              className={`px-5 py-4 ${i > 0 ? "border-t border-white/[0.24]" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-md font-medium text-foreground">
                      {provider.name}
                    </span>
                    {settings?.defaultExposureProviderId === provider.id && (
                      <span className="rounded-full bg-primary/[0.12] px-2 py-0.5 text-2xs font-medium uppercase tracking-[0.12em] text-primary">
                        Default
                      </span>
                    )}
                    {!provider.enabled && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {provider.providerType === "caddy"
                      ? "Caddy Reverse Proxy"
                      : "Cloudflare Tunnel"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {settings?.defaultExposureProviderId !== provider.id && (
                    <button
                      onClick={() => setDefaultProvider.mutate(provider.id)}
                      className="rounded-lg px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-muted-foreground"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    onClick={() => runCheckSetup(provider)}
                    disabled={checkingSetup[provider.id]}
                    className="rounded-lg px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-muted-foreground disabled:opacity-40"
                  >
                    {checkingSetup[provider.id] ? "Checking…" : "Check setup"}
                  </button>
                  <button
                    onClick={() => setModalState({ mode: "edit", provider })}
                    className="rounded-lg px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-muted-foreground"
                  >
                    Edit
                  </button>
                  {deletingProviderId === provider.id ? (
                    <div className="flex items-center gap-1.5 pl-1">
                      <span className="text-xs text-muted-foreground">
                        Delete?
                      </span>
                      <button
                        onClick={() => setDeletingProviderId(null)}
                        className="text-xs text-muted-foreground transition-colors hover:text-muted-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deleteProvider.mutate(provider.id)}
                        disabled={deleteProvider.isPending}
                        className="rounded-lg border border-[rgba(248,113,113,0.36)] px-2.5 py-0.5 text-xs text-[rgba(254,202,202,0.85)] transition-colors hover:bg-[rgba(127,29,29,0.20)] disabled:opacity-40"
                      >
                        {deleteProvider.isPending ? "Deleting…" : "Confirm"}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingProviderId(provider.id)}
                      className="rounded-lg px-2.5 py-1 text-xs text-muted-foreground/50 transition-colors hover:text-[rgba(248,113,113,0.75)]"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {setupResults[provider.id] && (
                <SetupCheckDisplay result={setupResults[provider.id]} />
              )}
            </div>
          ))}
        </div>
      )}

      {providers.length > 0 && settings?.defaultExposureProviderId && (
        <button
          onClick={() => setDefaultProvider.mutate(null)}
          className="mt-3 text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground"
        >
          Clear default provider
        </button>
      )}

      {/* Modal */}
      {modalState && (
        <ProviderModal
          provider={
            modalState.mode === "edit" ? modalState.provider : undefined
          }
          onClose={() => setModalState(null)}
          onSave={(data) => {
            if (modalState.mode === "add") createProvider.mutate(data);
            else updateProvider.mutate({ id: modalState.provider.id, data });
          }}
          isPending={modalIsPending}
        />
      )}
    </>
  );
}

// ─── groups section ──────────────────────────────────────────────────────────

function GroupsSection() {
  const { data: groups = [], isLoading } = useGroups();
  const { data: projects = [] } = useProjects();
  const createGroup = useCreateGroup();
  const renameGroup = useRenameGroup();
  const deleteGroup = useDeleteGroup();
  const reorderGroups = useReorderGroups();
  const reorderProjects = useReorderProjects();

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  const getGroupProjects = (groupId: string) =>
    [...projects]
      .filter((p) => p.groupId === groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  const startEdit = (group: ProjectGroup) => {
    setEditingGroupId(group.id);
    setEditingName(group.name);
  };

  const commitEdit = (group: ProjectGroup) => {
    if (editingName.trim() && editingName.trim() !== group.name) {
      renameGroup.mutate({ id: group.id, name: editingName.trim() });
    }
    setEditingGroupId(null);
  };

  const handleNewGroup = async () => {
    const group = await createGroup.mutateAsync("New Group");
    startEdit(group);
  };

  const moveGroupUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...groups];
    [newOrder[index - 1], newOrder[index]] = [
      newOrder[index],
      newOrder[index - 1],
    ];
    reorderGroups.mutate(newOrder.map((g) => g.id));
  };

  const moveGroupDown = (index: number) => {
    if (index === groups.length - 1) return;
    const newOrder = [...groups];
    [newOrder[index], newOrder[index + 1]] = [
      newOrder[index + 1],
      newOrder[index],
    ];
    reorderGroups.mutate(newOrder.map((g) => g.id));
  };

  const moveProjectUp = (groupId: string, projectIndex: number) => {
    if (projectIndex === 0) return;
    const gProjects = getGroupProjects(groupId);
    const newOrder = [...gProjects];
    [newOrder[projectIndex - 1], newOrder[projectIndex]] = [
      newOrder[projectIndex],
      newOrder[projectIndex - 1],
    ];
    reorderProjects.mutate(
      newOrder.map((p, i) => ({ id: p.id, groupId, sortOrder: i })),
    );
  };

  const moveProjectDown = (groupId: string, projectIndex: number) => {
    const gProjects = getGroupProjects(groupId);
    if (projectIndex === gProjects.length - 1) return;
    const newOrder = [...gProjects];
    [newOrder[projectIndex], newOrder[projectIndex + 1]] = [
      newOrder[projectIndex + 1],
      newOrder[projectIndex],
    ];
    reorderProjects.mutate(
      newOrder.map((p, i) => ({ id: p.id, groupId, sortOrder: i })),
    );
  };

  const moveProjectToGroup = (
    project: Project,
    targetGroupId: string | null,
  ) => {
    const targetProjects = projects.filter((p) => p.groupId === targetGroupId);
    reorderProjects.mutate([
      {
        id: project.id,
        groupId: targetGroupId,
        sortOrder: targetProjects.length,
      },
    ]);
  };

  const dotColor: Record<string, string> = {
    running: "#4ade80",
    stopped: "rgba(255,255,255,0.20)",
    starting: "#facc15",
    error: "#f87171",
  };

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={handleNewGroup}
          disabled={createGroup.isPending}
          className="flex items-center gap-1.5 rounded-xl border border-primary/[0.4] px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary/[0.08] disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          New Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.22] px-6 py-10 text-center">
          <div className="mb-3 flex justify-center">
            <Layers className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">
            Groups help you organize your projects.
          </p>
        </div>
      ) : (
        <div className="space-y-0">
          {groups.map((group, groupIndex) => {
            const gProjects = getGroupProjects(group.id);
            const isDeleting = deletingGroupId === group.id;
            const isEditing = editingGroupId === group.id;

            return (
              <div key={group.id}>
                <div
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${groupIndex === 0 ? "" : "mt-1"} bg-accent/80 border border-white/[0.24]`}
                >
                  <div className="flex flex-col">
                    <button
                      onClick={() => moveGroupUp(groupIndex)}
                      disabled={groupIndex === 0}
                      className="text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-20 transition-colors leading-none"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => moveGroupDown(groupIndex)}
                      disabled={groupIndex === groups.length - 1}
                      className="text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-20 transition-colors leading-none"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => commitEdit(group)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(group);
                        if (e.key === "Escape") setEditingGroupId(null);
                      }}
                      className="flex-1 rounded-lg border border-primary/[0.4] bg-primary/[0.06] px-2 py-0.5 text-sm text-foreground outline-none"
                    />
                  ) : (
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      <span className="truncate text-sm font-medium text-foreground">
                        {group.name}
                      </span>
                      <button
                        onClick={() => startEdit(group)}
                        className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
                    {gProjects.length}
                  </span>

                  {isDeleting ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Projects will become ungrouped.
                      </span>
                      <button
                        onClick={() => setDeletingGroupId(null)}
                        className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          deleteGroup.mutate(group.id);
                          setDeletingGroupId(null);
                        }}
                        disabled={deleteGroup.isPending}
                        className="rounded-lg border border-[rgba(248,113,113,0.36)] px-2.5 py-0.5 text-xs text-[rgba(254,202,202,0.85)] transition-colors hover:bg-[rgba(127,29,29,0.20)] disabled:opacity-40"
                      >
                        Confirm
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingGroupId(group.id)}
                      className="shrink-0 text-xs text-muted-foreground hover:text-[rgba(248,113,113,0.75)] transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {gProjects.length > 0 && (
                  <div className="ml-6 border-l border-white/[0.24] pl-3 mt-0.5 space-y-0.5 mb-1">
                    {gProjects.map((project, projectIndex) => (
                      <div
                        key={project.id}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex flex-col">
                          <button
                            onClick={() =>
                              moveProjectUp(group.id, projectIndex)
                            }
                            disabled={projectIndex === 0}
                            className="text-muted-foreground hover:text-muted-foreground disabled:opacity-20 transition-colors leading-none"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() =>
                              moveProjectDown(group.id, projectIndex)
                            }
                            disabled={projectIndex === gProjects.length - 1}
                            className="text-muted-foreground hover:text-muted-foreground disabled:opacity-20 transition-colors leading-none"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </div>

                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              dotColor[project.status] ??
                              "rgba(255,255,255,0.20)",
                          }}
                        />
                        <span className="flex-1 truncate text-sm text-muted-foreground">
                          {project.name}
                        </span>

                        <select
                          value={project.groupId ?? "__ungrouped__"}
                          onChange={(e) => {
                            const target =
                              e.target.value === "__ungrouped__"
                                ? null
                                : e.target.value;
                            moveProjectToGroup(project, target);
                          }}
                          className="appearance-none rounded-lg border border-white/[0.22] bg-transparent px-2 py-0.5 text-xs text-muted-foreground hover:border-white/[0.26] transition-colors cursor-pointer"
                        >
                          <option value={group.id}>{group.name}</option>
                          {groups
                            .filter((g) => g.id !== group.id)
                            .map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          <option value="__ungrouped__">(ungrouped)</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── data section ────────────────────────────────────────────────────────────

function DataSection() {
  const [isExporting, setIsExporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importConfirming, setImportConfirming] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/settings/export", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `labrador-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImportFile(file);
    setImportConfirming(false);
    setImportError(null);
  };

  const handleImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const text = await importFile.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/settings/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Import failed");
      }
      toast.success("Backup restored.");
      window.location.reload();
    } catch (err: any) {
      if (
        err.message?.includes("Invalid backup") ||
        err.message?.includes("JSON")
      ) {
        setImportError("That file doesn't look like a valid Labrador backup.");
      } else {
        setImportError(err.message || "Import failed. Please try again.");
      }
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setIsImporting(false);
      setImportConfirming(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Export */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-3">
          Export backup
        </p>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-xl border border-white/[0.15] px-4 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          {isExporting ? "Exporting…" : "Export backup"}
        </button>
      </div>

      {/* Import */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-3">
          Restore from backup
        </p>

        <div
          onClick={() => {
            if (!isImporting && !importFile) fileInputRef.current?.click();
          }}
          className={`rounded-2xl border border-dashed px-6 transition-colors ${
            importFile
              ? "flex items-center py-5 cursor-default border-white/[0.26]"
              : "flex flex-col items-center justify-center gap-2 py-8 cursor-pointer border-white/[0.15] hover:border-white/[0.25] hover:bg-accent/50"
          }`}
        >
          {importFile ? (
            <>
              <FileCheck className="h-4 w-4 shrink-0 text-[#4ade80]" />
              <span className="ml-3 flex-1 truncate text-sm text-foreground">
                {importFile.name}
              </span>
              <button
                type="button"
                disabled={isImporting}
                onClick={(e) => {
                  e.stopPropagation();
                  setImportFile(null);
                  setImportConfirming(false);
                  setImportError(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="ml-3 shrink-0 text-muted-foreground/50 transition-colors hover:text-muted-foreground disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Choose a backup file
              </p>
              <p className="text-xs text-muted-foreground/50">
                Click to browse
              </p>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Warning + import button */}
        {importFile && !importConfirming && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-[rgba(248,113,113,0.85)]">
              This will replace all projects, providers, and settings. Your
              current data cannot be recovered.
            </p>
            <button
              onClick={() => setImportConfirming(true)}
              className="rounded-xl border border-[rgba(248,113,113,0.36)] px-4 py-1.5 text-sm text-[rgba(254,202,202,0.85)] transition-colors hover:bg-[rgba(127,29,29,0.20)]"
            >
              Import
            </button>
          </div>
        )}

        {/* Two-step confirmation */}
        {importConfirming && (
          <div className="mt-4 flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Replace everything?
            </span>
            <button
              onClick={() => setImportConfirming(false)}
              className="text-sm text-muted-foreground transition-colors hover:text-muted-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="rounded-xl border border-[rgba(248,113,113,0.36)] px-4 py-1.5 text-sm text-[rgba(254,202,202,0.85)] transition-colors hover:bg-[rgba(127,29,29,0.20)] disabled:opacity-40"
            >
              {isImporting ? "Importing…" : "Yes, replace it"}
            </button>
          </div>
        )}

        {importError && (
          <p className="mt-3 text-sm text-[rgba(248,113,113,0.85)]">
            {importError}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── account section ─────────────────────────────────────────────────────────

function AccountSection() {
  const [successVisible, setSuccessVisible] = useState(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  const changePassword = useMutation({
    mutationFn: (data: ChangePasswordInput) =>
      api.put("/auth/password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      }),
    onSuccess: () => {
      reset();
      setSuccessVisible(true);
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccessVisible(false), 3000);
    },
    onError: (err: any) => {
      if (err?.status === 401) {
        setError("currentPassword", { message: "That password is incorrect." });
      } else {
        toast.error(err?.message ?? "Failed to update password");
      }
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => changePassword.mutate(data))}
      className="space-y-4 max-w-sm"
    >
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Current password
        </label>
        <input
          type="password"
          autoComplete="current-password"
          className={inputCls}
          {...register("currentPassword")}
        />
        {errors.currentPassword && (
          <p className="text-xs text-[rgba(254,202,202,0.85)]">
            {errors.currentPassword.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          New password
        </label>
        <input
          type="password"
          autoComplete="new-password"
          className={inputCls}
          {...register("newPassword")}
        />
        {errors.newPassword && (
          <p className="text-xs text-[rgba(254,202,202,0.85)]">
            {errors.newPassword.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Confirm new password
        </label>
        <input
          type="password"
          autoComplete="new-password"
          className={inputCls}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-[rgba(254,202,202,0.85)]">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-1">
        <span
          className={`flex items-center gap-1.5 text-sm text-[#4ade80] transition-opacity duration-300 ${
            successVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Password updated.
        </span>
        <button
          type="submit"
          disabled={isSubmitting || changePassword.isPending}
          className="rounded-xl bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {isSubmitting || changePassword.isPending
            ? "Saving…"
            : "Update password"}
        </button>
      </div>
    </form>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export function Settings() {
  const [activeSection, setActiveSection] = useState<SectionId>("groups");

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(id);
        },
        { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <div className="min-h-full max-w-2xl">
      <div className="px-6 pt-6">
        <h1 className="text-xl font-semibold text-foreground mb-6">Settings</h1>
      </div>
      <AnchorNav active={activeSection} />

      <div className="px-6 pb-6">
        <Section
          id="groups"
          heading="Project Groups"
          description="Organize your projects into named groups."
          first
        >
          <GroupsSection />
        </Section>

        <Section
          id="account"
          heading="Account"
          description="Change your login credentials."
        >
          <AccountSection />
        </Section>

        <Section
          id="providers"
          heading="Exposure Providers"
          description="Configure how your services are exposed to the internet."
        >
          <ProvidersSection />
        </Section>

        <Section
          id="data"
          heading="Data"
          description="Back up or restore your Labrador configuration — projects, providers, and settings."
        >
          <DataSection />
        </Section>
      </div>
    </div>
  );
}
