; Give the file classes created by Tauri's NSIS bundle distinct Explorer icons.
; The association helper creates these classes before NSIS_HOOK_POSTINSTALL runs.

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHELL_CONTEXT "Software\Classes\PDF Document\DefaultIcon" "" "$INSTDIR\file-pdf.ico"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Markdown Document\DefaultIcon" "" "$INSTDIR\file-markdown.ico"
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro UPDATEFILEASSOC
!macroend
