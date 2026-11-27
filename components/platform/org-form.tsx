"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cs } from "@/lib/i18n/cs";
import type { OrgFormValues } from "@/lib/orgs/form";
import type { OrgFormState } from "@/lib/orgs/state";

type Props = {
  mode: "create" | "edit";
  initial: OrgFormValues;
  action: (prev: OrgFormState, formData: FormData) => Promise<OrgFormState>;
};

type TextField = keyof Omit<OrgFormValues, "vatPayer">;

const f = cs.platform.fields;
const hints: Partial<Record<TextField, string>> = cs.platform.hints;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function OrgForm({ mode, initial, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const value = (name: TextField): string => state.values?.[name] ?? initial[name];

  const field = (name: TextField, opts: { readOnly?: boolean; inputMode?: "numeric" | "decimal" } = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`org-${name}`}>{f[name]}</Label>
      <Input
        id={`org-${name}`}
        name={name}
        defaultValue={value(name)}
        readOnly={opts.readOnly}
        inputMode={opts.inputMode}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `org-${name}-error` : undefined}
      />
      {hints[name] && !errors[name] ? (
        <p className="text-muted-foreground text-xs">{hints[name]}</p>
      ) : null}
      {errors[name] ? (
        <p id={`org-${name}-error`} role="alert" className="text-destructive text-xs">
          {errors[name]}
        </p>
      ) : null}
    </div>
  );

  const vatChecked = state.values ? state.values.vatPayer === "on" : initial.vatPayer;

  return (
    <form action={formAction} className="space-y-6">
      <Section title={cs.platform.sectionBilling}>
        {mode === "create" ? field("slug") : null}
        {field("name")}
        {field("legalName")}
        {field("ico", { inputMode: "numeric" })}
        {field("dic")}
        {field("street")}
        {field("city")}
        {field("zip")}
        {field("country")}
        <div className="flex items-center gap-2">
          <input
            id="org-vatPayer"
            name="vatPayer"
            type="checkbox"
            defaultChecked={vatChecked}
            className="size-4"
          />
          <Label htmlFor="org-vatPayer">{f.vatPayer}</Label>
        </div>
        {field("invoicePrefix")}
      </Section>

      <Section title={cs.platform.sectionFees}>
        {field("feePercent", { inputMode: "decimal" })}
        {field("feeFixedCzk", { inputMode: "decimal" })}
        {field("payoutDelayDays", { inputMode: "numeric" })}
      </Section>

      <Section title={cs.platform.sectionBranding}>
        {field("logoUrl")}
        {field("primaryColor")}
        {field("metaPixelId", { inputMode: "numeric" })}
      </Section>

      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.message ? (
        <p role="status" className="text-sm text-green-700">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {mode === "create" ? cs.platform.create : cs.platform.save}
      </Button>
    </form>
  );
}
