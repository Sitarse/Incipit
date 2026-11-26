// Les traceurs du pas à pas (modules/cours/ide.js) donnent tous le même format, la « photo de la mémoire » de chaque pas
// (lue par ide-mem.js) : cadres (main d'abord), variables, objets du tas par identité, flèches. Un vrai programme par
// langage, lancé seulement si l'outil est sur ce PC.
const assert = require('node:assert/strict')
const os = require('node:os'), path = require('node:path')
const IdeMem = require('../src/modules/cours/ide-mem')
const Schemas = require('../src/modules/cours/schemas')

const varOf = (f, nom) => f?.vars.find(x => x.nom === nom)?.v
const top = s => s.frames.at(-1)
// chaque trace se dessine du premier au dernier pas, sans erreur
function drawsAll(steps, lang) {
  const spec = IdeMem.toSpec(steps)
  for (let k = 0; k < steps.length; k++) Schemas.render(spec, { libre: true, theme: 'css', step: k })
  assert.equal(steps.at(-1).event, 'end', `${lang} : le dernier pas est la fin`)
}

;(async () => {
  const ide = require('../src/modules/cours/ide')({ data: path.join(os.tmpdir(), 'hitodama-ide-test'), push: () => {} })
  const langs = await ide.langs(), has = id => langs.find(l => l.id === id)?.ok && langs.find(l => l.id === id)?.pile

  // ---------- Python ----------
  if (has('python')) {
    const code = 'a = [1, 2]\nb = a\nb.append(3)\ndef f(n):\n    return n * 2\nx = f(4)\nclass P:\n    def __init__(s): s.v = 1\np = P()'
    const t = await ide.trace({ lang: 'python', code })
    assert.equal(t.error, null, t.error)
    const S = t.steps
    assert.ok(S.every(s => s.frames.length === 0 || s.frames[0].func === 'programme'), 'le cadre du bas est le programme')
    const al = S.find(s => varOf(s.frames[0], 'a')?.ref && varOf(s.frames[0], 'b')?.ref)
    assert.ok(al, 'un pas où a et b existent')
    assert.equal(varOf(al.frames[0], 'a').ref, varOf(al.frames[0], 'b').ref, 'a et b : le même objet')
    const lst = S.find(s => s.heap[varOf(s.frames[0], 'a')?.ref]?.champs.length === 3)
    assert.ok(lst, 'après append, la liste a 3 cases'); assert.equal(lst.heap[varOf(lst.frames[0], 'a').ref].kind, 'liste')
    assert.ok(S.some(s => s.frames.length === 2 && s.frames[1].func === 'f'), 'un pas dans f')
    assert.ok(S.some(s => s.event === 'return' && s.ret === '8'), 'f renvoie 8')
    assert.ok(!S.some(s => s.frames.some(f => f.func === 'P')), 'le corps de « class P: » n’est pas un appel')
    assert.ok(S.some(s => s.frames.at(-1)?.func === 'P.__init__'), 'le constructeur, nommé avec sa classe')
    const end = S.at(-1), pv = varOf(end.frames[0], 'p')
    assert.equal(end.heap[pv?.ref]?.classe, 'P')
    assert.deepEqual(end.heap[pv.ref].champs.find(c => c.nom === 'v')?.v, { t: '1' })
    assert.deepEqual(varOf(end.frames[0], 'x'), { t: '8' })
    assert.ok(!end.frames[0].vars.some(v => /^(f|P|__\w+__)$/.test(v.nom)), 'ni fonctions, ni classes, ni noms internes')
    drawsAll(S, 'Python')
  } else console.log('ide-trace : Python absent, sauté')

  // ---------- C++ (gdb, la table des blocs) ----------
  const at = (S, l) => S.filter(s => s.event === 'line' && s.line === l)[0]
  if (has('cpp')) {
    const code = ['#include <vector>', '#include <string>', 'struct P { int x; };', 'int g = 7;', 'int f(int k) {', '  return k * 2;', '}',
      'int main() {', '  int a = 1;', '  int *c = &a;', '  int t[3] = {1, 2, 3};', '  int *q = &t[1];', '  P *p = new P{5};', '  P *r = p;',
      '  int *n = new int[4];', '  int &ref = a;', '  std::vector<int> v{1, 2};', '  std::string s = "hi";', '  int *u;', '  int y = f(3);',
      '  delete p;', '  n = nullptr;', '  u = c; return y + *u - 7;', '}'].join('\n')
    const t = await ide.trace({ lang: 'cpp', code })
    assert.equal(t.error, null, t.error)
    const S = t.steps, m = s => s.frames[0]
    assert.ok(S.every(s => s.event === 'end' || m(s).func === 'main'), 'le cadre du bas est main')
    const s19 = at(S, 20) // « int *u; » (ligne 19) n'a pas de code : gdb ne s'y arrête pas
    assert.ok(s19, 'un pas à la ligne 20')
    assert.deepEqual(varOf(m(s19), 'c'), { sref: [0, 'a'] }, 'c pointe a')
    assert.equal(varOf(m(s19), 't').champs.length, 3, 't : ses cases dans le cadre')
    assert.deepEqual(varOf(m(s19), 'q'), { sref: [0, 't', '1'] }, 'q pointe t[1]')
    const p = varOf(m(s19), 'p'), r = varOf(m(s19), 'r')
    assert.ok(p.ref && p.ref === r.ref, 'p et r : le même objet')
    assert.deepEqual(s19.heap[p.ref].champs.find(c => c.nom === 'x')?.v, { t: '5' })
    const n = varOf(m(s19), 'n')
    assert.equal(s19.heap[n.ref].kind, 'tableau'); assert.equal(s19.heap[n.ref].champs.length, 4)
    assert.deepEqual(varOf(m(s19), 'ref'), { sref: [0, 'a'] }, 'la référence vers a')
    const v = varOf(m(s19), 'v')
    assert.equal(s19.heap[v.ref]?.kind, 'liste'); assert.deepEqual(s19.heap[v.ref].champs.map(c => c.v.t), ['1', '2'])
    assert.deepEqual(varOf(m(s19), 's'), { t: '"hi"' })
    assert.equal(varOf(m(at(S, 18)), 'u'), undefined, 'u pas encore déclaré')
    assert.equal(varOf(m(s19), 'y'), undefined, 'y : sa ligne n’a pas encore tourné')
    assert.deepEqual(varOf(m(s19), 'u'), { inv: 'non-init' }, 'u déclaré sans valeur')
    assert.deepEqual(s19.statics?.find(x => x.nom === 'g')?.v, { t: '7' }, 'la globale g')
    const inF = S.find(s => s.frames.length === 2 && s.frames[1].func === 'f')
    assert.ok(inF, 'un pas dans f'); assert.deepEqual(varOf(inF.frames[1], 'k'), { t: '3' }); assert.equal(varOf(m(inF), 'y'), undefined)
    const s22 = at(S, 22)
    assert.deepEqual(varOf(m(s22), 'p'), { inv: 'libere' }, 'après delete, p pointe un bloc libéré')
    assert.equal(s22.heap[p.ref]?.etat, 'libere')
    const s23 = at(S, 23)
    assert.deepEqual(varOf(m(s23), 'n'), { nul: true }); assert.equal(s23.heap[n.ref]?.etat, 'fuite', 'plus rien ne pointe le tableau')
    const end = S.at(-1)
    assert.equal(end.heap[n.ref]?.etat, 'fuite', 'à la fin, le tableau jamais libéré')
    assert.notEqual(end.heap[v.ref]?.etat, 'fuite', 'le vector a rendu son bloc')
    drawsAll(S, 'C++')

    // plusieurs fichiers : on entre dans Compte::ajouter, dans Compte.cpp
    const files = { 'Compte.h': 'struct Compte {\n  int solde;\n  void ajouter(int m);\n};', 'Compte.cpp': '#include "Compte.h"\nvoid Compte::ajouter(int m) {\n  solde += m;\n}' }
    const t2 = await ide.trace({ lang: 'cpp', code: '#include "Compte.h"\nint main() {\n  Compte c{10};\n  c.ajouter(5);\n  return c.solde - 15;\n}', files })
    assert.equal(t2.error, null, t2.error)
    const inC = t2.steps.find(s => s.file === 'Compte.cpp')
    assert.ok(inC, 'un pas dans Compte.cpp'); assert.equal(inC.line, 3); assert.equal(inC.frames[1].func, 'Compte::ajouter')
    assert.deepEqual(varOf(inC.frames[1], 'this'), { sref: [0, 'c'] }, 'this : la variable c de main')
    drawsAll(t2.steps, 'C++ multi-fichiers')
    // argv : alloué avant main par le démarrage du programme, ce n'est pas une fuite de l'élève
    const t3 = await ide.trace({ lang: 'cpp', code: 'int main(int argc, char **argv) {\n  int n = argc;\n  return n - 1;\n}' })
    assert.equal(t3.error, null, t3.error)
    assert.ok(!Object.values(t3.steps.at(-1).heap).some(o => o.etat === 'fuite'), 'argv n’est pas une fuite')
  } else console.log('ide-trace : g++/gdb absent, C++ sauté')

  // ---------- C (malloc, free) ----------
  if (has('c')) {
    const code = ['#include <stdlib.h>', 'struct P { int x; };', 'int g = 7;', 'int main(void) {', '  int a = 1;', '  int *c = &a;',
      '  struct P *p = malloc(sizeof(struct P));', '  p->x = 5;', '  struct P *r = p;', '  int *n = calloc(4, sizeof(int));', '  free(p);',
      '  n = NULL;', '  return a + g - 8;', '}'].join('\n')
    const t = await ide.trace({ lang: 'c', code })
    assert.equal(t.error, null, t.error)
    const S = t.steps, s11 = at(S, 11), m = s11.frames[0]
    assert.deepEqual(varOf(m, 'c'), { sref: [0, 'a'] })
    const p = varOf(m, 'p'); assert.equal(p.ref, varOf(m, 'r').ref)
    assert.deepEqual(s11.heap[p.ref].champs.find(c => c.nom === 'x')?.v, { t: '5' })
    const n = varOf(m, 'n'); assert.equal(s11.heap[n.ref].champs.length, 4); assert.deepEqual(s11.heap[n.ref].champs[0].v, { t: '0' })
    assert.deepEqual(varOf(at(S, 12).frames[0], 'p'), { inv: 'libere' })
    assert.equal(at(S, 13).heap[n.ref]?.etat, 'fuite')
    assert.deepEqual(s11.statics?.find(x => x.nom === 'g')?.v, { t: '7' })
    drawsAll(S, 'C')
  } else console.log('ide-trace : gcc/gdb absent, C sauté')

  // ---------- Java (JDI) ----------
  if (has('java')) {
    const code = ['import java.util.ArrayList;', 'public class Main {', '  static int carre(int x) {', '    return x * x;', '  }',
      '  public static void main(String[] args) {', '    Compte a = new Compte();', '    Compte b = a;', '    b.solde = 5;',
      '    ArrayList<Compte> l = new ArrayList<>();', '    l.add(a);', '    int r = carre(3);', '    String s = "hé";',
      '    System.out.println("fini " + r);', '    throw new IllegalStateException("boum");', '  }', '}',
      'class Compte { int solde; static int nb = 2; }'].join('\n')
    const t = await ide.trace({ lang: 'java', code })
    const S = t.steps ?? []
    assert.ok(S.length > 5, `Java : ${t.error}`)
    const m = s => s.frames[0], s12 = at(S, 12)
    assert.equal(m(s12).func, 'main')
    assert.equal(varOf(m(s12), 'args'), undefined, 'le tableau vide des arguments n’est pas montré')
    const a = varOf(m(s12), 'a'), b = varOf(m(s12), 'b')
    assert.ok(a?.ref && a.ref === b?.ref, 'a et b : le même objet')
    assert.deepEqual(s12.heap[a.ref].champs.find(c => c.nom === 'solde')?.v, { t: '5' })
    const l = varOf(m(s12), 'l')
    assert.equal(s12.heap[l.ref]?.kind, 'liste'); assert.equal(s12.heap[l.ref].champs[0]?.v.ref, a.ref, 'la case [0] de la liste : a')
    assert.ok(S.some(s => s.frames.at(-1)?.func === 'carre'), 'un pas dans carre')
    assert.ok(S.some(s => s.event === 'return' && s.ret === '9'), 'carre renvoie 9')
    assert.deepEqual(s12.statics?.find(x => x.nom === 'Compte.nb')?.v, { t: '2' })
    assert.deepEqual(varOf(m(at(S, 15)), 's'), { t: '"hé"' })
    const ex = S.find(s => s.event === 'exception')
    assert.ok(ex, 'le pas de l’exception'); assert.match(ex.exc, /IllegalStateException: boum/)
    assert.match(S.at(-1).out, /fini 9/)
    assert.match(t.error ?? '', /boum/)
    drawsAll(S, 'Java')
    // StringBuilder en texte, HashMap par ses entrées, et le pas « retour » qui ne rappelle pas de méthode
    const t2 = await ide.trace({ lang: 'java', code: ['import java.util.*;', 'public class Main {', '  static int un() { return 1; }',
      '  public static void main(String[] args) {', '    StringBuilder sb = new StringBuilder("ab");', '    HashMap<String, Integer> m = new HashMap<>();',
      '    m.put("x", 1);', '    int k = un();', '    sb.append(k);', '  }', '}'].join('\n') })
    assert.equal(t2.error, null, t2.error)
    const s9 = at(t2.steps, 9), mv = varOf(s9.frames[0], 'm')
    assert.deepEqual(varOf(s9.frames[0], 'sb'), { t: '"ab"' })
    assert.equal(s9.heap[mv.ref]?.kind, 'dict'); assert.deepEqual(s9.heap[mv.ref].champs[0], { nom: '"x"', v: { t: '1' } })
    const back = t2.steps.find(s => s.event === 'return' && s.ret === '1')
    assert.ok(back, 'le pas où un() renvoie 1'); assert.deepEqual(varOf(back.frames[0], 'sb'), { t: '"ab"' })
    drawsAll(t2.steps, 'Java (collections)')
  } else console.log('ide-trace : JDK absent, Java sauté')

  // ---------- JavaScript (l'inspecteur de Node) ----------
  if (has('javascript')) {
    const code = ['const a = { v: 1 };', 'const b = a;', 'b.v = 2;', 'const t = [a, 3];', 'function f(n) {', '  return n + 1;', '}',
      'const x = f(1);', 'console.log("x vaut", x);', 'const m = new Map([["k", a]]);', 'throw new Error("boum");'].join('\n')
    const t = await ide.trace({ lang: 'javascript', code })
    const S = t.steps ?? []
    assert.ok(S.length > 4, `JS : ${t.error}`)
    const m = s => s.frames[0], s9 = at(S, 9)
    assert.equal(m(s9).func, 'programme')
    assert.ok(!m(s9).vars.some(v => /^(require|module|exports|__dirname|__filename|f)$/.test(v.nom)), 'ni variables internes de Node ni fonctions')
    const a = varOf(m(s9), 'a'), b = varOf(m(s9), 'b')
    assert.ok(a?.ref && a.ref === b?.ref, 'a et b : le même objet')
    assert.deepEqual(s9.heap[a.ref].champs.find(c => c.nom === 'v')?.v, { t: '2' })
    const tv = varOf(m(s9), 't')
    assert.equal(s9.heap[tv.ref]?.kind, 'liste'); assert.equal(s9.heap[tv.ref].champs[0].v.ref, a.ref)
    assert.ok(S.some(s => s.frames.at(-1)?.func === 'f'), 'un pas dans f')
    assert.ok(S.some(s => s.event === 'return' && s.ret === '2'), 'f renvoie 2')
    assert.deepEqual(varOf(m(s9), 'x'), { t: '2' })
    assert.match(at(S, 10).out, /x vaut 2/)
    const mv = varOf(m(at(S, 11)), 'm')
    assert.equal(at(S, 11).heap[mv.ref]?.kind, 'dict'); assert.equal(at(S, 11).heap[mv.ref].champs[0].v.ref, a.ref)
    const ex = S.find(s => s.event === 'exception')
    assert.ok(ex, 'le pas de l’exception'); assert.match(ex.exc, /Error: boum/); assert.match(t.error ?? '', /boum/)
    drawsAll(S, 'JavaScript')
    // une erreur de syntaxe : son message, tout de suite (pas « code 1 », pas d'attente)
    const t0 = Date.now(), bad = await ide.trace({ lang: 'javascript', code: 'const x = ;\nconsole.log(x)' })
    assert.match(bad.error ?? '', /SyntaxError/, bad.error); assert.ok(Date.now() - t0 < 20e3, 'sans attendre la fin du temps')
  }

  // ---------- C# (netcoredbg, téléchargé à la demande : sauté s'il manque) ----------
  const cs = langs.find(l => l.id === 'csharp')
  if (cs?.ok && cs.debugger) {
    const code = ['static int Carre(int x) { return x * x; }', 'var a = new C();', 'var b = a;', 'b.v = 4;', 'var l = new List<int> { 1, 2 };',
      'var d = new Dictionary<string, C> { ["k"] = a };', 'string s = "hé";', 'int r = Carre(3);', 'Console.WriteLine(r);',
      'class C { public int v; public static int nb = 2; public C next; }'].join('\n')
    const t = await ide.trace({ lang: 'csharp', code })
    assert.equal(t.error, null, t.error)
    const S = t.steps, s8 = at(S, 8), m = s8.frames[0]
    assert.equal(m.func, 'programme')
    const a = varOf(m, 'a'), b = varOf(m, 'b')
    assert.ok(a?.ref && a.ref === b?.ref, 'a et b : le même objet')
    assert.deepEqual(s8.heap[a.ref].champs.find(c => c.nom === 'v')?.v, { t: '4' })
    assert.deepEqual(s8.heap[a.ref].champs.find(c => c.nom === 'next')?.v, { nul: true })
    const l = varOf(m, 'l'); assert.equal(s8.heap[l.ref]?.kind, 'liste'); assert.deepEqual(s8.heap[l.ref].champs.map(c => c.v.t), ['1', '2'])
    const d = varOf(m, 'd'); assert.equal(s8.heap[d.ref]?.kind, 'dict'); assert.deepEqual(s8.heap[d.ref].champs[0], { nom: '"k"', v: { ref: a.ref } })
    assert.deepEqual(varOf(m, 's'), { t: '"hé"' })
    assert.deepEqual(s8.statics?.find(x => x.nom === 'C.nb')?.v, { t: '2' })
    assert.ok(S.some(s => s.frames.length === 2 && s.frames[1].func === 'Carre'), 'un pas dans Carre')
    assert.match(S.at(-1).out, /9/)
    drawsAll(S, 'C#')
  } else console.log('ide-trace : netcoredbg absent, C# sauté')

  console.log('ide-trace : ok')
})().catch(err => { console.error(err); process.exit(1) })
