' Lance Incipit sans aucune fenetre de terminal.
' Double-clic suffit : WScript.Shell.Run avec le mode 0 lance le programme
' cache, contrairement a un .bat qui fait clignoter une console noire.
'
' Passe par `uv run` : les dependances (Flask, pywebview) sont declarees en
' tete de app.py et installees toutes seules au premier lancement. Aucun
' chemin de python code en dur -- l'application doit suivre le dossier, pas
' rester attachee a la machine sur laquelle elle a ete ecrite.
'
' D'abord, verifie/installe les dependances systeme (uv, Chrome) via installer.py

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

' Ce script vit dans launchers/ : la racine du projet est un cran au-dessus.
racine = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))

' 1. Verifier/installer les dependances systeme (silencieux si deja OK)
uv = sh.ExpandEnvironmentStrings("%USERPROFILE%\.local\bin\uv.exe")
If Not fso.FileExists(uv) Then
    uv = "uv.exe"   ' installe ailleurs : on laisse le PATH le retrouver
End If

' Lancer l'installateur en mode silencieux (--check) pour verifier
' Si ca echoue, on tente l'installation complete (avec interface)
cmdCheck = """" & uv & """ run --script """ & racine & "\installer.py"" --check"
ret = sh.Run(cmdCheck, 0, True)
If ret <> 0 Then
    ' Dependance manquante : lancer l'installation complete avec interface visible
    cmdInstall = """" & uv & """ run --script """ & racine & "\installer.py"""
    sh.Run cmdInstall, 1, True
    ' Re-verifier
    sh.Run cmdCheck, 0, True
End If

' 2. Lancer l'application principale
' --script : app.py declare ses dependances dans son en-tete PEP 723.
sh.Run """" & uv & """ run --script """ & racine & "\app.py""", 0, False
