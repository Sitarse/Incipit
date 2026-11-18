// Le lanceur d'Incipit (Incipit.exe, à la racine du dossier) : un double-clic ouvre l'appli, c'est-à-dire l'Electron de
// node_modules sur ce dossier, sans fenêtre de console. Il se repère depuis son propre emplacement : le dossier peut
// changer de place. Si Incipit tourne déjà, c'est lui qui répond (sa fenêtre revient devant). Compilé par
// launcher/build.js avec le compilateur C# fourni avec Windows, le logo dedans.
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("Incipit")]
[assembly: AssemblyDescription("Lance Incipit")]
[assembly: AssemblyProduct("Incipit")]
[assembly: AssemblyVersion("2.0.0.0")]
[assembly: AssemblyFileVersion("2.0.0.0")]

static class Lanceur
{
    [STAThread]
    static int Main(string[] args)
    {
        string dir = Path.GetDirectoryName(Application.ExecutablePath);
        string electron = Path.Combine(dir, "node_modules", "electron", "dist", "electron.exe");
        if (!File.Exists(electron))
        {
            MessageBox.Show("Electron est introuvable dans ce dossier.\nOuvre un terminal ici, lance « npm install », puis réessaie.",
                "Incipit", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }
        // Ce qu'on lui donne (un fichier lâché sur le lanceur) suit, entre guillemets
        string extra = string.Concat(args.Select(a => " \"" + a.Replace("\"", "") + "\""));
        try
        {
            Process.Start(new ProcessStartInfo(electron, "\"" + dir + "\"" + extra) { WorkingDirectory = dir, UseShellExecute = false });
            return 0;
        }
        catch (Exception e)
        {
            MessageBox.Show("Incipit n’a pas pu démarrer : " + e.Message, "Incipit", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
