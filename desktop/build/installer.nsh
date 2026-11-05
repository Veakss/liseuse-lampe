; Liseuse à la lampe : extra NSIS steps for electron-builder (nsis.include).
; Encoding: UTF-8 with BOM (NSIS needs the BOM to read accents).

!macro liseuseWithProgid EXT
  WriteRegNone SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "Liseuse.Document"
!macroend

!macro liseuseWithoutProgid EXT
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "Liseuse.Document"
!macroend

; Always a per-user install: no « pour tous les utilisateurs » page, no administrator prompt.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; « Ouvrir avec » only. One shared class (Liseuse.Document) is added to the OpenWithProgids list of each extension; the
; default value of the extension is never written, so the app does not become the default reader of .pdf or .txt (nor
; takes it from another app). The reader picks « Toujours utiliser cette application » herself if she wants it.
!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\Liseuse.Document" "" "Document de la Liseuse à la lampe"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Liseuse.Document\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Liseuse.Document\shell" "" "open"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Liseuse.Document\shell\open" "" "Ouvrir avec la Liseuse à la lampe"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Liseuse.Document\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  !insertmacro liseuseWithProgid epub
  !insertmacro liseuseWithProgid pdf
  !insertmacro liseuseWithProgid fb2
  !insertmacro liseuseWithProgid mobi
  !insertmacro liseuseWithProgid azw3
  !insertmacro liseuseWithProgid txt
  !insertmacro liseuseWithProgid docx
  !insertmacro liseuseWithProgid odt
  !insertmacro liseuseWithProgid rtf
  !insertmacro liseuseWithProgid cbz
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  !insertmacro liseuseWithoutProgid epub
  !insertmacro liseuseWithoutProgid pdf
  !insertmacro liseuseWithoutProgid fb2
  !insertmacro liseuseWithoutProgid mobi
  !insertmacro liseuseWithoutProgid azw3
  !insertmacro liseuseWithoutProgid txt
  !insertmacro liseuseWithoutProgid docx
  !insertmacro liseuseWithoutProgid odt
  !insertmacro liseuseWithoutProgid rtf
  !insertmacro liseuseWithoutProgid cbz
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Liseuse.Document"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
