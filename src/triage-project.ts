// Finds the Community Triage project's sections and custom fields by name.
// With { create: true } it also creates anything missing, so setup is safe
// to re-run. The app itself calls it with create: false and fails loudly.
import { asana, type CustomField } from "./asana.js";
import { config } from "./config.js";
import {
  FIELDS,
  NEEDS_REVIEW_SECTION,
  SIGNAL_TYPES,
  SOURCE_URL_FIELD,
  type FieldKey,
  type SignalType,
} from "./taxonomy.js";

export interface TriageProject {
  workspace: string;
  project: string;
  sections: Record<SignalType, string> & { needsReview: string };
  /** field key → { gid, options: label → enum option gid } */
  fields: Record<FieldKey, { gid: string; options: Record<string, string> }>;
  /** gid of the "Source URL" text field */
  sourceUrlField: string;
}

type Log = (msg: string) => void;
const quiet: Log = () => {};

export async function resolveTriageProject(
  { create = false, log = quiet }: { create?: boolean; log?: Log } = {},
): Promise<TriageProject> {
  const missing = (what: string) =>
    new Error(`${what} not found in Asana. Run \`npm run setup\` first.`);

  // Workspace
  const me = await asana.me();
  const workspace = config.ASANA_WORKSPACE_GID ?? me.workspaces[0]?.gid;
  if (!workspace) throw new Error("Your Asana user has no workspace.");

  // Project (created by hand in Asana; we don't create projects)
  const project = (await asana.projectsInWorkspace(workspace)).find(
    (p) => p.name === config.ASANA_PROJECT_NAME,
  );
  if (!project) {
    throw new Error(`Project "${config.ASANA_PROJECT_NAME}" not found. Create it in Asana first.`);
  }
  log(`Project: ${project.name} (${project.gid})`);

  // Sections: one per signal type plus "Needs review"
  let existing = await asana.sections(project.gid);
  const wanted = [...Object.values(SIGNAL_TYPES), NEEDS_REVIEW_SECTION];
  const sectionGid: Record<string, string> = {};
  for (const name of wanted) {
    let found = existing.find((s) => s.name === name);
    if (!found && create) {
      // Reuse Asana's default empty section instead of leaving it behind.
      const untitled = existing.find((s) => s.name === "Untitled section");
      found = untitled
        ? await asana.renameSection(untitled.gid, name)
        : await asana.createSection(project.gid, name);
      existing = existing.filter((s) => s !== untitled);
      log(`  + section ${name}`);
    }
    if (!found) throw missing(`Section "${name}"`);
    sectionGid[name] = found.gid;
  }

  // Custom fields: reuse a workspace field with the same name, else create it
  const onProject = await asana.projectFields(project.gid);
  const inWorkspace = create ? await asana.workspaceFields(workspace) : [];
  const fields = {} as TriageProject["fields"];

  for (const [key, spec] of Object.entries(FIELDS) as [FieldKey, (typeof FIELDS)[FieldKey]][]) {
    let field: CustomField | undefined = onProject.find((f) => f.name === spec.name);
    if (field && field.resource_subtype !== "enum") {
      throw new Error(
        `The project's "${spec.name}" field is a ${field.resource_subtype} field, but triage needs a dropdown. ` +
          `Remove it from the project in Asana, then run \`npm run setup\` again.`,
      );
    }
    if (!field && create) {
      field = inWorkspace.find((f) => f.name === spec.name);
      if (field && field.resource_subtype !== "enum") {
        throw new Error(`Workspace field "${spec.name}" exists but isn't a dropdown. Rename it or delete it.`);
      }
      field ??= await asana.createEnumField(workspace, spec.name, spec.options);
      await asana.addFieldToProject(project.gid, field.gid);
      log(`  + field ${spec.name}`);
    }
    if (!field) throw missing(`Custom field "${spec.name}"`);

    const options: Record<string, string> = {};
    for (const [label, color] of Object.entries(spec.options)) {
      let opt = field.enum_options?.find((o) => o.name === label && o.enabled);
      if (!opt && create) {
        opt = await asana.addEnumOption(field.gid, label, color);
        log(`  + option ${spec.name} → ${label}`);
      }
      if (!opt) throw missing(`Option "${label}" on field "${spec.name}"`);
      options[label] = opt.gid;
    }
    fields[key] = { gid: field.gid, options };
  }

  // Source URL: a plain text field
  let urlField = onProject.find((f) => f.name === SOURCE_URL_FIELD);
  if (urlField && urlField.resource_subtype !== "text") {
    throw new Error(`The project's "${SOURCE_URL_FIELD}" field must be a text field.`);
  }
  if (!urlField && create) {
    urlField = inWorkspace.find((f) => f.name === SOURCE_URL_FIELD && f.resource_subtype === "text");
    urlField ??= await asana.createTextField(workspace, SOURCE_URL_FIELD);
    await asana.addFieldToProject(project.gid, urlField.gid);
    log(`  + field ${SOURCE_URL_FIELD}`);
  }
  if (!urlField) throw missing(`Custom field "${SOURCE_URL_FIELD}"`);

  const bySignal = Object.fromEntries(
    (Object.keys(SIGNAL_TYPES) as SignalType[]).map((k) => [k, sectionGid[SIGNAL_TYPES[k]]!]),
  ) as Record<SignalType, string>;

  return {
    workspace,
    project: project.gid,
    sections: { ...bySignal, needsReview: sectionGid[NEEDS_REVIEW_SECTION]! },
    fields,
    sourceUrlField: urlField.gid,
  };
}
