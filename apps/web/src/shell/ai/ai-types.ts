/**
 * Shared AI-panel types live beside the shell UI so future model adapters can
 * connect without coupling feature modules to assistant implementation details.
 */
export interface AiAssistantPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  /**
   * Suppresses the panel's own collapse control.
   *
   * Inside a handset sheet the sheet already supplies the one way out, and a
   * second dismiss button beside it would offer the same action twice with two
   * different icons.
   */
  hideOwnToggle?: boolean;
}
