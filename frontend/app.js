// Interface de la fabrique de cours. Le HTML est la maquette telle quelle :
// ce fichier ne fait que la remplir avec ce que le backend expose reellement
// (moteurs, modeles, fichiers, cours recents) et renvoyer les actions.

const $ = (id) => document.getElementById(id);

async function json(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erreur || `Erreur ${res.status}`);
  return data;
}

// --- Vues ---
// Parametres et Aide ne sont pas des fenetres : elles prennent la place de la
// vue cours dans la meme surface. Une seule est visible a la fois, et l'entree
// de la barre laterale correspondante s'allume.
const VUES = {
  'vue-cours': 'lien-cours',
  'vue-parametres': 'link-parametres',
  'vue-aide': 'link-aide',
};

function montrer(vue) {
  Object.entries(VUES).forEach(([idVue, idLien]) => {
    const actif = idVue === vue;
    $(idVue)?.classList.toggle('hidden', !actif);
    const lien = $(idLien);
    if (!lien) return;
    lien.classList.toggle('bg-surface-container-high', actif);
    lien.classList.toggle('text-on-surface', actif);
    lien.classList.toggle('border-[#7c3aed]', actif);
    lien.classList.toggle('text-on-surface-variant', !actif);
    lien.classList.toggle('border-transparent', !actif);
  });
}

// --- Aide ---
const linkAide = $('link-aide');
const btnFermerAide = $('btn-fermer-aide');
const aideSidebarList = $('aide-sidebar-list');
const aideContentArea = $('aide-content-area');

// Modular Help Content (Easy to expand for new features)
const HELP_TOPICS = [
  {
    id: 'generer',
    title: 'Générer un cours',
    icon: 'auto_awesome',
    content: `
      <div class="mb-lg">
        <h2 class="font-display-lg text-display-lg text-on-surface mb-sm">Générer un cours</h2>
        <p class="font-body-lg text-body-lg text-on-surface-variant">Découvrez comment utiliser Course Factory pour transformer vos idées en parcours de formation structuré.</p>
      </div>
      <div class="space-y-xl text-on-surface-variant">
        <section>
          <h3 class="font-title-sm text-title-sm text-on-surface mb-md">Le processus</h3>
          <div class="space-y-sm">
            <div class="flex gap-md border border-[#333333] rounded-lg p-md bg-[#252525]">
              <div class="w-7 h-7 rounded-full bg-[#333333] flex items-center justify-center font-bold text-on-surface shrink-0 text-sm">1</div>
              <div>
                <h4 class="font-title-sm text-title-sm text-on-surface mb-xs">Ajoutez vos fichiers</h4>
                <p class="text-sm">Glissez vos supports (PDF, Word, texte...) : c'est la matière première dont l'IA s'inspire pour rédiger.</p>
              </div>
            </div>
            <div class="flex gap-md border border-[#333333] rounded-lg p-md bg-[#252525]">
              <div class="w-7 h-7 rounded-full bg-[#333333] flex items-center justify-center font-bold text-on-surface shrink-0 text-sm">2</div>
              <div>
                <h4 class="font-title-sm text-title-sm text-on-surface mb-xs">Précisez matière, type et contexte</h4>
                <p class="text-sm">Plus le champ « Contexte » est précis, plus le plan généré colle à ce que vous attendez.</p>
              </div>
            </div>
            <div class="flex gap-md border border-[#333333] rounded-lg p-md bg-[#252525]">
              <div class="w-7 h-7 rounded-full bg-[#333333] flex items-center justify-center font-bold text-on-surface shrink-0 text-sm">3</div>
              <div>
                <h4 class="font-title-sm text-title-sm text-on-surface mb-xs">Choisissez un moteur IA</h4>
                <p class="text-sm">Un moteur gratuit ou une clé API payante (voir l'aide « Moteurs IA »).</p>
              </div>
            </div>
            <div class="flex gap-md border border-[#333333] rounded-lg p-md bg-[#252525]">
              <div class="w-7 h-7 rounded-full bg-[#333333] flex items-center justify-center font-bold text-on-surface shrink-0 text-sm">4</div>
              <div>
                <h4 class="font-title-sm text-title-sm text-on-surface mb-xs">Générez</h4>
                <p class="text-sm">L'IA construit d'abord un plan puis rédige chaque section. Le cours final fait au plus 6 500 mots, pour rester lisible d'une traite.</p>
              </div>
            </div>
          </div>
          <div class="bg-[rgba(124,58,237,0.1)] border border-[rgba(124,58,237,0.3)] rounded-lg p-md flex gap-md items-start mt-md">
            <span class="material-symbols-outlined text-primary-container mt-1">lightbulb</span>
            <div>
              <h4 class="font-title-sm text-title-sm text-primary-container mb-xs">Astuce</h4>
              <p>Soyez le plus précis possible dans le champ 'Contexte' pour guider l'IA correctement.</p>
            </div>
          </div>
        </section>
      </div>`
  },
  {
    id: 'moteurs',
    title: 'Moteurs IA',
    icon: 'psychology',
    content: `
      <div class="mb-lg">
        <h2 class="font-display-lg text-display-lg text-on-surface mb-sm">Moteurs IA (Gratuit vs Payant)</h2>
        <p class="font-body-lg text-body-lg text-on-surface-variant">Comprendre la différence entre le mode standard et le mode avancé.</p>
      </div>
      <div class="space-y-md text-on-surface-variant">
        <p>L'application propose deux moteurs pour s'adapter à vos besoins et votre budget.</p>
        <ul class="list-disc pl-md space-y-sm">
          <li><strong class="text-on-surface">Gratuit (Standard) :</strong> Utilise les modèles ouverts ou l'IA locale pour générer le cours sans frais.</li>
          <li><strong class="text-on-surface">Payant (Premium / NVIDIA / Gemini) :</strong> Utilise des clés API externes. Vous payez à l'utilisation auprès du fournisseur (NVIDIA, Google, Anthropic).</li>
        </ul>
        <p class="mt-sm">Configurez vos clés API dans le menu <strong>Paramètres</strong> ou dans les <strong>Options Avancées</strong> de la carte Moteur IA.</p>
      </div>`
  },
  {
    id: 'obsidian',
    title: 'Obsidian (Coffre)',
    icon: 'auto_stories',
    content: `
      <div class="mb-lg">
        <h2 class="font-display-lg text-display-lg text-on-surface mb-sm">Intégration Obsidian</h2>
        <p class="font-body-lg text-body-lg text-on-surface-variant">Ouvrez directement vos cours générés dans Obsidian pour les lire, annoter et organiser.</p>
      </div>
      <div class="space-y-xl text-on-surface-variant">
        <section>
          <h3 class="font-title-sm text-title-sm text-on-surface mb-md">Qu'est-ce qu'Obsidian ?</h3>
          <p>Obsidian est une application de prise de notes puissante qui affiche vos fichiers Markdown avec mise en forme complète, graphes de liens, et bien plus. Incipit génère ses cours au format <code class="bg-[#2d2d2d] px-1 py-0.5 rounded text-xs">.md</code> — parfaitement compatible.</p>
        </section>
        <div class="bg-[rgba(124,58,237,0.1)] border border-[rgba(124,58,237,0.3)] rounded-lg p-md flex gap-md items-start">
          <span class="material-symbols-outlined text-primary-container mt-1 shrink-0">download</span>
          <div>
            <h4 class="font-title-sm text-title-sm text-primary-container mb-xs">Installation requise</h4>
            <p>Le bouton <em>Ouvrir dans Obsidian</em> nécessite qu'Obsidian soit installé sur votre PC. Si ce n'est pas encore fait, téléchargez-le gratuitement sur <a href="https://obsidian.md" target="_blank" class="text-violet-400 hover:text-violet-300 underline underline-offset-2">obsidian.md</a>.</p>
          </div>
        </div>
        <section>
          <h3 class="font-title-sm text-title-sm text-on-surface mb-md">Comment ça marche ?</h3>
          <div class="space-y-sm">
            <div class="flex gap-md border border-[#333333] rounded-lg p-md bg-[#252525]">
              <div class="w-7 h-7 rounded-full bg-[#333333] flex items-center justify-center font-bold text-on-surface shrink-0 text-sm">1</div>
              <div>
                <h4 class="font-title-sm text-title-sm text-on-surface mb-xs">Générez votre cours</h4>
                <p class="text-sm">Lancez la génération normalement. Le cours est sauvegardé dans votre dossier de sortie.</p>
              </div>
            </div>
            <div class="flex gap-md border border-[#333333] rounded-lg p-md bg-[#252525]">
              <div class="w-7 h-7 rounded-full bg-[#333333] flex items-center justify-center font-bold text-on-surface shrink-0 text-sm">2</div>
              <div>
                <h4 class="font-title-sm text-title-sm text-on-surface mb-xs">Cliquez sur "Ouvrir dans Obsidian"</h4>
                <p class="text-sm">Incipit ouvre automatiquement votre dossier de sortie comme un coffre Obsidian, avec le cours sélectionné.</p>
              </div>
            </div>
            <div class="flex gap-md border border-[#333333] rounded-lg p-md bg-[#252525]">
              <div class="w-7 h-7 rounded-full bg-[#333333] flex items-center justify-center font-bold text-on-surface shrink-0 text-sm">3</div>
              <div>
                <h4 class="font-title-sm text-title-sm text-on-surface mb-xs">Lisez et annotez</h4>
                <p class="text-sm">Dans Obsidian, vos cours s'affichent avec titres hiérarchisés, tableaux, formules mathématiques et diagrammes Mermaid.</p>
              </div>
            </div>
          </div>
        </section>
      </div>`
  },
  {
    id: 'journal',
    title: 'Journal',
    icon: 'description',
    content: `
      <div class="mb-lg">
        <h2 class="font-display-lg text-display-lg text-on-surface mb-sm">Journal</h2>
        <p class="font-body-lg text-body-lg text-on-surface-variant">L'application tourne sans console visible : le journal est l'endroit où retrouver ce qui s'est passé.</p>
      </div>
      <div class="space-y-md text-on-surface-variant">
        <p>Tout est enregistré dans un fichier texte : le démarrage, chaque ligne produite pendant une génération, et le détail des erreurs si quelque chose échoue.</p>
        <p>Ouvrez-le depuis <strong class="text-on-surface">Paramètres → Journal</strong> avec le bouton <em>Ouvrir le fichier de logs</em>. Utile surtout pour comprendre une génération qui a échoué sans message clair.</p>
      </div>`
  }
];

let currentHelpTopic = 'generer';

function renderHelpModal() {
  if(!aideSidebarList || !aideContentArea) return;
  
  // Render Sidebar
  aideSidebarList.innerHTML = HELP_TOPICS.map(topic => {
    const isActive = topic.id === currentHelpTopic;
    const baseClass = "flex items-center gap-sm py-2 px-3 transition-colors rounded-r-DEFAULT w-full text-left";
    const stateClass = isActive 
      ? "bg-[#2d2d2d] text-on-surface border-l-2 border-primary-container"
      : "text-on-surface-variant hover:bg-[#252525] hover:text-on-surface border-l-2 border-transparent";
    
    return `
      <li>
        <button data-topic="${topic.id}" class="help-nav-btn ${baseClass} ${stateClass}">
          <span class="material-symbols-outlined text-[20px]">${topic.icon}</span>
          <span class="font-body-md text-body-md">${topic.title}</span>
        </button>
      </li>
    `;
  }).join('');

  // Bind sidebar clicks
  aideSidebarList.querySelectorAll('.help-nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      currentHelpTopic = e.currentTarget.dataset.topic;
      renderHelpModal();
    });
  });

  // Render Content
  const topicData = HELP_TOPICS.find(t => t.id === currentHelpTopic);
  if(topicData) {
    aideContentArea.innerHTML = topicData.content;
  }
}

if (linkAide) {
  linkAide.addEventListener('click', (e) => {
    e.preventDefault();
    renderHelpModal();
    montrer('vue-aide');
  });
}

btnFermerAide?.addEventListener('click', () => montrer('vue-cours'));

// Icones "?" disseminees dans l'appli (bouton Obsidian, section Moteur IA, etc) :
// chacune ramene directement au sujet d'aide correspondant plutot qu'au sommaire.
function ouvrirAide(sujet) {
  currentHelpTopic = sujet;
  renderHelpModal();
  montrer('vue-aide');
}
document.querySelectorAll('[data-aide]').forEach((btn) => {
  btn.addEventListener('click', () => ouvrirAide(btn.dataset.aide));
});

const poster = (url, corps) => json(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corps),
});

// --- Messages "ne plus afficher" : confidentialite (avant chaque generation)
// et tutoriel (au demarrage). Le choix vit dans un petit JSON cote backend
// (config/messages_masques.json), relu au lancement par /api/messages_masques
// - pas en localStorage, remis a zero a chaque profil webview jetable.
const CLE_CONFIDENTIALITE = 'confidentialite';
const CLE_TUTORIEL = 'tutoriel';
let messagesMasques = {};
const confidentialiteMasquee = () => !!messagesMasques[CLE_CONFIDENTIALITE];
const tutorielMasque = () => !!messagesMasques[CLE_TUTORIEL];
const masquerMessage = (cle, masque) => {
  if (masque) messagesMasques[cle] = true; else delete messagesMasques[cle];
  poster('/api/messages_masques', { cle, masque }).catch(() => {});
};

// Le nom de fichier vient du disque : il peut contenir <, > ou des guillemets
// qui casseraient le HTML construit a la main juste en dessous.
const echapper = (s) => String(s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const taille = (ko) => (ko >= 1024 ? `${(ko / 1024).toFixed(1)} MB` : `${ko} KB`);

// --- Langue : liste a drapeaux ---
// Dessines en SVG et pas en emoji : Segoe UI Emoji n'a aucun glyphe de drapeau,
// Windows afficherait "FR", "GB"… a la place. Le <select> cache garde la valeur,
// la liste visible ne fait que le piloter.
const DRAPEAUX = {
  fr: '<rect width="20" height="14" fill="#fff"/><rect width="6.67" height="14" fill="#002654"/><rect x="13.33" width="6.67" height="14" fill="#ED2939"/>',
  en: '<rect width="20" height="14" fill="#012169"/>'
    + '<path d="M0 0 20 14M20 0 0 14" stroke="#fff" stroke-width="2.8"/>'
    + '<path d="M0 0 20 14M20 0 0 14" stroke="#C8102E" stroke-width="1.4"/>'
    + '<path d="M10 0V14M0 7H20" stroke="#fff" stroke-width="4.6"/>'
    + '<path d="M10 0V14M0 7H20" stroke="#C8102E" stroke-width="2.8"/>',
};

const drapeau = (code) => `<svg width="20" height="14" viewBox="0 0 20 14" class="rounded-[2px] ring-1 ring-white/15">${DRAPEAUX[code] || ''}</svg>`;

// --- Traductions UI ---
const UI_TRADUCTIONS = {
  fr: {
    // Navigation
    "nouveau_cours": "Nouveau cours",
    "dossier_sortie": "Dossier de sortie",
    "parametres": "Paramètres",
    "aide": "Aide",
    "recent_courses": "Cours récents",
    // Header
    "nouveau_cours_titre": "Nouveau cours",
    "generer_cours_desc": "Générez un cours structuré à partir de vos documents",
    "ouvrir_dans_obsidian": "Ouvrir dans Obsidian",
    "obsidian_requis": "Obsidian requis",
    "pas_encore_installe": "Pas encore installé ?",
    "telecharger_obsidian": "Téléchargez Obsidian sur obsidian.md",
    // Sections
    "infos_seance": "Informations de la séance",
    "matiere": "Matière",
    "selectionner_matiere": "Sélectionner une matière...",
    "nouvelle_matiere": "+ Nouvelle matière…",
    "titre_chapitre": "Titre du chapitre",
    "ex_intro_pointeurs": "Ex: Introduction aux pointeurs",
    "type_seance": "Type de séance",
    "cm_label": "CM (Cours Magistral)",
    "td_label": "TD (Travaux Dirigés)",
    "tp_label": "TP (Travaux Pratiques)",
    "photos_pdfs": "Photos et PDF du prof",
    "ouvrir_dossier": "Ouvrir le dossier",
    "ajouter_fichiers": "Ajouter des fichiers",
    "type_fichier": "Type",
    "nom_fichier": "Nom du fichier",
    "taille": "Taille",
    "action": "Action",
    "aucun_fichier": "Aucun fichier ajouté.",
    "generer_options": "Ce qu'on génère",
    "cours_principal": "Cours principal",
    "tp_interactif": "TP interactif",
    "fiche_revision": "Fiche de révision",
    "desc_cours": "Génère le cours structuré (Markdown + PDF)",
    "desc_tp": "Sujets progressifs, notés sur 100 — 5 questions sur tout le cours par défaut",
    "desc_fiche": "Résumé condensé du cours pour réviser vite",
    "niveau_exercices": "Niveau des exercices (TP, fiche)",
    "placeholder_niveau": "comme le cours — ex. débutant, licence 2, agrégation…",
    "tp_focus": "Sur quoi porte le TP (facultatif)",
    "placeholder_focus": "tout le cours — ex. les diagrammes de séquence",
    "nb_questions": "Nombre de questions (facultatif)",
    "moteur_ia": "Moteur IA",
    "modele_redaction": "Modèle de rédaction",
    "qui_lit_photos": "Qui lit tes photos ?",
    "transcripteur_auto": "Automatique  (NVIDIA)",
    "transcripteur_nemotron-omni": "NVIDIA Nemotron Omni  ·  recommandé",
    "transcripteur_kimi-k3": "NVIDIA Kimi K3",
    "transcripteur_gemini": "Google Gemini",
    "transcripteur_ocr": "NVIDIA Nemotron OCR v2  ·  texte imprimé",
    "cle_api": "Clé API",
    "coller_cle": "Colle ta clé ici",
    "enregistrer": "Enregistrer",
    "charger_liste": "Charger la liste",
    "cle_enregistree": "Clé enregistrée !",
    "options_avancees": "Options avancées & API",
    // Barre d'action
    "pret_generer": "Prêt à générer",
    "generer": "Générer",
    "ouvrir_cours": "Ouvrir le cours",
    "ajoutez_document": "Ajoutez au moins un document",
    // Modal TP
    "tp_titre": "TP",
    "exercice": "Exercice",
    "score": "Score : 0%",
    "palier": "Palier : ",
    "indice": "Indice",
    "solution": "Solution",
    "verifier": "Vérifier",
    "voir_solution": "Voir la solution",
    "suivant": "Suivant →",
    "ta_reponse": "Ta réponse…",
    "execution": "Exécution…",
    "tests_reussis": "test(s) réussi(s)",
    "erreur": "Erreur",
    "juste": "Juste",
    "faux": "Faux",
    "moitie": "À moitié",
    "idees_trouvees": "idée(s) attendue(s) repérée(s)",
    "manque": "manque",
    "auto_corrige": "Corrige-toi toi-même : as-tu eu juste ?",
    "tp_fini": "TP terminé",
    "par_palier": "Par palier",
    "par_notion": "Par notion",
    "v90": "le cours est acquis, jusqu'aux détails.",
    "v70": "l'essentiel est là ; reprends les paliers du bas.",
    "v40": "les bases tiennent, le fond reste à travailler.",
    "v0": "relis le cours avant de recommencer.",
    "fermer_tp": "Fermer le TP",
    "arreter_tp": "Ferme cette fenêtre pour arrêter le TP.",
    // Modals
    "avant_envoi": "Avant d'envoyer tes documents",
    "confidentialite_msg": "Tout ce que tu fournis (photos, PDF, titres) est envoyé au moteur d'IA sélectionné pour rédiger le cours. Selon le fournisseur, ces données peuvent être conservées et réutilisées pour entraîner leurs modèles — évite d'y mettre des informations personnelles, confidentielles ou soumises à un accord de confidentialité.",
    "ne_plus_afficher": "Ne plus afficher ce message",
    "annuler": "Annuler",
    "continuer": "Continuer",
    // Paramètres
    "general": "Général",
    "api_moteurs": "API & Moteurs",
    "journal": "Journal",
    "dossier_sortie_label": "Dossier de sortie",
    "ouvrir": "Ouvrir...",
    "emplacement_fichiers": "L'emplacement où les fichiers générés sont sauvegardés.",
    "longueur_cours": "Longueur des cours",
    "longueur_desc": "Chaque cours vise 6 500 mots au maximum, toutes sections comprises : au-delà, un cours devient long à lire et à corriger pour un gain de fond marginal.",
    "confidentialite": "Confidentialité",
    "confidentialite_desc": "Réaffiche l'avertissement sur les données envoyées au modèle d'IA, si tu avais coché « Ne plus afficher ce message ».",
    "reafficher_avertissement": "Réafficher l'avertissement",
    "tutoriel": "Tutoriel",
    "tutoriel_desc": "Réaffiche l'explication de démarrage, si tu avais coché « Ne plus afficher ce message ».",
    "reafficher_tutoriel": "Réafficher le tutoriel",
    "cle_nvidia": "Clé API NVIDIA NIM",
    "obtenir_cle_nvidia": "Obtenir une clé",
    "placeholder_nvidia": "nvapi-...",
    "cle_gemini": "Clé API Google Gemini",
    "obtenir_cle_gemini": "Obtenir une clé",
    "placeholder_gemini": "AIzaSy-...",
    "piston_api": "Piston API (sandbox code)",
    "documentation_piston": "Documentation",
    "placeholder_piston": "http://localhost:2000",
    "lancer_piston": "Lancer Piston : ",
    "tester_connexion": "Tester la connexion",
    "piston_accessible": "✓ Piston accessible",
    "piston_injoignable": "✗ ",
    // Aide
    "guide_utilisateur": "Guide Utilisateur",
    "generer_un_cours": "Générer un cours",
    "moteurs_ia": "Moteurs IA",
    "obsidian_coffre": "Obsidian (Coffre)",
    "journal_aide": "Journal",
    "le_processus": "Le processus",
    "ajoutez_fichiers": "Ajoutez vos fichiers",
    "ajoutez_fichiers_desc": "Glissez vos supports (PDF, Word, texte...) : c'est la matière première dont l'IA s'inspire pour rédiger.",
    "precisez_matiere": "Précisez matière, type et contexte",
    "precisez_matiere_desc": "Plus le champ « Contexte » est précis, plus le plan généré colle à ce que vous attendez.",
    "choisissez_moteur": "Choisissez un moteur IA",
    "choisissez_moteur_desc": "Un moteur gratuit ou une clé API payante (voir l'aide « Moteurs IA »).",
    "generez": "Générez",
    "generez_desc": "L'IA construit d'abord un plan puis rédige chaque section. Le cours final fait au plus 6 500 mots, pour rester lisible d'une traite.",
    "astuce": "Astuce",
    "astuce_desc": "Soyez le plus précis possible dans le champ 'Contexte' pour guider l'IA correctement.",
    "moteurs_gratuit_payant": "L'application propose deux moteurs pour s'adapter à vos besoins et votre budget.",
    "gratuit_standard": "Gratuit (Standard) : Utilise les modèles ouverts ou l'IA locale pour générer le cours sans frais.",
    "payant_premium": "Payant (Premium / NVIDIA / Gemini) : Utilise des clés API externes. Vous payez à l'utilisation auprès du fournisseur (NVIDIA, Google, Anthropic).",
    "configurez_cles": "Configurez vos clés API dans le menu Paramètres ou dans les Options Avancées de la carte Moteur IA.",
    "qu_est_ce_obsidian": "Qu'est-ce qu'Obsidian ?",
    "obsidian_desc": "Obsidian est une application de prise de notes puissante qui affiche vos fichiers Markdown avec mise en forme complète, graphes de liens, et bien plus. Incipit génère ses cours au format .md — parfaitement compatible.",
    "installation_requise": "Installation requise",
    "obsidian_install_desc": "Le bouton Ouvrir dans Obsidian nécessite qu'Obsidian soit installé sur votre PC. Si ce n'est pas encore fait, téléchargez-le gratuitement sur obsidian.md.",
    "comment_ca_marche": "Comment ça marche ?",
    "generez_votre_cours": "Générez votre cours",
    "generez_votre_cours_desc": "Lancez la génération normalement. Le cours est sauvegardé dans votre dossier de sortie.",
    "cliquez_ouvrir": "Cliquez sur \"Ouvrir dans Obsidian\"",
    "cliquez_ouvrir_desc": "Incipit ouvre automatiquement votre dossier de sortie comme un coffre Obsidian, avec le cours sélectionné.",
    "lisez_annotez": "Lisez et annotez",
    "lisez_annotez_desc": "Dans Obsidian, vos cours s'affichent avec titres hiérarchisés, tableaux, formules mathématiques et diagrammes Mermaid.",
    "journal_desc": "L'application tourne sans console visible : le journal est l'endroit où retrouver ce qui s'est passé.",
    "journal_log_desc": "Tout est enregistré dans un fichier texte : le démarrage, chaque ligne produite pendant une génération, et le détail des erreurs si quelque chose échoue.",
    "ouvrir_logs": "Ouvrir le fichier de logs",
    // Toast/feedback
    "cle_refusee": "Clé refusée : elle n'est pas écrite",
    "cle_enregistree_toast": "Clé enregistrée.",
    "interrogation_nvidia": "Interrogation de NVIDIA…",
    "modeles_ouverts": "modèles ouverts par cette clé.",
    // Prompt nouvelle matière
    "nom_nouvelle_matiere": "Nom de la nouvelle matière :",
    "retirer_fichier": "Retirer ",
    "confirmer_retirer": " ?",
    // Bouton supports
    "faire_tp": "Faire le TP",
    "prets_supports": "Prêt : ",
    "support_s": " support(s)",
    // Progress
    "preparation": "Préparation",
    "redaction_cours": "Rédaction du cours",
    "mise_en_page_pdf": "Mise en page du PDF",
    "generation_supports": "Génération des supports",
    "exercices_fiches": "Exercices et fiches",
    "supports_prets": "Supports prêts",
    "termine": "Terminé",
    "erreur_generation": "La génération a échoué",
    "erreur_supports": "Aucun support n'a été écrit.",
    "erreur_cours": "Aucun cours n'a été écrit.",
    "erreur_generation_cours": "La génération du cours a échoué",
    // Fermer
    "fermer": "Fermer",
    "fermer_aide": "Fermer l'aide",
    "fermer_parametres": "Fermer les paramètres",
    "cours": "Cours",
    // Ce que l'app ecrivait encore en dur : titres de vues, infobulles, cartes
    // moteur, messages de la modale TP. Les cles en _html portent leur balisage
    // (gras, lien, code) et se posent avec data-i18n-html.
    "aide_documentation": "Aide & Documentation",
    "journal_param_desc": "L'application ne garde aucune console ouverte : tout ce qu'elle fait (démarrage, génération ligne par ligne, erreurs) est écrit dans un fichier de log, utile si quelque chose se passe mal.",
    "bienvenue": "Bienvenue sur Incipit",
    "tuto_1": "<strong class=\"text-on-surface\">Choisis</strong> une matière, un type de séance et un titre en haut de l'écran.",
    "tuto_2": "<strong class=\"text-on-surface\">Ajoute</strong> tes documents (photos, PDF...) : ce sont eux qui servent de base au cours.",
    "tuto_3": "<strong class=\"text-on-surface\">Génère le cours</strong> : le bouton se change en « Ouvrir le résultat » une fois le PDF prêt.",
    "tuto_4": "<strong class=\"text-on-surface\">Exercices</strong> fabrique ensuite un TP interactif et une fiche à partir du cours généré.",
    "compris": "Compris",
    "longueur_desc_html": "Chaque cours vise <strong class=\"text-on-surface\">6 500 mots</strong> au maximum, toutes sections comprises : au-delà, un cours devient long à lire et à corriger pour un gain de fond marginal.",
    "lancer_piston_html": "Lancer Piston : <code class=\"bg-[#2d2d2d] px-1 py-0.5 rounded text-xs font-code\">docker run -d -p 2000:2000 ghcr.io/engineer-man/piston</code>",
    "demarrage": "Démarrage…",
    "pret": "prêt",
    "moteur": "Moteur",
    "cours_ecrits_dans": "Les cours sont écrits dans",
    "supprimer": "Supprimer",
    "aucun_exercice": "Aucun exercice dans ce TP.",
    "score_prefixe": "Score : ",
    "comptabilise": "Comptabilisé : ",
    "choisir_option": "Choisis au moins une option à générer.",
    "injoignable": "Injoignable",
    "erreur_verification": "Erreur de vérification",
    "url_enregistree": "URL enregistrée !",
    "obsidian_non_detecte": "Obsidian non détecté. Installez-le sur obsidian.md",
    "cle_deja_enregistree": "Une clé est déjà enregistrée.",
    "cle_de": "Clé",
    "enregistree": "enregistrée",
    "mots_cles_reperes": "mot(s)-clé(s) repéré(s)",
    "offre_gratuit": "GRATUIT",
    "offre_payant": "PAYANT",
    "badge_claude_cli": "Abonnement Claude Code",
    "desc_claude_cli": "Rédaction de très haute qualité (local, via Claude Code).",
    "badge_nvidia": "Clé perso",
    "desc_nvidia": "Génération rapide et performante avec ta propre clé.",
    "badge_claude_api": "Cloud, payant",
    "desc_claude_api": "Connexion directe au cloud Anthropic.",
    "titre_aide_generer": "Aide : générer un cours",
    "titre_aide_obsidian": "Aide : Obsidian",
    "titre_aide_moteurs": "Aide : moteurs IA et clés API",
    "titre_aide_journal": "Aide : journal",
    "titre_obsidian_requis": "Obsidian doit être installé pour utiliser cette fonctionnalité",
    "titre_generer": "Génère selon les options cochées ci-dessus",
    "titre_ouvrir_cours": "Ouvre le cours généré (Markdown ou PDF)",
    "titre_faire_tp": "Ouvre le TP généré pour ce cours",
    "aide_generer_intro": "Découvrez comment utiliser Incipit pour transformer vos idées en parcours de formation structuré.",
    "aide_moteurs_titre": "Moteurs IA (Gratuit vs Payant)",
    "aide_moteurs_intro": "Comprendre la différence entre le mode standard et le mode avancé.",
    "aide_obsidian_titre": "Intégration Obsidian",
    "aide_obsidian_intro": "Ouvrez directement vos cours générés dans Obsidian pour les lire, annoter et organiser.",
    "aide_journal_ouvrir": "Ouvrez-le depuis <strong class=\"text-on-surface\">Paramètres → Journal</strong> avec le bouton <em>Ouvrir le fichier de logs</em>. Utile surtout pour comprendre une génération qui a échoué sans message clair.",
  },
  en: {
    // Navigation
    "nouveau_cours": "New Course",
    "dossier_sortie": "Output Folder",
    "parametres": "Settings",
    "aide": "Help",
    "recent_courses": "Recent courses",
    // Header
    "nouveau_cours_titre": "New Course",
    "generer_cours_desc": "Generate a structured course from your documents",
    "ouvrir_dans_obsidian": "Open in Obsidian",
    "obsidian_requis": "Obsidian required",
    "pas_encore_installe": "Not installed yet?",
    "telecharger_obsidian": "Download Obsidian at obsidian.md",
    // Sections
    "infos_seance": "Session Information",
    "matiere": "Subject",
    "selectionner_matiere": "Select a subject...",
    "nouvelle_matiere": "+ New subject…",
    "titre_chapitre": "Chapter Title",
    "ex_intro_pointeurs": "Ex: Introduction to pointers",
    "type_seance": "Session Type",
    "cm_label": "Lecture",
    "td_label": "Tutorial",
    "tp_label": "Lab",
    "photos_pdfs": "Professor's Photos & PDFs",
    "ouvrir_dossier": "Open Folder",
    "ajouter_fichiers": "Add Files",
    "type_fichier": "Type",
    "nom_fichier": "File Name",
    "taille": "Size",
    "action": "Action",
    "aucun_fichier": "No files added.",
    "generer_options": "What to Generate",
    "cours_principal": "Main Course",
    "tp_interactif": "Interactive Lab",
    "fiche_revision": "Revision Sheet",
    "desc_cours": "Generates the structured course (Markdown + PDF)",
    "desc_tp": "Progressive exercises, scored out of 100 — 5 questions covering the whole course by default",
    "desc_fiche": "Condensed course summary for quick revision",
    "niveau_exercices": "Exercise Level (Lab, Sheet)",
    "placeholder_niveau": "like the course — e.g. beginner, undergrad, competitive exam…",
    "tp_focus": "Lab Focus (optional)",
    "placeholder_focus": "whole course — e.g. sequence diagrams",
    "nb_questions": "Number of Questions (optional)",
    "moteur_ia": "AI Engine",
    "modele_redaction": "Writing Model",
    "qui_lit_photos": "Who reads your photos?",
    "transcripteur_auto": "Automatic  (NVIDIA)",
    "transcripteur_nemotron-omni": "NVIDIA Nemotron Omni  ·  recommended",
    "transcripteur_kimi-k3": "NVIDIA Kimi K3",
    "transcripteur_gemini": "Google Gemini",
    "transcripteur_ocr": "NVIDIA Nemotron OCR v2  ·  printed text",
    "cle_api": "API Key",
    "coller_cle": "Paste your key here",
    "enregistrer": "Save",
    "charger_liste": "Load List",
    "cle_enregistree": "Key saved!",
    "options_avancees": "Advanced Options & API",
    // Barre d'action
    "pret_generer": "Ready to generate",
    "generer": "Generate",
    "ouvrir_cours": "Open Course",
    "ajoutez_document": "Add at least one document",
    // Modal TP
    "tp_titre": "Lab",
    "exercice": "Exercise",
    "score": "Score: 0%",
    "palier": "Tier: ",
    "indice": "Hint",
    "solution": "Solution",
    "verifier": "Check",
    "voir_solution": "View Solution",
    "suivant": "Next →",
    "ta_reponse": "Your answer…",
    "execution": "Running…",
    "tests_reussis": "test(s) passed",
    "erreur": "Error",
    "juste": "Correct",
    "faux": "Wrong",
    "moitie": "Half right",
    "idees_trouvees": "expected idea(s) found",
    "manque": "missing",
    "auto_corrige": "Grade yourself: did you get it right?",
    "tp_fini": "Lab finished",
    "par_palier": "By Tier",
    "par_notion": "By Topic",
    "v90": "the course is mastered, down to the details.",
    "v70": "the essentials are there; revisit the lower tiers.",
    "v40": "the basics hold, the depth needs work.",
    "v0": "read the course again before retrying.",
    "fermer_tp": "Close the Lab",
    "arreter_tp": "Close this window to stop the Lab.",
    // Modals
    "avant_envoi": "Before Sending Your Documents",
    "confidentialite_msg": "Everything you provide (photos, PDFs, titles) is sent to the selected AI engine to write the course. Depending on the provider, this data may be retained and reused to train their models — avoid including personal, confidential, or NDA-covered information.",
    "ne_plus_afficher": "Don't show this again",
    "annuler": "Cancel",
    "continuer": "Continue",
    // Paramètres
    "general": "General",
    "api_moteurs": "API & Engines",
    "journal": "Log",
    "dossier_sortie_label": "Output Folder",
    "ouvrir": "Open...",
    "emplacement_fichiers": "The location where generated files are saved.",
    "longueur_cours": "Course Length",
    "longueur_desc": "Each course targets 6,500 words maximum, all sections included: beyond that, a course becomes long to read and correct for marginal gain.",
    "confidentialite": "Privacy",
    "confidentialite_desc": "Redisplay the warning about data sent to the AI model, if you had checked \"Don't show this again\".",
    "reafficher_avertissement": "Redisplay Warning",
    "tutoriel": "Tutorial",
    "tutoriel_desc": "Redisplay the getting started explanation, if you had checked \"Don't show this again\".",
    "reafficher_tutoriel": "Redisplay Tutorial",
    "cle_nvidia": "NVIDIA NIM API Key",
    "obtenir_cle_nvidia": "Get a Key",
    "placeholder_nvidia": "nvapi-...",
    "cle_gemini": "Google Gemini API Key",
    "obtenir_cle_gemini": "Get a Key",
    "placeholder_gemini": "AIzaSy-...",
    "piston_api": "Piston API (code sandbox)",
    "documentation_piston": "Documentation",
    "placeholder_piston": "http://localhost:2000",
    "lancer_piston": "Run Piston: ",
    "tester_connexion": "Test Connection",
    "piston_accessible": "✓ Piston accessible",
    "piston_injoignable": "✗ ",
    // Aide
    "guide_utilisateur": "User Guide",
    "generer_un_cours": "Generate a Course",
    "moteurs_ia": "AI Engines",
    "obsidian_coffre": "Obsidian (Vault)",
    "journal_aide": "Log",
    "le_processus": "The Process",
    "ajoutez_fichiers": "Add Your Files",
    "ajoutez_fichiers_desc": "Drag your materials (PDF, Word, text...): this is the raw material the AI uses to write.",
    "precisez_matiere": "Specify Subject, Type & Context",
    "precisez_matiere_desc": "The more precise the \"Context\" field, the better the generated plan matches your expectations.",
    "choisissez_moteur": "Choose an AI Engine",
    "choisissez_moteur_desc": "A free engine or a paid API key (see \"AI Engines\" help).",
    "generez": "Generate",
    "generez_desc": "The AI first builds an outline then writes each section. The final course is at most 6,500 words, to remain readable in one sitting.",
    "astuce": "Tip",
    "astuce_desc": "Be as precise as possible in the 'Context' field to guide the AI correctly.",
    "moteurs_gratuit_payant": "The app offers two engines to suit your needs and budget.",
    "gratuit_standard": "Free (Standard): Uses open models or local AI to generate the course at no cost.",
    "payant_premium": "Paid (Premium / NVIDIA / Gemini): Uses external API keys. You pay per use to the provider (NVIDIA, Google, Anthropic).",
    "configurez_cles": "Configure your API keys in Settings or in the AI Engine card's Advanced Options.",
    "qu_est_ce_obsidian": "What is Obsidian?",
    "obsidian_desc": "Obsidian is a powerful note-taking app that displays your Markdown files with full formatting, link graphs, and more. Incipit generates courses in .md format — perfectly compatible.",
    "installation_requise": "Installation Required",
    "obsidian_install_desc": "The \"Open in Obsidian\" button requires Obsidian to be installed on your PC. If not yet installed, download it for free at obsidian.md.",
    "comment_ca_marche": "How It Works",
    "generez_votre_cours": "Generate Your Course",
    "generez_votre_cours_desc": "Run generation normally. The course is saved in your output folder.",
    "cliquez_ouvrir": "Click \"Open in Obsidian\"",
    "cliquez_ouvrir_desc": "Incipit automatically opens your output folder as an Obsidian vault, with the course selected.",
    "lisez_annotez": "Read & Annotate",
    "lisez_annotez_desc": "In Obsidian, your courses display with hierarchical headings, tables, math formulas, and Mermaid diagrams.",
    "journal_desc": "The app runs without a visible console: the log is where to find what happened.",
    "journal_log_desc": "Everything is written to a text file: startup, every line produced during generation, and error details if something fails.",
    "ouvrir_logs": "Open Log File",
    // Toast/feedback
    "cle_refusee": "Key rejected: not written",
    "cle_enregistree_toast": "Key saved.",
    "interrogation_nvidia": "Querying NVIDIA…",
    "modeles_ouverts": "models unlocked by this key.",
    // Prompt nouvelle matière
    "nom_nouvelle_matiere": "Name of the new subject:",
    "retirer_fichier": "Remove ",
    "confirmer_retirer": "?",
    // Bouton supports
    "faire_tp": "Do the Lab",
    "prets_supports": "Ready: ",
    "support_s": " support(s)",
    // Progress
    "preparation": "Preparation",
    "redaction_cours": "Writing Course",
    "mise_en_page_pdf": "PDF Layout",
    "generation_supports": "Generating Supports",
    "exercices_fiches": "Exercises & Sheets",
    "supports_prets": "Supports Ready",
    "termine": "Done",
    "erreur_generation": "Generation Failed",
    "erreur_supports": "No support was written.",
    "erreur_cours": "No course was written.",
    "erreur_generation_cours": "Course Generation Failed",
    // Fermer
    "fermer": "Close",
    "fermer_aide": "Close Help",
    "fermer_parametres": "Close Settings",
    "cours": "Course",
    "aide_documentation": "Help & Documentation",
    "journal_param_desc": "The app keeps no console open: everything it does (startup, generation line by line, errors) is written to a log file, useful if something goes wrong.",
    "bienvenue": "Welcome to Incipit",
    "tuto_1": "<strong class=\"text-on-surface\">Pick</strong> a subject, a session type and a title at the top of the screen.",
    "tuto_2": "<strong class=\"text-on-surface\">Add</strong> your documents (photos, PDFs...): they are what the course is built from.",
    "tuto_3": "<strong class=\"text-on-surface\">Generate the course</strong>: the button turns into \"Open result\" once the PDF is ready.",
    "tuto_4": "<strong class=\"text-on-surface\">Exercises</strong> then builds an interactive lab and a revision sheet from the generated course.",
    "compris": "Got it",
    "longueur_desc_html": "Each course targets <strong class=\"text-on-surface\">6,500 words</strong> maximum, all sections included: beyond that, a course becomes long to read and correct for marginal gain.",
    "lancer_piston_html": "Run Piston: <code class=\"bg-[#2d2d2d] px-1 py-0.5 rounded text-xs font-code\">docker run -d -p 2000:2000 ghcr.io/engineer-man/piston</code>",
    "demarrage": "Starting…",
    "pret": "ready",
    "moteur": "Engine",
    "cours_ecrits_dans": "Courses are written to",
    "supprimer": "Remove",
    "aucun_exercice": "No exercise in this lab.",
    "score_prefixe": "Score: ",
    "comptabilise": "Recorded: ",
    "choisir_option": "Pick at least one thing to generate.",
    "injoignable": "Unreachable",
    "erreur_verification": "Check failed",
    "url_enregistree": "URL saved!",
    "obsidian_non_detecte": "Obsidian not detected. Install it from obsidian.md",
    "cle_deja_enregistree": "A key is already saved.",
    "cle_de": "API key",
    "enregistree": "saved",
    "mots_cles_reperes": "keyword(s) found",
    "offre_gratuit": "FREE",
    "offre_payant": "PAID",
    "badge_claude_cli": "Claude Code subscription",
    "desc_claude_cli": "Very high quality writing (local, via Claude Code).",
    "badge_nvidia": "Own key",
    "desc_nvidia": "Fast, capable generation with your own key.",
    "badge_claude_api": "Cloud, paid",
    "desc_claude_api": "Direct connection to the Anthropic cloud.",
    "titre_aide_generer": "Help: generating a course",
    "titre_aide_obsidian": "Help: Obsidian",
    "titre_aide_moteurs": "Help: AI engines and API keys",
    "titre_aide_journal": "Help: log",
    "titre_obsidian_requis": "Obsidian must be installed to use this feature",
    "titre_generer": "Generates according to the options checked above",
    "titre_ouvrir_cours": "Opens the generated course (Markdown or PDF)",
    "titre_faire_tp": "Opens the lab generated for this course",
    "aide_generer_intro": "Learn how to use Incipit to turn your material into a structured course.",
    "aide_moteurs_titre": "AI Engines (Free vs Paid)",
    "aide_moteurs_intro": "Understand the difference between standard and advanced mode.",
    "aide_obsidian_titre": "Obsidian Integration",
    "aide_obsidian_intro": "Open your generated courses straight into Obsidian to read, annotate and organise them.",
    "aide_journal_ouvrir": "Open it from <strong class=\"text-on-surface\">Settings → Log</strong> with the <em>Open Log File</em> button. Mostly useful to understand a generation that failed without a clear message.",
  }
};

function applyTraductions(lang) {
  const t = UI_TRADUCTIONS[lang] || UI_TRADUCTIONS.fr;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key]) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.type === 'submit' || el.type === 'button') {
          el.value = t[key];
        } else {
          el.placeholder = t[key];
        }
      } else {
        el.textContent = t[key];
      }
    }
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml;
    if (t[key]) el.innerHTML = t[key];
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (t[key]) el.title = t[key];
  });
  // L'aide est entierement construite depuis T() a chaque rendu : la rejouer
  // suffit a la faire changer de langue, ouverte ou non.
  renderHelpModal();
  // Mettre à jour le texte de progression si pas en cours
  if (!etat.enCours && !$('progres-texte').textContent.includes('%')) {
    $('progres-texte').textContent = t.pret_generer;
  }
}

const ICONES = {
  '.pdf': ['picture_as_pdf', 'text-error'],
  '.jpg': ['image', 'text-primary'], '.jpeg': ['image', 'text-primary'],
  '.png': ['image', 'text-primary'], '.webp': ['image', 'text-primary'],
  '.gif': ['image', 'text-primary'], '.bmp': ['image', 'text-primary'],
};

// Capture avant toute mutation : rafraichir() s'en sert pour remettre le
// bouton en etat "Generer" quand on change de matiere/titre/type apres un
// premier cours termine, sinon "Ouvrir le resultat" resterait colle a un
// fichier qui n'est plus celui affiche.
const HTML_BTN_GENERER = $('btn-generer').innerHTML;

const etat = {
  matiere: '', type: 'CM', titre: '', moteur: null,
  transcripteur: null, fournisseurs: {}, cleOuverte: null,
  pdf: null, flux: null, enCours: false, exercicesPrets: false,
  langue: 'en',
};

// Un texte de l'interface dans la langue courante. Tout ce que le JS ecrit
// lui-meme passe par la (les elements statiques, eux, portent data-i18n).
// Repli sur le francais cle par cle : une traduction oubliee laisse la phrase
// francaise plutot qu'un trou dans l'interface.
const T = (cle) => (UI_TRADUCTIONS[etat.langue] || {})[cle]
  ?? UI_TRADUCTIONS.fr[cle] ?? cle;

// --- Selecteur de langue ---
// Apres `etat` et `HTML_BTN_GENERER`, pas avant : applyTraductions() les lit, et
// l'appeler plus haut jetait un ReferenceError de zone morte temporelle qui
// arretait net l'evaluation du fichier -- plus aucun ecouteur, plus aucun appel
// reseau, une fenetre vide.
const langSelect = $('lang-select');
const langBouton = $('lang-bouton');
const langListe = $('lang-liste');

if (langSelect && langBouton && langListe) {
  const langues = [...langSelect.options].map((o) => ({ code: o.value, nom: o.textContent }));

  const peindreLangue = () => {
    const l = langues.find((x) => x.code === langSelect.value) || langues[0];
    $('lang-drapeau').innerHTML = drapeau(l.code);
    $('lang-nom').textContent = l.nom;
  };

  langListe.innerHTML = langues.map((l) => `
    <li><button type="button" data-langue="${l.code}"
      class="flex items-center gap-sm w-full px-md py-sm text-left text-on-surface-variant hover:bg-[#2d2d2d] hover:text-on-surface transition-colors">
      ${drapeau(l.code)}<span class="font-body-md text-body-md">${echapper(l.nom)}</span>
    </button></li>`).join('');

  langListe.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      langSelect.value = b.dataset.langue;
      langSelect.dispatchEvent(new Event('change'));
      langListe.classList.add('hidden');
    });
  });

  langBouton.addEventListener('click', (e) => {
    e.stopPropagation();
    langListe.classList.toggle('hidden');
  });
  document.addEventListener('click', () => langListe.classList.add('hidden'));

  langSelect.addEventListener('change', () => {
    peindreLangue();
    etat.langue = langSelect.value;
    applyTraductions(langSelect.value);
    // Les cartes moteur, le tableau de fichiers et la ligne d'etat sont ecrits
    // par le JS : seul un nouveau rendu les fait changer de langue. Une fois les
    // moteurs connus seulement -- avant, il n'y a rien a redessiner.
    if (moteursConnus.length) chargerMoteurs();
  });
  peindreLangue();
  applyTraductions(langSelect.value);
}

function remplir(select, valeurs, valeur) {
  select.innerHTML = '';
  valeurs.forEach(({ code, libelle }) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = libelle;
    select.appendChild(opt);
  });
  select.value = valeur ?? '';
  // Le modele garde peut avoir disparu du catalogue rapporte du fournisseur :
  // sans ce repli le menu s'afficherait vide, sur rien.
  if (!select.value) select.value = select.options[0]?.value ?? '';
}

// ------------------------------------------------------------------ moteurs

// Fiche moteur sur une seule ligne : le choix se fait a la couleur et au nom,
// pas a la lecture. La description complete part en infobulle -- elle occupait
// deux lignes pour une information qu'on ne relit jamais apres le premier choix.
// nom = marque, jamais traduite. offre/badge/desc suivent la langue courante,
// d'ou une fonction plutot qu'un objet fige au chargement du script.
function moteursMeta() {
  const m = {
    'claude-cli': { nom: 'CLAUDE OPUS 5', offre: T('offre_payant'), couleur: '#7c3aed',
      icone: 'credit_card', badge: T('badge_claude_cli'),
      desc: T('desc_claude_cli') },
    'nvidia_nim': { nom: 'NVIDIA NIM', offre: T('offre_gratuit'), couleur: '#10b981',
      icone: 'dns', badge: T('badge_nvidia'),
      desc: T('desc_nvidia') },
    'claude_api': { nom: 'CLAUDE API', offre: T('offre_payant'), couleur: '#7c3aed',
      icone: 'cloud', badge: T('badge_claude_api'),
      desc: T('desc_claude_api') },
  };
  m.claude_cli = m['claude-cli'];
  m.gratuit = m.nvidia_nim;
  return m;
}

function carteMoteur(m, choisi) {
  const d = moteursMeta()[m.code] || { nom: m.nom, offre: T('offre_gratuit'), couleur: '#10b981',
    icone: 'dns', badge: m.sous_titre || '', desc: m.nom };

  const label = document.createElement('label');
  // La bordure garde la meme epaisseur selectionnee ou non : passer a border-2
  // decalait la carte d'un pixel a chaque clic.
  label.className = 'flex items-center gap-sm px-md py-sm rounded-lg bg-[#1e1e1e]'
    + ' cursor-pointer transition-colors group '
    + (choisi
      ? `border border-[${d.couleur}] ring-1 ring-inset ring-[${d.couleur}]/40`
      : 'border border-[#333333] hover:border-[#4a4455]');
  label.title = d.desc;

  const icone = choisi ? 'check_circle' : 'radio_button_unchecked';

  label.innerHTML = `
    <input type="radio" name="ai_engine" value="${echapper(m.code)}" class="hidden peer"${choisi ? ' checked' : ''}/>
    <span class="material-symbols-outlined text-[20px] shrink-0 ${choisi ? `text-[${d.couleur}]` : 'text-outline'}" data-icon="${icone}">${icone}</span>
    <span class="min-w-0 flex-1">
      <span class="flex items-center gap-xs">
        <span class="font-title-sm text-[15px] font-bold text-on-surface leading-tight truncate">${echapper(d.nom)}</span>
        <span class="shrink-0 px-[6px] py-[1px] rounded-full border bg-[${d.couleur}]/10 border-[${d.couleur}]/25 text-[${d.couleur}] font-bold text-[9px] uppercase tracking-widest">${echapper(d.offre)}</span>
      </span>
      <span class="flex items-center gap-xs text-on-surface-variant mt-[1px]">
        <span class="material-symbols-outlined text-[13px] shrink-0" data-icon="${d.icone}">${d.icone}</span>
        <span class="font-label-sm text-[11px] truncate">${echapper(d.badge)}</span>
      </span>
    </span>`;

  label.querySelector('input').addEventListener('change', () => {
    etat.moteur = m.code;
    chargerMoteurs();
    
    // Auto-open the advanced options panel
    const details = document.getElementById('options-avancees');
    if (details) {
      details.open = true;
    }
  });
  return label;
}

let moteursConnus = [];
let transcripteurs = [];
let catalogueNim = [];   // rempli seulement si on demande la liste reelle a NVIDIA

const fournisseurDe = (code) => transcripteurs.find((t) => t.code === code)?.fournisseur;

// La pastille dit d'ou vient le modele choisi et si sa cle est en place ; cliquer
// dessus ouvre la saisie de cette cle-la. Vert : le fournisseur repondra. Orange :
// la cle manque, le modele est choisi mais ne repondra pas.
function peindrePastille(bouton, code) {
  const f = code && etat.fournisseurs[code];
  bouton.classList.toggle('hidden', !f);
  bouton.classList.toggle('flex', !!f);
  if (!f) return;
  bouton.innerHTML = `
    <span class="w-2 h-2 rounded-full ${f.souci ? 'bg-[#fbbf24]' : 'bg-[#4ade80]'}"></span>
    <span>${echapper(f.nom)}</span>
    <span class="material-symbols-outlined text-[14px]" data-icon="vpn_key">vpn_key</span>`;
  bouton.title = f.souci || `Clé ${f.nom} enregistrée`;
  bouton.onclick = () => (etat.cleOuverte === code && !$('bloc-cle').classList.contains('hidden')
    ? fermerCle() : ouvrirCle(code));
}

function fermerCle() {
  etat.cleOuverte = null;
  $('bloc-cle').classList.add('hidden');
}

function ouvrirCle(code) {
  const f = etat.fournisseurs[code];
  if (!f) return fermerCle();
  etat.cleOuverte = code;
  $('cle-titre').textContent = `${T('cle_api')} ${f.nom}`;
  const champ = $('cle-valeur');
  champ.value = '';
  champ.placeholder = f.prefixe ? `${f.prefixe}…` : T('coller_cle');
  message(f.souci || T('cle_deja_enregistree'), f.souci ? '#fbbf24' : '#4ade80');
  // Le catalogue reel se demande a NVIDIA, et seulement une fois la cle posee.
  $('btn-catalogue').classList.toggle('hidden', code !== 'nim' || !!f.souci);
  $('bloc-cle').classList.remove('hidden');
  champ.focus();
}

function message(texte, couleur) {
  $('cle-message').textContent = texte;
  $('cle-message').style.color = couleur || '';
}

async function enregistrerCle() {
  const code = etat.cleOuverte;
  try {
    await poster('/api/cle', { fournisseur: code, valeur: $('cle-valeur').value });
  } catch (err) {
    return message(err.message, '#ffb4ab');   // cle refusee : elle n'est pas ecrite
  }
  $('cle-valeur').value = '';
  await chargerMoteurs();     // la cle change l'etat du moteur, pas que la pastille
  message('Clé enregistrée.', '#4ade80');
  $('btn-catalogue').classList.toggle('hidden', code !== 'nim');
}

async function chargerCatalogue() {
  message('Interrogation de NVIDIA…');
  try {
    catalogueNim = (await poster('/api/catalogue', { fournisseur: 'nim' })).modeles;
  } catch (err) {
    return message(err.message, '#ffb4ab');
  }
  await chargerMoteurs();
  message(`${catalogueNim.length} modèles ouverts par cette clé.`, '#4ade80');
}

async function chargerMoteurs() {
  const data = await json('/api/moteurs');
  moteursConnus = data.moteurs;
  transcripteurs = data.transcripteurs;
  etat.fournisseurs = data.fournisseurs;
  etat.transcripteur = etat.transcripteur || data.transcripteur;
  if (!etat.moteur || !moteursConnus.some((m) => m.code === etat.moteur)) {
    etat.moteur = data.defaut;
  }
  const liste = $('liste-moteurs');
  liste.innerHTML = '';
  // Reverse the array so 'gratuit' comes before 'claude-cli'
  [...moteursConnus].reverse().forEach((m) => liste.appendChild(carteMoteur(m, m.code === etat.moteur)));

  const courant = moteursConnus.find((m) => m.code === etat.moteur);
  // Le catalogue rapporte de NVIDIA remplace la liste connue : c'est ce que la
  // cle ouvre vraiment, la liste statique n'est qu'un ordre de preference.
  const modeles = (courant.fournisseur === 'nim' && catalogueNim.length)
    ? catalogueNim : courant.modeles;
  const select = $('model-select');
  remplir(select, (modeles.length ? modeles : ['—']).map((n) => ({ code: n, libelle: n })),
          courant.modele);
  // Un seul modele possible (claude-cli) : le menu n'a rien a offrir.
  select.disabled = modeles.length <= 1;
  select.style.opacity = select.disabled ? '0.5' : '1';
  peindrePastille($('pastille-modele'), courant.fournisseur);

  // Les lecteurs de photos ont chacun leur cle : ce choix n'a de sens que pour
  // la version gratuite, claude-cli lit les photos avec son propre abonnement.
  const gratuit = !!courant.fournisseur;
  $('bloc-transcripteur').classList.toggle('hidden', !gratuit);
  if (gratuit) {
    remplir($('transcripteur-select'), transcripteurs.map(
      (t) => ({ code: t.code, libelle: T('transcripteur_' + t.code) || t.libelle })), etat.transcripteur);
    peindrePastille($('pastille-transcripteur'), fournisseurDe(etat.transcripteur));
  } else {
    peindrePastille($('pastille-transcripteur'), null);
    fermerCle();
  }

  await rafraichir();
}

// ------------------------------------------------------------------- statut

async function rafraichir() {
  const s = await poster('/api/status', {
    matiere: etat.matiere, type: etat.type, titre: etat.titre, moteur: etat.moteur,
  });

  const corps = $('table-fichiers');
  corps.innerHTML = '';
  if (!s.fichiers.length) {
    corps.innerHTML = `<tr><td colspan="4" class="py-xl text-center text-on-surface-variant opacity-50">
      <span class="material-symbols-outlined text-[32px] mb-sm block" data-icon="upload_file">upload_file</span>
      Aucun fichier ajouté.</td></tr>`;
  } else {
    s.fichiers.forEach((f) => {
      const [icone, couleur] = ICONES[f.ext] || ['description', 'text-on-surface-variant'];
      const tr = document.createElement('tr');
      tr.className = 'border-b border-[#333333] hover:bg-[#252525] transition-colors group';
      tr.innerHTML = `
        <td class="py-sm px-md text-center"><span class="material-symbols-outlined ${couleur} text-[20px]" data-icon="${icone}">${icone}</span></td>
        <td class="py-sm px-md font-body-md text-body-md text-on-surface truncate">${echapper(f.nom)}</td>
        <td class="py-sm px-md font-code text-code text-on-surface-variant">${taille(f.taille_ko)}</td>
        <td class="py-sm px-md text-center">
          <button aria-label="Supprimer" class="text-outline-variant hover:text-error transition-colors p-xs rounded hover:bg-surface-container">
            <span class="material-symbols-outlined text-[18px]" data-icon="delete">delete</span>
          </button></td>`;
      tr.querySelector('button').addEventListener('click', async () => {
        if (!confirm(`Retirer ${f.nom} ?`)) return;
        await json(`/api/fichiers/${encodeURIComponent(f.nom)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matiere: etat.matiere, type: etat.type, titre: etat.titre }),
        });
        rafraichir();
      });
      corps.appendChild(tr);
    });
  }

  const courant = moteursConnus.find((m) => m.code === etat.moteur);
  const bouton = $('btn-generer');
  if (etat.enCours) return;

  // Changer de matiere/titre/type rend l'ancien resultat obsolete : sans ce
  // reset, le bouton restait bloque sur "Ouvrir le resultat" pointant vers un
  // fichier qui n'est plus celui affiche, et il fallait relancer l'app pour
  // generer un nouveau cours.
  if (etat.pdf !== null) {
    etat.pdf = null;
    bouton.innerHTML = HTML_BTN_GENERER;
  }
  // Cacher le bouton "Ouvrir le cours" car il pointe vers l'ancien cours
  const btnOuvrir = $('btn-ouvrir-cours');
  if (btnOuvrir) btnOuvrir.classList.add('hidden');

  // Vérifier si le cours existe déjà pour adapter l'option "Cours principal"
  await verifierCoursExistant();

  // L'etat tient sur la ligne de titre. La raison d'un moteur non configure est
  // ce qu'on a besoin de lire : elle passe en clair, pas derriere un generique
  // "Moteur non configuré". Le reste (destination) va en infobulle.
  if (s.souci) {
    $('etat-icone').textContent = 'error';
    $('etat-icone').className = 'material-symbols-outlined text-error text-[18px] shrink-0';
    $('etat-titre').textContent = s.souci;
    $('etat-moteur').title = s.souci;
  } else {
    $('etat-icone').textContent = 'check_circle';
    $('etat-icone').className = 'material-symbols-outlined text-[#4ade80] text-[18px] shrink-0';
    $('etat-titre').textContent = `${courant ? courant.nom : 'Moteur'} prêt`;
    $('etat-moteur').title = `Les cours sont écrits dans ${s.destination}`;
  }
  // Sans fichier source il n'y a rien a resumer : le bouton mentirait.
  // L'apparence desactivee vient de .btn-primaire:disabled, pas d'une opacite
  // en ligne qui laissait un bouton violet delave encore cliquable a l'oeil.
  bouton.disabled = !(!s.souci && s.fichiers.length > 0);
  if (!s.souci && !s.fichiers.length) {
    $('progres-texte').textContent = 'Ajoutez au moins un document';
  }
}

async function chargerMatieres() {
  const matieres = await json('/api/matieres');
  const select = $('subject-select');
  select.innerHTML = '<option disabled value="">Sélectionner une matière...</option>';
  matieres.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  });
  // La matiere se saisit aussi librement : une nouvelle matiere doit pouvoir
  // etre creee sans qu'un dossier existe deja.
  const nouvelle = document.createElement('option');
  nouvelle.value = '__nouvelle__';
  nouvelle.textContent = '+ Nouvelle matière…';
  select.appendChild(nouvelle);
  select.value = etat.matiere || '';
}

async function chargerRecents() {
  const recents = await json('/api/recents');
  const liste = $('liste-recents');
  liste.innerHTML = '';
  recents.forEach((r) => {
    const li = document.createElement('li');
    li.innerHTML = `<a class="flex items-center gap-sm text-on-surface-variant hover:bg-surface-container-highest py-sm px-md transition-colors group pl-[32px]" href="#">
      <span class="material-symbols-outlined text-[16px] text-outline" data-icon="description">description</span>
      <span class="font-body-md text-body-md truncate text-sm">${echapper(r.nom)}</span></a>`;
    li.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      poster('/api/ouvrir_note', { chemin: r.chemin }).catch((err) => alert(err.message));
    });
    liste.appendChild(li);
  });
}

// ----------------------------------------------------------------- actions

function terminer(pdf) {
  etat.enCours = false;
  etat.pdf = pdf;
  $('progres-texte').textContent = 'Terminé';
  $('progres-texte').style.color = '#4ade80';
  $('progres-pct').textContent = '100%';
  $('progres-barre').style.width = '100%';
  const bouton = $('btn-generer');
  // Le bouton "Générer" reste "Générer" pour permettre de générer un autre cours
  bouton.innerHTML = HTML_BTN_GENERER;
  bouton.disabled = false;
  // Afficher le bouton "Ouvrir le cours" à côté
  const btnOuvrir = $('btn-ouvrir-cours');
  if (btnOuvrir) btnOuvrir.classList.remove('hidden');
  chargerRecents();
}

function echouer(message) {
  etat.enCours = false;
  $('progres-texte').textContent = `Erreur : ${message}`;
  $('progres-texte').style.color = '#ffb4ab';
  $('btn-generer').disabled = false;
}

// Le flux d'avancement s'ouvre avant de lancer : ouvert apres, les premieres
// etapes seraient deja passees et la barre resterait a zero. Avancement et
// erreurs se lisent pareil pour les deux boutons -- seul l'evenement de fin
// change, d'ou son nom en parametre.
function suivreProgression(evenementFinal, surFin) {
  if (etat.flux) etat.flux.close();
  etat.flux = new EventSource('/api/progression');
  etat.flux.addEventListener('phase', (e) => {
    const d = JSON.parse(e.data);
    $('progres-texte').textContent = d.texte;
    $('progres-pct').textContent = `${d.pct}%`;
    $('progres-barre').style.width = `${d.pct}%`;
  });
  etat.flux.addEventListener('erreur', (e) => {
    echouer(JSON.parse(e.data).message);
    etat.flux.close();
  });
  etat.flux.addEventListener(evenementFinal, (e) => {
    surFin(JSON.parse(e.data));
    etat.flux.close();
  });
}

function demarrerBarre(texte) {
  etat.enCours = true;
  // Le TP affiche est celui de la generation precedente : on le recache tant
  // que celle qui demarre n'en a pas annonce un.
  etat.exercicesPrets = false;
  $('btn-supports').classList.add('hidden');
  $('progres-texte').style.color = '';
  $('progres-texte').textContent = texte;
  $('progres-pct').textContent = '0%';
  $('progres-barre').style.width = '0%';
  $('btn-generer').disabled = true;
}

async function generer() {
  etat.pdf = null;
  demarrerBarre('Démarrage…');
  suivreProgression('fini', (d) => terminer(d.pdf));

  try {
    await poster('/api/generer', {
      matiere: etat.matiere, type: etat.type, titre: etat.titre, moteur: etat.moteur,
      langue: etat.langue,
    });
  } catch (err) {
    etat.flux.close();
    echouer(err.message);
  }
}

async function genererComplet(options) {
  etat.pdf = null;
  demarrerBarre('Démarrage…');
  
  // Déterminer quel événement final attendre
  const attendCours = options.generer_cours;
  const attendSupports = options.generer_tp || options.generer_fiche;
  const evenementFinal = attendCours ? 'fini' : 'supports';
  
  suivreProgression(evenementFinal, (d) => {
    if (attendCours && d.pdf) {
      terminer(d.pdf);
    }
    if (attendSupports && d.fichiers) {
      etat.enCours = false;
      if (d.fichiers.some((f) => f.endsWith('_exercices.json'))) {
        etat.exercicesPrets = true;
        $('btn-supports').classList.remove('hidden');
      }
      $('progres-texte').textContent = `Prêt : ${d.fichiers.length} support(s)`;
      $('progres-texte').style.color = '#4ade80';
      $('progres-pct').textContent = '100%';
      $('progres-barre').style.width = '100%';
      $('btn-generer').disabled = false;
      chargerRecents();
    }
  });

  try {
    await poster('/api/generer-complet', {
      matiere: etat.matiere, type: etat.type, titre: etat.titre, moteur: etat.moteur,
      langue: etat.langue,
      generer_cours: options.generer_cours,
      generer_tp: options.generer_tp,
      generer_fiche: options.generer_fiche,
      niveau: options.niveau,
      tp_focus: options.tp_focus,
      tp_questions: options.tp_questions,
    });
  } catch (err) {
    etat.flux.close();
    echouer(err.message);
  }
}

// ------------------------------------------------------- TP interactif

// Etat de la prise du TP en cours : une liste d'exercices (avec _points ajoute
// dessus au fur et a mesure des corrections) et l'index affiche. Separe de
// `etat` : ce n'est vivant que pendant que la modale est ouverte.
let exoEtat = null;

async function ouvrirExercices() {
  let liste;
  try {
    const params = new URLSearchParams({ matiere: etat.matiere, type: etat.type, titre: etat.titre });
    liste = await json(`/api/exercices_data?${params}`);
  } catch (err) {
    alert(err.message);
    return;
  }
  if (!liste.length) { alert('Aucun exercice dans ce TP.'); return; }
  exoEtat = { liste, index: 0 };
  $('exo-corps').classList.remove('hidden');
  $('exo-recap').classList.add('hidden');
  $('modal-exercices').classList.remove('hidden');
  afficherExercice();
}

function normaliser(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

// La moyenne se fait sur le nombre total d'exercices, pas seulement ceux deja
// corriges : un TP a moitie fait n'affiche pas un score gonfle.
function scoreGlobal(liste) {
  const somme = liste.reduce((a, e) => a + (e._points ?? 0), 0);
  return Math.round(somme / liste.length * 100);
}

function majBarreScore() {
  const pct = scoreGlobal(exoEtat.liste);
  $('exo-score').textContent = `Score : ${pct}%`;
  $('exo-barre').style.width = `${pct}%`;
}

function feedback(texte, ok) {
  const el = $('exo-feedback');
  el.textContent = texte;
  el.style.color = ok === null ? '' : (ok ? '#4ade80' : '#f87171');
}

// Un enonce peut porter un schema ASCII entre deux lignes ``` : hors bloc c'est
// du texte, dedans une figure a chasse fixe, sans quoi les colonnes ne tombent
// plus en face. textContent partout : l'enonce vient du modele, jamais du HTML.
function poserEnonce(el, texte) {
  el.textContent = '';
  String(texte || '').split('```').forEach((bout, n) => {
    if (!bout) return;
    if (n % 2 === 0) { el.append(document.createTextNode(bout)); return; }
    const pre = document.createElement('pre');
    pre.className = 'my-xs px-sm py-xs rounded border border-[#333333] '
      + 'border-l-2 border-l-[#7c3aed] bg-[#1e1e1e] font-code text-code '
      + 'overflow-x-auto whitespace-pre';
    pre.textContent = bout.replace(/^[a-zA-Z]*\n/, '').replace(/\n\s*$/, '');
    el.append(pre);
  });
}

function afficherExercice() {
  document.querySelectorAll('.exo-auto-boutons').forEach((el) => el.remove());
  const exo = exoEtat.liste[exoEtat.index];
  $('exo-notion').textContent = exo.notion;
  $('exo-progression').textContent = `Exercice ${exoEtat.index + 1}/${exoEtat.liste.length}`;
  // `difficulte` est le nom d'avant les paliers : un TP genere a l'epoque doit
  // rester lisible sans etre regenere.
  const palier = exo.palier || exo.difficulte;
  $('exo-difficulte').textContent = palier ? `Palier : ${palier}` : '';
  poserEnonce($('exo-enonce'), exo.enonce);
  $('exo-indice-texte').textContent = exo.indice ? `Indice : ${exo.indice}` : '';
  $('exo-indice-texte').classList.add('hidden');
  $('exo-solution-texte').textContent = exo.solution ? `Solution : ${exo.solution}` : '';
  $('exo-solution-texte').classList.add('hidden');
  feedback('', null);
  $('btn-exo-indice').classList.toggle('hidden', !exo.indice);
  $('btn-exo-solution').classList.toggle('hidden', !exo.solution);
  $('btn-exo-verifier').disabled = false;

  const zone = $('exo-zone-reponse');
  if (exo.type === 'code') {
    zone.innerHTML = '<textarea id="exo-reponse" class="w-full h-40 px-sm py-xs rounded border '
      + 'border-[#333333] bg-[#1e1e1e] text-on-surface font-code text-code focus:border-primary-container '
      + 'focus:ring-0" spellcheck="false"></textarea>';
    $('exo-reponse').value = exo.stub || '';
  } else if (exo.type === 'calcul') {
    zone.innerHTML = '<input type="text" id="exo-reponse" class="w-full h-9 px-sm rounded border '
      + 'border-[#333333] bg-[#1e1e1e] text-on-surface focus:border-primary-container focus:ring-0" '
      + 'autocomplete="off" placeholder="Ta réponse…"/>';
  } else {
    zone.innerHTML = '<textarea id="exo-reponse" class="w-full h-28 px-sm py-xs rounded border '
      + 'border-[#333333] bg-[#1e1e1e] text-on-surface focus:border-primary-container focus:ring-0" '
      + 'placeholder="Ta réponse…"></textarea>';
  }
  majBarreScore();
}

// Ni reponse ni mots-cles fournis par le modele pour cet exercice (rare, mais
// le format reste libre cote IA) : pas de verite-terrain fiable a comparer,
// donc on montre la solution et l'etudiant se note lui-meme -- comme le fait
// deja le TP.py hors-ligne genere a cote.
function demanderAutoDeclaration(exo) {
  $('exo-solution-texte').classList.remove('hidden');
  feedback('Corrige-toi toi-même : as-tu eu juste ?', null);
  const conteneur = document.createElement('div');
  conteneur.className = 'exo-auto-boutons flex gap-xs mt-xs';
  const bouton = (texte, points, ok) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texte;
    b.className = 'px-sm py-[2px] rounded border border-[#333333] hover:bg-[#2d2d2d] '
      + 'font-body-md text-body-md text-on-surface-variant';
    b.addEventListener('click', () => {
      exo._points = points;
      feedback(`Comptabilisé : ${texte.toLowerCase()}.`, ok);
      majBarreScore();
    });
    return b;
  };
  conteneur.append(bouton('Juste', 1, true), bouton('Faux', 0, false));
  $('exo-feedback').after(conteneur);
}

async function verifierExercice() {
  document.querySelectorAll('.exo-auto-boutons').forEach((el) => el.remove());
  const exo = exoEtat.liste[exoEtat.index];
  const reponse = $('exo-reponse').value;

  if (exo.type === 'code') {
    $('btn-exo-verifier').disabled = true;
    try {
      const r = await poster('/api/exercices_code', {
        matiere: etat.matiere, type: etat.type, titre: etat.titre,
        index: exoEtat.index, code: reponse,
      });
      if (r.erreur) {
        exo._points = 0;
        feedback(`Erreur : ${r.erreur}`, false);
      } else {
        exo._points = r.total ? r.reussis / r.total : 0;
        feedback(`${r.reussis}/${r.total} test(s) réussis`, r.reussis === r.total);
      }
    } catch (err) {
      feedback(err.message, false);
    }
    $('btn-exo-verifier').disabled = false;
    majBarreScore();
    return;
  }

  if (exo.type === 'calcul' && exo.reponses.length) {
    const dite = normaliser(reponse);
    const juste = exo.reponses.some((r) => {
      if (normaliser(r) === dite) return true;
      const a = parseFloat(r), b = parseFloat(reponse);
      return !isNaN(a) && !isNaN(b) && Math.abs(a - b) < 1e-6;
    });
    exo._points = juste ? 1 : 0;
    feedback(juste ? 'Juste !' : 'Faux.', juste);
    majBarreScore();
    return;
  }

  if (exo.type === 'qualitatif' && exo.mots_cles.length) {
    const dite = normaliser(reponse);
    const trouves = exo.mots_cles.filter((m) => dite.includes(normaliser(m)));
    exo._points = trouves.length / exo.mots_cles.length;
    feedback(`${trouves.length}/${exo.mots_cles.length} mot(s)-clé(s) repéré(s)`,
      trouves.length === exo.mots_cles.length);
    majBarreScore();
    return;
  }

  demanderAutoDeclaration(exo);
}

function exercicesSuivant() {
  if (exoEtat.index < exoEtat.liste.length - 1) {
    exoEtat.index += 1;
    afficherExercice();
    return;
  }
  afficherRecap();
}

function afficherRecap() {
  $('exo-corps').classList.add('hidden');
  const parNotion = {};
  exoEtat.liste.forEach((e) => {
    parNotion[e.notion] ??= { points: 0, total: 0 };
    parNotion[e.notion].points += e._points ?? 0;
    parNotion[e.notion].total += 1;
  });
  const ul = $('exo-recap-notions');
  ul.innerHTML = '';
  Object.entries(parNotion).forEach(([notion, v]) => {
    const li = document.createElement('li');
    const pct = Math.round(v.points / v.total * 100);
    li.className = 'flex items-center justify-between gap-sm font-body-md text-body-md text-on-surface-variant';
    li.innerHTML = `<span class="truncate">${echapper(notion)}</span><span class="shrink-0">${pct}%</span>`;
    ul.appendChild(li);
  });
  $('exo-recap-titre').textContent = `TP terminé : ${scoreGlobal(exoEtat.liste)}%`;
  $('exo-recap').classList.remove('hidden');
  $('exo-progression').textContent = 'Terminé';
  majBarreScore();
}

function fermerExercices() {
  $('modal-exercices').classList.add('hidden');
  exoEtat = null;
}

// -------------------------------------------------------------- demarrage

document.addEventListener('DOMContentLoaded', async () => {
  // Le HTML de #liste-recents et #table-fichiers est la maquette (donnees
  // d'exemple, cf. commentaire en tete de fichier) : la vider tout de suite,
  // avant tout appel reseau, garantit une premiere installation vierge meme
  // si /api/recents ou /api/status echoue plus bas.
  $('liste-recents').innerHTML = '';
  $('table-fichiers').innerHTML = '';

  // Les messages "ne plus afficher" coches lors d'un lancement precedent :
  // lu avant le tutoriel plus bas, qui en depend pour savoir s'il s'affiche.
  try {
    messagesMasques = await json('/api/messages_masques');
  } catch (e) {
    console.warn('Impossible de charger les messages masques:', e);
  }

  // Initialiser la langue depuis le backend (detection systeme)
  try {
    const languesData = await json('/api/langues');
    if (languesData.systeme && languesData.langues[languesData.systeme]) {
      etat.langue = languesData.systeme;
      $('lang-select').value = languesData.systeme;
      $('lang-select').dispatchEvent(new Event('change'));
    }
  } catch (e) {
    // Si l'API echoue, on garde la langue par defaut (fr)
    console.warn('Impossible de charger la langue systeme:', e);
  }

  const fichierInput = document.createElement('input');
  fichierInput.type = 'file';
  fichierInput.multiple = true;
  fichierInput.hidden = true;
  document.body.appendChild(fichierInput);

  $('subject-select').addEventListener('change', (e) => {
    if (e.target.value === '__nouvelle__') {
      const nom = prompt('Nom de la nouvelle matière :');
      if (nom) {
        etat.matiere = nom.trim();
        const opt = document.createElement('option');
        opt.value = etat.matiere;
        opt.textContent = etat.matiere;
        e.target.insertBefore(opt, e.target.lastElementChild);
      }
      e.target.value = etat.matiere || '';
    } else {
      etat.matiere = e.target.value;
    }
    rafraichir();
  });

  $('chapter-title').addEventListener('input', (e) => {
    etat.titre = e.target.value;
    rafraichir();
  });

  document.querySelectorAll('input[name="session_type"]').forEach((r) => {
    r.addEventListener('change', (e) => {
      if (!e.target.checked) return;
      etat.type = e.target.value.toUpperCase();
      rafraichir();
    });
  });

  $('model-select').addEventListener('change', (e) => {
    const courant = moteursConnus.find((m) => m.code === etat.moteur);
    poster('/api/modele', { fournisseur: courant?.fournisseur, modele: e.target.value });
  });

  $('transcripteur-select').addEventListener('change', async (e) => {
    etat.transcripteur = e.target.value;
    await poster('/api/transcripteur', { code: etat.transcripteur });
    const f = fournisseurDe(etat.transcripteur);
    peindrePastille($('pastille-transcripteur'), f);
    // La saisie ouverte suit le nouveau lecteur : sinon elle reclamerait la cle
    // d'un fournisseur qui ne lit plus rien.
    if (etat.cleOuverte) ouvrirCle(f);
  });

  $('btn-cle').addEventListener('click', enregistrerCle);
  $('cle-valeur').addEventListener('keydown', (e) => e.key === 'Enter' && enregistrerCle());
  $('btn-catalogue').addEventListener('click', chargerCatalogue);

  $('btn-ouvrir-dossier').addEventListener('click', () => {
    poster('/api/ouvrir_dossier', {
      matiere: etat.matiere, type: etat.type, titre: etat.titre,
    });
  });

  $('lien-destination').addEventListener('click', (e) => {
    e.preventDefault();
    poster('/api/ouvrir_destination', {});
  });

  $('btn-ajouter').addEventListener('click', () => fichierInput.click());
  fichierInput.addEventListener('change', async () => {
    if (!fichierInput.files.length) return;
    const form = new FormData();
    form.append('matiere', etat.matiere);
    form.append('type', etat.type);
    form.append('titre', etat.titre);
    [...fichierInput.files].forEach((f, i) => form.append(`file${i}`, f));
    await fetch('/api/fichiers', { method: 'POST', body: form });
    fichierInput.value = '';
    rafraichir();
  });

  // Le cours part chez un fournisseur d'IA dans les deux cas : le meme
  // avertissement doit donc preceder la generation comme les exercices.
  const demanderAccord = (action) => {
    if (confidentialiteMasquee()) {
      action();
      return;
    }
    etat.apresAccord = action;
    $('confidentialite-ne-plus-afficher').checked = false;
    $('modal-confidentialite').classList.remove('hidden');
  };

  // --- Options de génération (dans la section entre Photos/PDF et Moteur IA) ---
  const genererCheckboxes = $('generer-checkboxes');
  const genererNiveauWrapper = $('generer-niveau-wrapper');
  const genererNiveauInput = $('generer-niveau');

  // Options de génération disponibles. labelKey/descKey posent data-i18n sur
  // les elements crees ici : un changement de langue plus tard les retraduit
  // via la boucle generique d'applyTraductions(), sans reconstruire le HTML
  // (qui perdrait l'etat coche des cases).
  const GENERER_OPTIONS = [
    { id: 'generer_cours', labelKey: 'cours_principal', descKey: 'desc_cours', icon: 'auto_awesome' },
    { id: 'generer_tp', labelKey: 'tp_interactif', descKey: 'desc_tp', icon: 'fitness_center' },
    { id: 'generer_fiche', labelKey: 'fiche_revision', descKey: 'desc_fiche', icon: 'summarize' },
  ];

  function renderGenererOptions() {
    genererCheckboxes.innerHTML = GENERER_OPTIONS.map(opt => `
      <label class="flex items-start gap-sm p-sm rounded border border-[#333333] hover:border-[#4a4455] hover:bg-[#2d2d2d] transition-colors cursor-pointer group">
        <input type="checkbox" id="${opt.id}" name="generer-option" value="${opt.id}" class="w-4 h-4 mt-1 text-primary-container border-[#4a4455] bg-transparent focus:ring-primary-container focus:ring-offset-[#252525] accent-primary-container" ${opt.id === 'generer_cours' ? 'checked' : ''}>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-xs">
            <span class="material-symbols-outlined text-[18px] text-primary-container shrink-0" data-icon="${opt.icon}">${opt.icon}</span>
            <span class="font-body-md text-body-md text-on-surface" data-i18n="${opt.labelKey}">${T(opt.labelKey)}</span>
          </div>
          <p class="font-label-sm text-label-sm text-on-surface-variant mt-1 ml-7" data-i18n="${opt.descKey}">${T(opt.descKey)}</p>
        </div>
      </label>
    `).join('');

    // Par défaut : Cours principal coché, les autres décochés
    $('generer_cours').checked = true;
    $('generer_tp').checked = false;
    $('generer_fiche').checked = false;
    
    // Mettre à jour l'état du champ niveau selon les cases cochées
    updateNiveauVisibility();
  }

  function updateNiveauVisibility() {
    const anySupportChecked = ['generer_tp', 'generer_fiche'].some(id => $(id).checked);
    genererNiveauWrapper.classList.toggle('hidden', !anySupportChecked);
    // Sujet et nombre de questions ne cadrent que le TP : inutiles sans lui.
    $('generer-tp-options').classList.toggle('hidden', !$('generer_tp').checked);
  }

  // Écouteurs sur les checkboxes
  genererCheckboxes.addEventListener('change', (e) => {
    if (e.target.name === 'generer-option') {
      updateNiveauVisibility();
    }
  });

  function recupererOptionsGenerer() {
    const options = {
      generer_cours: $('generer_cours').checked,
      generer_tp: $('generer_tp').checked,
      generer_fiche: $('generer_fiche').checked,
      niveau: genererNiveauInput.value.trim() || 'comme le cours',
      // Vides : tout le cours, 5 questions de plus en plus dures (defaut cote
      // exercices.py -- le 0 dit "ne passe pas d'option").
      tp_focus: $('tp-focus').value.trim(),
      tp_questions: parseInt($('tp-questions').value, 10) || 0,
    };
    return options;
  }

  // Clic sur le bouton Générer -> lance directement avec les options cochées
  $('btn-generer').addEventListener('click', () => {
    const options = recupererOptionsGenerer();
    
    // Vérifier qu'au moins une option est cochée
    if (!options.generer_cours && !options.generer_tp && !options.generer_fiche) {
      alert('Choisis au moins une option à générer.');
      return;
    }
    
    demanderAccord(() => genererComplet(options));
  });

  // Clic sur le bouton Ouvrir le cours
  $('btn-ouvrir-cours').addEventListener('click', () => {
    if (etat.pdf !== null) {
      poster('/api/ouvrir_resultat', {
        matiere: etat.matiere, type: etat.type, titre: etat.titre, pdf: etat.pdf,
      });
    } else {
      // Si pas de PDF, ouvrir le .md
      const sortiePath = getSortiePath(etat.matiere, etat.type, etat.titre);
      poster('/api/ouvrir_note', { chemin: sortiePath }).catch(() => {});
    }
  });

  // Initialiser les options au démarrage
  renderGenererOptions();

  // Le seul chemin vers le TP dans la fenetre : sans lui, la modale et sa
  // correction etaient du code mort.
  $('btn-supports').addEventListener('click', ouvrirExercices);

  $('btn-exo-fermer').addEventListener('click', fermerExercices);
  $('btn-exo-recap-fermer').addEventListener('click', fermerExercices);
  $('btn-exo-indice').addEventListener('click', () => $('exo-indice-texte').classList.remove('hidden'));
  $('btn-exo-solution').addEventListener('click', () => $('exo-solution-texte').classList.remove('hidden'));
  $('btn-exo-verifier').addEventListener('click', verifierExercice);
  $('btn-exo-suivant').addEventListener('click', exercicesSuivant);

  $('btn-confidentialite-annuler').addEventListener('click', () => {
    $('modal-confidentialite').classList.add('hidden');
  });
  $('modal-confidentialite').addEventListener('click', (e) => {
    if (e.target.id === 'modal-confidentialite') $('modal-confidentialite').classList.add('hidden');
  });
  $('btn-confidentialite-continuer').addEventListener('click', () => {
    if ($('confidentialite-ne-plus-afficher').checked) masquerMessage(CLE_CONFIDENTIALITE, true);
    $('modal-confidentialite').classList.add('hidden');
    (etat.apresAccord || generer)();
  });
  $('btn-reafficher-confidentialite')?.addEventListener('click', () => {
    masquerMessage(CLE_CONFIDENTIALITE, false);
  });

  $('btn-tutoriel-fermer').addEventListener('click', () => {
    if ($('tutoriel-ne-plus-afficher').checked) masquerMessage(CLE_TUTORIEL, true);
    $('modal-tutoriel').classList.add('hidden');
  });
  $('modal-tutoriel').addEventListener('click', (e) => {
    if (e.target.id === 'modal-tutoriel') $('modal-tutoriel').classList.add('hidden');
  });
  // Contrairement a la confidentialite (relue avant chaque generation), rien
  // d'autre ne redeclenche le tutoriel plus tard : le reafficher l'ouvre donc
  // tout de suite plutot que d'attendre une prochaine action.
  $('btn-reafficher-tutoriel')?.addEventListener('click', () => {
    masquerMessage(CLE_TUTORIEL, false);
    $('tutoriel-ne-plus-afficher').checked = false;
    $('modal-tutoriel').classList.remove('hidden');
  });
  if (!tutorielMasque()) $('modal-tutoriel').classList.remove('hidden');

  // --- Paramètres ---
  $('link-parametres')?.addEventListener('click', async (e) => {
    e.preventDefault();
    // La vue s'affiche d'abord : si /api/status echoue, on ne reste pas bloque
    // sur la vue cours apres un clic qui n'a visiblement rien fait.
    montrer('vue-parametres');
    // Load current values. /api/status est en POST : passe a json(), l'objet
    // partait en options fetch et la requete arrivait en GET (405).
    const status = await poster('/api/status', {
      matiere: etat.matiere, type: etat.type, titre: etat.titre, moteur: etat.moteur
    });
    if (status) $('settings-output-path').value = status.destination;
    // Charger l'URL Piston actuelle
    try {
      const pistonStatus = await json('/api/piston/status');
      if (pistonStatus.url) {
        $('settings-piston-url').value = pistonStatus.url;
        $('settings-piston-url').placeholder = '';
      }
      // Mettre a jour l'affichage du statut
      const statusEl = $('piston-status');
      if (pistonStatus.pret) {
        statusEl.textContent = '✓ Piston accessible';
        statusEl.style.color = '#4ade80';
      } else {
        statusEl.textContent = '✗ ' + (pistonStatus.souci || 'Injoignable');
        statusEl.style.color = '#f87171';
      }
    } catch (e) {
      // Ignorer les erreurs de chargement du statut Piston
    }
  });

  const revenirAuCours = () => {
    montrer('vue-cours');
    rafraichir();   // la destination ou la cle ont pu changer entre-temps
  };
  $('btn-fermer-parametres')?.addEventListener('click', revenirAuCours);
  $('lien-cours')?.addEventListener('click', (e) => {
    e.preventDefault();
    revenirAuCours();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('vue-cours').classList.contains('hidden')) revenirAuCours();
  });
  montrer('vue-cours');

  // Open destination folder from settings
  $('btn-browse-folder')?.addEventListener('click', () => {
    poster('/api/ouvrir_destination', {});
  });

  // Onglets Paramètres : Général / API & Moteurs / Journal partagent le meme
  // panneau, un seul <section> visible a la fois.
  document.querySelectorAll('.parametres-onglet').forEach((onglet) => {
    onglet.addEventListener('click', () => {
      document.querySelectorAll('.parametres-onglet').forEach((o) => {
        const actif = o === onglet;
        o.classList.toggle('bg-[#2d2d2d]', actif);
        o.classList.toggle('border-primary-container', actif);
        o.classList.toggle('text-on-surface', actif);
        o.classList.toggle('border-transparent', !actif);
        o.classList.toggle('text-on-surface-variant', !actif);
      });
      document.querySelectorAll('section[id^="onglet-"]').forEach((section) => {
        section.classList.toggle('hidden', section.id !== onglet.dataset.onglet);
      });
    });
  });

  $('btn-ouvrir-logs')?.addEventListener('click', () => {
    poster('/api/ouvrir_logs', {});
  });

  // Les deux champs de la modale ecrivent la meme cle que la pastille : meme
  // route, meme validation. Le retour se lit sur le champ lui-meme, message()
  // ecrit dans #cle-message qui est enferme dans les options avancees, invisible
  // d'ici. Une cle refusee ne doit pas laisser croire qu'elle est posee.
  const enregistrerCleReglages = async (champ, fournisseur) => {
    const val = $(champ).value;
    if (!val) return;
    try {
      await poster('/api/cle', { fournisseur, valeur: val });
    } catch (err) {
      $(champ).value = '';
      $(champ).placeholder = err.message;
      return;
    }
    $(champ).value = '';
    $(champ).placeholder = 'Clé enregistrée !';
    await chargerMoteurs();   // la pastille et l'etat du moteur suivent la cle
  };

  $('btn-save-nvidia')?.addEventListener('click',
    () => enregistrerCleReglages('settings-nvidia-key', 'nim'));
  $('btn-save-gemini')?.addEventListener('click',
    () => enregistrerCleReglages('settings-gemini-key', 'gemini'));

  // --- Piston (sandbox d'execution de code) ---
  async function chargerStatutPiston() {
    try {
      const res = await json('/api/piston/status');
      const statusEl = $('piston-status');
      if (res.pret) {
        statusEl.textContent = '✓ Piston accessible';
        statusEl.style.color = '#4ade80';
      } else {
        statusEl.textContent = '✗ ' + (res.souci || 'Injoignable');
        statusEl.style.color = '#f87171';
      }
    } catch (e) {
      $('piston-status').textContent = 'Erreur de vérification';
      $('piston-status').style.color = '#f87171';
    }
  }

  $('btn-save-piston')?.addEventListener('click', async () => {
    const url = $('settings-piston-url').value.trim();
    if (!url) return;
    try {
      await poster('/api/piston/url', { url });
      $('settings-piston-url').value = '';
      $('settings-piston-url').placeholder = 'URL enregistrée !';
      await chargerStatutPiston();
    } catch (err) {
      $('settings-piston-url').value = '';
      $('settings-piston-url').placeholder = err.message;
    }
  });

  $('btn-test-piston')?.addEventListener('click', chargerStatutPiston);

  // Charger le statut Piston au demarrage de l'onglet API
  document.querySelector('[data-onglet="onglet-api"]')?.addEventListener('click', chargerStatutPiston);

  // --- Obsidian Vault Button ---
  // Le bouton est monte dans l'en-tete, loin de #cle-message : le retour passe
  // par le badge et l'invite qui le suivent, pas par message() qui ecrirait
  // dans les options avancees repliees, invisible d'ici.
  async function initObsidian() {
    const btnVault = $('btn-ouvrir-vault');
    const badgeObsidian = $('badge-obsidian');
    const hintObsidian = $('hint-obsidian');
    if (!btnVault) return;

    const signalerAbsence = () => {
      badgeObsidian?.classList.replace('hidden', 'flex');
      hintObsidian?.classList.remove('hidden');
      btnVault.title = 'Obsidian non détecté. Installez-le sur obsidian.md';
      btnVault.classList.add('opacity-60');
    };

    try {
      if (!(await json('/api/obsidian_installe')).installe) signalerAbsence();
    } catch (e) { /* la detection echoue : on laisse le bouton tenter sa chance */ }

    btnVault.addEventListener('click', async () => {
      let res;
      try {
        res = await poster('/api/ouvrir_vault', {});
      } catch (err) {
        btnVault.title = err.message;
        return;
      }
      // Coffre absent : le backend repond 200 avec ok:false, il n'y a rien a
      // ouvrir tant qu'Obsidian n'est pas installe.
      if (!res.ok) {
        signalerAbsence();
        window.open('https://obsidian.md', '_blank');
      }
    });
  }
  initObsidian();

  // --- Ctrl+G shortcut to generate ---
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
      e.preventDefault();
      const btnGenerer = $('btn-generer');
      if (btnGenerer && !btnGenerer.disabled) btnGenerer.click();
    }
  });

  // Chacun independant : sans le try/catch, un echec du premier (reseau,
  // backend pas encore repondant...) coupait tout l'enchainement et laissait
  // les listes figees sur la maquette HTML (faux cours recents, faux fichiers)
  // au lieu de se vider.
  const tenter = async (fn, nom) => {
    try { await fn(); } catch (err) { console.error(`${nom} :`, err); }
  };
  await tenter(chargerMatieres, 'chargerMatieres');
  await tenter(chargerMoteurs, 'chargerMoteurs');   // appelle rafraichir() une fois les moteurs connus
  await tenter(chargerRecents, 'chargerRecents');
});
