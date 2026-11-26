# La pile pas à pas d'un programme Python, pour l'IDE des cours (ide.js) : chaque ligne exécutée du fichier donne un pas,
# au format commun des traceurs (ide-mem.js le dessine) : les cadres (le programme d'abord) avec leurs variables, les
# objets du tas par id() (listes, dictionnaires, instances), ce que le programme a affiché jusque-là.
# python ide-trace.py main.py entree.txt  ->  un JSON sur la sortie : {"steps": [...], "error": "..."|null}
import io, json, os, sys

MAX_STEPS, NIVEAUX, MAX_OBJETS, MAX_CHAMPS = 400, 3, 30, 12
target, entree = sys.argv[1], sys.argv[2]
FILE = os.path.basename(target)
with open(target, encoding="utf-8") as f:
    src = f.read()
with open(entree, encoding="utf-8") as f:
    stdin_text = f.read()

real_out = sys.stdout
out = io.StringIO()
steps = []
SIMPLE = (bool, int, float, complex, str, bytes)


class Stop(Exception):
    pass


def short(v):
    try:
        t = repr(v)
    except Exception as e:  # un __repr__ qui plante ne casse pas la trace
        t = f"<{type(v).__name__} : {e}>"
    t = " ".join(t.split())
    return t if len(t) <= 160 else t[:157] + "…"


def shown(k, v):
    return not (k.startswith("__") and k.endswith("__")) and not callable(v) and type(v).__name__ != "module"


def value(x, heap, d):
    """Une valeur : en ligne si elle est simple, sinon une flèche vers sa boîte du tas (explorée sur NIVEAUX)."""
    if x is None:
        return {"nul": True}
    if isinstance(x, SIMPLE):
        return {"t": short(x)}
    if isinstance(x, (list, tuple, set, frozenset, dict)) or hasattr(x, "__dict__"):
        oid = str(id(x))
        if oid not in heap and d <= NIVEAUX and len(heap) < MAX_OBJETS:
            o = heap[oid] = {"classe": type(x).__name__, "kind": "dict" if isinstance(x, dict) else "liste", "champs": []}
            if isinstance(x, dict):
                items = [(short(k), v) for k, v in x.items()]
            elif isinstance(x, (list, tuple)):
                items = [(f"[{i}]", v) for i, v in enumerate(x)]
            elif isinstance(x, (set, frozenset)):
                items = [("•", v) for v in x]
            else:
                o["kind"] = "objet"
                items = [(k, v) for k, v in vars(x).items() if shown(k, v)]
            o["champs"] = [{"nom": k, "v": value(v, heap, d + 1)} for k, v in items[:MAX_CHAMPS]]
            if len(items) > MAX_CHAMPS:
                o["total"] = len(items)
        return {"ref": oid}
    return {"t": short(x)}  # un objet sans champs (range, fichier…) : son texte


def frame_of(name, line, loc, heap):
    return {"func": name, "line": line, "file": FILE,
            "vars": [{"nom": k, "v": value(v, heap, 1)} for k, v in loc.items() if shown(k, v)]}


def func_name(c):
    # P.__init__ plutôt que __init__ (Python 3.11+) ; une fonction locale sans le « .<locals> »
    return "programme" if c.co_name == "<module>" else getattr(c, "co_qualname", c.co_name).replace(".<locals>", "")


def ours(c):
    # le code du fichier, sauf le corps d'une classe (« class P: » n'est pas un appel) : sans CO_NEWLOCALS, hors module
    return c.co_filename == target and (c.co_name == "<module>" or c.co_flags & 0x02)


def snapshot(frame):
    chain = []
    while frame is not None:
        if ours(frame.f_code):
            chain.append(frame)
        frame = frame.f_back
    heap = {}
    frames = [frame_of(func_name(f.f_code), f.f_lineno, f.f_locals, heap) for f in reversed(chain)]
    return frames, heap


def tracer(frame, event, arg):
    if not ours(frame.f_code):
        return None
    # la fin du programme (le « return » du module) : c'est le pas « end », fait après
    if event in ("line", "return", "exception") and not (event == "return" and frame.f_code.co_name == "<module>"):
        if len(steps) >= MAX_STEPS:
            raise Stop()
        frames, heap = snapshot(frame)
        step = {"line": frame.f_lineno, "file": FILE, "event": event, "frames": frames, "heap": heap, "out": out.getvalue()}
        if event == "return" and arg is not None:
            step["ret"] = short(arg)
        if event == "exception":
            step["exc"] = f"{arg[0].__name__}: {arg[1]}"
        steps.append(step)
    return tracer


error = None
g = {"__name__": "__main__", "__file__": target}
sys.stdout, sys.stdin = out, io.StringIO(stdin_text)
code = compile(src, target, "exec")
sys.settrace(tracer)
try:
    exec(code, g)
except Stop:
    error = f"Arrêté après {MAX_STEPS} pas (boucle trop longue ?)."
except BaseException as e:  # l'exception du programme : montrée, pas plantée
    error = f"{type(e).__name__}: {e}"
finally:
    sys.settrace(None)
    sys.stdout = real_out
# la fin : la mémoire du programme telle qu'il la laisse
last = steps[-1]["line"] if steps else 1
heap = {}
steps.append({"line": last, "file": FILE, "event": "end", "frames": [frame_of("programme", last, g, heap)], "heap": heap,
              "out": out.getvalue()})
json.dump({"steps": steps, "error": error}, real_out, ensure_ascii=False)
