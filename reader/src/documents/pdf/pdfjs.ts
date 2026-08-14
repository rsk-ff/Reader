// pdfjs-dist bootstrap: point the worker at the Vite-bundled URL once.
// v6 ships ESM-only; `?url` lets Vite emit the worker as a separate chunk.
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };
