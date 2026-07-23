/**
 * Shared AI-panel types live beside the shell UI so future model adapters can
 * connect without coupling feature modules to assistant implementation details.
 */
export interface AiAssistantPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

export interface AiContextChip {
  id: string;
  label: string;
}
