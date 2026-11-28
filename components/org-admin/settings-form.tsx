"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cs } from "@/lib/i18n/cs";
import type { OrgFormState } from "@/lib/orgs/state";

export type OwnerSettingsValues = {
  name: string;
  street: string;
  city: string;
  zip: string;
  country: string;
  logoUrl: string;
  primaryColor: string;
};

type Field = keyof OwnerSettingsValues;
const f = cs.orgAdmin.fields;

export function SettingsForm({
  initial,
  action,
}: {
  initial: OwnerSettingsValues;
  action: (prev: OrgFormState, formData: FormData) => Promise<OrgFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  const field = (name: Field) => (
    <div className="space-y-1">
      <Label htmlFor={`org-${name}`}>{f[name]}</Label>
      <Input
        id={`org-${name}`}
        name={name}
        defaultValue={state.values?.[name] ?? initial[name]}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `org-${name}-error` : undefined}
      />
      {errors[name] ? (
        <p id={`org-${name}-error`} role="alert" className="text-destructive text-xs">
          {errors[name]}
        </p>
      ) : null}
    </div>
  );

  return (
    <form action={formAction} className="space-y-6">
      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">{cs.orgAdmin.sectionGeneral}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name")}
          {field("logoUrl")}
          {field("primaryColor")}
        </div>
      </fieldset>
      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">{cs.orgAdmin.sectionAddress}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("street")}
          {field("city")}
          {field("zip")}
          {field("country")}
        </div>
      </fieldset>
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
        {cs.platform.save}
      </Button>
    </form>
  );
}
