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
                <p class="text-sm">L'IA construit d'abord un plan puis rédige chaque section. Le cours final fait au plus 6 000 mots, pour rester lisible d'une traite.</p>
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

// --- Avertissement confidentialite : envoye au moteur d'IA, potentiellement
// reutilise par le fournisseur pour entrainer ses modeles. Affiche avant
// chaque generation tant que l'utilisateur n'a pas coche "ne plus afficher".
const CLE_CONFIDENTIALITE = 'oc_confidentialite_masquee';
const confidentialiteMasquee = () => localStorage.getItem(CLE_CONFIDENTIALITE) === '1';

// --- Tutoriel de premier lancement : meme mecanique que la confidentialite,
// mais affiche au demarrage plutot que sur une action.
const CLE_TUTORIEL = 'oc_tutoriel_masque';
const tutorielMasque = () => localStorage.getItem(CLE_TUTORIEL) === '1';

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
  es: '<rect width="20" height="14" fill="#AA151B"/><rect y="3.5" width="20" height="7" fill="#F1BF00"/>',
  de: '<rect width="20" height="4.67" fill="#000"/><rect y="4.67" width="20" height="4.67" fill="#DD0000"/><rect y="9.33" width="20" height="4.67" fill="#FFCE00"/>',
};

const drapeau = (code) => `<svg width="20" height="14" viewBox="0 0 20 14" class="rounded-[2px] ring-1 ring-white/15">${DRAPEAUX[code] || ''}</svg>`;

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

  langSelect.addEventListener('change', peindreLangue);
  peindreLangue();
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
  pdf: null, flux: null, enCours: false,
};

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
const MOTEURS = {
  'claude-cli': { nom: 'CLAUDE OPUS 5', offre: 'PAYANT', couleur: '#7c3aed',
    icone: 'credit_card', badge: 'Abonnement Claude Code',
    desc: 'Rédaction de très haute qualité (local, via Claude Code).' },
  'nvidia_nim': { nom: 'NVIDIA NIM', offre: 'GRATUIT', couleur: '#10b981',
    icone: 'dns', badge: 'Clé perso',
    desc: 'Génération rapide et performante avec ta propre clé.' },
  'claude_api': { nom: 'CLAUDE API', offre: 'PAYANT', couleur: '#7c3aed',
    icone: 'cloud', badge: 'Cloud, payant',
    desc: 'Connexion directe au cloud Anthropic.' },
};
MOTEURS.claude_cli = MOTEURS['claude-cli'];
MOTEURS.gratuit = MOTEURS.nvidia_nim;

function carteMoteur(m, choisi) {
  const d = MOTEURS[m.code] || { nom: m.nom, offre: 'GRATUIT', couleur: '#10b981',
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
  $('cle-titre').textContent = `Clé API ${f.nom}`;
  const champ = $('cle-valeur');
  champ.value = '';
  champ.placeholder = f.prefixe ? `${f.prefixe}…` : 'Colle ta clé ici';
  message(f.souci || 'Une clé est déjà enregistrée.', f.souci ? '#fbbf24' : '#4ade80');
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
      (t) => ({ code: t.code, libelle: t.libelle })), etat.transcripteur);
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
  // Le clic teste "Ouvrir" dans le texte du bouton : le mot doit rester.
  bouton.innerHTML = '<span class="material-symbols-outlined text-[18px] shrink-0"'
    + ' data-icon="open_in_new">open_in_new</span><span>Ouvrir le résultat</span>';
  bouton.disabled = false;
  $('btn-supports').disabled = false;
  chargerRecents();
}

function echouer(message) {
  etat.enCours = false;
  $('progres-texte').textContent = `Erreur : ${message}`;
  $('progres-texte').style.color = '#ffb4ab';
  $('btn-generer').disabled = false;
  $('btn-supports').disabled = false;
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
  $('progres-texte').style.color = '';
  $('progres-texte').textContent = texte;
  $('progres-pct').textContent = '0%';
  $('progres-barre').style.width = '0%';
  $('btn-generer').disabled = true;
  $('btn-supports').disabled = true;
}

async function generer() {
  etat.pdf = null;
  demarrerBarre('Démarrage…');
  suivreProgression('fini', (d) => terminer(d.pdf));

  try {
    await poster('/api/generer', {
      matiere: etat.matiere, type: etat.type, titre: etat.titre, moteur: etat.moteur,
    });
  } catch (err) {
    etat.flux.close();
    echouer(err.message);
  }
}

async function supports() {
  demarrerBarre('Exercices…');
  suivreProgression('supports', (d) => {
    etat.enCours = false;
    $('progres-texte').textContent = `Prêt : ${d.fichiers.length} support(s)`;
    $('progres-texte').style.color = '#4ade80';
    $('progres-pct').textContent = '100%';
    $('progres-barre').style.width = '100%';
    $('btn-generer').disabled = false;
    $('btn-supports').disabled = false;
    chargerRecents();
  });

  try {
    await poster('/api/exercices', {
      matiere: etat.matiere, type: etat.type, titre: etat.titre, moteur: etat.moteur,
    });
  } catch (err) {
    etat.flux.close();
    echouer(err.message);
  }
}

// -------------------------------------------------------------- demarrage

document.addEventListener('DOMContentLoaded', async () => {
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

  $('btn-generer').addEventListener('click', () => {
    if (etat.pdf !== null || $('btn-generer').textContent.includes('Ouvrir')) {
      poster('/api/ouvrir_resultat', {
        matiere: etat.matiere, type: etat.type, titre: etat.titre, pdf: etat.pdf,
      });
      return;
    }
    demanderAccord(generer);
  });

  $('btn-supports').addEventListener('click', () => demanderAccord(supports));

  $('btn-confidentialite-annuler').addEventListener('click', () => {
    $('modal-confidentialite').classList.add('hidden');
  });
  $('modal-confidentialite').addEventListener('click', (e) => {
    if (e.target.id === 'modal-confidentialite') $('modal-confidentialite').classList.add('hidden');
  });
  $('btn-confidentialite-continuer').addEventListener('click', () => {
    if ($('confidentialite-ne-plus-afficher').checked) localStorage.setItem(CLE_CONFIDENTIALITE, '1');
    $('modal-confidentialite').classList.add('hidden');
    (etat.apresAccord || generer)();
  });
  $('btn-reafficher-confidentialite')?.addEventListener('click', () => {
    localStorage.removeItem(CLE_CONFIDENTIALITE);
  });

  $('btn-tutoriel-fermer').addEventListener('click', () => {
    if ($('tutoriel-ne-plus-afficher').checked) localStorage.setItem(CLE_TUTORIEL, '1');
    $('modal-tutoriel').classList.add('hidden');
  });
  $('modal-tutoriel').addEventListener('click', (e) => {
    if (e.target.id === 'modal-tutoriel') $('modal-tutoriel').classList.add('hidden');
  });
  // Contrairement a la confidentialite (relue avant chaque generation), rien
  // d'autre ne redeclenche le tutoriel plus tard : le reafficher l'ouvre donc
  // tout de suite plutot que d'attendre une prochaine action.
  $('btn-reafficher-tutoriel')?.addEventListener('click', () => {
    localStorage.removeItem(CLE_TUTORIEL);
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

  await chargerMatieres();
  await chargerMoteurs();   // appelle rafraichir() une fois les moteurs connus
  await chargerRecents();
});
