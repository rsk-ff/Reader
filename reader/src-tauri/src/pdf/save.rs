//! Save entry point (§7). The atomic-write primitive lives in `pdfium.rs`
//! (`atomic_write`); this module is the future home of document-revision
//! management and sidecar recovery (spec §7, §26) — intentionally minimal here.
