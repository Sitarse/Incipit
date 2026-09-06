' Lance Incipit sans aucune fenetre de terminal.
' Double-clic suffit : WScript.Shell.Run avec le mode 0 lance le programme
' cache, contrairement a un .bat qui fait clignoter une console noire.
'
' Passe par `uv run` : les dependances (Flask, pywebview) sont declarees en
' tete de app.py et installees toutes seules au premier lancement. Aucun
' chemin de python code en dur -- l'application doit suivre le dossier, pas
' rester attachee a la machine sur laquelle elle a ete ecrite.

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

' Ce script vit dans launchers/ : la racine du projet est un cran au-dessus.
racine = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))

uv = sh.ExpandEnvironmentStrings("%USERPROFILE%\.local\bin\uv.exe")
If Not fso.FileExists(uv) Then
    uv = "uv.exe"   ' installe ailleurs : on laisse le PATH le retrouver
End If

' --script : app.py declare ses dependances dans son en-tete PEP 723.
sh.Run """" & uv & """ run --script """ & racine & "\app.py""", 0, False
