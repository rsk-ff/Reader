/**
 * Deterministic policy helpers for PdfViewer hardening.
 *
 * These are pure functions so the loading/refit/portal decisions can be unit
 * tested without a DOM or a real PDF.js instance. They encode only the rules
 * approved in the hardening brief; no React or PDF.js state lives here.
 */

import type { PdfAnnotation } from "./annotation-types";
import type { AnnotationTool } from "./PdfAnnotationLayer";

/**
 * Decide whether a mounted PDF is eligible to begin (or keep) loading.
 *
 * A tab that has never been active must not start `getDocument`. The first time
 * it becomes active it loads once; after that, toggling `active` must not
 * destroy/reload the viewer — its scroll/zoom state is preserved. A previously
 * activated tab therefore stays eligible even while inactive.
 */
export function shouldLoadPdf(
  active: boolean,
  previouslyActivated: boolean,
): boolean {
  return active || previouslyActivated;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Decide whether a ResizeObserver callback warrants a refit/update.
 *
 * No work while inactive. No work for zero-size (collapsed/hidden) containers.
 * No work when the rounded size is unchanged. The first positive observation
 * (previous size {0,0}) is treated as a change so the initial fit is applied.
 */
export function shouldRefit(active: boolean, prev: Size, next: Size): boolean {
  if (!active) return false;
  if (!(next.width > 0) || !(next.height > 0)) return false;
  if (prev.width === 0 && prev.height === 0) return true;
  return (
    Math.round(next.width) !== Math.round(prev.width) ||
    Math.round(next.height) !== Math.round(prev.height)
  );
}

/**
 * Decide whether Reader's custom annotation portals need to be attached.
 *
 * Portals are disabled while the tab is inactive and also in active `select`
 * mode when there are no session-created annotations. They are enabled for any
 * creation tool (highlight/underline/strikeout/note/freetext/ink) or whenever a
 * page carries at least one annotation.
 */
export function shouldRenderPortals(
  active: boolean,
  tool: AnnotationTool,
  annotationsByPage: Record<number, PdfAnnotation[]>,
): boolean {
  if (!active) return false;
  if (tool !== "select") return true;
  for (const key in annotationsByPage) {
    if (annotationsByPage[key]?.length) return true;
  }
  return false;
}

export interface AnnotationHostIdentity {
  pageNumber: number;
  scale: number;
}

/**
 * Compare two annotation-host identity sets. Returns true when every entry
 * matches by page number and scale (the DOM element is stable per page within
 * one viewer generation, so it is not compared here). Used to skip redundant
 * `setHosts` updates that would otherwise re-portal identical overlays.
 */
export function hostsEqual(
  a: readonly AnnotationHostIdentity[],
  b: readonly AnnotationHostIdentity[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].pageNumber !== b[i].pageNumber) return false;
    if (a[i].scale !== b[i].scale) return false;
  }
  return true;
}
