// Thin typed layer over the official `asana` Node SDK (v3). The SDK's own
// types are mostly `any`, so every call we use is wrapped here once.
import Asana from "asana";
import { config } from "./config.js";

const client = Asana.ApiClient.instance;
client.authentications.token!.accessToken = config.ASANA_PAT;

const users = new Asana.UsersApi();
const projects = new Asana.ProjectsApi();
const sections = new Asana.SectionsApi();
const customFields = new Asana.CustomFieldsApi();
const fieldSettings = new Asana.CustomFieldSettingsApi();
const tasks = new Asana.TasksApi();

export interface Named {
  gid: string;
  name: string;
}
export interface EnumOption extends Named {
  enabled: boolean;
}
export interface CustomField extends Named {
  resource_subtype: string;
  enum_options?: EnumOption[];
}
export interface Task extends Named {
  permalink_url: string;
}
export interface TaskWithFields extends Named {
  completed: boolean;
  custom_fields: { gid: string; text_value?: string | null }[];
}

/** Follow Asana's pagination until every page is read. */
async function listAll<T>(label: string, first: () => Promise<any>): Promise<T[]> {
  const items: T[] = [];
  try {
    let page = await first();
    while (page?.data) {
      items.push(...page.data);
      page = typeof page.nextPage === "function" ? await page.nextPage() : null;
    }
  } catch (err: any) {
    const detail = err?.response?.body?.errors?.map((e: any) => e.message).join("; ");
    throw new Error(`Asana ${label} failed: ${detail ?? err?.message ?? err}`);
  }
  return items;
}

/** Turn SDK errors into readable messages with Asana's own error text. */
async function call<T>(label: string, fn: () => Promise<{ data: unknown }>): Promise<T> {
  try {
    return (await fn()).data as T;
  } catch (err: any) {
    const status = err?.status ?? err?.response?.status;
    const detail = err?.response?.body?.errors?.map((e: any) => e.message).join("; ");
    throw new Error(`Asana ${label} failed${status ? ` (${status})` : ""}: ${detail ?? err?.message ?? err}`);
  }
}

export const asana = {
  me: () =>
    call<Named & { workspaces: Named[] }>("get me", () =>
      users.getUser("me", { opt_fields: "name,workspaces.name" }),
    ),

  projectsInWorkspace: (workspace: string) =>
    call<Named[]>("list projects", () =>
      projects.getProjects({ workspace, archived: false, limit: 100, opt_fields: "name" }),
    ),

  sections: (project: string) =>
    call<Named[]>("list sections", () => sections.getSectionsForProject(project, { limit: 100 })),

  createSection: (project: string, name: string) =>
    call<Named>("create section", () =>
      sections.createSectionForProject(project, { body: { data: { name } } }),
    ),

  renameSection: (section: string, name: string) =>
    call<Named>("rename section", () => sections.updateSection(section, { body: { data: { name } } })),

  workspaceFields: (workspace: string) =>
    call<CustomField[]>("list workspace fields", () =>
      customFields.getCustomFieldsForWorkspace(workspace, {
        limit: 100,
        opt_fields: "name,resource_subtype,enum_options.name,enum_options.enabled",
      }),
    ),

  createEnumField: (workspace: string, name: string, options: Record<string, string>) =>
    call<CustomField>("create custom field", () =>
      customFields.createCustomField(
        {
          data: {
            workspace,
            name,
            resource_subtype: "enum",
            enum_options: Object.entries(options).map(([name, color]) => ({ name, color })),
          },
        },
        { opt_fields: "name,resource_subtype,enum_options.name,enum_options.enabled" },
      ),
    ),

  createTextField: (workspace: string, name: string) =>
    call<CustomField>("create custom field", () =>
      customFields.createCustomField(
        { data: { workspace, name, resource_subtype: "text" } },
        { opt_fields: "name,resource_subtype" },
      ),
    ),

  /** Every task in the project, completed or not, with custom field values. */
  allTasks: (project: string) =>
    listAll<TaskWithFields>("list tasks", () =>
      tasks.getTasksForProject(project, {
        limit: 100,
        opt_fields: "name,completed,custom_fields.gid,custom_fields.text_value",
      }),
    ),

  addEnumOption: (field: string, name: string, color: string) =>
    call<EnumOption>("add enum option", () =>
      customFields.createEnumOptionForCustomField(field, { body: { data: { name, color } } }),
    ),

  projectFields: async (project: string) =>
    (
      await call<{ custom_field: CustomField }[]>("list project fields", () =>
        fieldSettings.getCustomFieldSettingsForProject(project, {
          limit: 100,
          opt_fields: "custom_field.name,custom_field.resource_subtype,custom_field.enum_options.name,custom_field.enum_options.enabled",
        }),
      )
    ).map((s) => s.custom_field),

  addFieldToProject: (project: string, field: string) =>
    call<unknown>("add field to project", () =>
      projects.addCustomFieldSettingForProject({ data: { custom_field: field } }, project),
    ),

  createTask: (input: {
    name: string;
    notes: string;
    project: string;
    section: string;
    /** field gid → enum option gid, or text for text fields */
    customFields: Record<string, string>;
  }) =>
    call<Task>("create task", () =>
      tasks.createTask(
        {
          data: {
            name: input.name,
            notes: input.notes,
            projects: [input.project],
            memberships: [{ project: input.project, section: input.section }],
            custom_fields: input.customFields,
          },
        },
        { opt_fields: "name,permalink_url" },
      ),
    ),
};
