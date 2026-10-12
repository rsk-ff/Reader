export interface LocalLocation { name: string; path: string }
export interface CloudLocation extends LocalLocation { id: string; provider: "onedrive" | "dropbox" }
export interface LocalLocations { roots: LocalLocation[]; shortcuts: LocalLocation[]; cloud: CloudLocation[] }
export interface LocalEntry {
  name: string; path: string; is_dir: boolean;
  file_size: number | null; modified_at: number | null;
}
export interface LocalDirectory { path: string; parent: string | null; entries: LocalEntry[]; skipped: number }

export function documentType(path: string): "pdf" | "markdown" | "unknown" {
  if (/\.pdf$/i.test(path)) return "pdf";
  if (/\.(md|markdown)$/i.test(path)) return "markdown";
  return "unknown";
}
