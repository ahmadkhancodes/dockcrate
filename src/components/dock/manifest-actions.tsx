"use client";
import { ArrowsClockwise, UploadSimple } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/app/api";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";

const ERRORS: Record<string, string> = {
  not_publishable: "This version is not publishable yet. Open the QA log to see which check is holding it.",
  manifest_invalid: "The manifest signature did not verify, so nothing was uploaded.",
  rings_not_configured: "Set the Pilot and Broad groups for this tenant first.",
  tenant_not_connected: "This tenant is not connected. Reconnect it first.",
  tenant_paused: "This tenant is paused.",
  no_previous_version: "There is no earlier version to roll back to.",
  not_rollbackable: "This version cannot be rolled back right now.",
  installer_download_not_available: "No reviewed installer URL exists for this version yet, so it cannot be packaged.",
  forbidden: "Your role does not allow this action.",
};

/** Roll back, publish, auto update and QA log for the selected app. Every failure shows a plain sentence. */
export function ManifestActions(props: {
  tenantId: string; slug: string; versionId: string; name: string; deploymentId: string | null; rollbackTo: { id: string; version: string } | null;
  canPublish: boolean; canOperate: boolean; autoUpdate: boolean; hasDeployment: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(kind: string, path: string, body: unknown, okText: string) {
    setBusy(kind);
    setMsg(null);
    const r = await api(path, { method: "POST", body });
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: ERRORS[r.code] ?? r.message });
    setMsg({ ok: true, text: okText });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {props.deploymentId && props.rollbackTo ? (
          <Button disabled={!props.canOperate} loading={busy === "rb"} onClick={() => run("rb", `/api/deployments/${props.deploymentId}/rollback`, { toDeploymentId: props.rollbackTo!.id }, `Rolled back to ${props.rollbackTo!.version}.`)}>
            <ArrowsClockwise size={16} aria-hidden /> Roll back to {props.rollbackTo.version}
          </Button>
        ) : props.canPublish ? (
          <Button disabled={!props.canOperate} loading={busy === "pub"} onClick={() => run("pub", "/api/deployments", { tenantId: props.tenantId, versionId: props.versionId }, "Published to Pilot.")}>
            <UploadSimple size={16} aria-hidden /> Publish to Pilot
          </Button>
        ) : null}
        <ButtonLink href={`/catalog/${props.slug}`} variant="secondary">Open QA log</ButtonLink>
      </div>
      {props.hasDeployment ? (
        <label className="flex min-h-11 items-center gap-3 body-6 text-text">
          <input type="checkbox" className="size-5 accent-[var(--color-action)]" defaultChecked={props.autoUpdate} disabled={!props.canOperate || busy === "au"}
            onChange={(e) => run("au", "/api/tenant-apps", { tenantId: props.tenantId, appSlug: props.slug, autoUpdate: e.target.checked }, e.target.checked ? "Auto update is on." : "Auto update is off.")} />
          Auto update {props.name} in this tenant
        </label>
      ) : null}
      {!props.canOperate ? <p className="caption-2 text-text-subtle">Your role can view this tenant but not publish or roll back.</p> : null}
      {msg ? <Notice tone={msg.ok ? "success" : "danger"}>{msg.text}</Notice> : null}
    </div>
  );
}
