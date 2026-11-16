import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus } from "lucide-react";
import { api } from "../api";
import { today, validateInput } from "../domain";
import { statuses, type Application, type ApplicationInput } from "../types";
import { Modal } from "./ui";
export default function ApplicationForm({
  application,
  onClose,
  onSaved,
}: {
  application?: Application;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [input, setInput] = useState<ApplicationInput>(
    application
      ? { ...application }
      : {
          company: "",
          role: "",
          category: "Engineering",
          channel: "Company website",
          status: "Applied",
          applied_at: today(),
          decision_at: null,
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => api.save(input, application?.id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["applications"] });
      await client.invalidateQueries({ queryKey: ["dashboard"] });
      onSaved();
    },
  });
  const change = (key: keyof ApplicationInput, value: string) =>
    setInput((v) => ({
      ...v,
      [key]: value,
      ...(key === "status"
        ? { decision_at: value === "Rejected" ? "" : null }
        : {}),
    }));
  function submit(e: FormEvent) {
    e.preventDefault();
    const next = validateInput(input);
    setErrors(next);
    if (!Object.keys(next).length) save.mutate();
  }
  function field(
    key: keyof ApplicationInput,
    label: string,
    options?: string[],
  ) {
    return (
      <label className="field">
        <span>
          {label} <i>*</i>
        </span>
        {options ? (
          <select
            value={input[key] ?? ""}
            onChange={(e) => change(key, e.target.value)}
            aria-invalid={!!errors[key]}
            aria-describedby={errors[key] ? key + "-error" : undefined}
          >
            {[
              ...new Set([
                ...options,
                ...(input[key] ? [input[key] as string] : []),
              ]),
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        ) : (
          <input
            value={input[key] ?? ""}
            type={key.endsWith("_at") ? "date" : "text"}
            max={key.endsWith("_at") ? today() : undefined}
            maxLength={key.endsWith("_at") ? undefined : 160}
            placeholder={
              key === "company"
                ? "e.g. Linear"
                : key === "role"
                  ? "e.g. Frontend Engineer"
                  : ""
            }
            onChange={(e) => change(key, e.target.value)}
            aria-invalid={!!errors[key]}
            aria-describedby={errors[key] ? key + "-error" : undefined}
          />
        )}
        {errors[key] && (
          <small className="field-error" id={key + "-error"}>
            {errors[key]}
          </small>
        )}
      </label>
    );
  }
  return (
    <Modal
      title={application ? "Edit application" : "A new possibility"}
      description={
        application
          ? "Keep your application details up to date."
          : "Add an opportunity and keep your next chapter moving."
      }
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          {field("company", "Company")}
          {field("role", "Role")}
          {field("category", "Role category", [
            "Engineering",
            "Data",
            "Design",
            "Product",
            "Marketing",
            "Other",
          ])}
          {field("channel", "Channel", [
            "Company website",
            "LinkedIn",
            "Referral",
            "Recruiter",
            "Other",
          ])}
          {field("applied_at", "Application date")}
          {field("status", "Status", [...statuses])}
          {input.status === "Rejected" &&
            field("decision_at", "Rejection date")}
        </div>
        {save.error && (
          <p role="alert" className="field-error">
            {save.error.message}
          </p>
        )}
        <div className="modal-footer">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={save.isPending}>
            {save.isPending ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Plus size={16} />
            )}{" "}
            {save.isPending
              ? "Saving…"
              : application
                ? "Save changes"
                : "Add application"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
