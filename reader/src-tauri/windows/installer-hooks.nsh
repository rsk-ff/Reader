; Give the file classes created by Tauri's NSIS bundle distinct Explorer icons.
; The association helper creates these classes before NSIS_HOOK_POSTINSTALL runs.

!macro NSIS_HOOK_POSTINSTALL
  ; Keep both bundler-specific ProgID families in sync. Existing installations
  ; can leave the NSIS class active even when an MSI is used for the update.
  WriteRegStr SHELL_CONTEXT "Software\Classes\PDF Document\DefaultIcon" "" "$INSTDIR\file-pdf.ico"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Markdown Document\DefaultIcon" "" "$INSTDIR\file-markdown.ico"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Reader.pdf\DefaultIcon" "" "$INSTDIR\file-pdf.ico"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Reader.md\DefaultIcon" "" "$INSTDIR\file-markdown.ico"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Reader.markdown\DefaultIcon" "" "$INSTDIR\file-markdown.ico"
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro UPDATEFILEASSOC
!macroend
