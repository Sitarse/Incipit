// L'IDE des cours (modules/cours/ide-langs.js) : un bloc du cours trouve son langage, un fragment est complété pour
// tourner (et ses erreurs reviennent à ses lignes), les réponses de gdb se lisent. Puis, si g++ et Python sont là,
// un vrai programme tourne et se suit pas à pas (ide.js).
const assert = require('node:assert/strict')
const os = require('node:os'), path = require('node:path')
const { langOf, wrap, javaFile, diagnostics, parseMI, shortVal } = require('../src/modules/cours/ide-langs')

// 1. Les étiquettes des blocs de code
assert.equal(langOf('cpp'), 'cpp'); assert.equal(langOf('C++'), 'cpp'); assert.equal(langOf('py'), 'python')
assert.equal(langOf('cs'), 'csharp'); assert.equal(langOf('sh'), 'bash'); assert.equal(langOf('text'), null); assert.equal(langOf(''), null)

// 2. Compléter un fragment
const stmt = wrap('cpp', 'int x = 2;\ncout << x;')
assert.match(stmt.code, /#include <iostream>[\s\S]*using namespace std;\nint main\(\) \{\nint x = 2;/)
assert.ok(!stmt.code.includes('bits/stdc++.h'), 'pas de bits/stdc++.h : il n’existe pas avec clang (macOS)')
assert.equal(stmt.code.split('\n')[stmt.offset], 'int x = 2;', 'offset : la 1re ligne du fragment')
const defs = wrap('cpp', 'class A {\npublic:\n  int f() { return 1; }\n};')
assert.match(defs.code, /};\nint main\(\) \{ return 0; \}/, 'des définitions : un main vide après')
assert.equal(wrap('cpp', '#include <iostream>\nint main() { }').wrapped, false, 'un programme complet ne bouge pas')
assert.match(wrap('java', 'System.out.println(1);').code, /public class Main \{\npublic static void main/)
assert.equal(javaFile('public class Pile { }'), 'Pile.java')
assert.match(wrap('php', 'echo 1;').code, /^<\?php\n/)
assert.match(wrap('go', 'fmt.Println(1)').code, /package main\nimport "fmt"\nfunc main\(\) \{/)
assert.equal(wrap('python', 'print(1)').wrapped, false)

// 3. Les erreurs, ramenées aux lignes du fragment
const L1 = stmt.offset + 2, L2 = stmt.offset + 3 // les lignes 2 et 3 du fragment, quelle que soit la longueur de l'en-tête ajouté
const d = diagnostics(`main.cpp: In function 'int main()':\nmain.cpp:${L1}:5: error: 'y' was not declared in this scope\nmain.cpp:${L2}:1: warning: unused\n`, 'main.cpp', stmt.offset)
assert.deepEqual(d.map(x => [x.line, x.col, x.severity]), [[2, 5, 'error'], [3, 1, 'warning']])
assert.equal(diagnostics('Program.cs(3,9): error CS0103: The name x does not exist [C:\\p\\Programme.csproj]', 'Program.cs')[0].line, 3)
assert.equal(diagnostics('Traceback (most recent call last):\n  File "C:\\t\\main.py", line 2, in <module>\nNameError: name x', 'main.py')[0].message, 'NameError: name x')
assert.equal(diagnostics('main.cpp:1:1: error: avant le fragment', 'main.cpp', 3).length, 0, 'une erreur dans les lignes ajoutées ne pointe nulle part')

// 3b. Un exemple qui se lance, ou un extrait qui s'illustre seulement (les vrais cas de COO 7)
const { runnable } = require('../src/modules/cours/ide-langs')
for (const [lang, code] of [
  ['cpp', 'T top();     // renvoie la tête (existe aussi en const)\nvoid pop();   // étête, ne renvoie rien'],                // des signatures
  ['cpp', 'catch (X::Small&) { ... }\ncatch (X::Big&)   { ... }\ncatch (X::Trouble&) { ... }'],                        // des « ... » et un catch seul
  ['cpp', 'template<class T> T stack<T>::pop() {\n  if (count == 0) throw logic_error("stack underflow");\n  return data[--count];\n}'], // une méthode sans sa classe
  ['cpp', '#include <iostream>\nclass A;\nint f(int);'], ['cpp', ''], ['python', 'def f():\n    ...'],
]) assert.equal(runnable(lang, code), false, `extrait : ${code.slice(0, 30)}`)
for (const [lang, code] of [
  ['cpp', 'int n = 3;\ncout << n * 2 << endl;'], ['cpp', 'int f(int a) { return a * 2; }\nint main() { cout << f(2); }'],
  ['cpp', 'class A {\npublic:\n  int f() { return 1; }\n};'], ['cpp', 'try { throw 1; } catch (int e) { cout << e; }'],
  ['cpp', 'cout << "pas de ... ici" << endl; // un « ... » dans une chaîne n\'est pas un trou'], ['python', 'print(sum(range(5)))'], ['java', 'System.out.println(1);'],
]) assert.equal(runnable(lang, code), true, `exemple : ${code.slice(0, 30)}`)

// 4. gdb/MI
const st = parseMI('*stopped,reason="end-stepping-range",frame={addr="0x1",func="main",args=[],file="main.cpp",line="12"},thread-id="1"')
assert.equal(st.type, '*'); assert.equal(st.cls, 'stopped'); assert.equal(st.data.frame.line, '12'); assert.deepEqual(st.data.frame.args, [])
const fr = parseMI('5^done,stack=[frame={level="0",func="f",file="main.cpp",line="4"},frame={level="1",func="main",file="main.cpp",line="9"}]')
assert.equal(fr.token, '5'); assert.deepEqual(fr.data.stack.map(x => x.frame.func), ['f', 'main'])
const vs = parseMI('7^done,variables=[{name="s",value="\\"ab\\\\n\\""},{name="v",value="{1, 2}"}]')
assert.deepEqual(vs.data.variables.map(v => v.value), ['"ab\\n"', '{1, 2}'])
assert.equal(parseMI('~"texte\\n"').text, 'texte\n')
assert.ok(shortVal('x'.repeat(300)).length <= 160)

// 5. En vrai (seulement si ce PC a les outils) : C++ avec une saisie, puis la pile à travers une exception
;(async () => {
  const ide = require('../src/modules/cours/ide')({ data: path.join(os.tmpdir(), 'hitodama-ide-test'), push: e => events.push(e) })
  const events = []
  const langs = await ide.langs(), has = id => langs.find(l => l.id === id)?.ok
  if (has('cpp')) {
    await ide.run({ lang: 'cpp', code: 'int n;\ncin >> n;\ncout << n * 2 << endl;' })
    await new Promise(r => setTimeout(r, 300))
    const until = Date.now() + 60e3
    while (!events.some(e => e.t === 'exit') && Date.now() < until) { ide.input('21\n'); await new Promise(r => setTimeout(r, 500)) }
    const exit = events.find(e => e.t === 'exit')
    assert.equal(exit?.code, 0, `C++ : ${JSON.stringify(events.slice(-3))}`)
    assert.match(events.filter(e => e.t === 'out').map(e => e.data).join(''), /42/)
    if (langs.find(l => l.id === 'cpp').pile) {
      const code = 'int f(int a) {\n  if (a > 1) throw runtime_error("non");\n  return a;\n}\nint main() {\n  int s = 0;\n  try { s = f(5); } catch (const exception& e) { s = -1; }\n  cout << s;\n}'
      const t = await ide.trace({ lang: 'cpp', code })
      assert.equal(t.error, null, t.error)
      const seen = t.steps.map(s => s.stack.map(f => f.func).join('<'))
      assert.ok(seen.includes('f<main'), `la pile montre f appelée par main : ${seen}`)
      assert.match(t.steps.at(-1).out, /-1/, 'le catch a tourné')
    }
  } else console.log('ide : g++ absent, essai C++ sauté')
  if (has('python')) {
    const t = await ide.trace({ lang: 'python', code: 'def f(a):\n    return a + 1\nx = f(int(input()))\nprint(x)', stdin: '4\n' })
    assert.equal(t.error, null)
    assert.ok(t.steps.some(s => s.stack[0]?.func === 'f' && s.stack[0].vars.a === '4'))
    assert.equal(t.steps.at(-1).out, '5\n')
  }
  console.log('ide : ok')
})().catch(err => { console.error(err); process.exit(1) })
