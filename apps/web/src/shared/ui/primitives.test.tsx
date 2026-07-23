/**
 * Shared UI primitive tests prove the reusable building blocks have real,
 * accessible behavior before feature pages depend on them.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  LoadingState,
  Modal,
  PageGrid,
  PageHeader,
  Select,
  Switch,
  Textarea,
  Toast,
  Toolbar,
} from "./index";

describe("shared UI primitives", () => {
  it("renders accessible buttons and handles clicks", async () => {
    const user = userEvent.setup();
    let clicks = 0;

    render(
      <Toolbar>
        <Button variant="primary" onClick={() => { clicks += 1; }}>
          Save
        </Button>
        <IconButton label="Open filters" onClick={() => { clicks += 1; }}>
          F
        </IconButton>
      </Toolbar>,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Open filters" }));

    expect(clicks).toBe(2);
  });

  it("renders validated form controls with labels and error state", async () => {
    const user = userEvent.setup();

    render(
      <form>
        <Field label="Project name" htmlFor="project-name" required error="Name is required">
          <Input id="project-name" invalid maxLength={120} />
        </Field>
        <Field label="Description" htmlFor="description" hint="Optional project summary">
          <Textarea id="description" />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" defaultValue="active">
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </Select>
        </Field>
        <Checkbox label="Track audit events" description="Recommended for production" />
        <Switch label="Enable module" />
      </form>,
    );

    const input = screen.getByLabelText(/project name/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Name is required")).toBeInTheDocument();

    await user.type(input, "New HQ");
    expect(input).toHaveValue("New HQ");
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /status/i })).toHaveValue("active");
    expect(screen.getByRole("checkbox", { name: /track audit events/i })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /enable module/i })).toBeInTheDocument();
  });

  it("renders layout primitives and status components", () => {
    render(
      <PageGrid columns={2}>
        <Card>
          <PageHeader title="Projects" eyebrow="Portfolio">
            Manage project records.
          </PageHeader>
          <Badge tone="success">Healthy</Badge>
        </Card>
        <EmptyState title="No projects" message="Create the first project." />
        <LoadingState title="Loading projects" />
        <ErrorState title="Unable to load" message="Try again." />
        <Toast title="Saved" message="Project updated." tone="success" />
      </PageGrid>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Projects" })).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("No projects")).toBeInTheDocument();
    expect(screen.getByText("Loading projects")).toBeInTheDocument();
    expect(screen.getByText("Unable to load")).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("renders data table rows and empty state", () => {
    const columns = [
      { id: "code", header: "Code", accessor: (row: { code: string; value: number }) => row.code },
      { id: "value", header: "Value", accessor: (row: { code: string; value: number }) => row.value, align: "end" as const },
    ];

    const { rerender } = render(
      <DataTable
        caption="Cost codes"
        columns={columns}
        rows={[{ code: "BOQ-001", value: 42 }]}
        getRowKey={(row) => row.code}
      />,
    );

    expect(screen.getByRole("table", { name: "Cost codes" })).toBeInTheDocument();
    expect(screen.getByText("BOQ-001")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();

    rerender(<DataTable columns={columns} rows={[]} getRowKey={(row) => row.code} />);
    expect(screen.getByText("No records found.")).toBeInTheDocument();
  });

  it("renders modal, confirm dialog, and drawer with accessible names", async () => {
    const user = userEvent.setup();
    let closed = 0;
    let confirmed = 0;

    render(
      <>
        <Drawer open title="Inspector" onClose={() => { closed += 1; }}>
          Details
        </Drawer>
        <Modal open title="Edit project" onClose={() => { closed += 1; }}>
          Form body
        </Modal>
        <ConfirmDialog
          open
          title="Delete project"
          onClose={() => { closed += 1; }}
          onConfirm={() => { confirmed += 1; }}
        >
          Confirm delete?
        </ConfirmDialog>
      </>,
    );

    expect(screen.getByLabelText("Inspector")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit project" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Delete project" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(confirmed).toBe(1);

    const [firstCloseButton] = screen.getAllByRole("button", { name: /close/i });
    expect(firstCloseButton).toBeDefined();
    await user.click(firstCloseButton as HTMLElement);
    expect(closed).toBe(1);
  });
});
