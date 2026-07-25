/** Global search across the registers the signed-in person can reach. */
import { apiRequest } from "@/shared/api/client";

export type SearchResultKind = "project" | "task" | "person";

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export function search(term: string): Promise<{ results: SearchResult[] }> {
  return apiRequest(`/v1/search?q=${encodeURIComponent(term)}`);
}
